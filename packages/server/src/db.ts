// 轻量持久层：优先 better-sqlite3，缺失时回退内存 Map（保证在无原生模块环境也可运行）
// M4：新增 queue（F17 消息队列）与 usage（F22 用量账本）两组契约，sqlite 与内存实现语义逐方法对齐（NFR4）。
// M5/Q4：降级路径此前是**静默**的（catch {} → return null），会让「刷新后保持」类验收出现误判
//        （数据其实只在内存里，重启即丢）。现改为显式可观测：启动日志明确打印降级原因，
//        并经 getStoreInfo() 暴露给 GET /api/health 的 db_kind / db_error 字段。
// V3/#19：sessions 表新增 workspace 列（每会话工作目录，绑终端 cwd）。用 SQLite 的
//         PRAGMA user_version 做一次性迁移：旧库升级时自动 ALTER，旧库 user_version<1 时
//         追加列后置位。MemoryStore 走 JS 字段，不需要迁移。
import path from 'node:path';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import type { QueueItem, UsageStatRow, UsageTotals, UsageGroupBy } from './protocol.js';

const home = process.env.KMASTER_STUDIO_HOME
  ?? path.resolve(process.env.USERPROFILE ?? process.env.HOME ?? '.', '.kmaster-studio');
fs.mkdirSync(home, { recursive: true });
const dbPath = path.join(home, 'kmaster.db');

export interface SessionRow {
  id: string;
  title: string;
  profile: string | null;
  created_at: number;
  updated_at: number;
  archived: number;
  // M3：每会话覆盖（继承自全局默认）
  mode?: string | null;
  model?: string | null;
  // V3/#19：每会话工作目录（终端 cwd 默认值；web 模式下作为文件上下文锚点）
  workspace?: string | null;
  // B-01（schema v2）：技能 / MCP 侧车列。hermes state.db 无处存放（F4），
  // 故落 kmaster.db，读时以 id 为键 left-join 回 state.db 结果。
  // 存储形态恒为 JSON 数组字符串，DEFAULT '[]'，解析失败回落 []（§7.1）。
  skills?: string | null;
  mcp_servers?: string | null;
  /**
   * B-02（schema v2 / U2「hermes 无 session 写通道」分支）：置顶态侧车覆盖。
   *
   * ⚠️ **三态语义**（主理人 Q1 裁定）：
   *   - `null`  = 未覆盖 → merge 时回落 hermes state.db 的 `pinned`
   *   - `0`     = 用户显式取消置顶
   *   - `1`     = 用户显式置顶
   *
   * 因此列必须**可空**（`ALTER ... ADD COLUMN pinned INTEGER`，不带 NOT NULL/DEFAULT）。
   * 若用 `NOT NULL DEFAULT 0`，`run-chat.ts` 对每个跑过的会话调 `getOrCreateSession()`
   * 建行时会写入 0，从而把 hermes 侧的 `pinned=1` 静默压平。
   */
  pinned?: number | null;
  /**
   * B-03（schema v2）：归档态侧车覆盖，三态语义同 `pinned`。
   *
   * 刻意**不复用**既有的 `archived INTEGER NOT NULL DEFAULT 0` 列：
   *   ① 那一列非空，对「从未设置」与「显式取消归档」不可分辨；
   *   ② 改它的可空性需要整表重建，而它还被 `listSessions()` 的
   *      `WHERE archived = 0` 依赖，重建的收益抵不上回归风险。
   * 故新增一列承载三态，legacy `archived` 保持原样只作向后兼容（不再由本模块写入）。
   */
  archived_override?: number | null;
  /** T02：会话绑定的 Agent ID（创建时指定），未指定时为 null */
  agent?: string | null;
}

/**
 * 三态标记位求值：侧车覆盖优先，未覆盖回落 hermes 值。
 *
 * @param override kmaster.db 侧车列（`null`/`undefined` = 未覆盖）
 * @param hermesValue hermes state.db 的原值
 */
export function resolveTriStateFlag(override: number | null | undefined, hermesValue: number | null | undefined): boolean {
  if (override === null || override === undefined) return !!hermesValue;
  return override !== 0;
}

/**
 * JSON 数组列解析（§7.1 硬约定）。
 * 解析失败/非数组一律静默回落 `[]`，**不得抛异常中断整个列表接口**。
 */
export function parseJsonArrayColumn(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((x): x is string => typeof x === 'string');
  if (typeof raw !== 'string') return [];
  const text = raw.trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text) as unknown;
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** 数组 → JSON 列文本（统一去空白项、保持稳定形态）。 */
export function toJsonArrayColumn(list: readonly string[] | null | undefined): string {
  if (!Array.isArray(list)) return '[]';
  return JSON.stringify(list.filter((x) => typeof x === 'string' && x.trim() !== ''));
}

/**
 * B-02/B-03：三态标记位补丁。
 * `undefined` = 不动；`true`/`false` = 写显式覆盖；`null` = 清除覆盖回落 hermes。
 */
export interface SessionFlagsPatch {
  pinned?: boolean | null;
  archived?: boolean | null;
}

export interface MessageRow {
  id: string;
  session_id: string;
  role: string;
  content: string;
  created_at: number;
  usage_json: string | null;
  guidance: number;
}

/** F22：单条用量写入载荷（model 由 run-chat 用有效值补齐，事件本身无该字段）。 */
export interface UsageInput {
  session_id: string;
  model?: string | null;
  input_tokens: number;
  output_tokens: number;
  cost?: number;
  ts?: number;
}

