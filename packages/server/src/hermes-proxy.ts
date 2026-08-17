// hermes-proxy：枚举/设置/MCP/记忆/自动化的 server 侧数据来源
// - 模型/技能经 python 子进程包装 hermes 的能力（失败回退内置静态快照）
// - MCP 直接读写 <hermesHome>/config.yaml 的 mcp_servers（js-yaml）；写后由 hermes config watcher 自动 reload
// - 设置读写 settings 表（db）
// - M4/F13 记忆：直接读写 <hermesHome>/memories/{MEMORY,USER}.md（`§` 分隔条目），写回带锁 + 备份 + 原子替换
// - M4/F15 自动化：读 <hermesHome>/cron/jobs.json 与 output/ 目录；写一律经 `hermes cron` CLI
// NFR3：无真实 hermes 时一律回退静态快照 / 本地沙箱，保证 UI 可演示。
// NFR5：写 hermes 数据仅限 F13 memories（锁+备份例外）与 F15 经 CLI，其余零直写。
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { db, getStoreInfo } from './db.js';
import { getRealSkills } from './services/hermes/read/skills.js';
import { getRealModels } from './services/hermes/read/models.js';
import { requestBridgeRestart } from './services/hermes/env.js';
import { safeWriteConfig } from './services/hermes/write/config-yaml.js';
import type {
  ProviderGroup,
  Skill,
  McpServer,
  Settings,
  HermesMode,
  MemoryEntry,
  MemoryGroup,
  CronJob,
  CronRun,
  ProviderInfo,
  ProviderListResult,
  SetProviderKeyResult,
  ProfileInfo,
  ProfileListResult,
  UseProfileResult,
  HealthInfo,
} from './protocol.js';

// ───────────────────────── 结构化错误（路由层直接映射 HTTP 状态码）─────────────────────────
export class ProxyError extends Error {
  readonly status: number;
  readonly code: string;
  readonly detail?: string;

  constructor(status: number, code: string, message?: string, detail?: string) {
    super(message ?? code);
    this.name = 'ProxyError';
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

// ───────────────────────── 子进程（python 包装 hermes）─────────────────────────
function runPython(script: string, timeoutMs = 8000): Promise<string> {
  return new Promise((resolve, reject) => {
    const py = process.env.HERMES_PYTHON ?? 'python3';
    let child;
    try {
      // M5/§0.2.1：显式注入 HERMES_HOME —— hermes 不会据 active_profile 改写子进程环境
      child = spawn(py, ['-c', script], { env: hermesChildEnv() });
    } catch (e) {
      reject(e);
      return;
    }
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d.toString()));
    child.stderr.on('data', (d) => (err += d.toString()));
    const timer = setTimeout(() => {
      try { child.kill(); } catch { /* ignore */ }
      reject(new Error('python timeout'));
    }, timeoutMs);
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(out.trim());
      else reject(new Error(err || `code ${code}`));
    });
  });
}

// ───────────────────────── TTL 缓存（5 分钟）─────────────────────────
const CACHE_TTL = 5 * 60 * 1000;
const cache = new Map<string, { ts: number; data: unknown }>();
function cacheGet<T>(key: string): T | null {
  const c = cache.get(key);
  if (c && Date.now() - c.ts < CACHE_TTL) return c.data as T;
  return null;
}
function cacheSet(key: string, data: unknown): void {
  cache.set(key, { ts: Date.now(), data });
}

// ───────────────────────── 内置静态快照（仅保留注释，数据源已切至真实 hermes）───
// MODELS_SNAPSHOT 已删除（U-06）：/api/models 现从 config.yaml custom_providers[].models{} 读取
// SKILLS_SNAPSHOT 已删除（U-05）：/api/skills 现从 $HERMES_HOME/skills/ + hermes-agent 文件系统扫描

// ───────────────────────── 模型枚举 ─────────────────────────
export async function getModels(): Promise<ProviderGroup[]> {
  const cached = cacheGet<ProviderGroup[]>('models');
  if (cached) return cached;
  try {
    const providers = getRealModels();
    cacheSet('models', providers);
    return providers;
  } catch {
    return [];
  }
}

/**
 * F18/O-5：模型上下文窗口查询（同步，用于 contextEstimate 的 context_max 兜底）。
 * 从真实 config.yaml 读取，回落 128k。
 */
export function getModelContextWindow(model?: string): number {
  const id = (model ?? '').trim().toLowerCase();
  if (!id) return 128_000;
  try {
    const providers = getRealModels();
    for (const g of providers) {
      for (const m of g.models) {
        if (m.id.toLowerCase() === id && m.context) return m.context;
      }
    }
  } catch { /* fall through to heuristics */ }
  // 启发式回落
  if (id.includes('claude')) return 200_000;
  if (id.includes('gpt') || id.includes('glm')) return 128_000;
  if (id.includes('qwen')) return 32_768;
  return 128_000;
}

// ───────────────────────── 技能枚举 ─────────────────────────
export async function getSkills(): Promise<Skill[]> {
  const cached = cacheGet<Skill[]>('skills');
  if (cached) return cached;
  try {
    const skills = getRealSkills();
    cacheSet('skills', skills);
    return skills;
  } catch {
    return [];
  }
}

// ═══════════════════════ hermes home 唯一解析入口（M4 §0.0）═══════════════════════
/**
 * 解析 hermes 主目录。优先级：
 *   1. `HERMES_HOME` 环境变量（显式指定）
 *   2. win32 且 `%LOCALAPPDATA%/hermes` 存在（Windows 真实主目录，含 config.yaml / memories / cron）
 *   3. `~/.hermes`（非 win32 或探测失败时的传统路径）
 *
 * ⚠️ M3 曾写死 `HERMES_HOME ?? ~/.hermes`，在 Windows 上指向错误目录，导致 F12 MCP 读写空目录。
 * 本函数为 M4 起所有 hermes 数据访问（config.yaml / memories / cron）的唯一入口，顺带修复 F12。
 */
export function resolveHermesHome(): string {
  const env = process.env.HERMES_HOME;
  if (env && env.trim()) return env.trim();
  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA;
    if (localAppData) {
      const candidate = path.join(localAppData, 'hermes');
      try {
        if (fs.existsSync(candidate)) return candidate;
      } catch { /* 探测失败则继续回退 */ }
    }
  }
  return path.join(os.homedir(), '.hermes');
}

// ═══════════════════════ M5/§0.2.1 两级 hermes home 解析 ═══════════════════════
/*
 * ⚠️ 陷阱（hermes-agent issue #18594）：hermes 解析主目录的顺序是
 *   override → 环境变量 HERMES_HOME → 平台默认根目录
 * `<root>/active_profile` 只被「读一次并打 stderr 警告」，**不会**改写返回值，更不会
 * 改写子进程环境。源码注释原文：
 *   "Subprocess spawners are expected to propagate `HERMES_HOME` explicitly."
 * 因此只跑 `hermes profile use x` 不足以让 kmaster 自己派生的子进程切到新 profile ——
 * 它们会静默落回 default，造成「切了但没切」的数据错位。
 *
 * 解法：两级解析 + 所有 hermes 子进程 spawn 显式注入 env.HERMES_HOME。
 *   resolveHermesRoot()        → profile 枚举锚点、读 active_profile（= M4 的 resolveHermesHome）
 *   resolveActiveHermesHome()  → 子进程真正该用的目录
 */

/** 缺省 profile 名：语义上等价于「就用 root 本身，不进 profiles/ 子目录」。 */
export const DEFAULT_PROFILE = 'default';
/** 激活 profile 记录文件（懒创建，缺失即视为 default）。 */
const ACTIVE_PROFILE_FILE = 'active_profile';
/** profile 子目录（懒创建，缺失即视为「只有 default」）。 */
const PROFILES_DIR = 'profiles';

/** 进程内记忆缓存：避免每次 spawn 都读盘；profile 切换后由 invalidateHermesCaches() 清空。 */
let activeHomeMemo: { root: string; active: string; home: string } | null = null;

/**
 * hermes 根目录（profile 枚举锚点）。语义与 M4 的 `resolveHermesHome()` **完全一致**，
 * 仅为可读性提供别名：涉及 profile 的代码一律读 root，涉及子进程的一律读 activeHome。
 */
export function resolveHermesRoot(): string {
  return resolveHermesHome();
}

/**
 * 读取当前激活的 profile 名。
 * `<root>/active_profile` 懒创建：文件不存在 / 为空 / 读失败一律回落 `default`（🚫 不抛 ENOENT）。
 */
