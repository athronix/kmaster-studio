/**
 * ServerProcessManager —— Electron 壳的 server 进程宿主（TECHNICAL-SOLUTION-M5 §1.3 / §4.1）
 *
 * 关键架构约束（R-M5-2 的决定性收益，勿改）：
 * - server 跑在「spawn 出来的独立 Node 子进程」（ELECTRON_RUN_AS_NODE=1），**不是** Electron 主进程。
 *   因此 node-pty / better-sqlite3 全部按 **Node ABI** 加载，直接吃官方 prebuild，
 *   打包时 `nodeGypRebuild:false` + `npmRebuild:false` 即可，彻底绕开 electron-rebuild。
 * - 启动前先探活 `/api/health`：命中则复用外部 server（spawnedByMe=false，退出时**绝不** kill，AC6）。
 * - 主机名一律 `localhost`（解析到 ::1）以绕开 TUN 代理；🚫 禁止 127.0.0.1 / 0.0.0.0（方案 §7）。
 *
 * ⚠️ 本文件**只依赖 Node 内置模块**，不 import electron —— 让 server 宿主逻辑与 Electron 运行时解耦，
 *    可在纯 Node 环境下直接单测与复用（Electron 相关装配全部收敛在 main/index.ts）。
 */
import { spawn, execFile, type ChildProcess } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/** 默认端口，与 server 保持一致（NFR-M5-6，M5 不变）。 */
export const DEFAULT_PORT = 6648;

/** 🚫 禁止改成 127.0.0.1 / 0.0.0.0（方案 §7）。 */
export const SERVER_HOST = 'localhost';

const PROBE_TIMEOUT_MS = 1_500;
const READY_TIMEOUT_MS = 30_000;
const READY_POLL_INTERVAL_MS = 300;
const GRACEFUL_KILL_WAIT_MS = 3_000;
const LOG_RETENTION_DAYS = 7;
/** 单个日志文件上限：超过即就地归档重开（壳可能连开数天，仅按天轮转不足以封顶）。 */
const MAX_LOG_BYTES = 5 * 1024 * 1024;
/** 归档日志文件名：`server-2025-08-01.log` 或 `server-2025-08-01T12-30-00-000Z.log`。 */
const ARCHIVED_LOG_RE = /^server-\d{4}-\d{2}-\d{2}[^\\/]*\.log$/;

/** 启动阶段，用于向 loading.html 播报进度（FR-D7 失败兜底需要）。 */
export type ServerStatusPhase =
  | 'probing'
  | 'reusing'
  | 'spawning'
  | 'waiting'
  | 'ready'
  | 'failed'
  | 'stopped';

export interface ServerStatus {
  phase: ServerStatusPhase;
  message: string;
  port: number;
  /** 错误页展示该路径，便于用户自查（方案 §7「日志」）。 */
  log_path: string;
}

export interface ServerHandle {
  port: number;
  url: string;
  /** true = 本壳拉起的进程（退出时需清理进程树）；false = 复用的外部 server（AC6，退出时不动它）。 */
  spawnedByMe: boolean;
}

export interface ServerProcessOptions {
  port?: number;
  /** server 入口（`server/dist/index.js`）；缺省走 resolveServerEntry() 探测。 */
  entry?: string;
  /** 子进程可执行文件；Electron 下为 process.execPath（配合 ELECTRON_RUN_AS_NODE=1）。 */
  execPath?: string;
  /**
   * 附加环境变量（透传给 server 子进程）。
   *
   * ⚠️ 见 §4.1.1 勘误：若确需注入 `HERMES_HOME`，**只允许 root 级路径**
   * （如 `C:\Users\x\AppData\Local\hermes`），绝不允许 profile 级
   * （`<root>/profiles/<name>`）——后者会让 server 把激活目录当成根，
   * 造成 profile 双层嵌套、F21「切了但没切」静默失效。
   */
  extraEnv?: Record<string, string>;
  onStatus?: (status: ServerStatus) => void;
}

