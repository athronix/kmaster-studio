// F20 内置终端 · TerminalManager 单例（方案 §3.3）
// 职责：node-pty 懒加载与降级标记、shell 探测、cwd 解析、pty spawn/write/resize/kill、
//       会话表 Map<term_id, PtySession>、按 socket 归属回收、进程退出兜底清理。
//
// 设计约束（来自 TECHNICAL-SOLUTION-M5.md §1.1 / §3.2 / §7）：
//  1. 原生模块降级范式与 db.ts 的 better-sqlite3 → MemoryStore 完全一致：
//     `await import('node-pty')` 包 try/catch，失败记录 error.message 到 ptyError、available=false，
//     主流程继续，server 全功能不受影响（AC4）。
//  2. 输出微批：pty.onData 的高频小包按 TERMINAL_BATCH_MS(8ms) 合并后再回调，降低 WS 帧开销。
//  3. 归属清理：每个 pty 记 owner_socket_id，socket 断开时 killByOwner，进程退出时 killAll（NFR-M5-7）。
//  4. 并发上限：MAX_TERMS = env.KMASTER_MAX_TERMS || DEFAULT_MAX_TERMS(8)，超限抛 limit_exceeded。
import fs from 'node:fs';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { db } from '../db.js';
import {
  DEFAULT_MAX_TERMS,
  TERMINAL_BATCH_MS,
  type PtyInfo,
  type TerminalErrorCode,
  type TerminalOpenRequest,
} from '../protocol.js';

/** node-pty 的 IPty 结构性子集：只声明本模块实际使用的成员，避免对可选原生模块的硬类型依赖。 */
export interface PtyLike {
  readonly pid: number;
  onData(listener: (data: string) => void): { dispose(): void };
  onExit(listener: (e: { exitCode: number; signal?: number }) => void): { dispose(): void };
  write(data: string): void;
  resize(cols: number, rows: number): void;
  kill(signal?: string): void;
}

/** node-pty 模块的结构性子集（只用到 spawn）。 */
export interface PtyModuleLike {
  spawn(
    file: string,
    args: string[] | string,
    options: {
      name?: string;
      cols?: number;
      rows?: number;
      cwd?: string;
      env?: Record<string, string | undefined>;
      useConpty?: boolean;
    }
  ): PtyLike;
}

/** 单个 pty 会话（方案 §3.3 类图 PtySession）。 */
export interface PtySession {
  term_id: string;
  owner_socket_id: string;
  shell: string;
  cwd: string;
  pid: number;
  cols: number;
  rows: number;
  created_at: number;
  pty: PtyLike;
}

/** 终端侧的领域错误：携带协议错误码，交由 terminal-ns 转译为 `term.error`。 */
export class TerminalError extends Error {
  readonly code: TerminalErrorCode;
  readonly term_id?: string;

  constructor(code: TerminalErrorCode, message: string, termId?: string) {
    super(message);
    this.name = 'TerminalError';
    this.code = code;
    this.term_id = termId;
  }
}

/** TerminalManager 对外回调（由 terminal-ns 注入，Manager 本身不认识 socket.io）。 */
export interface TerminalHandlers {
  /** 微批合并后的 pty 输出。 */
  onData: (termId: string, data: string) => void;
  /** pty 退出（含主动 kill）。 */
  onExit: (termId: string, exitCode: number, signal?: number) => void;
}

/** 终端能力诊断快照（供 GET /api/health 的 terminal_available 字段消费，T3 侧 `?? false` 容错）。 */
export interface TerminalInfo {
  available: boolean;
  error: string | null;
  sessions: number;
  max_terms: number;
}

/** 并发上限：环境变量优先，非法值回落 DEFAULT_MAX_TERMS。 */
function resolveMaxTerms(): number {
  const raw = Number(process.env.KMASTER_MAX_TERMS);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_MAX_TERMS;
}