/** F17：入队载荷（position 由持久层分配，保证同会话严格递增）。 */
export type QueueInput = Omit<QueueItem, 'position'> & { position?: number };

/** 本地时区 YYYY-MM-DD（写入时算好，聚合直接 GROUP BY）。 */
export function localDay(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// 持久层统一契约（sqlite 与内存实现共用），db() 始终返回非空 Store
export interface Store {
  getOrCreateSession: (id: string, profile?: string, workspace?: string | null, agent?: string | null) => SessionRow;
  listSessions: () => SessionRow[];
  getSession: (id: string) => SessionRow | undefined;
  renameSession: (id: string, title: string) => void;
  deleteSession: (id: string) => void;
  getMessages: (sessionId: string) => MessageRow[];
  appendMessage: (m: {
    session_id: string;
    role: string;
    content: string;
    usage_json?: string | null;
    guidance?: number;
    id?: string;
    created_at?: number;
  }) => MessageRow;
  // M3：全局设置（key/value 文本存储）
  getSetting: (key: string) => string | null;
  setSetting: (key: string, value: string) => void;
  // M3：每会话模式/模型覆盖持久化
  setSessionModeModel: (id: string, mode?: string | null, model?: string | null) => void;
  // V3/#19：每会话工作目录（持久层接口；调用方传 null/'' 视为清空）
  setSessionWorkspace: (id: string, workspace?: string | null) => void;
  /**
   * T04/CH-D：每会话 Agent 角色（kmaster.db 侧车 `agent` 列）。
   *
   * 调用方传 `null` / 空串视为「解除绑定」——出参 `mergeSession()` 会自动
   * 回落 hermes 的 `profile_name`。🚫 本方法不写 hermes state.db。
   */
  setSessionAgent: (id: string, agent?: string | null) => void;

  // —— B-01/B-02/B-03（schema v2）会话侧车字段 ——
  /**
   * A5：批量取会话行。GET /api/sessions 用它一次性拉齐侧车列，
   * **禁止在 map 循环里逐条 getSession（N+1）**。
   * 返回顺序不保证，调用方自行构 Map；不存在的 id 直接缺席。
   */
  getSessionsByIds: (ids: readonly string[]) => SessionRow[];
  /**
   * B-01：写 skills / mcp_servers 侧车列。
   * 传 `undefined` 表示该列保持不变；传 `null` 或 `[]` 均写入 `'[]'`。
   */
  setSessionSkillsMcp: (id: string, skills?: readonly string[] | null, mcpServers?: readonly string[] | null) => void;
  /**
   * B-02/B-03：pinned / archived 标记位（U2 分支：hermes 无 session 写通道 → 落 kmaster.db 侧车）。
   *
   * 三态写入语义：
   *   - `undefined`（不传该键）→ 保持不变
   *   - `true` / `false`       → 写显式覆盖 1 / 0
   *   - `null`                 → 清除覆盖，回落 hermes 值
   */
  setSessionFlags: (id: string, flags: SessionFlagsPatch) => void;

  // —— M4/F17 队列（排序恒为 position ASC）——
  enqueue: (item: QueueInput) => QueueItem;
  listQueue: (sessionId?: string) => QueueItem[];
  peekQueue: (sessionId: string) => QueueItem | undefined;
  getQueueItem: (id: string) => QueueItem | undefined;
  removeQueueItem: (id: string) => void;
  clearQueue: (sessionId?: string) => void;
  /** 「立即发送」把条目提到会话队首（position = 当前最小值 - 1）。 */
  moveQueueItemToFront: (id: string) => QueueItem | undefined;

  // —— M4/F22 用量（聚合恒按 key ASC）——
  addUsage: (u: UsageInput) => void;
  queryUsage: (group: UsageGroupBy, from?: string, to?: string) => { rows: UsageStatRow[]; totals: UsageTotals };
}

/** 用量原始行（内存实现与聚合共用）。 */
interface UsageRow {
  id: string;
  session_id: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost: number;
  ts: number;
  day: string;
}

/** 按 group 归约原始行 → 聚合行 + 总计（sqlite 与内存共用同一语义，避免两套口径漂移）。 */
function reduceUsage(rows: UsageRow[], group: UsageGroupBy): { rows: UsageStatRow[]; totals: UsageTotals } {
  const buckets = new Map<string, UsageStatRow>();
  const sessions = new Set<string>();
  const totals: UsageTotals = { input_tokens: 0, output_tokens: 0, cost: 0, sessions: 0 };
  for (const r of rows) {
    const key = group === 'day' ? r.day : group === 'model' ? r.model : r.session_id;
    const b = buckets.get(key) ?? { key, input_tokens: 0, output_tokens: 0, cost: 0, runs: 0 };
    b.input_tokens += r.input_tokens;
    b.output_tokens += r.output_tokens;
    b.cost += r.cost;
    b.runs += 1;
    buckets.set(key, b);
    totals.input_tokens += r.input_tokens;
    totals.output_tokens += r.output_tokens;
    totals.cost += r.cost;
    sessions.add(r.session_id);
  }
  totals.sessions = sessions.size;
  const out = [...buckets.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  return { rows: out, totals };
}

/** 日期区间过滤（from/to 为 YYYY-MM-DD，闭区间）。 */
function inRange(day: string, from?: string, to?: string): boolean {
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}

// —— M5/Q4：持久层可观测性 ——
/** 当前生效的持久层实现。`uninitialized` 表示 db() 尚未被调用。 */
export type StoreKind = 'sqlite' | 'memory' | 'uninitialized';

/** 持久层诊断快照（供 GET /api/health 消费）。 */
export interface StoreInfo {
  kind: StoreKind;
  /** sqlite 落盘路径；memory 态为 null */
  path: string | null;
  /** better-sqlite3 加载失败原因；正常时为 null */
  error: string | null;
  /** 是否由 KMASTER_DB=memory 强制指定（非故障降级） */
  forced: boolean;
  /** V3/#19：当前 schema 版本（来自 SQLite user_version；memory 态为 0） */
  schema_version: number;
}

let storeKind: StoreKind = 'uninitialized';
let sqliteError: string | null = null;
let memoryForced = false;
let schemaVersion = 0;

/** 读取持久层诊断快照。db() 未初始化时 kind 为 'uninitialized'。 */
export function getStoreInfo(): StoreInfo {
  return {
    kind: storeKind,
    path: storeKind === 'sqlite' ? dbPath : null,
    error: sqliteError,
    forced: memoryForced,
    schema_version: schemaVersion,
  };
}

// V3/#19：schema 版本常量。后续新增字段请递增此值并在 initSqlite() 内追加分支迁移块，
// 不要直接 ALTER 不带版本号。
//   v1 —— 新增 sessions.workspace
//   v2 —— B-01/B-02：新增 sessions.skills / sessions.mcp_servers / sessions.pinned 侧车列
//   v3 —— B-03/Q1 三态：新增 sessions.archived_override，并把 v2 中间版本建成
//         NOT NULL 的 pinned 修回可空。
//         ⚠️ 为什么必须新开 v3 而不是改 v2：v2 的中间版本（commit 131cc8b）已经把
//         user_version 置成 2，`while (currentVersion < SCHEMA_VERSION)` 不会再进
//         case 2，那些库永远拿不到 archived_override 列 —— 而 listSessions 的
//         `COALESCE(archived_override, ...)` 会在 prepare 阶段抛 "no such column"，
//         导致 initSqlite 整体失败并**静默回落 MemoryStore**（用户数据不再落盘）。
export const SCHEMA_VERSION = 3;

/**
 * better-sqlite3 Database 的最小结构约束。
 * 只声明迁移需要的两个方法，让 `runSchemaMigrations` 可以在单测里被任意
 * 兼容实现驱动，而无需把 better-sqlite3 类型泄漏到调用方（A2）。
 */
export interface SqliteLike {
  exec(sql: string): unknown;
  pragma(source: string, options?: { simple?: boolean }): unknown;
}

/** `PRAGMA table_info(...)` 单行结构（只取本模块用得到的字段）。 */
interface TableColumnInfo {
  name: string;
  notnull: number;
  dflt_value: string | null;
}

/** 读取表的列元信息；表不存在或 pragma 不可用时返回空数组。 */
function tableColumns(database: SqliteLike, table: string): TableColumnInfo[] {
  try {
    const rows = database.pragma(`table_info(${table})`);
    return Array.isArray(rows) ? (rows as TableColumnInfo[]) : [];
  } catch {
    return [];
  }
}

/**
 * 自愈修复：把 `pinned` 从 `NOT NULL DEFAULT 0` 改回可空（三态所需）。
 *
 * 背景：v2 的**中间版本**曾把 `pinned` 建成 `NOT NULL DEFAULT 0`（二态），
 * 主理人 Q1 裁定改为三态后需要纠正。SQLite 不支持 `ALTER COLUMN`，
 * 只能整表重建。该分支**仅对中间版本产生的库触发**，正常库直接跳过。
 *
 * 幂等：重建后 `notnull=0`，下次启动条件不成立即跳过。
 */
function repairPinnedNullability(database: SqliteLike): void {
  const cols = tableColumns(database, 'sessions');
  const pinned = cols.find((c) => c.name === 'pinned');
  // 只有「存在且被声明为 NOT NULL」才需要重建
  if (!pinned || pinned.notnull !== 1) return;

  const names = cols.map((c) => c.name);
  const has = (n: string) => names.includes(n);
  // 动态拼列，兼容极旧库缺 workspace 的形态。
  // ⚠️ 清单必须覆盖新表的**全部**列，漏一个就是静默数据丢失 —— 尤其 archived_override，
  // 它承载用户的归档覆盖态。末尾统一 filter(has) 兜住源表缺列的情况。
  const carried = [
    'id', 'title', 'profile', 'created_at', 'updated_at', 'archived', 'mode', 'model',
    'workspace', 'skills', 'mcp_servers', 'pinned', 'archived_override',
  ].filter(has);

  try {
    database.exec(`
      BEGIN;
      CREATE TABLE sessions__v2fix (
        id TEXT PRIMARY KEY, title TEXT NOT NULL DEFAULT '新会话',
        profile TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
        archived INTEGER NOT NULL DEFAULT 0,
        mode TEXT, model TEXT, workspace TEXT,
        skills TEXT NOT NULL DEFAULT '[]', mcp_servers TEXT NOT NULL DEFAULT '[]',
        pinned INTEGER, archived_override INTEGER
      );
      INSERT INTO sessions__v2fix (${carried.join(', ')})
        SELECT ${carried.join(', ')} FROM sessions;
      DROP TABLE sessions;
      ALTER TABLE sessions__v2fix RENAME TO sessions;
      COMMIT;
    `);
    // 中间版本写入的 0 无法区分「显式取消」与「建行默认」，一律归零为「未覆盖」，
    // 让 merge 回落 hermes 值——这正是三态改造要达成的效果。
    database.exec('UPDATE sessions SET pinned = NULL WHERE pinned = 0');
  } catch {
    // 重建失败不阻断启动：退化为二态语义（功能可用，仅边角优先级不同）。
    try { database.exec('ROLLBACK'); } catch { /* 无事务可回滚 */ }
  }
}

/**
 * 幂等地补齐 v2/v3 侧车列并做三态自愈。
 *
 * 被 `case 2` 与 `case 3` 共同调用：前者服务「老库正常升级」，后者服务
 * 「v2 中间版本已把 user_version 置为 2、再也进不了 case 2」的库。
 *
 * ⚠️ pinned / archived_override **刻意不带 NOT NULL/DEFAULT**：三态语义要求
 * 「未覆盖」可表达为 NULL，否则 run-chat 建行时写 0 会压平 hermes 的置顶态。
 */
function ensureSidecarColumns(database: SqliteLike): void {
  // 列已存在时 better-sqlite3 抛 "duplicate column name" —— 直接吞掉。
  try { database.exec(`ALTER TABLE sessions ADD COLUMN skills TEXT NOT NULL DEFAULT '[]'`); } catch { /* already exists */ }
  try { database.exec(`ALTER TABLE sessions ADD COLUMN mcp_servers TEXT NOT NULL DEFAULT '[]'`); } catch { /* already exists */ }
  try { database.exec('ALTER TABLE sessions ADD COLUMN pinned INTEGER'); } catch { /* already exists */ }
  try { database.exec('ALTER TABLE sessions ADD COLUMN archived_override INTEGER'); } catch { /* already exists */ }
  // 自愈：修正 v2 中间版本把 pinned 建成 NOT NULL 的库
  repairPinnedNullability(database);
}

/**
 * 版本化 schema 迁移（幂等）。
 *
 * 独立导出的原因：`initSqlite()` 依赖模块级 `dbPath`，无法在单测里指向临时库；
 * 把纯迁移逻辑剥出来后，A2 可以直接对内存库/临时文件库验证：
 *   v0 → v2、v1 → v2、v2 → v2 空转、列已存在时 ALTER 异常被吞。
 *
 * @param database 已打开且已建表的 SQLite 句柄
 * @returns 迁移完成后的 `user_version`
 */
export function runSchemaMigrations(database: SqliteLike): number {
  let currentVersion = Number(database.pragma('user_version', { simple: true }) ?? 0);
  while (currentVersion < SCHEMA_VERSION) {
    const target = currentVersion + 1;
    switch (target) {
      case 1: {
        // v1：新增 sessions.workspace。CREATE TABLE 已含该列，
        // ALTER 兜底只在「极旧库表结构与 v0 完全相同」时生效——两者择一即可。
        try { database.exec('ALTER TABLE sessions ADD COLUMN workspace TEXT'); } catch { /* already exists */ }
        break;
      }
      case 2: {
        // v2（B-01/B-02/B-03）：skills / mcp_servers / pinned / archived_override 侧车列。
        // 同 case 1 的幂等策略：新库由 CREATE TABLE 建好，老库靠 ALTER 补齐，
        // 列已存在时 better-sqlite3 抛 "duplicate column name" —— 直接吞掉。
        //
        // U2 结论：hermes `services/hermes/write/` 下只有 agents / config-yaml / cron /
        // skills-install，**无任何 session 写通道**（且 read/state-db.ts 是
        // readonly + PRAGMA query_only=1 的硬只读）→ pinned/archived 落 kmaster.db 侧车。
        //
        // ⚠️ pinned / archived_override **刻意不带 NOT NULL/DEFAULT**：三态语义要求
        // 「未覆盖」可表达为 NULL，否则 run-chat 建行时写 0 会压平 hermes 的置顶态。
        ensureSidecarColumns(database);
        break;
      }
      case 3: {
        // v3（B-03/Q1 三态收口）：把 v2 的列补齐动作**再做一遍**。
        // 必要性：v2 的中间版本已把 user_version 置成 2，那些库再也不会进 case 2，
        // 从而缺 archived_override 且 pinned 仍是 NOT NULL。这里是它们唯一的修复入口。
        // 全部动作幂等（ALTER 吞 duplicate column；repair 只在 notnull=1 时触发）。
        ensureSidecarColumns(database);
        break;
      }
      default:
        // 未知版本：抛错阻止启动，避免静默漂移。
        throw new Error(`未知的 schema 迁移目标版本：${target}`);
    }
    database.pragma(`user_version = ${target}`);
    currentVersion = target;
  }
  return currentVersion;
}

async function initSqlite(): Promise<Store | null> {
  try {
    const Database = (await import('better-sqlite3')).default;
    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY, title TEXT NOT NULL DEFAULT '新会话',
        profile TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, archived INTEGER NOT NULL DEFAULT 0,
        mode TEXT, model TEXT, workspace TEXT,
        -- schema v2（B-01/B-02/B-03）：新库直接建全列，老库走下方 user_version 迁移补齐。
        -- pinned / archived_override 可空（三态：NULL=未覆盖回落 hermes，0/1=显式覆盖）
        skills TEXT NOT NULL DEFAULT '[]', mcp_servers TEXT NOT NULL DEFAULT '[]',
        pinned INTEGER, archived_override INTEGER,
        -- T02：会话绑定的 Agent ID
        agent TEXT
      );
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY, session_id TEXT NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL,
        created_at INTEGER NOT NULL, usage_json TEXT, guidance INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY, value TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, created_at);

      -- M4/F17 消息队列
      CREATE TABLE IF NOT EXISTS queue (
        id TEXT PRIMARY KEY, session_id TEXT NOT NULL, message TEXT NOT NULL,
        mode TEXT, model TEXT, position INTEGER NOT NULL, created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_queue_session ON queue(session_id, position);

      -- M4/F22 用量账本（day 为本地时区 YYYY-MM-DD，写入时算好）
      CREATE TABLE IF NOT EXISTS "usage" (
        id TEXT PRIMARY KEY, session_id TEXT NOT NULL, model TEXT NOT NULL DEFAULT '',
        input_tokens INTEGER NOT NULL DEFAULT 0, output_tokens INTEGER NOT NULL DEFAULT 0,
        cost REAL NOT NULL DEFAULT 0, ts INTEGER NOT NULL, day TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_usage_day ON "usage"(day);
      CREATE INDEX IF NOT EXISTS idx_usage_session ON "usage"(session_id);
    `);
    // 兼容旧库（v0）：补齐 mode/model/workspace 列（已存在则忽略）。
    // 这些分支属于「迁移前的临时兜底」，统一被下面的 user_version 迁移取代。
    try { db.exec('ALTER TABLE sessions ADD COLUMN mode TEXT'); } catch { /* already exists */ }
    try { db.exec('ALTER TABLE sessions ADD COLUMN model TEXT'); } catch { /* already exists */ }
    try { db.exec('ALTER TABLE sessions ADD COLUMN workspace TEXT'); } catch { /* already exists */ }

    // T02：加 agent 列（可空）
    try { db.exec('ALTER TABLE sessions ADD COLUMN agent TEXT'); } catch { /* already exists */ }

    // V3/#19：基于 PRAGMA user_version 的版本化迁移。新增字段请按以下顺序扩展：
    //   1. 在 SCHEMA_VERSION 上递增；
    //   2. 在 runSchemaMigrations() 的 switch 里加 case，做 ALTER / 数据回填 / 索引重建；
    //   3. 迁移体自身负责把 user_version 置到目标版本。
    // 严禁直接 exec('ALTER TABLE ...') 不带版本号——一旦多个进程同时打开旧库会触发竞态。
    schemaVersion = runSchemaMigrations(db);

    const stmtGet = db.prepare('SELECT * FROM sessions WHERE id = ?');
    const stmtInsert = db.prepare(
      'INSERT OR IGNORE INTO sessions (id, title, profile, created_at, updated_at, archived, mode, model, workspace, agent) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?)'
    );
    // B-03：归档判定要同时看 legacy `archived` 与三态覆盖列。
    // COALESCE 保证「未覆盖(NULL) → 看 legacy 列」，且 NULL 不会被 `= 0` 静默过滤掉。
    const stmtList = db.prepare(
      'SELECT * FROM sessions WHERE COALESCE(archived_override, archived, 0) = 0 ORDER BY updated_at DESC'
    );
    const stmtRename = db.prepare('UPDATE sessions SET title = ?, updated_at = ? WHERE id = ?');
    const stmtDeleteMsgs = db.prepare('DELETE FROM messages WHERE session_id = ?');
    const stmtDeleteSession = db.prepare('DELETE FROM sessions WHERE id = ?');
    const stmtMsgs = db.prepare('SELECT * FROM messages WHERE session_id = ? ORDER BY created_at ASC');
    const stmtMsgIns = db.prepare(
      'INSERT INTO messages (id, session_id, role, content, created_at, usage_json, guidance) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    const stmtSetModeModel = db.prepare('UPDATE sessions SET mode = ?, model = ?, updated_at = ? WHERE id = ?');
    // V3/#19：workspace 更新单独成语句（与 mode/model 解耦，简化调用方语义）。
    // 传 null 视为清空，传 '' 也视作清空（避免界面遗留空字符串状态）。
    const stmtSetWorkspace = db.prepare('UPDATE sessions SET workspace = ?, updated_at = ? WHERE id = ?');
    // T04/CH-D：Agent 角色侧车列（列本身由上面的 ALTER TABLE 幂等补齐）
    const stmtSetAgent = db.prepare('UPDATE sessions SET agent = ?, updated_at = ? WHERE id = ?');
    // —— schema v2：侧车字段写入语句（列级独立，避免误清空未传字段）——
    const stmtSetSkills = db.prepare('UPDATE sessions SET skills = ?, updated_at = ? WHERE id = ?');
    const stmtSetMcpServers = db.prepare('UPDATE sessions SET mcp_servers = ?, updated_at = ? WHERE id = ?');
    // 三态写入：值为 null 时清除覆盖（回落 hermes），0/1 为显式覆盖。
    const stmtSetPinned = db.prepare('UPDATE sessions SET pinned = ?, updated_at = ? WHERE id = ?');
    const stmtSetArchived = db.prepare('UPDATE sessions SET archived_override = ?, updated_at = ? WHERE id = ?');
    const stmtGetSetting = db.prepare('SELECT value FROM settings WHERE key = ?');
    const stmtSetSetting = db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)');

    // —— F17 队列语句 ——
    const stmtQueueMaxPos = db.prepare('SELECT MAX(position) AS m FROM queue WHERE session_id = ?');
    const stmtQueueMinPos = db.prepare('SELECT MIN(position) AS m FROM queue WHERE session_id = ?');
    const stmtQueueIns = db.prepare(
      'INSERT INTO queue (id, session_id, message, mode, model, position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    const stmtQueueListAll = db.prepare('SELECT * FROM queue ORDER BY session_id ASC, position ASC');
    const stmtQueueListBySession = db.prepare('SELECT * FROM queue WHERE session_id = ? ORDER BY position ASC');
    const stmtQueuePeek = db.prepare('SELECT * FROM queue WHERE session_id = ? ORDER BY position ASC LIMIT 1');
    const stmtQueueGet = db.prepare('SELECT * FROM queue WHERE id = ?');
    const stmtQueueDel = db.prepare('DELETE FROM queue WHERE id = ?');
    const stmtQueueClearAll = db.prepare('DELETE FROM queue');
    const stmtQueueClearSession = db.prepare('DELETE FROM queue WHERE session_id = ?');
    const stmtQueueSetPos = db.prepare('UPDATE queue SET position = ? WHERE id = ?');

    // —— F22 用量语句 ——
    const stmtUsageIns = db.prepare(
      'INSERT INTO "usage" (id, session_id, model, input_tokens, output_tokens, cost, ts, day) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    );
    const stmtUsageAll = db.prepare('SELECT * FROM "usage"');

    return {
      getOrCreateSession(id, profile, workspace, agent) {
        const now = Date.now();
        // 新会话继承全局默认 mode/model
        const defMode = (stmtGetSetting.get('default_mode') as { value: string } | undefined)?.value ?? null;
        const defModel = (stmtGetSetting.get('default_model') as { value: string } | undefined)?.value ?? null;
        // V3/#19：workspace 一并写入。空串归一为 null，避免「清空」与「从未设置」状态混淆。
        const ws = workspace && workspace.trim() ? workspace : null;
        stmtInsert.run(id, '新会话', profile ?? null, now, now, defMode, defModel, ws, agent ?? null);
        return stmtGet.get(id) as SessionRow;
      },
      listSessions: () => stmtList.all() as SessionRow[],
      getSession: (id) => stmtGet.get(id) as SessionRow | undefined,
      renameSession: (id, title) => { stmtRename.run(title, Date.now(), id); },
      deleteSession: (id) => { stmtDeleteMsgs.run(id); stmtDeleteSession.run(id); },
      getMessages: (sid) => stmtMsgs.all(sid) as MessageRow[],
      appendMessage: (m) => {
        const row: MessageRow = {
          id: m.id ?? randomUUID(),
          session_id: m.session_id,
          role: m.role,
          content: m.content,
          created_at: m.created_at ?? Date.now(),
          usage_json: m.usage_json ?? null,
          guidance: m.guidance ?? 0,
        };
        stmtMsgIns.run(row.id, row.session_id, row.role, row.content, row.created_at, row.usage_json, row.guidance);
        return row;
      },
      getSetting: (key) => (stmtGetSetting.get(key) as { value: string } | undefined)?.value ?? null,
      setSetting: (key, value) => { stmtSetSetting.run(key, value); },
      setSessionModeModel: (id, mode, model) => { stmtSetModeModel.run(mode ?? null, model ?? null, Date.now(), id); },
      setSessionWorkspace: (id, workspace) => {
        // 空串归一为 null：UI 选「清空工作区」时不会出现「workspace=''」半状态。
        const ws = workspace && workspace.trim() ? workspace : null;
        stmtSetWorkspace.run(ws, Date.now(), id);
      },
      setSessionAgent: (id, agent) => {
        // 与 setSessionWorkspace 同一口径：空串归一为 null，避免 agent='' 半状态
        // 把 mergeSession() 的「回落 profile_name」分支短路掉。
        const next = agent && agent.trim() ? agent.trim() : null;
        stmtSetAgent.run(next, Date.now(), id);
      },
      getSessionsByIds: (ids) => {
        const uniq = [...new Set(ids.filter((x) => typeof x === 'string' && x !== ''))];
        if (uniq.length === 0) return [];
        // SQLite 绑定变量上限 999（SQLITE_MAX_VARIABLE_NUMBER），分片查询后拼接。
        // 这是 A5「单次批量查库，不得 N+1」的落地：请求数恒为 ceil(n/500)。
        const CHUNK = 500;
        const out: SessionRow[] = [];
        for (let i = 0; i < uniq.length; i += CHUNK) {
          const slice = uniq.slice(i, i + CHUNK);
          const placeholders = slice.map(() => '?').join(',');
          const stmt = db.prepare(`SELECT * FROM sessions WHERE id IN (${placeholders})`);
          out.push(...(stmt.all(...slice) as SessionRow[]));
        }
        return out;
      },
      setSessionSkillsMcp: (id, skills, mcpServers) => {
        const now = Date.now();
        if (skills !== undefined) stmtSetSkills.run(toJsonArrayColumn(skills), now, id);
        if (mcpServers !== undefined) stmtSetMcpServers.run(toJsonArrayColumn(mcpServers), now, id);
      },
      setSessionFlags: (id, flags) => {
        const now = Date.now();
        // null → 写 NULL 清除覆盖；true/false → 写 1/0 显式覆盖；undefined → 不动
        if (flags.pinned !== undefined) {
          stmtSetPinned.run(flags.pinned === null ? null : flags.pinned ? 1 : 0, now, id);
        }
        if (flags.archived !== undefined) {
          stmtSetArchived.run(flags.archived === null ? null : flags.archived ? 1 : 0, now, id);
        }
      },

      enqueue(item) {
        const maxPos = (stmtQueueMaxPos.get(item.session_id) as { m: number | null } | undefined)?.m ?? 0;
        const row: QueueItem = {
          id: item.id || randomUUID(),
          session_id: item.session_id,
          message: item.message,
          mode: item.mode ?? null,
          model: item.model ?? null,
          position: item.position ?? maxPos + 1,
          created_at: item.created_at || Date.now(),
        };
        stmtQueueIns.run(row.id, row.session_id, row.message, row.mode, row.model, row.position, row.created_at);
        return row;
      },
      listQueue: (sessionId) =>
        (sessionId ? stmtQueueListBySession.all(sessionId) : stmtQueueListAll.all()) as QueueItem[],
      peekQueue: (sessionId) => stmtQueuePeek.get(sessionId) as QueueItem | undefined,
      getQueueItem: (id) => stmtQueueGet.get(id) as QueueItem | undefined,
      removeQueueItem: (id) => { stmtQueueDel.run(id); },
      clearQueue: (sessionId) => {
        if (sessionId) stmtQueueClearSession.run(sessionId);
        else stmtQueueClearAll.run();
      },
      moveQueueItemToFront(id) {
        const cur = stmtQueueGet.get(id) as QueueItem | undefined;
        if (!cur) return undefined;
        const minPos = (stmtQueueMinPos.get(cur.session_id) as { m: number | null } | undefined)?.m ?? cur.position;
        if (minPos < cur.position) {
          const next = minPos - 1;
          stmtQueueSetPos.run(next, id);
          cur.position = next;
        }
        return cur;
      },

      addUsage(u) {
        const ts = u.ts ?? Date.now();
        stmtUsageIns.run(
          randomUUID(),
          u.session_id,
          u.model ?? '',
          Math.max(0, Math.round(u.input_tokens || 0)),
          Math.max(0, Math.round(u.output_tokens || 0)),
          Number(u.cost ?? 0),
          ts,
          localDay(ts)
        );
      },
      queryUsage(group, from, to) {
        const all = stmtUsageAll.all() as UsageRow[];
        return reduceUsage(all.filter((r) => inRange(r.day, from, to)), group);
      },
    };
  } catch (err) {
    // 记录真实原因（多为原生模块 build/Release 缺失），交由 db() 统一打印与上报。
    sqliteError = err instanceof Error ? err.message : String(err);
    return null;
  }
}

// 内存回退
const mem = {
  sessions: new Map<string, SessionRow>(),
  messages: new Map<string, MessageRow[]>(),
  settings: new Map<string, string>(),
  queue: new Map<string, QueueItem>(),
  usage: [] as UsageRow[],
};

async function initMem(): Promise<Store> {
  const sortedQueue = (sessionId?: string): QueueItem[] =>
    [...mem.queue.values()]
      .filter((q) => (sessionId ? q.session_id === sessionId : true))
      .sort((a, b) => (a.position === b.position
        ? 0
        : a.position < b.position ? -1 : 1));

  // V3/#19：MemoryStore 不存在 schema 迁移（JS 字段直接持有），但 schemaVersion
  // 仍按当前版本上报，便于上层在「内存态」时也吃到相同的版本诊断。
  schemaVersion = SCHEMA_VERSION;

  return {
    getOrCreateSession(id, profile, workspace, agent) {
      let s = mem.sessions.get(id);
      if (!s) {
        const now = Date.now();
        const defMode = mem.settings.get('default_mode') ?? null;
        const defModel = mem.settings.get('default_model') ?? null;
        const ws = workspace && workspace.trim() ? workspace : null;
        s = {
          id,
          title: '新会话',
          profile: profile ?? null,
          created_at: now,
          updated_at: now,
          archived: 0,
          mode: defMode,
          model: defModel,
          workspace: ws,
          // schema v2 侧车字段：内存实现同样以 JSON 字符串形态持有，
          // 保证与 sqlite 语义逐字对齐（NFR4）。
          skills: '[]',
          mcp_servers: '[]',
          // 三态：新建行为「未覆盖」，与 sqlite 侧可空列的 NULL 对齐
          pinned: null,
          archived_override: null,
          // T02：新建时写入 agent
          agent: agent ?? null,
        };
        mem.sessions.set(id, s);
      }
      return s;
    },
    // B-03：与 sqlite 侧 COALESCE(archived_override, archived, 0) = 0 语义对齐
    listSessions: () => [...mem.sessions.values()]
      .filter((s) => !resolveTriStateFlag(s.archived_override, s.archived))
      .sort((a, b) => b.updated_at - a.updated_at),
    getSession: (id) => mem.sessions.get(id),
    renameSession: (id, title) => {
      const s = mem.sessions.get(id);
      if (s) { s.title = title; s.updated_at = Date.now(); }
    },
    deleteSession: (id) => {
      mem.sessions.delete(id);
      mem.messages.delete(id);
    },
    getMessages: (sid) => mem.messages.get(sid) ?? [],
    appendMessage: (m) => {
      const row: MessageRow = {
        id: m.id ?? randomUUID(),
        session_id: m.session_id,
        role: m.role,
        content: m.content,
        created_at: m.created_at ?? Date.now(),
        usage_json: m.usage_json ?? null,
        guidance: m.guidance ?? 0,
      };
      const arr = mem.messages.get(row.session_id) ?? [];
      arr.push(row);
      mem.messages.set(row.session_id, arr);
      return row;
    },
    getSetting: (key) => mem.settings.get(key) ?? null,
    setSetting: (key, value) => { mem.settings.set(key, value); },
    setSessionModeModel: (id, mode, model) => {
      const s = mem.sessions.get(id);
      if (s) { s.mode = mode ?? null; s.model = model ?? null; s.updated_at = Date.now(); }
    },
    setSessionWorkspace: (id, workspace) => {
      const s = mem.sessions.get(id);
      if (s) {
        const ws = workspace && workspace.trim() ? workspace : null;
        s.workspace = ws;
        s.updated_at = Date.now();
      }
    },
    setSessionAgent: (id, agent) => {
      const s = mem.sessions.get(id);
      if (s) {
        s.agent = agent && agent.trim() ? agent.trim() : null;
        s.updated_at = Date.now();
      }
    },
    getSessionsByIds: (ids) => {
      const uniq = [...new Set(ids.filter((x) => typeof x === 'string' && x !== ''))];
      const out: SessionRow[] = [];
      for (const id of uniq) {
        const s = mem.sessions.get(id);
        if (s) out.push(s);
      }
      return out;
    },
    setSessionSkillsMcp: (id, skills, mcpServers) => {
      const s = mem.sessions.get(id);
      if (!s) return;
      if (skills !== undefined) s.skills = toJsonArrayColumn(skills);
      if (mcpServers !== undefined) s.mcp_servers = toJsonArrayColumn(mcpServers);
      s.updated_at = Date.now();
    },
    setSessionFlags: (id, flags) => {
      const s = mem.sessions.get(id);
      if (!s) return;
      // 与 sqlite 实现逐字对齐：null 清除覆盖，true/false 写显式覆盖，undefined 不动
      if (flags.pinned !== undefined) s.pinned = flags.pinned === null ? null : flags.pinned ? 1 : 0;
      if (flags.archived !== undefined) {
        s.archived_override = flags.archived === null ? null : flags.archived ? 1 : 0;
      }
      s.updated_at = Date.now();
    },

    enqueue(item) {
      const siblings = [...mem.queue.values()].filter((q) => q.session_id === item.session_id);
      const maxPos = siblings.length ? Math.max(...siblings.map((q) => q.position)) : 0;
      const row: QueueItem = {
        id: item.id || randomUUID(),
        session_id: item.session_id,
        message: item.message,
        mode: item.mode ?? null,
        model: item.model ?? null,
        position: item.position ?? maxPos + 1,
        created_at: item.created_at || Date.now(),
      };
      mem.queue.set(row.id, row);
      return row;
    },
    listQueue: (sessionId) => sortedQueue(sessionId),
    peekQueue: (sessionId) => sortedQueue(sessionId)[0],
    getQueueItem: (id) => mem.queue.get(id),
    removeQueueItem: (id) => { mem.queue.delete(id); },
    clearQueue: (sessionId) => {
      if (!sessionId) { mem.queue.clear(); return; }
      for (const [k, v] of mem.queue) if (v.session_id === sessionId) mem.queue.delete(k);
    },
    moveQueueItemToFront(id) {
      const cur = mem.queue.get(id);
      if (!cur) return undefined;
      const siblings = [...mem.queue.values()].filter((q) => q.session_id === cur.session_id);
      const minPos = siblings.length ? Math.min(...siblings.map((q) => q.position)) : cur.position;
      if (minPos < cur.position) cur.position = minPos - 1;
      return cur;
    },

    addUsage(u) {
      const ts = u.ts ?? Date.now();
      mem.usage.push({
        id: randomUUID(),
        session_id: u.session_id,
        model: u.model ?? '',
        input_tokens: Math.max(0, Math.round(u.input_tokens || 0)),
        output_tokens: Math.max(0, Math.round(u.output_tokens || 0)),
        cost: Number(u.cost ?? 0),
        ts,
        day: localDay(ts),
      });
    },
    queryUsage(group, from, to) {
      return reduceUsage(mem.usage.filter((r) => inRange(r.day, from, to)), group);
    },
  };
}

let ready: Promise<Store> | null = null;
export function db(): Promise<Store> {
  if (!ready) {
    ready = (async () => {
      // KMASTER_DB=memory 可强制走内存实现：
      // 既是无原生模块环境的逃生阀，也是 NFR4「两套实现语义一致」的可验证入口。
      if (process.env.KMASTER_DB === 'memory') {
        storeKind = 'memory';
        memoryForced = true;
        console.warn('[kmaster-server] KMASTER_DB=memory —— 强制使用 MemoryStore（数据仅存内存，进程退出即丢失）');
        return initMem();
      }
      const sqlite = await initSqlite();
      if (sqlite) {
        storeKind = 'sqlite';
        sqliteError = null;
        console.log(`[kmaster-server] persistence: better-sqlite3 → ${dbPath}`);
        console.log(`[kmaster-server] schema: user_version=${schemaVersion} (target=${SCHEMA_VERSION})`);
        return sqlite;
      }
      // M5/Q4：此前这里是静默回落，验收时极易把「内存态」误判为「已持久化」。
      storeKind = 'memory';
      console.warn('[kmaster-server] better-sqlite3 unavailable, using MemoryStore');
      console.warn(`[kmaster-server]   原因：${sqliteError ?? 'unknown'}`);
      console.warn('[kmaster-server]   影响：会话/消息/设置/队列/用量仅存内存，server 重启即丢失');
      console.warn('[kmaster-server]   真修：将 better-sqlite3 加入 ~/.npmrc 的 allow-scripts 白名单后执行 `npm rebuild better-sqlite3`');
      return initMem();
    })();
  }
  return ready;
}