/** 30s 内未就绪（FR-D7）：主进程据此渲染错误页 + 重试按钮。 */
export class ServerStartTimeoutError extends Error {
  readonly logPath: string;

  constructor(timeoutMs: number, logPath: string) {
    super(`server 未能在 ${Math.round(timeoutMs / 1000)}s 内就绪；详见日志：${logPath}`);
    this.name = 'ServerStartTimeoutError';
    this.logPath = logPath;
  }
}

/** 本地时区 YYYY-MM-DD（日志按天轮转用）。 */
function toLocalDay(d: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function delay(ms: number): Promise<void> {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * 定位 server 入口。按「显式覆盖 → 打包资源 → 开发期源码树」优先级探测，返回首个存在的路径。
 * 全部落空时返回最后一个候选（由调用方抛出可读错误）。
 */
export function resolveServerEntry(): string {
  const candidates: string[] = [];

  const override = process.env.KMASTER_SERVER_ENTRY;
  if (override) candidates.push(override);

  // 打包态：electron-builder 的 extraResources / asarUnpack 产物
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  if (resourcesPath) {
    candidates.push(path.join(resourcesPath, 'server', 'dist', 'index.js'));
    candidates.push(path.join(resourcesPath, 'app.asar.unpacked', 'packages', 'server', 'dist', 'index.js'));
  }

  // 开发态：dist/main/server-process.js → ../../../server/dist/index.js
  candidates.push(path.resolve(__dirname, '../../../server/dist/index.js'));
  // 兜底：从 monorepo 根往下找
  candidates.push(path.resolve(__dirname, '../../../../packages/server/dist/index.js'));

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }
  return candidates[candidates.length - 1] ?? '';
}

export class ServerProcessManager {
  private child: ChildProcess | null = null;
  private spawnedByMe = false;
  private childExit: { code: number | null; signal: NodeJS.Signals | null } | null = null;
  private logStream: fs.WriteStream | null = null;
  private logBytes = 0;
  /** stopServer() 之后置位：阻止「退出流程已开始却还在 spawn」造成的孤儿进程（NFR-M5-7）。 */
  private disposed = false;

  private readonly port: number;
  private readonly entry: string;
  private readonly execPath: string;
  private readonly extraEnv: Record<string, string>;
  private readonly onStatus: (status: ServerStatus) => void;

  constructor(options: ServerProcessOptions = {}) {
    this.port = options.port ?? Number(process.env.PORT ?? DEFAULT_PORT);
    this.entry = options.entry ?? resolveServerEntry();
    this.execPath = options.execPath ?? process.execPath;
    this.extraEnv = options.extraEnv ?? {};
    this.onStatus = options.onStatus ?? ((): void => undefined);
  }

  /** SPA 与探活统一使用的基址。 */
  get url(): string {
    return `http://${SERVER_HOST}:${this.port}`;
  }

  logDir(): string {
    return path.join(os.homedir(), '.kmaster-studio', 'logs');
  }

  /** 当前日志文件路径（错误页展示用）。 */
  logPath(): string {
    return path.join(this.logDir(), 'server.log');
  }

  isSpawnedByMe(): boolean {
    return this.spawnedByMe;
  }

  /** 本壳拉起的 server 子进程 pid；复用外部 server 或尚未拉起时为 null（诊断与进程树核对用）。 */
  serverPid(): number | null {
    return this.child?.pid ?? null;
  }

  /**
   * 读取子进程退出信息。
   * ⚠️ 必须经本方法读取而非直接访问 `this.childExit`：spawnServer() 内先赋了 `null`，
   * TS 的控制流分析不会因 `await` 而失效，直接访问会被错误收窄为 `never`。
   */
  private readChildExit(): { code: number | null; signal: NodeJS.Signals | null } | null {
    return this.childExit;
  }

  /**
   * 保证有一个可用 server：命中外部实例则复用，否则 spawn 并等待就绪。
   * 可重复调用（错误页「重试」走的就是这条路），重入时不会遗留孤儿进程。
   * @throws {ServerStartTimeoutError} 30s 内未就绪
   */
  async ensureServer(): Promise<ServerHandle> {
    this.disposed = false;

    // —— 重入分支：上一轮已由本壳拉起且进程仍在 ——
    // ⚠️ 必须先于探活判断：否则自己拉起的 server 会在重试时被探活命中而误判成「外部 server」，
    //    spawnedByMe 被翻成 false，退出时不再清理 → 孤儿 node 进程（违反 AC6 / NFR-M5-7）。
    if (this.child && this.spawnedByMe && !this.readChildExit()) {
      if (await this.probeHealth(PROBE_TIMEOUT_MS)) {
        this.emit('ready', 'server 就绪');
        return { port: this.port, url: this.url, spawnedByMe: true };
      }
      // 自己的子进程还活着却不健康（如上一轮 30s 超时）→ 先杀干净再重来，避免叠加多个僵死 server
      await this.stopServer();
      this.disposed = false;
    }

    this.emit('probing', `正在检测本机 server（${this.url}）…`);
    if (await this.probeHealth(PROBE_TIMEOUT_MS)) {
      // AC6：外部已有健康 server，纯 loadURL，不拉进程、退出时也不 kill
      this.spawnedByMe = false;
      this.emit('reusing', '检测到已在运行的 server，直接复用');
      this.emit('ready', 'server 就绪');
      return { port: this.port, url: this.url, spawnedByMe: false };
    }

    this.emit('spawning', '正在启动本地 server…');
    await this.spawnServer();

    this.emit('waiting', '等待 server 就绪…');
    await this.waitReady(READY_TIMEOUT_MS);

    this.emit('ready', 'server 就绪');
    return { port: this.port, url: this.url, spawnedByMe: true };
  }

  /** GET /api/health，2xx 视为健康。任何异常/超时均返回 false（不抛）。 */
  private probeHealth(timeoutMs: number = PROBE_TIMEOUT_MS): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      let settled = false;
      const done = (value: boolean): void => {
        if (settled) return;
        settled = true;
        resolve(value);
      };

      const req = http.request(
        { host: SERVER_HOST, port: this.port, path: '/api/health', method: 'GET', timeout: timeoutMs },
        (res) => {
          const status = res.statusCode ?? 0;
          res.resume();
          res.on('end', () => done(status >= 200 && status < 300));
          res.on('error', () => done(false));
        },
      );
      req.on('timeout', () => {
        req.destroy();
        done(false);
      });
      req.on('error', () => done(false));
      req.end();
    });
  }

  /** spawn 独立 Node 子进程跑 server；stdout/stderr 落日志文件。 */
  private async spawnServer(): Promise<void> {
    if (!this.entry || !fs.existsSync(this.entry)) {
      throw new Error(`未找到 server 入口：${this.entry || '(空)'}。请先在仓库根执行 \`npm run build\`。`);
    }

    this.openLogStream();
    // ⚠️ 反向注释（§4.1.1 勘误，请勿"照着 §4.1 时序图修回去"）：
    // 时序图 spawn 那步画了 `HERMES_HOME=…`，那是设计期简写。**壳不得自行计算
    // HERMES_HOME**——解析权唯一归 server 的 hermes-proxy.ts（§7 两级解析）。
    // 壳若把 resolveActiveHermesHome() 的结果（root/profiles/<name>）注入进来，
    // server 会把「激活目录」当成「根」，于是 active_profile 写歪、listProfiles()
    // 只剩 default，F21 profile 切换整体报废且静默无报错。这里只透传 process.env。
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      // 核心：让 Electron 可执行文件以「纯 Node」身份运行，原生模块按 Node ABI 加载
      ELECTRON_RUN_AS_NODE: '1',
      PORT: String(this.port),
      ...this.extraEnv,
    };
    // 这些 Electron 专有变量会干扰纯 Node 子进程，显式剔除
    delete env.ELECTRON_NO_ATTACH_CONSOLE;
    delete env.ELECTRON_FORCE_IS_PACKAGED;

    const child = spawn(this.execPath, [this.entry], {
      env,
      cwd: path.dirname(this.entry),
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      // Unix：独立进程组，退出时 kill(-pgid) 可级联清理整棵树（含 Bridge :16765）
      detached: process.platform !== 'win32',
    });

    this.child = child;
    this.spawnedByMe = true;
    this.childExit = null;

    const stamp = new Date().toISOString();
    this.appendLog(`\n===== [${stamp}] spawn server pid=${child.pid ?? '?'} entry=${this.entry} =====\n`);
    // 🚫 不用 stream.pipe()：需要自己记账字节数才能做运行期按体积滚动（见 appendLog）
    child.stdout?.on('data', (chunk: Buffer) => this.appendLog(chunk));
    child.stderr?.on('data', (chunk: Buffer) => this.appendLog(chunk));

    child.on('error', (err: Error) => {
      this.appendLog(`[spawn error] ${err.message}\n`);
    });
    child.on('exit', (code, signal) => {
      this.childExit = { code, signal };
      this.appendLog(`===== server exited code=${code} signal=${signal} =====\n`);
    });

    // 给 spawn 失败（如 ENOENT）一个立即暴露的窗口
    await delay(50);
    const earlyExit = this.readChildExit();
    if (earlyExit) {
      throw new Error(`server 子进程启动后立即退出（code=${earlyExit.code}）；详见日志：${this.logPath()}`);
    }
    // 退出流程在 spawn 期间启动过 → 立刻回收，绝不把进程留给操作系统（NFR-M5-7）
    if (this.disposed) {
      await this.stopServer();
      throw new Error('server 启动过程中应用已退出，已回收子进程');
    }
  }

  /** 每 300ms 探活一次，最多 30s（FR-D7）。子进程中途退出则立即失败，不空等。 */
  private async waitReady(timeoutMs: number = READY_TIMEOUT_MS): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (this.disposed) throw new Error('等待 server 就绪期间应用已退出');
      const exited = this.readChildExit();
      if (exited) {
        throw new Error(
          `server 子进程意外退出（code=${exited.code}, signal=${exited.signal}）；详见日志：${this.logPath()}`,
        );
      }
      if (await this.probeHealth(PROBE_TIMEOUT_MS)) return;
      await delay(READY_POLL_INTERVAL_MS);
    }
    throw new ServerStartTimeoutError(timeoutMs, this.logPath());
  }

  /**
   * 退出清理：**仅**清理 `spawnedByMe === true` 的进程树。
   * Windows：`taskkill /PID <pid> /T /F`；Unix：`process.kill(-pgid, 'SIGTERM')` 后必要时 SIGKILL。
   */
  async stopServer(): Promise<void> {
    this.disposed = true;
    const child = this.child;
    const owned = this.spawnedByMe;
    this.child = null;

    if (!child || !owned) {
      // AC6：复用的外部 server 绝不 kill
      this.spawnedByMe = false;
      this.closeLogStream();
      this.emit('stopped', owned ? 'server 已停止' : '复用的外部 server 保持运行');
      return;
    }

    const pid = child.pid;
    if (pid && !this.readChildExit()) {
      if (process.platform === 'win32') {
        await new Promise<void>((resolve) => {
          execFile('taskkill', ['/PID', String(pid), '/T', '/F'], () => resolve());
        });
      } else {
        try {
          // 负 pid = 整个进程组（detached:true 时成立），可级联带走 Bridge 子进程
          process.kill(-pid, 'SIGTERM');
        } catch {
          try {
            child.kill('SIGTERM');
          } catch {
            /* 进程已退出 */
          }
        }
        await this.waitExit(child, GRACEFUL_KILL_WAIT_MS);
        if (!this.readChildExit()) {
          try {
            process.kill(-pid, 'SIGKILL');
          } catch {
            try {
              child.kill('SIGKILL');
            } catch {
              /* 进程已退出 */
            }
          }
        }
      }
    }

    this.spawnedByMe = false;
    this.closeLogStream();
    this.emit('stopped', 'server 已停止');
  }

  /** 等待子进程退出，最多 ms 毫秒（超时不抛，由调用方决定是否 SIGKILL）。 */
  private waitExit(child: ChildProcess, ms: number): Promise<void> {
    if (this.readChildExit()) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, ms);
      child.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  private emit(phase: ServerStatusPhase, message: string): void {
    try {
      this.onStatus({ phase, message, port: this.port, log_path: this.logPath() });
    } catch {
      /* 播报失败不影响启动主流程 */
    }
  }

  private openLogStream(): fs.WriteStream {
    if (this.logStream) return this.logStream;
    this.rotateLogs();
    this.logStream = fs.createWriteStream(this.logPath(), { flags: 'a' });
    this.logBytes = this.currentLogSize();
    return this.logStream;
  }

  private currentLogSize(): number {
    try {
      return fs.statSync(this.logPath()).size;
    } catch {
      return 0;
    }
  }

  /**
   * 写一段 server 输出。超过 `MAX_LOG_BYTES` 时**运行期**就地归档并重开，
   * 保证长时间挂机（壳可连开数天）也不会让 `server.log` 无限增长。
   */
  private appendLog(chunk: Buffer | string): void {
    if (!this.logStream) return;
    const buf = typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk;
    if (this.logBytes + buf.length > MAX_LOG_BYTES && !this.rollOversizedLog()) return;
    this.logBytes += buf.length;
    try {
      this.logStream.write(buf);
    } catch {
      /* 日志写失败不得影响 server 运行 */
    }
  }

  /** 关闭当前流 → 归档 → 重开同名文件。任一步失败都退化为「继续写」，宁可超限也不丢日志。 */
  private rollOversizedLog(): boolean {
    const stream = this.logStream;
    if (!stream) return false;
    try {
      stream.end();
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      fs.renameSync(this.logPath(), path.join(this.logDir(), `server-${stamp}.log`));
    } catch {
      /* 归档失败（文件被占用等）→ 下面直接重开同名文件继续追加 */
    }
    try {
      this.logStream = fs.createWriteStream(this.logPath(), { flags: 'a' });
      this.logBytes = this.currentLogSize();
      return true;
    } catch {
      this.logStream = null;
      return false;
    }
  }

  private closeLogStream(): void {
    if (!this.logStream) return;
    try {
      this.logStream.end();
    } catch {
      /* ignore */
    }
    this.logStream = null;
    this.logBytes = 0;
  }

  /** 按天轮转 + 保留 7 天（方案 §7「日志」）。任何 IO 异常都不应阻断启动。 */
  private rotateLogs(): void {
    const dir = this.logDir();
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch {
      return;
    }

    const current = this.logPath();
    try {
      const stat = fs.statSync(current);
      const fileDay = toLocalDay(stat.mtime);
      if (fileDay !== toLocalDay(new Date())) {
        const archived = path.join(dir, `server-${fileDay}.log`);
        if (fs.existsSync(archived)) {
          fs.appendFileSync(archived, fs.readFileSync(current));
          fs.rmSync(current, { force: true });
        } else {
          fs.renameSync(current, archived);
        }
      }
    } catch {
      /* 首次运行没有日志文件，属正常 */
    }

    const cutoff = Date.now() - LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    try {
      for (const name of fs.readdirSync(dir)) {
        if (!ARCHIVED_LOG_RE.test(name)) continue;
        const full = path.join(dir, name);
        try {
          if (fs.statSync(full).mtimeMs < cutoff) fs.rmSync(full, { force: true });
        } catch {
          /* 单个文件清理失败可忽略 */
        }
      }
    } catch {
      /* 目录读取失败可忽略 */
    }
  }
}