/**
 * 供测试/降级验证用的模块名开关：
 * 设置 `KMASTER_PTY_MODULE=__missing__` 可模拟 node-pty 缺失，验证 AC4 降级路径而无需改代码。
 */
function ptyModuleName(): string {
  return process.env.KMASTER_PTY_MODULE || 'node-pty';
}

/** pty 输出微批缓冲（8ms 窗口内合并同一 term 的多次 onData）。 */
interface DataBatch {
  chunks: string[];
  timer: NodeJS.Timeout;
}

/**
 * TerminalManager：进程内单例，持有全部 pty 会话。
 * 生命周期由 `registerTerminal(io)` 驱动，业务代码只经 `terminalManager` 单例访问。
 */
export class TerminalManager {
  private sessions = new Map<string, PtySession>();
  private batches = new Map<string, DataBatch>();
  private available = false;
  private ptyError: string | null = null;
  private ptyModule: PtyModuleLike | null = null;
  private initPromise: Promise<void> | null = null;
  private handlers: TerminalHandlers = { onData: () => {}, onExit: () => {} };
  private readonly maxTerms = resolveMaxTerms();

  /** 注入下行回调（terminal-ns 注册时调用一次）。 */
  setHandlers(handlers: TerminalHandlers): void {
    this.handlers = handlers;
  }