export function readActiveProfileName(): string {
  const file = path.join(resolveHermesRoot(), ACTIVE_PROFILE_FILE);
  try {
    if (!fs.existsSync(file)) return DEFAULT_PROFILE;
    const raw = fs.readFileSync(file, 'utf8').trim();
    return raw || DEFAULT_PROFILE;
  } catch {
    return DEFAULT_PROFILE;
  }
}

/**
 * 子进程真正该用的 hermes 主目录：
 *   active === 'default' ? root : root/profiles/<active>
 * 若 `<root>/profiles/<active>` 不存在（active_profile 指向已删除的 profile），回落 root，
 * 避免把子进程指到一个空目录导致「配置全丢」的更坏后果。
 */
export function resolveActiveHermesHome(): string {
  const root = resolveHermesRoot();
  const active = readActiveProfileName();
  if (activeHomeMemo && activeHomeMemo.root === root && activeHomeMemo.active === active) {
    return activeHomeMemo.home;
  }
  let home = root;
  if (active !== DEFAULT_PROFILE) {
    const candidate = path.join(root, PROFILES_DIR, active);
    try {
      if (fs.existsSync(candidate)) home = candidate;
    } catch { /* 探测失败保守回落 root */ }
  }
  activeHomeMemo = { root, active, home };
  return home;
}

/**
 * 所有 hermes 子进程（python / hermes CLI）的环境：继承 process.env 并**显式覆盖** HERMES_HOME。
 * 这是 §0.2.1 的核心修复点，🚫 任何新增 spawn 都不得再直接用 `process.env`。
 */
function hermesChildEnv(): NodeJS.ProcessEnv {
  return { ...process.env, HERMES_HOME: resolveActiveHermesHome() };
}

/**
 * 失效与 hermes 主目录绑定的全部缓存。
 * profile 切换 / 写入 Provider Key 后**必须**调用，否则 UI 会读到旧 profile 的模型与技能。
 */
export function invalidateHermesCaches(): void {
  cache.clear();
  activeHomeMemo = null;
}

/** kmaster-studio 自有数据根目录（备份 / 沙箱 / 上传）。 */
function kmasterHome(): string {
  return process.env.KMASTER_STUDIO_HOME
    ?? path.resolve(process.env.USERPROFILE ?? process.env.HOME ?? '.', '.kmaster-studio');
}

// ───────────────────────── MCP（config.yaml 读写）─────────────────────────
function configPath(): string {
  return path.join(resolveActiveHermesHome(), 'config.yaml');
}
function readConfig(): Record<string, any> {
  try {
    const raw = fs.readFileSync(configPath(), 'utf8');
    return (yaml.load(raw) as Record<string, any>) ?? {};
  } catch {
    return {};
  }
}
function writeConfig(cfg: Record<string, any>): void {
  fs.mkdirSync(resolveActiveHermesHome(), { recursive: true });
  fs.writeFileSync(configPath(), yaml.dump(cfg), 'utf8');
}

export function listMcp(): McpServer[] {
  const cfg = readConfig();
  const servers = (cfg.mcp_servers ?? {}) as Record<string, any>;
  return Object.entries(servers).map(([name, v]) => ({
    name,
    command: v?.command,
    args: v?.args,
    env: v?.env,
    status: 'unknown' as const,
  }));
}

export function addMcp(server: {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
}): McpServer[] {
  const cfg = readConfig();
  cfg.mcp_servers = cfg.mcp_servers ?? {};
  cfg.mcp_servers[server.name] = {
    command: server.command,
    args: server.args ?? [],
    env: server.env ?? {},
  };
  writeConfig(cfg);
  return listMcp();
}

export function removeMcp(name: string): McpServer[] {
  const cfg = readConfig();
  cfg.mcp_servers = cfg.mcp_servers ?? {};
  delete cfg.mcp_servers[name];
  writeConfig(cfg);
  return listMcp();
}

// ═══════════════════════ M4/F13 记忆适配层 ═══════════════════════

const MEMORY_FILES: Record<MemoryGroup, string> = { memory: 'MEMORY.md', user: 'USER.md' };
const MEMORY_SEPARATOR = '§';
const LOCK_SPIN_TIMEOUT_MS = 3000;
const LOCK_STALE_MS = 30_000;
const BACKUP_KEEP = 20;

const MEMORY_SEED: Record<MemoryGroup, string> = {
  memory: [
    '用户偏好使用中文交流，回答尽量简洁直接。',
    '项目 kmaster-studio 复用 hermes-studio 架构（Vue3 + Koa + Socket.IO + Python Bridge）。',
    '涉及 hermes 数据写入时，必须先备份再原子替换。',
  ].join(`\n${MEMORY_SEPARATOR}\n`) + '\n',
  user: [
    '用户是工程背景，期望端到端交付（实现 + 校验 + 结论）。',
    '偏好零新增依赖的轻量方案。',
  ].join(`\n${MEMORY_SEPARATOR}\n`) + '\n',
};

/** 记忆目录：真实 hermes memories 优先，缺失时落到本地沙箱并播种示例（NFR3）。 */
function memoriesDir(): string {
  const real = path.join(resolveActiveHermesHome(), 'memories');
  if (fs.existsSync(real)) return real;
  const sandbox = path.join(kmasterHome(), 'mock', 'memories');
  fs.mkdirSync(sandbox, { recursive: true });
  for (const group of Object.keys(MEMORY_FILES) as MemoryGroup[]) {
    const f = path.join(sandbox, MEMORY_FILES[group]);
    if (!fs.existsSync(f)) fs.writeFileSync(f, MEMORY_SEED[group], 'utf8');
  }
  return sandbox;
}

function memoryFilePath(group: MemoryGroup): string {
  return path.join(memoriesDir(), MEMORY_FILES[group]);
}

function sha8(content: string): string {
  return createHash('sha1').update(content, 'utf8').digest('hex').slice(0, 8);
}

function makeMemoryId(group: MemoryGroup, content: string): string {
  return `${group}:${sha8(content)}`;
}

function parseMemoryId(id: string): { group: MemoryGroup; hash: string } {
  const idx = id.indexOf(':');
  const group = (idx > 0 ? id.slice(0, idx) : '') as MemoryGroup;
  const hash = idx > 0 ? id.slice(idx + 1) : '';
  if (!(group in MEMORY_FILES) || !hash) {
    throw new ProxyError(400, 'bad_id', `invalid memory id: ${id}`);
  }
  return { group, hash };
}

/** 按「独立一行 §」切分条目；空白段落丢弃。 */
function parseEntries(raw: string): string[] {
  const out: string[] = [];
  let cur: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    if (line.trim() === MEMORY_SEPARATOR) {
      out.push(cur.join('\n'));
      cur = [];
    } else {
      cur.push(line);
    }
  }
  out.push(cur.join('\n'));
  return out.map((s) => s.trim()).filter((s) => s.length > 0);
}

/** 反向序列化：条目之间插入独立一行 §，文件末尾保留换行。 */
function serializeEntries(entries: string[]): string {
  const cleaned = entries.map((e) => e.trim()).filter((e) => e.length > 0);
  if (cleaned.length === 0) return '';
  return `${cleaned.join(`\n${MEMORY_SEPARATOR}\n`)}\n`;
}