  /**
   * 懒加载 node-pty（幂等，多次调用共享同一 Promise）。
   * 失败时只记录能力标志位与原因，绝不抛出 —— server 主流程必须继续（AC4）。
   */
  init(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.loadPty();
    }
    return this.initPromise;
  }

  private async loadPty(): Promise<void> {
    const moduleName = ptyModuleName();
    try {
      const mod = (await import(/* @vite-ignore */ moduleName)) as unknown as
        | PtyModuleLike
        | { default: PtyModuleLike };
      const resolved = (mod as { default?: PtyModuleLike }).default ?? (mod as PtyModuleLike);
      if (typeof resolved?.spawn !== 'function') {
        throw new Error(`module "${moduleName}" has no spawn()`);
      }
      this.ptyModule = resolved;
      this.available = true;
      this.ptyError = null;
      console.log(`[terminal] node-pty ready (module=${moduleName}, max_terms=${this.maxTerms})`);
    } catch (err) {
      this.ptyModule = null;
      this.available = false;
      this.ptyError = err instanceof Error ? err.message : String(err);
      console.warn(`[terminal] node-pty unavailable, terminal disabled: ${this.ptyError}`);
    }
  }

  /** node-pty 是否就绪。 */
  isAvailable(): boolean {
    return this.available;
  }

  /** node-pty 加载失败原因；正常时为空串。 */
  getError(): string {
    return this.ptyError ?? '';
  }

  /** 诊断快照（GET /api/health 消费）。 */
  getInfo(): TerminalInfo {
    return {
      available: this.available,
      error: this.ptyError,
      sessions: this.sessions.size,
      max_terms: this.maxTerms,
    };
  }

  /** 当前存活会话数。 */
  count(): number {
    return this.sessions.size;
  }

  /** 只读快照（诊断/测试用，不暴露 pty 句柄）。 */
  list(): PtyInfo[] {
    return [...this.sessions.values()].map((s) => ({
      term_id: s.term_id,
      shell: s.shell,
      cwd: s.cwd,
      pid: s.pid,
      cols: s.cols,
      rows: s.rows,
    }));
  }

  /**
   * shell 探测（方案 §3.2）：
   *  - Windows：`process.env.COMSPEC || 'cmd.exe'`
   *  - Unix：`process.env.SHELL || '/bin/bash'`
   * 请求里的 `shell` 优先级最高。
   */
  detectShell(requested?: string): string {
    const explicit = requested?.trim();
    if (explicit) return explicit;
    if (process.platform === 'win32') return process.env.COMSPEC || 'cmd.exe';
    return process.env.SHELL || '/bin/bash';
  }

  /**
   * cwd 解析：req.cwd → Settings.terminal_cwd（T3 未完成时读不到，容错为 undefined）→ process.cwd()。
   * 目录不存在或不是目录时抛 `bad_cwd`（仅对显式传入的候选校验，兜底值永远合法）。
   */
  async resolveCwd(req: TerminalOpenRequest): Promise<string> {
    const candidate = req.cwd?.trim() || (await this.readSettingsCwd()) || '';
    if (!candidate) return process.cwd();
    const expanded = expandHome(candidate);
    let stat: fs.Stats | null = null;
    try {
      stat = fs.statSync(expanded);
    } catch {
      stat = null;
    }
    if (!stat || !stat.isDirectory()) {
      throw new TerminalError('bad_cwd', `工作目录不存在或不是目录：${candidate}`);
    }
    return expanded;
  }

  /**
   * 读取 `Settings.terminal_cwd`（F21/T3 生产的字段）。
   * T3 尚未落地时该键不存在，读不到一律返回 undefined，绝不阻塞终端开启（方案 §5.2）。
   */
  private async readSettingsCwd(): Promise<string | undefined> {
    try {
      const store = await db();
      return store.getSetting('terminal_cwd') ?? undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * 创建 pty 会话。
   * @throws TerminalError pty_unavailable / limit_exceeded / bad_cwd / spawn_failed
   */
  async open(req: TerminalOpenRequest, ownerSocketId: string): Promise<PtyInfo> {
    await this.init();
    if (!this.available || !this.ptyModule) {
      throw new TerminalError(
        'pty_unavailable',
        this.ptyError || 'node-pty 不可用，终端功能已降级'
      );
    }
    if (this.sessions.size >= this.maxTerms) {
      throw new TerminalError(
        'limit_exceeded',
        `终端数量已达上限（${this.maxTerms}），请先关闭已有终端`
      );
    }

    const cols = normalizeDimension(req.cols, 80);
    const rows = normalizeDimension(req.rows, 24);
    const cwd = await this.resolveCwd(req); // 可能抛 bad_cwd
    const shell = this.detectShell(req.shell);

    let pty: PtyLike;
    try {
      pty = this.ptyModule.spawn(shell, [], {
        name: 'xterm-color',
        cols,
        rows,
        cwd,
        env: buildPtyEnv(),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new TerminalError('spawn_failed', `启动 shell 失败（${shell}）：${message}`);
    }

    const term_id = randomUUID();
    const session: PtySession = {
      term_id,
      owner_socket_id: ownerSocketId,
      shell,
      cwd,
      pid: pty.pid,
      cols,
      rows,
      created_at: Date.now(),
      pty,
    };
    this.sessions.set(term_id, session);

    pty.onData((chunk: string) => this.pushData(term_id, chunk));
    pty.onExit(({ exitCode, signal }) => {
      this.flushData(term_id); // 退出前把残留输出吐干净，避免丢最后一屏
      this.sessions.delete(term_id);
      this.handlers.onExit(term_id, exitCode ?? 0, signal);
    });

    return {
      term_id,
      shell,
      cwd,
      pid: session.pid,
      cols,
      rows,
    };
  }

  /**
   * 写入 pty。
   * @throws TerminalError not_found
   */
  write(termId: string, data: string): void {
    const session = this.sessions.get(termId);
    if (!session) {
      throw new TerminalError('not_found', `终端不存在或已退出：${termId}`, termId);
    }
    session.pty.write(data);
  }

  /**
   * 调整 pty 尺寸。
   * @throws TerminalError not_found
   */
  resize(termId: string, cols: number, rows: number): void {
    const session = this.sessions.get(termId);
    if (!session) {
      throw new TerminalError('not_found', `终端不存在或已退出：${termId}`, termId);
    }
    const nextCols = normalizeDimension(cols, session.cols);
    const nextRows = normalizeDimension(rows, session.rows);
    if (nextCols === session.cols && nextRows === session.rows) return;
    try {
      session.pty.resize(nextCols, nextRows);
      session.cols = nextCols;
      session.rows = nextRows;
    } catch (err) {
      // resize 失败不致命（pty 可能刚退出），记录后忽略
      console.warn(`[terminal] resize failed term=${termId}: ${errText(err)}`);
    }
  }

  /**
   * 主动关闭 pty；真正的 `term.exit` 由 onExit 回调统一下发。
   * @throws TerminalError not_found
   */
  kill(termId: string): void {
    const session = this.sessions.get(termId);
    if (!session) {
      throw new TerminalError('not_found', `终端不存在或已退出：${termId}`, termId);
    }
    this.killSession(session);
  }

  /** 回收某 socket 名下全部 pty（socket 断开 / 页面刷新，NFR-M5-7）。 */
  killByOwner(socketId: string): number {
    let killed = 0;
    for (const session of [...this.sessions.values()]) {
      if (session.owner_socket_id !== socketId) continue;
      this.killSession(session);
      killed += 1;
    }
    return killed;
  }

  /** 回收全部 pty（SIGINT / SIGTERM / exit 兜底，NFR-M5-7）。 */
  killAll(): number {
    const total = this.sessions.size;
    for (const session of [...this.sessions.values()]) {
      this.killSession(session);
    }
    return total;
  }

  /** 统一 kill 实现：清理批处理定时器 + 摘表 + 尽力 kill（异常不外溢）。 */
  private killSession(session: PtySession): void {
    this.clearBatch(session.term_id);
    this.sessions.delete(session.term_id);
    try {
      session.pty.kill();
    } catch (err) {
      console.warn(`[terminal] kill failed term=${session.term_id}: ${errText(err)}`);
    }
  }

  /** 8ms 微批：同一 term 在窗口内的多次输出合并为一帧下发。 */
  private pushData(termId: string, chunk: string): void {
    const existing = this.batches.get(termId);
    if (existing) {
      existing.chunks.push(chunk);
      return;
    }
    const batch: DataBatch = {
      chunks: [chunk],
      timer: setTimeout(() => this.flushData(termId), TERMINAL_BATCH_MS),
    };
    // 微批定时器不应阻止进程退出
    batch.timer.unref?.();
    this.batches.set(termId, batch);
  }

  /** 立即冲刷某 term 的微批缓冲。 */
  private flushData(termId: string): void {
    const batch = this.batches.get(termId);
    if (!batch) return;
    clearTimeout(batch.timer);
    this.batches.delete(termId);
    const data = batch.chunks.join('');
    if (data.length > 0) this.handlers.onData(termId, data);
  }

  /** 丢弃某 term 的微批缓冲（kill 路径，输出已无接收方）。 */
  private clearBatch(termId: string): void {
    const batch = this.batches.get(termId);
    if (!batch) return;
    clearTimeout(batch.timer);
    this.batches.delete(termId);
  }
}

/** `~` 展开（Settings.terminal_cwd 允许用户填 `~/projects` 这类写法）。 */
function expandHome(p: string): string {
  if (p === '~') return os.homedir();
  if (p.startsWith('~/') || p.startsWith('~\\')) return os.homedir() + p.slice(1);
  return p;
}

/** 尺寸归一：非法值回落默认，且限制在合理区间，避免 pty.spawn 报错。 */
function normalizeDimension(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  const n = Math.floor(value);
  if (n < 1) return fallback;
  return Math.min(n, 1000);
}

/** pty 环境：继承 server 环境并强制 TERM，保证颜色与控制序列正常。 */
function buildPtyEnv(): Record<string, string | undefined> {
  return { ...process.env, TERM: 'xterm-256color' };
}

/** 统一错误文案提取。 */
function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** 进程内单例（方案 §3.3：TerminalManager 单例持有 Map<term_id, PtySession>）。 */
export const terminalManager = new TerminalManager();