function readMemoryFile(group: MemoryGroup): { entries: string[]; mtime: number } {
  const file = memoryFilePath(group);
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const stat = fs.statSync(file);
    return { entries: parseEntries(raw), mtime: stat.mtimeMs };
  } catch {
    return { entries: [], mtime: Date.now() };
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * `.kmlock` 自旋锁：`fs.open(path,'wx')` 原子创建，冲突自旋 ≤3s；
 * 锁文件超过 30s 视为陈旧可抢占。绝不触碰 hermes 自身的 `.lock`（Python portalocker 语义）。
 */
async function withMemoryLock<T>(file: string, fn: () => Promise<T> | T): Promise<T> {
  const lockPath = `${file}.kmlock`;
  const deadline = Date.now() + LOCK_SPIN_TIMEOUT_MS;
  let acquired = false;

  while (!acquired) {
    try {
      const fd = fs.openSync(lockPath, 'wx');
      fs.writeSync(fd, JSON.stringify({ pid: process.pid, ts: Date.now() }));
      fs.closeSync(fd);
      acquired = true;
    } catch (e: any) {
      if (e?.code !== 'EEXIST') {
        throw new ProxyError(500, 'lock_error', `failed to acquire memory lock: ${String(e?.message ?? e)}`);
      }
      // 陈旧锁抢占
      try {
        const st = fs.statSync(lockPath);
        if (Date.now() - st.mtimeMs > LOCK_STALE_MS) {
          fs.unlinkSync(lockPath);
          continue;
        }
      } catch { /* 锁刚被释放，下轮重试 */ }
      if (Date.now() >= deadline) {
        throw new ProxyError(423, 'locked', 'memory file is locked by another writer');
      }
      await sleep(50);
    }
  }

  try {
    return await fn();
  } finally {
    try { fs.unlinkSync(lockPath); } catch { /* 已释放 */ }
  }
}

function backupStamp(): string {
  const d = new Date();
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}-${p(d.getMilliseconds(), 3)}`;
}

/** 写前备份到 ~/.kmaster-studio/backups/memory/，仅保留最近 20 份。返回备份文件绝对路径。 */
function backupMemoryFile(file: string): string {
  const dir = path.join(kmasterHome(), 'backups', 'memory');
  fs.mkdirSync(dir, { recursive: true });
  const base = path.basename(file, '.md');
  const target = path.join(dir, `${base}.${backupStamp()}.md`);
  try {
    fs.copyFileSync(file, target);
  } catch {
    // 源文件尚不存在（首次创建）：落一个空备份占位，保持「写前必有备份」不变式
    fs.writeFileSync(target, '', 'utf8');
  }
  // 轮转
  try {
    const olds = fs.readdirSync(dir)
      .filter((f) => f.startsWith(`${base}.`) && f.endsWith('.md'))
      .sort();
    while (olds.length > BACKUP_KEEP) {
      const victim = olds.shift();
      if (victim) fs.unlinkSync(path.join(dir, victim));
    }
  } catch { /* 轮转失败不影响主流程 */ }
  return target;
}

/** tmp + rename 原子替换。 */
function atomicWrite(file: string, content: string): void {
  const tmp = `${file}.${randomBytes(4).toString('hex')}.tmp`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(tmp, content, 'utf8');
  fs.renameSync(tmp, file);
}

function toEntries(group: MemoryGroup, contents: string[], mtime: number): MemoryEntry[] {
  return contents.map((content, index) => ({
    id: makeMemoryId(group, content),
    group,
    content,
    index,
    updated_at: Math.round(mtime),
  }));
}

/** F13：列出记忆条目（可按分组与关键字过滤，server 端过滤）。 */
export function listMemory(group?: MemoryGroup, q?: string): MemoryEntry[] {
  const groups: MemoryGroup[] = group ? [group] : (Object.keys(MEMORY_FILES) as MemoryGroup[]);
  const needle = (q ?? '').trim().toLowerCase();
  const out: MemoryEntry[] = [];
  for (const g of groups) {
    const { entries, mtime } = readMemoryFile(g);
    out.push(...toEntries(g, entries, mtime));
  }
  return needle ? out.filter((e) => e.content.toLowerCase().includes(needle)) : out;
}

/** F13：按内容寻址 id 取单条。 */
export function getMemoryEntry(id: string): MemoryEntry | undefined {
  const { group, hash } = parseMemoryId(id);
  return listMemory(group).find((e) => e.id === `${group}:${hash}`);
}

/** F13：新增条目（追加到文件末尾）。锁 → 备份 → 原子写。 */
export async function createMemoryEntry(group: MemoryGroup, content: string): Promise<MemoryEntry> {
  const body = String(content ?? '').trim();
  if (!body) throw new ProxyError(400, 'bad_request', 'content required');
  if (!(group in MEMORY_FILES)) throw new ProxyError(400, 'bad_request', `invalid group: ${group}`);
  const file = memoryFilePath(group);

  return withMemoryLock(file, () => {
    const { entries } = readMemoryFile(group);
    backupMemoryFile(file);
    const next = [...entries, body];
    atomicWrite(file, serializeEntries(next));
    const mtime = fs.statSync(file).mtimeMs;
    return {
      id: makeMemoryId(group, body),
      group,
      content: body,
      index: next.length - 1,
      updated_at: Math.round(mtime),
    };
  });
}

/** F13：编辑条目（hash 定位，找不到抛 409 stale_id）。锁 → 备份 → 原子写。 */
export async function updateMemoryEntry(id: string, content: string): Promise<MemoryEntry> {
  const { group, hash } = parseMemoryId(id);
  const body = String(content ?? '').trim();
  if (!body) throw new ProxyError(400, 'bad_request', 'content required');
  const file = memoryFilePath(group);

  return withMemoryLock(file, () => {
    const { entries } = readMemoryFile(group);
    const idx = entries.findIndex((e) => sha8(e) === hash);
    if (idx < 0) {
      throw new ProxyError(409, 'stale_id', 'memory entry not found (content changed elsewhere)');
    }
    backupMemoryFile(file);
    const next = [...entries];
    next[idx] = body;
    atomicWrite(file, serializeEntries(next));
    const mtime = fs.statSync(file).mtimeMs;
    return {
      id: makeMemoryId(group, body),
      group,
      content: body,
      index: idx,
      updated_at: Math.round(mtime),
    };
  });
}

/** F13：删除条目，返回备份文件路径（供 UI 提示可回滚）。 */
export async function deleteMemoryEntry(id: string): Promise<{ ok: true; backup: string }> {
  const { group, hash } = parseMemoryId(id);
  const file = memoryFilePath(group);

  return withMemoryLock(file, () => {
    const { entries } = readMemoryFile(group);
    const idx = entries.findIndex((e) => sha8(e) === hash);
    if (idx < 0) {
      throw new ProxyError(404, 'not_found', 'memory entry not found');
    }
    const backup = backupMemoryFile(file);
    const next = entries.filter((_, i) => i !== idx);
    atomicWrite(file, serializeEntries(next));
    return { ok: true as const, backup };
  });
}

// ═══════════════════════ M4/F15 cron CLI 包装 ═══════════════════════

const CRON_CLI_TIMEOUT_MS = 15_000;

/** hermes 可执行文件解析：env → venv 内置 → PATH。 */
export function resolveHermesBin(): string {
  const env = process.env.HERMES_BIN;
  if (env && env.trim()) return env.trim();
  const home = resolveActiveHermesHome();
  const candidates = process.platform === 'win32'
    ? [
        path.join(home, 'hermes-agent', 'venv', 'Scripts', 'hermes.exe'),
        path.join(home, 'bin', 'hermes.exe'),
      ]
    : [
        path.join(home, 'hermes-agent', 'venv', 'bin', 'hermes'),
        path.join(home, 'bin', 'hermes'),
      ];
  for (const c of candidates) {
    try { if (fs.existsSync(c)) return c; } catch { /* ignore */ }
  }
  return 'hermes'; // 回退 PATH
}

function hermesBinAvailable(): boolean {
  const bin = resolveHermesBin();
  if (bin === 'hermes') return false; // PATH 中是否存在无法同步确定，保守视为不可用 → 走沙箱
  try { return fs.existsSync(bin); } catch { return false; }
}

interface CronContext {
  mode: 'real' | 'mock';
  dir: string;
  jobsPath: string;
  outputDir: string;
}

const CRON_SEED = {
  jobs: [
    {
      id: 'mock00000001',
      name: 'daily-report',
      prompt: '汇总昨天的工作进展，生成一份中文日报',
      skills: [],
      skill: null,
      model: null,
      provider: null,
      script: null,
      no_agent: false,
      context_from: null,
      schedule: { kind: 'cron', expr: '0 9 * * *', display: '0 9 * * *' },
      schedule_display: '0 9 * * *',
      repeat: { times: null, completed: 3 },
      enabled: true,
      state: 'scheduled',
      paused_at: null,
      paused_reason: null,
      created_at: new Date().toISOString(),
      next_run_at: null,
      last_run_at: null,
      last_status: 'ok',
      last_error: null,
      deliver: 'local',
      origin: null,
      workdir: null,
    },
  ],
};

/** cron 上下文：真实 hermes cron 目录 + 可用 CLI 时走真实链路，否则落本地沙箱（NFR3）。 */
function cronContext(): CronContext {
  const forceMock = (process.env.KMASTER_CRON_MOCK ?? '0') === '1';
  const realDir = path.join(resolveActiveHermesHome(), 'cron');
  if (!forceMock && fs.existsSync(realDir) && hermesBinAvailable()) {
    return {
      mode: 'real',
      dir: realDir,
      jobsPath: path.join(realDir, 'jobs.json'),
      outputDir: path.join(realDir, 'output'),
    };
  }
  const sandbox = path.join(kmasterHome(), 'mock', 'cron');
  const jobsPath = path.join(sandbox, 'jobs.json');
  fs.mkdirSync(path.join(sandbox, 'output'), { recursive: true });
  if (!fs.existsSync(jobsPath)) {
    fs.writeFileSync(jobsPath, JSON.stringify(CRON_SEED, null, 2), 'utf8');
  }
  return { mode: 'mock', dir: sandbox, jobsPath, outputDir: path.join(sandbox, 'output') };
}

/** spawn `hermes cron --accept-hooks <sub> …`（非 TTY 免交互）。失败抛 502 cli_failed。 */
function runHermesCli(args: string[], timeoutMs = CRON_CLI_TIMEOUT_MS): Promise<string> {
  const bin = resolveHermesBin();
  return new Promise((resolve, reject) => {
    let child;
    try {
      // M5/§0.2.1：显式注入 HERMES_HOME，保证 CLI 落在当前激活 profile 上
      child = spawn(bin, args, { env: hermesChildEnv(), windowsHide: true });
    } catch (e: any) {
      reject(new ProxyError(502, 'cli_failed', 'failed to spawn hermes CLI', String(e?.message ?? e)));
      return;
    }
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d.toString()));
    child.stderr.on('data', (d) => (err += d.toString()));
    const timer = setTimeout(() => {
      try { child.kill(); } catch { /* ignore */ }
      reject(new ProxyError(502, 'cli_failed', 'hermes CLI timeout', `args: ${args.join(' ')}`));
    }, timeoutMs);
    child.on('error', (e: any) => {
      clearTimeout(timer);
      reject(new ProxyError(502, 'cli_failed', 'hermes CLI error', String(e?.message ?? e)));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      const text = out.trim();
      if (code !== 0) {
        reject(new ProxyError(502, 'cli_failed', `hermes CLI exited with ${code}`, (err || text).trim()));
        return;
      }
      // 探真修正：hermes cron CLI 在业务失败时仍返回 exit code 0，
      // 仅在 stdout 打印 "Failed to ..." / "Error: ..." / "No job found ..."。
      // 因此必须再做一次文本判定，否则失败会被静默吞掉（写操作返回 200 但未生效）。
      const failure = detectCliFailure(text);
      if (failure) {
        reject(new ProxyError(failure.status, failure.code, failure.message, `args: ${args.join(' ')}`));
        return;
      }
      resolve(text);
    });
  });
}

/**
 * 派发一个不等待结果的 hermes CLI 子进程（用于「触发即返回」的 202 语义接口）。
 * 子进程 detached + unref，不占用 server 的事件循环，也不阻塞 HTTP 响应。
 */
function spawnHermesCliDetached(args: string[]): void {
  try {
    const child = spawn(resolveHermesBin(), args, {
      // M5/§0.2.1：detached 子进程同样必须显式注入 HERMES_HOME
      env: hermesChildEnv(),
      windowsHide: true,
      detached: true,
      stdio: 'ignore',
    });
    child.on('error', () => { /* 触发失败不影响已返回的 202；结果以运行历史为准 */ });
    child.unref();
  } catch {
    /* 同上：不抛出，避免把「已受理」变成 5xx */
  }
}

/** hermes CLI 的「软失败」判定：exit 0 但 stdout 是错误文案。 */
function detectCliFailure(
  text: string,
): { status: number; code: string; message: string } | null {
  const first = text.split('\n').map((l) => l.trim()).find((l) => l.length > 0) ?? '';
  if (!first) return null;
  // 目标不存在 -> 404
  if (/^(no job found|job not found|unknown job)\b/i.test(first)) {
    return { status: 404, code: 'not_found', message: first };
  }
  // 参数非法（调度表达式 / 时长格式等）-> 400
  if (/^failed to \w+ job:/i.test(first) && /invalid|unsupported|unknown|bad /i.test(first)) {
    return { status: 400, code: 'bad_request', message: first };
  }
  // 其余业务失败 -> 502
  if (/^(failed to |error:|traceback \(most recent call last\))/i.test(first)) {
    return { status: 502, code: 'cli_failed', message: first };
  }
  return null;
}

function readJobsFile(ctx: CronContext): any[] {
  try {
    const raw = fs.readFileSync(ctx.jobsPath, 'utf8');
    const parsed = JSON.parse(raw);
    const jobs = Array.isArray(parsed) ? parsed : parsed?.jobs;
    return Array.isArray(jobs) ? jobs : [];
  } catch {
    return [];
  }
}

/** 仅沙箱模式使用：直写沙箱 jobs.json（真实 hermes jobs.json 一律经 CLI，禁止 Node 直写）。 */
function writeSandboxJobs(ctx: CronContext, jobs: any[]): void {
  if (ctx.mode !== 'mock') {
    throw new ProxyError(500, 'invalid_state', 'refusing to write real hermes jobs.json directly');
  }
  fs.mkdirSync(path.dirname(ctx.jobsPath), { recursive: true });
  fs.writeFileSync(ctx.jobsPath, JSON.stringify({ jobs }, null, 2), 'utf8');
}

function mapJob(raw: any): CronJob {
  const schedule = raw?.schedule ?? {};
  return {
    id: String(raw?.id ?? ''),
    name: String(raw?.name ?? ''),
    prompt: String(raw?.prompt ?? ''),
    schedule_expr: String(schedule?.expr ?? raw?.schedule_display ?? ''),
    schedule_display: String(raw?.schedule_display ?? schedule?.display ?? schedule?.expr ?? ''),
    enabled: Boolean(raw?.enabled),
    state: String(raw?.state ?? (raw?.enabled ? 'scheduled' : 'paused')),
    next_run_at: raw?.next_run_at ?? null,
    last_run_at: raw?.last_run_at ?? null,
    last_status: (raw?.last_status ?? null) as CronJob['last_status'],
    last_error: raw?.last_error ?? null,
    deliver: raw?.deliver ?? null,
    script: raw?.script ?? null,
    no_agent: Boolean(raw?.no_agent),
    workdir: raw?.workdir ?? null,
    created_at: raw?.created_at ?? null,
    repeat_completed: Number(raw?.repeat?.completed ?? 0),
    repeat_times: raw?.repeat?.times ?? null,
  };
}

/** F15：列出定时任务（只读解析 jobs.json，比解析 `cron list` 表格文本可靠）。 */
export function listCronJobs(): CronJob[] {
  const ctx = cronContext();
  return readJobsFile(ctx).map(mapJob);
}

/** F15：取单个任务。 */
export function getCronJob(id: string): CronJob | undefined {
  return listCronJobs().find((j) => j.id === id);
}

export interface CreateJobRequest {
  schedule: string;
  prompt?: string;
  name?: string;
  deliver?: string;
  repeat?: number;
  script?: string;
  no_agent?: boolean;
  workdir?: string;
}

/** createCronJob 的返回：新建任务 + 刷新后的全量列表。 */
export interface CreateJobResult {
  /** 新建出来的那条（真实链路按 id 差集识别；识别不到为 null）。 */
  job: CronJob | null;
  jobs: CronJob[];
}

/** F15：创建任务。真实链路经 CLI；沙箱直写沙箱 jobs.json。 */
export async function createCronJob(req: CreateJobRequest): Promise<CreateJobResult> {
  const schedule = String(req?.schedule ?? '').trim();
  if (!schedule) throw new ProxyError(400, 'bad_request', 'schedule required');
  const prompt = String(req?.prompt ?? '').trim();
  const ctx = cronContext();

  if (ctx.mode === 'real') {
    const before = new Set((await listCronJobs()).map((j) => j.id));
    const args = ['cron', '--accept-hooks', 'create', schedule];
    if (prompt) args.push(prompt);
    if (req.name) args.push('--name', String(req.name));
    if (req.deliver) args.push('--deliver', String(req.deliver));
    if (req.repeat !== undefined && req.repeat !== null) args.push('--repeat', String(req.repeat));
    if (req.script) args.push('--script', String(req.script));
    if (req.no_agent) args.push('--no-agent');
    if (req.workdir) args.push('--workdir', String(req.workdir));
    await runHermesCli(args);
    const jobs = await listCronJobs();
    return { job: jobs.find((j) => !before.has(j.id)) ?? null, jobs };
  }

  const newId = randomBytes(6).toString('hex');
  const jobs = readJobsFile(ctx);
  jobs.push({
    id: newId,
    name: req.name ?? `job-${jobs.length + 1}`,
    prompt,
    skills: [],
    skill: null,
    model: null,
    provider: null,
    script: req.script ?? null,
    no_agent: Boolean(req.no_agent),
    context_from: null,
    schedule: { kind: 'cron', expr: schedule, display: schedule },
    schedule_display: schedule,
    repeat: { times: req.repeat ?? null, completed: 0 },
    enabled: true,
    state: 'scheduled',
    paused_at: null,
    paused_reason: null,
    created_at: new Date().toISOString(),
    next_run_at: null,
    last_run_at: null,
    last_status: null,
    last_error: null,
    deliver: req.deliver ?? 'local',
    origin: null,
    workdir: req.workdir ?? null,
  });
  writeSandboxJobs(ctx, jobs);
  const all = await listCronJobs();
  return { job: all.find((j) => j.id === newId) ?? null, jobs: all };
}

export interface EditJobPatch {
  name?: string;
  schedule?: string;
  prompt?: string;
  deliver?: string;
  repeat?: number;
  workdir?: string;
  enabled?: boolean;
}

/**
 * F15：编辑任务。`enabled` 变更映射到 pause/resume 子命令，其余字段走 `cron edit`。
 * （已实测 `hermes cron edit` 支持 --schedule/--prompt/--name/--deliver/--repeat/--workdir，O-1 闭合。）
 */
export async function editCronJob(id: string, patch: EditJobPatch): Promise<CronJob[]> {
  if (!id) throw new ProxyError(400, 'bad_request', 'job id required');
  const ctx = cronContext();
  const existing = readJobsFile(ctx).find((j) => String(j?.id) === id);
  if (!existing) throw new ProxyError(404, 'not_found', `job ${id} not found`);

  if (ctx.mode === 'real') {
    const args = ['cron', '--accept-hooks', 'edit', id];
    let hasFieldEdit = false;
    if (patch.name !== undefined) { args.push('--name', String(patch.name)); hasFieldEdit = true; }
    if (patch.schedule !== undefined) { args.push('--schedule', String(patch.schedule)); hasFieldEdit = true; }
    if (patch.prompt !== undefined) { args.push('--prompt', String(patch.prompt)); hasFieldEdit = true; }
    if (patch.deliver !== undefined) { args.push('--deliver', String(patch.deliver)); hasFieldEdit = true; }
    if (patch.repeat !== undefined) { args.push('--repeat', String(patch.repeat)); hasFieldEdit = true; }
    if (patch.workdir !== undefined) { args.push('--workdir', String(patch.workdir)); hasFieldEdit = true; }
    if (hasFieldEdit) await runHermesCli(args);
    if (patch.enabled !== undefined) {
      await runHermesCli(['cron', '--accept-hooks', patch.enabled ? 'resume' : 'pause', id]);
    }
    return listCronJobs();
  }

  const jobs = readJobsFile(ctx);
  const target = jobs.find((j) => String(j?.id) === id);
  if (target) {
    if (patch.name !== undefined) target.name = patch.name;
    if (patch.prompt !== undefined) target.prompt = patch.prompt;
    if (patch.deliver !== undefined) target.deliver = patch.deliver;
    if (patch.workdir !== undefined) target.workdir = patch.workdir;
    if (patch.repeat !== undefined) target.repeat = { ...(target.repeat ?? {}), times: patch.repeat };
    if (patch.schedule !== undefined) {
      target.schedule = { kind: 'cron', expr: patch.schedule, display: patch.schedule };
      target.schedule_display = patch.schedule;
    }
    if (patch.enabled !== undefined) {
      target.enabled = patch.enabled;
      target.state = patch.enabled ? 'scheduled' : 'paused';
      target.paused_at = patch.enabled ? null : new Date().toISOString();
    }
  }
  writeSandboxJobs(ctx, jobs);
  return listCronJobs();
}

export async function pauseCronJob(id: string): Promise<CronJob[]> {
  return editCronJob(id, { enabled: false });
}

export async function resumeCronJob(id: string): Promise<CronJob[]> {
  return editCronJob(id, { enabled: true });
}

/** F15：删除任务。 */
export async function removeCronJob(id: string): Promise<{ ok: true }> {
  if (!id) throw new ProxyError(400, 'bad_request', 'job id required');
  const ctx = cronContext();
  const exists = readJobsFile(ctx).some((j) => String(j?.id) === id);
  if (!exists) throw new ProxyError(404, 'not_found', `job ${id} not found`);

  if (ctx.mode === 'real') {
    await runHermesCli(['cron', '--accept-hooks', 'remove', id]);
    return { ok: true };
  }
  writeSandboxJobs(ctx, readJobsFile(ctx).filter((j) => String(j?.id) !== id));
  return { ok: true };
}

/** F15：调度器状态（供 `run` 响应附带提示，O-2 兜底）。 */
export async function getCronStatus(): Promise<{ running: boolean; raw: string }> {
  const ctx = cronContext();
  if (ctx.mode !== 'real') return { running: false, raw: 'mock sandbox (hermes CLI unavailable)' };
  try {
    const out = await runHermesCli(['cron', 'status'], 8000);
    return { running: !/not running|stopped|未运行/i.test(out), raw: out };
  } catch (e: any) {
    return { running: false, raw: String(e?.detail ?? e?.message ?? e) };
  }
}

/**
 * F15：手动触发。语义为「在下一个调度器 tick 执行」（非立即执行），
 * 因此返回 202 语义并附带调度器状态提示。
 */
export async function runCronJob(id: string): Promise<{ ok: true; note: string; scheduler_running: boolean }> {
  if (!id) throw new ProxyError(400, 'bad_request', 'job id required');
  const ctx = cronContext();
  const exists = readJobsFile(ctx).some((j) => String(j?.id) === id);
  if (!exists) throw new ProxyError(404, 'not_found', `job ${id} not found`);

  if (ctx.mode === 'real') {
    // 探真修正：`hermes cron run <id>` 是**同步执行**整个任务（含 LLM 调用，可达数分钟），
    // 而本接口的契约是 202「已触发」。因此这里 fire-and-forget：
    // 派发后立即返回，执行结果由前端轮询 GET /api/cron-history 获取。
    // `--accept-hooks` 按 `hermes cron run [-h] [--accept-hooks] job_id` 的用法置于子命令之后。
    spawnHermesCliDetached(['cron', 'run', '--accept-hooks', id]);
    const status = await getCronStatus();
    return {
      ok: true,
      note: status.running
        ? '任务已触发，正在后台执行；结果请查看运行历史'
        : '任务已触发并在后台执行；注意 hermes 调度器当前未运行，定时排程不会自动触发',
      scheduler_running: status.running,
    };
  }
  return {
    ok: true,
    note: '沙箱模式：任务已标记为下个 tick 执行（无真实调度器）',
    scheduler_running: false,
  };
}

/**
 * A8：把 run md 头里的耗时文本解析为毫秒。
 * 支持 `48300ms` / `48.3s` / `1m30s` / `1h2m3s` / `00:01:30` / 裸数字（按秒）。
 * 解析不出返回 `undefined`——**不得回落 0**（0 是合法耗时，会污染前端 `?? '—'` 判定）。
 */
function parseDurationMs(text: string): number | undefined {
  const raw = text.trim().toLowerCase();
  if (!raw) return undefined;
  // ① hh:mm:ss / mm:ss
  const clock = raw.match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2}(?:\.\d+)?)$/);
  if (clock) {
    const h = Number(clock[1] ?? 0);
    const m = Number(clock[2]);
    const s = Number(clock[3]);
    if ([h, m, s].every((n) => Number.isFinite(n))) return Math.round((h * 3600 + m * 60 + s) * 1000);
  }
  // ② 纯毫秒
  const ms = raw.match(/^(\d+(?:\.\d+)?)\s*(?:ms|milliseconds?)$/);
  if (ms) return Math.round(Number(ms[1]));
  // ③ 复合单位 1h2m3s / 48.3s / 5 min
  const unitRe = /(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s)\b/g;
  let total = 0;
  let matched = false;
  for (const m2 of raw.matchAll(unitRe)) {
    const value = Number(m2[1]);
    if (!Number.isFinite(value)) continue;
    const unit = m2[2];
    const factor = unit.startsWith('h') ? 3600_000 : unit.startsWith('m') && unit !== 's' ? 60_000 : 1000;
    total += value * factor;
    matched = true;
  }
  if (matched) return Math.round(total);
  // ④ 裸数字按秒
  const bare = raw.match(/^(\d+(?:\.\d+)?)$/);
  if (bare) return Math.round(Number(bare[1]) * 1000);
  return undefined;
}

/** A8：触发方式归一化。识别不出返回 `undefined`（前端由 E4 依 job.schedule 推导兜底）。 */
function normalizeTrigger(text: string): string | undefined {
  const raw = text.trim().toLowerCase();
  if (!raw) return undefined;
  if (/(schedule|cron|timer|auto|定时|自动)/.test(raw)) return 'schedule';
  if (/(manual|hand|cli|user|手动|人工)/.test(raw)) return 'manual';
  return 'unknown';
}

/** 解析 output/<job_id>/<ts>.md 文件头。 */
function parseCronRunFile(jobId: string, file: string): CronRun | null {
  let raw = '';
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
  const pick = (label: string): string => {
    const m = raw.match(new RegExp(`^\\*\\*${label}:\\*\\*\\s*(.+)$`, 'm'));
    return m ? m[1].trim() : '';
  };
  const nameMatch = raw.match(/^#\s*Cron Job:\s*(.+)$/m);
  // 正文：首个 --- 分隔线之后
  const sepIdx = raw.indexOf('\n---');
  const body = sepIdx >= 0 ? raw.slice(sepIdx + 4) : raw;
  const excerpt = body.replace(/^[\s-]+/, '').replace(/\s+/g, ' ').trim().slice(0, 200);
  const runTimeFromName = path.basename(file, '.md').replace('_', ' ').replace(/-/g, (m, off, s) =>
    // 仅把时间部分的 - 换成 :（日期部分保留 -）
    s.indexOf(' ') >= 0 && off > s.indexOf(' ') ? ':' : m
  );
  const run: CronRun = {
    job_id: pick('Job ID') || jobId,
    job_name: nameMatch ? nameMatch[1].trim() : '',
    run_time: pick('Run Time') || runTimeFromName,
    status: pick('Status') || 'unknown',
    mode: pick('Mode') || 'agent',
    excerpt,
    file,
  };

  // —— A8 渐进增强（F-10）——
  // hermes 当前是否写这些 label 未知（F15/F22）。策略：能抽到就带上，抽不到**一律省略该 key**，
  // 绝不填 ''/0/null —— 否则前端 `?? '—'` 会把「未知」误显示成 0 或空白（§7.1）。
  const command = pick('Command');
  if (command) run.command = command;

  const exitCodeText = pick('Exit Code');
  if (exitCodeText) {
    const code = Number.parseInt(exitCodeText, 10);
    if (Number.isFinite(code)) run.exit_code = code;
  }

  const durationText = pick('Duration') || pick('Elapsed');
  if (durationText) {
    const ms = parseDurationMs(durationText);
    if (ms !== undefined) run.duration_ms = ms;
  }

  const logFile = pick('Log') || pick('Log File');
  if (logFile) run.log_file = logFile;

  const trigger = normalizeTrigger(pick('Trigger') || pick('Triggered By'));
  if (trigger) run.trigger = trigger;

  return run;
}

/** F15：运行历史（扫描 output 目录，按运行时间倒序）。 */
export function getCronHistory(jobId?: string, limit = 50): CronRun[] {
  const ctx = cronContext();
  const runs: CronRun[] = [];
  let jobDirs: string[] = [];
  try {
    jobDirs = fs.readdirSync(ctx.outputDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    return [];
  }
  for (const dir of jobDirs) {
    if (jobId && dir !== jobId) continue;
    const abs = path.join(ctx.outputDir, dir);
    let files: string[] = [];
    try {
      files = fs.readdirSync(abs).filter((f) => f.endsWith('.md'));
    } catch {
      continue;
    }
    for (const f of files) {
      const run = parseCronRunFile(dir, path.join(abs, f));
      if (run) runs.push(run);
    }
  }
  runs.sort((a, b) => (a.run_time < b.run_time ? 1 : a.run_time > b.run_time ? -1 : 0));
  return runs.slice(0, Math.max(1, limit));
}

// ───────────────────────── 全局设置（settings 表）─────────────────────────
/**
 * 读全局设置。
 * M5/FR21.9：新增 `theme` / `locale` / `terminal_cwd` 三个可写字段与 `active_profile`
 * 一个**只读镜像**（真值在 `<root>/active_profile` 文件，写入一律走 `PUT /api/profiles/active`）。
 * 未设置过的可选字段一律省略，保持旧客户端语义不变（向后兼容）。
 */
export async function getSettings(): Promise<Settings> {
  const store = await db();
  const mode = store.getSetting('default_mode') ?? 'default';
  const model = store.getSetting('default_model') ?? '';
  const settings: Settings = {
    default_mode: (mode as HermesMode) ?? 'default',
    default_model: model,
    active_profile: readActiveProfileName(),
  };
  const theme = store.getSetting('theme');
  if (theme === 'dark' || theme === 'light') settings.theme = theme;
  const locale = store.getSetting('locale');
  if (locale === 'zh-CN') settings.locale = locale;
  const terminalCwd = store.getSetting('terminal_cwd');
  if (terminalCwd) settings.terminal_cwd = terminalCwd;
  return settings;
}

/**
 * 写全局设置。仅接受可写字段；`active_profile` 是只读镜像，此处**刻意不接受**。
 * 入参全部可选，未传的键保持原值（PATCH 语义，向后兼容 M3 的两字段调用）。
 */
export async function setSettings(s: {
  default_mode?: HermesMode;
  default_model?: string;
  theme?: 'dark' | 'light';
  locale?: 'zh-CN';
  terminal_cwd?: string;
}): Promise<Settings> {
  const store = await db();
  if (s.default_mode) store.setSetting('default_mode', s.default_mode);
  if (s.default_model !== undefined) store.setSetting('default_model', s.default_model);
  if (s.theme === 'dark' || s.theme === 'light') store.setSetting('theme', s.theme);
  if (s.locale === 'zh-CN') store.setSetting('locale', s.locale);
  if (s.terminal_cwd !== undefined) store.setSetting('terminal_cwd', s.terminal_cwd);
  return getSettings();
}

// ═══════════════════════ M5/F21 设置页：Provider / Profile / 诊断 ═══════════════════════

/**
 * provider slug → API Key 环境变量名的兜底映射。
 * 优先取 `getModels()`（`build_models_payload`）返回的 `key_env`；真实 hermes 缺席时
 * （走 MODELS_SNAPSHOT）用本表补齐，再兜底 `<SLUG>_API_KEY`。
 */
const PROVIDER_KEY_ENV: Record<string, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
  google: 'GEMINI_API_KEY',
  gemini: 'GEMINI_API_KEY',
  moonshot: 'MOONSHOT_API_KEY',
  kimi: 'MOONSHOT_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  groq: 'GROQ_API_KEY',
  xai: 'XAI_API_KEY',
  mistral: 'MISTRAL_API_KEY',
  zhipu: 'ZHIPUAI_API_KEY',
  qwen: 'DASHSCOPE_API_KEY',
  // 本地推理无需 Key：空串表示「该 provider 不需要配置 Key」
  local: '',
  ollama: '',
  lmstudio: '',
};

/** 解析某 provider 的 key_env（三级回退，恒返回字符串，空串表示无需 Key）。 */
function providerKeyEnv(slug: string, fromPayload?: unknown): string {
  if (typeof fromPayload === 'string' && fromPayload.trim()) return fromPayload.trim();
  const mapped = PROVIDER_KEY_ENV[slug.toLowerCase()];
  if (mapped !== undefined) return mapped;
  return `${slug.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_API_KEY`;
}

/**
 * 凭据脱敏（FR21.5 / NFR-M5-5）：`length <= 8 ? '****' : '****' + slice(-4)`。
 * 🔒 这是明文唯一被允许经过的地方，返回值绝不含可复原信息。
 */
export function maskSecret(value: string): string {
  const v = value ?? '';
  if (!v) return '';
  return v.length <= 8 ? '****' : `****${v.slice(-4)}`;
}

/**
 * 读取 `<activeHome>/.env` 为 KEY→VALUE 映射。
 * 文件缺失 / 无权限 / 格式异常一律返回空表（🚫 不抛），保证 Provider 列表始终可渲染。
 */
function readHermesEnvFile(): Record<string, string> {
  const file = path.join(resolveActiveHermesHome(), '.env');
  const out: Record<string, string> = {};
  let raw = '';
  try {
    if (!fs.existsSync(file)) return out;
    raw = fs.readFileSync(file, 'utf8');
  } catch {
    return out;
  }
  for (const line of raw.split(/\r?\n/)) {
    const text = line.trim();
    if (!text || text.startsWith('#')) continue;
    const eq = text.indexOf('=');
    if (eq <= 0) continue;
    const key = text.slice(0, eq).trim().replace(/^export\s+/, '');
    let value = text.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length >= 2) ||
      (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }
    if (key) out[key] = value;
  }
  return out;
}

/**
 * 向 `<activeHome>/.env` 写入/更新单个 `KEY=VALUE`（保留其余行，仅替换匹配行或追加）。
 * 与 `readHermesEnvFile()` 解析格式一致：值不加引号。
 * 用 `.env` 而非 hermes CLI 落地 Key —— 避免本机 hermes CLI 缺失时 `config set` 必然失败。
 */
function writeHermesEnvVar(key: string, value: string): void {
  const file = path.join(resolveActiveHermesHome(), '.env');
  let lines: string[] = [];
  try {
    if (fs.existsSync(file)) {
      lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    }
  } catch { /* 读取失败按空处理 */ }
  const out: string[] = [];
  let replaced = false;
  for (const l of lines) {
    const t = l.trim();
    if (t === '' || t.startsWith('#')) { out.push(l); continue; }
    const eq = t.indexOf('=');
    if (eq <= 0) { out.push(l); continue; }
    const k = t.slice(0, eq).trim().replace(/^export\s+/, '');
    if (k === key) { out.push(`${key}=${value}`); replaced = true; continue; }
    out.push(l);
  }
  if (!replaced) out.push(`${key}=${value}`);
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, out.join('\n'), 'utf8');
  } catch { /* 写入失败不影响内存态校验（process.env 已设置） */ }
}

/** 从 `<activeHome>/.env` 删除单个 KEY（保留其余行）。 */
function deleteHermesEnvVar(key: string): void {
  const file = path.join(resolveActiveHermesHome(), '.env');
  try {
    if (!fs.existsSync(file)) return;
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    const out = lines.filter((l) => {
      const t = l.trim();
      if (t === '' || t.startsWith('#')) return true;
      const eq = t.indexOf('=');
      if (eq <= 0) return true;
      const k = t.slice(0, eq).trim().replace(/^export\s+/, '');
      return k !== key;
    });
    fs.writeFileSync(file, out.join('\n'), 'utf8');
  } catch { /* 忽略 */ }
}

/**
 * 在 config.yaml `custom_providers[]` 中创建或合并一个供应商条目。
 *
 * 用途（修复连通性测试）：前端「新增供应商」后它只存在于 localStorage，后端 `getRealModels()`
 * 读不到 → `setProviderKey` 旧逻辑直接 404。这里用 `safeWriteConfig` 把条目落进 config.yaml，
 * 使后端可枚举、连通性测试可落到真实 provider。
 *
 * 🔒 Key 以 `${KEY_ENV}` 引用形式存储，真实值落在 `.env`（不在 config.yaml 落明文）。
 *
 * @param spec.name      供应商名（与 custom_providers[].name 对齐）
 * @param spec.keyEnv   providerKeyEnv 推导出的 env 名；存在时 config.yaml 写 `api_key: ${keyEnv}`，真实值写 .env
 * @param spec.value    Key 明文（空串表示清除）
 * @param spec.baseUrl / apiMode / models  可选元数据（前端新增供应商时带过来）
 */
export async function upsertCustomProvider(spec: {
  name: string;
  keyEnv?: string;
  value?: string;
  baseUrl?: string;
  apiMode?: string;
  models?: Record<string, unknown>;
}): Promise<void> {
  await safeWriteConfig((current) => {
    const cfg = current as Record<string, unknown>;
    const providers = Array.isArray(cfg.custom_providers)
      ? [...(cfg.custom_providers as Array<Record<string, unknown>>)]
      : [];
    let entry = providers.find((p) => p.name === spec.name);
    if (!entry) {
      entry = { name: spec.name };
      providers.push(entry);
    }
    if (spec.keyEnv) {
      entry.api_key_env = spec.keyEnv;
      entry.api_key = spec.value ? `\${${spec.keyEnv}}` : (entry.api_key ?? '');
    } else if (spec.value !== undefined) {
      entry.api_key = spec.value;
    }
    if (spec.baseUrl) entry.base_url = spec.baseUrl;
    if (spec.apiMode) entry.api_mode = spec.apiMode;
    if (spec.models) entry.models = spec.models;
    return { ...cfg, custom_providers: providers };
  });
}

/** 当前 provider：config.yaml 显式声明 > 默认模型所属分组 > 首个已认证分组 > 首个分组。 */
function detectCurrentProvider(groups: ProviderGroup[], defaultModel: string): string {
  const cfg = readConfig();
  const declared = typeof cfg.provider === 'string' ? cfg.provider.trim() : '';
  if (declared && groups.some((g) => g.provider === declared)) return declared;
  if (defaultModel) {
    const hit = groups.find((g) => g.models.some((m) => m.id === defaultModel));
    if (hit) return hit.provider;
  }
  const authed = groups.find((g) => g.authenticated);
  if (authed) return authed.provider;
  return groups[0]?.provider ?? '';
}

/**
 * `GET /api/config/providers`：provider 配置态列表。
 * 🔒 返回体在 DTO 层面就不含明文 Key —— 只有 `configured` 与 `masked`（FR21.5）。
 * ♻️ 复用 `getModels()`（含静态快照回退），🚫 不新建模型枚举端点。
 */
export async function listProviders(): Promise<ProviderListResult> {
  const groups = await getModels();
  const envMap = readHermesEnvFile();
  const settings = await getSettings();
  const current = detectCurrentProvider(groups, settings.default_model);

  const providers: ProviderInfo[] = groups.map((g) => {
    const keyEnv = providerKeyEnv(g.provider, (g as unknown as { key_env?: unknown }).key_env);
    const rawValue = keyEnv ? (envMap[keyEnv] ?? process.env[keyEnv] ?? '') : '';
    const configured = keyEnv !== '' && rawValue.trim().length > 0;
    const info: ProviderInfo = {
      slug: g.provider,
      name: g.label || g.provider,
      key_env: keyEnv,
      configured,
      masked: configured ? maskSecret(rawValue.trim()) : '',
      is_current: g.provider === current,
      authenticated: g.authenticated ?? false,
      total_models: g.models.length,
    };
    if (!keyEnv) info.warning = '该 provider 无需 API Key（本地推理）';
    else if (!configured) info.warning = `未检测到 ${keyEnv}，保存 Key 后生效`;
    return info;
  });

  return { providers, current };
}

/**
 * `PUT /api/config/providers`：写入 / 清除某 provider 的 API Key。
 * ♻️ 一律走 `runHermesCli(['config','set',<key_env>,<value>])`（FR21.4）——
 * 🚫 不用 js-yaml 直写（丢注释）、🚫 不引入任何 YAML/.env 写库。
 * 🔒 返回值只含 `configured` + `masked`，永不回显明文。
 *
 * @param provider provider slug（须存在于 `getModels()` 的分组中）
 * @param apiKey   明文 Key；空串表示清除
 */
export async function setProviderKey(provider: string, apiKey: string): Promise<SetProviderKeyResult> {
  const slug = (provider ?? '').trim();
  if (!slug) throw new ProxyError(400, 'bad_request', 'provider required');

  const groups = await getModels();
  const group = groups.find((g) => g.provider === slug);
  const keyEnv = providerKeyEnv(slug, group ? (group as unknown as { key_env?: unknown }).key_env : undefined);
  const value = (apiKey ?? '').trim();

  // 🔒 Key 引用落 config.yaml：只要供应商有 key_env，始终把 `api_key_env` + 引用写回
  // custom_providers —— **不论该 provider 是否已在 config.yaml**（旧逻辑仅在 `!group`
  // 时写，导致 provider 已存在时只写 .env、漏写 config.yaml）。
  // 不一致的后果：`listProviders().configured`（读 .env）说已配置、`getRealModels().authenticated`
  // （读 config.yaml api_key_env）说未配置 → 重测通过、但聊天链路（走 getRealModels）找不到 Key。
  // 模型列表由前端 putProviderMeta 单独维护，此处不传 models，避免被覆盖。
  if (keyEnv) {
    await upsertCustomProvider({ name: slug, keyEnv, value });
    // Key 落地：写入 <activeHome>/.env + 进程内 process.env。
    // 不再依赖 `hermes config set` CLI —— 本机 hermes CLI 常不在 PATH，旧逻辑会抛 502 cli_failed。
    if (value.length > 0) {
      writeHermesEnvVar(keyEnv, value);
      process.env[keyEnv] = value;
    } else {
      deleteHermesEnvVar(keyEnv);
      delete process.env[keyEnv];
    }
  } else if (value.length > 0) {
    // 无 key_env 的供应商（如本地推理）：以明文形式落到 custom_providers.api_key
    await upsertCustomProvider({ name: slug, value });
  }

  // Key 变更会影响 provider 认证态与可用模型列表 → 必须失效枚举缓存
  invalidateHermesCaches();

  return {
    ok: true,
    provider: slug,
    configured: value.length > 0,
    masked: value.length > 0 ? maskSecret(value) : '',
  };
}

/** 安全读取目录下的子目录名列表（失败返回空数组）。 */
function safeListDirs(dir: string): string[] {
  try {
    if (!fs.existsSync(dir)) return [];
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

/** 读取某 profile 目录下 config.yaml 的只读元信息（零子进程，失败返回空对象）。 */
function readProfileMeta(dir: string): { model?: string; provider?: string; description?: string } {
  try {
    const file = path.join(dir, 'config.yaml');
    if (!fs.existsSync(file)) return {};
    const cfg = (yaml.load(fs.readFileSync(file, 'utf8')) as Record<string, unknown>) ?? {};
    const meta: { model?: string; provider?: string; description?: string } = {};
    if (typeof cfg.model === 'string' && cfg.model.trim()) meta.model = cfg.model.trim();
    if (typeof cfg.provider === 'string' && cfg.provider.trim()) meta.provider = cfg.provider.trim();
    if (typeof cfg.description === 'string' && cfg.description.trim()) {
      meta.description = cfg.description.trim();
    }
    return meta;
  } catch {
    return {};
  }
}

/** 组装单条 ProfileInfo（全部字段来自纯文件系统读取，Q8：零子进程）。 */
function buildProfileInfo(name: string, dir: string, isDefault: boolean, active: string): ProfileInfo {
  const meta = readProfileMeta(dir);
  const info: ProfileInfo = {
    name,
    path: dir,
    is_default: isDefault,
    is_active: name === active,
    has_env: fs.existsSync(path.join(dir, '.env')),
    skill_count: safeListDirs(path.join(dir, 'skills')).length,
  };
  if (meta.model) info.model = meta.model;
  if (meta.provider) info.provider = meta.provider;
  if (meta.description) info.description = meta.description;
  return info;
}

/**
 * `GET /api/profiles`：扫 `<root>/profiles/*` + 读 `<root>/active_profile`。
 * ⚠️ 两者均为**懒创建**：任一缺失都回落为「仅 default，且 default 为激活态」，🚫 绝不抛 ENOENT。
 * ⚠️ `active_profile` 指向一个已不存在的目录时，激活态同样回落 default —— 与
 *    `resolveActiveHermesHome()` 的回落规则保持严格一致，避免 UI 与子进程各说各话。
 */
export function listProfiles(): ProfileListResult {
  const root = resolveHermesRoot();
  const declaredActive = readActiveProfileName();
  const names = safeListDirs(path.join(root, PROFILES_DIR));
  const active = declaredActive === DEFAULT_PROFILE || names.includes(declaredActive)
    ? declaredActive
    : DEFAULT_PROFILE;

  const profiles: ProfileInfo[] = [buildProfileInfo(DEFAULT_PROFILE, root, true, active)];
  for (const name of names) {
    if (name === DEFAULT_PROFILE) continue; // 同名子目录不重复列出，root 的 default 优先
    profiles.push(buildProfileInfo(name, path.join(root, PROFILES_DIR, name), false, active));
  }
  return { profiles, active, root };
}

/**
 * `PUT /api/profiles/active`：切换激活 profile。
 * ♻️ 写入走 `runHermesCli(['profile','use',name])`，保证 hermes 自身副作用不被绕过。
 *
 * ⚠️ §0.2.1：CLI 只写 `<root>/active_profile`，**不会**改写任何已存在子进程的 HERMES_HOME。
 * 因此本函数在 CLI 成功后立即 `invalidateHermesCaches()`，让后续所有 spawn 经
 * `hermesChildEnv()` 拿到新目录；返回 `restart_required: true` 通知调用方重建 Bridge 连接。
 *
 * 「有 run 在跑则拒绝切换」的判定在路由层完成（hermes-proxy 不依赖 run-chat，避免循环导入）。
 */
export async function useProfile(name: string): Promise<UseProfileResult> {
  const target = (name ?? '').trim();
  if (!target) throw new ProxyError(400, 'bad_request', 'profile name required');

  const before = listProfiles();
  if (!before.profiles.some((p) => p.name === target)) {
    throw new ProxyError(404, 'not_found', `profile ${target} not found`);
  }

  if (target !== before.active) {
    await runHermesCli(['profile', 'use', target]);
    invalidateHermesCaches();
    // 探真：hermes CLI 存在「exit 0 但没生效」的历史（M4 cron 同款），必须回读断言
    const applied = readActiveProfileName();
    const effective = applied === target
      || (target === DEFAULT_PROFILE && applied === DEFAULT_PROFILE);
    if (!effective) {
      throw new ProxyError(
        502,
        'cli_failed',
        `hermes profile use ${target} reported success but active_profile is "${applied}"`,
      );
    }
  }
  invalidateHermesCaches();
  requestBridgeRestart();  // U-24: 切 profile 后触发 Bridge 重建

  return {
    ok: true,
    active: target,
    hermes_home: resolveActiveHermesHome(),
    restart_required: true,
  };
}

/** 读取 server 版本号：npm 注入 > package.json 就近查找 > 'unknown'。 */
function readServerVersion(): string {
  const injected = process.env.npm_package_version;
  if (injected && injected.trim()) return injected.trim();
  let here = '';
  try {
    here = path.dirname(fileURLToPath(import.meta.url));
  } catch {
    return 'unknown';
  }
  // src/ 直跑（tsx）与 dist/ 编译后两种布局都覆盖
  const candidates = [
    path.resolve(here, '../package.json'),
    path.resolve(here, '../../package.json'),
    path.resolve(here, '../../../package.json'),
  ];
  for (const file of candidates) {
    try {
      if (!fs.existsSync(file)) continue;
      const pkg = JSON.parse(fs.readFileSync(file, 'utf8')) as { name?: string; version?: string };
      if (pkg?.version && pkg.name !== 'kmaster-studio') return pkg.version;
    } catch { /* continue */ }
  }
  return 'unknown';
}

/** python 可用性探测（带 TTL 缓存，避免每次 /api/health 都 spawn）。 */
async function probePythonOk(): Promise<boolean> {
  const cached = cacheGet<boolean>('python_ok');
  if (cached !== null) return cached;
  let ok = false;
  try {
    await runPython('print(1)', 3000);
    ok = true;
  } catch {
    ok = false;
  }
  cacheSet('python_ok', ok);
  return ok;
}

/**
 * `GET /api/health` 的 hermes / 运行时诊断字段（FR21.8）。
 * ♻️ 扩展既有端点，🚫 不新建诊断端点。
 * ⚠️ 终端相关字段（terminal_available / node_pty_error）由路由层从 `terminalManager`
 *    合入 —— hermes-proxy 刻意不依赖 F20 的 services/terminal。
 */
export async function probeHealth(): Promise<HealthInfo> {
  const store = getStoreInfo();
  const health: HealthInfo = {
    ok: true,
    service: 'kmaster-server',
    ts: Date.now(),
    version: readServerVersion(),
    port: Number(process.env.PORT ?? 6648),
    bridge_mock: (process.env.HERMES_BRIDGE_MOCK ?? '1') !== '0',
    hermes_home: resolveActiveHermesHome(),
    python_ok: await probePythonOk(),
    hermes_cli_ok: hermesBinAvailable(),
  };
  // 'uninitialized' 不是对外契约的合法值，此时干脆不报（字段可选）
  if (store.kind === 'sqlite' || store.kind === 'memory') health.db_kind = store.kind;
  if (store.error) health.db_error = store.error;
  return health;
}

/**
 * 诊断信息脱敏（NFR-M5-5）：把绝对路径里的用户名替换为 `<user>`。
 * 供「复制诊断信息」使用；client 侧同源实现，两边都做以防单点遗漏。
 */
export function redactUserPaths(text: string): string {
  const user = os.userInfo().username;
  if (!user) return text;
  const escaped = user.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(escaped, 'g'), '<user>');
}
