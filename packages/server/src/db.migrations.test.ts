/**
 * A2：kmaster.db schema 迁移幂等性单测。
 *
 * 覆盖矩阵（对应 A1 验收）：
 *   ① v0 老库（无 workspace/skills/mcp_servers/pinned）→ 一次启动升到最新版，四列齐备
 *   ② v1 老库（有 workspace）→ 升到最新版，补齐侧车列
 *   ③ 最新版库重复启动（空转）→ 不报错、不重复 ALTER、user_version 稳定
 *   ④ 半迁移库（列已存在但 user_version 落后）→ ALTER 抛 duplicate column 被吞，最终仍到位
 *   ⑤ 新列默认值符合契约：skills/mcp_servers = '[]'，pinned/archived_override = NULL
 *   ⑥ 未知目标版本抛错（防止静默漂移）
 *
 * 说明：这里刻意**不**走 `db()`——它依赖模块级 dbPath（用户主目录），
 * 单测直接对内存库驱动 `runSchemaMigrations()`，零副作用、可并行。
 *
 * ⚠️ QA 复核修正：断言一律对齐 `SCHEMA_VERSION` 常量，不再硬编码字面量 2。
 * 此前硬编码导致「为修复迁移可达性而升版」时整批用例误报为失败。
 */
import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import {
  runSchemaMigrations,
  SCHEMA_VERSION,
  parseJsonArrayColumn,
  toJsonArrayColumn,
  resolveTriStateFlag,
  type SqliteLike,
} from './db.js';

/** v0 表结构（workspace 列尚未存在）。 */
const DDL_V0 = `
  CREATE TABLE sessions (
    id TEXT PRIMARY KEY, title TEXT NOT NULL DEFAULT '新会话',
    profile TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
    archived INTEGER NOT NULL DEFAULT 0, mode TEXT, model TEXT
  );
`;

/** v1 表结构（含 workspace，不含 v2 三列）。 */
const DDL_V1 = `
  CREATE TABLE sessions (
    id TEXT PRIMARY KEY, title TEXT NOT NULL DEFAULT '新会话',
    profile TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
    archived INTEGER NOT NULL DEFAULT 0, mode TEXT, model TEXT, workspace TEXT
  );
`;

/** v2 表结构（与 initSqlite() 的 CREATE TABLE 逐字对齐；pinned/archived_override 可空）。 */
const DDL_V2 = `
  CREATE TABLE sessions (
    id TEXT PRIMARY KEY, title TEXT NOT NULL DEFAULT '新会话',
    profile TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
    archived INTEGER NOT NULL DEFAULT 0, mode TEXT, model TEXT, workspace TEXT,
    skills TEXT NOT NULL DEFAULT '[]', mcp_servers TEXT NOT NULL DEFAULT '[]',
    pinned INTEGER, archived_override INTEGER
  );
`;

/** v2 的**中间版本**表结构：pinned 曾被建成 NOT NULL DEFAULT 0（二态），需自愈修复。 */
const DDL_V2_INTERIM = `
  CREATE TABLE sessions (
    id TEXT PRIMARY KEY, title TEXT NOT NULL DEFAULT '新会话',
    profile TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
    archived INTEGER NOT NULL DEFAULT 0, mode TEXT, model TEXT, workspace TEXT,
    skills TEXT NOT NULL DEFAULT '[]', mcp_servers TEXT NOT NULL DEFAULT '[]',
    pinned INTEGER NOT NULL DEFAULT 0
  );
`;

interface ColumnInfo { name: string; dflt_value: string | null; notnull: number }

function openAt(ddl: string, version: number): Database.Database {
  const db = new Database(':memory:');
  db.exec(ddl);
  db.pragma(`user_version = ${version}`);
  return db;
}

function columnsOf(db: Database.Database): ColumnInfo[] {
  return db.prepare('PRAGMA table_info(sessions)').all() as unknown as ColumnInfo[];
}

function columnNames(db: Database.Database): string[] {
  return columnsOf(db).map((c) => c.name);
}

function versionOf(db: Database.Database): number {
  return Number(db.pragma('user_version', { simple: true }));
}

describe('runSchemaMigrations —— kmaster.db schema 版本化迁移', () => {
  it('SCHEMA_VERSION 当前应为 3（v3 = B-03 三态收口：archived_override + pinned 可空自愈）', () => {
    expect(SCHEMA_VERSION).toBe(3);
  });

  it('① v0 老库一次启动升到最新版，workspace/skills/mcp_servers/pinned 全部补齐', () => {
    const db = openAt(DDL_V0, 0);
    try {
      expect(columnNames(db)).not.toContain('workspace');
      const version = runSchemaMigrations(db);
      expect(version).toBe(SCHEMA_VERSION);
      expect(versionOf(db)).toBe(SCHEMA_VERSION);
      const names = columnNames(db);
      expect(names).toContain('workspace');
      expect(names).toContain('skills');
      expect(names).toContain('mcp_servers');
      expect(names).toContain('pinned');
    } finally {
      db.close();
    }
  });

  it('② v1 老库升到最新版，补齐侧车列且不影响既有数据', () => {
    const db = openAt(DDL_V1, 1);
    try {
      db.prepare(
        'INSERT INTO sessions (id, title, profile, created_at, updated_at, archived, mode, model, workspace) VALUES (?,?,?,?,?,?,?,?,?)'
      ).run('s1', '旧会话', 'default', 1000, 2000, 0, 'craft', 'claude', 'D:/proj');

      expect(runSchemaMigrations(db)).toBe(SCHEMA_VERSION);

      const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get('s1') as Record<string, unknown>;
      // 既有数据零丢失
      expect(row.title).toBe('旧会话');
      expect(row.workspace).toBe('D:/proj');
      expect(row.mode).toBe('craft');
      // ⑤ 新列默认值符合契约：JSON 列为 '[]'，三态标记位为 NULL（未覆盖）
      expect(row.skills).toBe('[]');
      expect(row.mcp_servers).toBe('[]');
      expect(row.pinned).toBeNull();
      expect(row.archived_override).toBeNull();
    } finally {
      db.close();
    }
  });

  it('②b 三态硬约束：pinned / archived_override 必须可空（notnull=0 且无默认值）', () => {
    const db = openAt(DDL_V1, 1);
    try {
      runSchemaMigrations(db);
      const cols = columnsOf(db);
      const pinned = cols.find((c) => c.name === 'pinned');
      const archivedOverride = cols.find((c) => c.name === 'archived_override');
      expect(pinned).toBeDefined();
      expect(archivedOverride).toBeDefined();
      // 若这里失败，说明有人把 NOT NULL/DEFAULT 加回来了 —— 三态语义会退化成二态，
      // run-chat 建行时写 0 会压平 hermes 的 pinned=1。
      expect(pinned!.notnull).toBe(0);
      expect(pinned!.dflt_value).toBeNull();
      expect(archivedOverride!.notnull).toBe(0);
      expect(archivedOverride!.dflt_value).toBeNull();
    } finally {
      db.close();
    }
  });

  it('②c 自愈：v2 中间版本（pinned NOT NULL DEFAULT 0）被重建为可空，且 0 归零为 NULL', () => {
    // ⚠️ QA 复核修正：原用例把 user_version 人为置成 1 来强行触发 case 2，
    // 但真实的中间版本（commit 131cc8b）SCHEMA_VERSION 就是 2，落盘库的
    // user_version = 2 —— 那种库根本进不了 case 2，自愈分支形同虚设。
    // 这里改用**真实的 user_version=2**，让本用例成为可达性回归防线。
    const db = openAt(DDL_V2_INTERIM, 2);
    try {
      db.prepare(
        'INSERT INTO sessions (id, title, profile, created_at, updated_at, archived, mode, model, workspace, skills, mcp_servers, pinned) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)'
      ).run('keep', '显式置顶', null, 1, 2, 0, null, null, null, '["pdf"]', '["git"]', 1);
      db.prepare(
        'INSERT INTO sessions (id, title, profile, created_at, updated_at, archived, mode, model, workspace, skills, mcp_servers, pinned) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)'
      ).run('reset', '建行默认', null, 1, 2, 0, null, null, null, '[]', '[]', 0);

      expect(runSchemaMigrations(db)).toBe(SCHEMA_VERSION);

      const pinnedCol = columnsOf(db).find((c) => c.name === 'pinned');
      expect(pinnedCol!.notnull).toBe(0);

      // pinned=1 是用户显式置顶 → 保留
      const keep = db.prepare('SELECT * FROM sessions WHERE id = ?').get('keep') as Record<string, unknown>;
      expect(keep.pinned).toBe(1);
      expect(keep.skills).toBe('["pdf"]');
      // pinned=0 无法区分「显式取消」与「建行默认」→ 归零为 NULL 让 merge 回落 hermes
      const reset = db.prepare('SELECT * FROM sessions WHERE id = ?').get('reset') as Record<string, unknown>;
      expect(reset.pinned).toBeNull();
    } finally {
      db.close();
    }
  });

  it('③ 最新版库重复启动为空转：不报错、user_version 稳定、列数不变', () => {
    const db = openAt(DDL_V2, SCHEMA_VERSION);
    try {
      const before = columnNames(db).length;
      expect(runSchemaMigrations(db)).toBe(SCHEMA_VERSION);
      expect(runSchemaMigrations(db)).toBe(SCHEMA_VERSION);
      expect(runSchemaMigrations(db)).toBe(SCHEMA_VERSION);
      expect(versionOf(db)).toBe(SCHEMA_VERSION);
      expect(columnNames(db).length).toBe(before);
    } finally {
      db.close();
    }
  });

  it('④ 半迁移库（列已存在但 user_version=1）：ALTER 的 duplicate column 异常被吞，仍升到最新版', () => {
    // 模拟「新库用 v2 DDL 建表，但 user_version 忘记置位」的场景
    const db = openAt(DDL_V2, 1);
    try {
      expect(() => runSchemaMigrations(db)).not.toThrow();
      expect(versionOf(db)).toBe(SCHEMA_VERSION);
      const names = columnNames(db);
      // 没有产生重复列
      expect(names.filter((n) => n === 'skills')).toHaveLength(1);
      expect(names.filter((n) => n === 'pinned')).toHaveLength(1);
    } finally {
      db.close();
    }
  });

  it('④b v0 DDL + user_version=1（漏迁移的极旧库）：workspace 由 v1 分支跳过，v2/v3 分支照常补列', () => {
    const db = openAt(DDL_V0, 1);
    try {
      expect(runSchemaMigrations(db)).toBe(SCHEMA_VERSION);
      const names = columnNames(db);
      // user_version 已是 1，case 1 不再执行 → workspace 保持缺失（与线上语义一致）
      expect(names).not.toContain('workspace');
      // 但 v2 的三列必须补上
      expect(names).toContain('skills');
      expect(names).toContain('mcp_servers');
      expect(names).toContain('pinned');
    } finally {
      db.close();
    }
  });

  it('⑥ 未知目标版本抛错，阻止静默漂移', () => {
    // 构造一个「声称版本比迁移体已知范围更低、但 switch 无对应 case」的假句柄
    let version = -1;
    const fake: SqliteLike = {
      exec: () => undefined,
      pragma: (source: string) => {
        const m = source.match(/user_version\s*=\s*(-?\d+)/);
        if (m) { version = Number(m[1]); return undefined; }
        return version;
      },
    };
    // -1 → 目标版本 0，switch 无 case 0 → 抛错
    expect(() => runSchemaMigrations(fake)).toThrow(/未知的 schema 迁移目标版本/);
  });
});

describe('JSON 数组列编解码（§7.1 硬约定）', () => {
  it('parseJsonArrayColumn 正常解析 JSON 数组', () => {
    expect(parseJsonArrayColumn('["pdf","xlsx"]')).toEqual(['pdf', 'xlsx']);
  });

  it('parseJsonArrayColumn 对空值/坏 JSON/非数组一律回落 []，绝不抛异常', () => {
    expect(parseJsonArrayColumn(undefined)).toEqual([]);
    expect(parseJsonArrayColumn(null)).toEqual([]);
    expect(parseJsonArrayColumn('')).toEqual([]);
    expect(parseJsonArrayColumn('   ')).toEqual([]);
    expect(parseJsonArrayColumn('not-json')).toEqual([]);
    expect(parseJsonArrayColumn('{"a":1}')).toEqual([]);
    expect(parseJsonArrayColumn('[1,2,3]')).toEqual([]);
    expect(parseJsonArrayColumn(123)).toEqual([]);
  });

  it('parseJsonArrayColumn 混合类型数组只保留字符串项', () => {
    expect(parseJsonArrayColumn('["pdf",1,null,"git"]')).toEqual(['pdf', 'git']);
  });

  it('toJsonArrayColumn 过滤空白项并输出稳定 JSON', () => {
    expect(toJsonArrayColumn(['pdf', '', '  ', 'git'])).toBe('["pdf","git"]');
    expect(toJsonArrayColumn([])).toBe('[]');
    expect(toJsonArrayColumn(null)).toBe('[]');
    expect(toJsonArrayColumn(undefined)).toBe('[]');
  });

  it('编解码可往返（round-trip）', () => {
    const list = ['pdf', 'xlsx', 'git'];
    expect(parseJsonArrayColumn(toJsonArrayColumn(list))).toEqual(list);
  });
});

describe('resolveTriStateFlag —— pinned/archived 三态求值（主理人 Q1 裁定）', () => {
  it('侧车未覆盖（null/undefined）时回落 hermes 值', () => {
    expect(resolveTriStateFlag(null, 1)).toBe(true);
    expect(resolveTriStateFlag(null, 0)).toBe(false);
    expect(resolveTriStateFlag(undefined, 1)).toBe(true);
    expect(resolveTriStateFlag(undefined, 0)).toBe(false);
    expect(resolveTriStateFlag(null, null)).toBe(false);
    expect(resolveTriStateFlag(undefined, undefined)).toBe(false);
  });

  it('侧车显式覆盖时以侧车为准，完全无视 hermes 值', () => {
    // 关键回归点：用户在 kmaster 取消置顶（0），即使 hermes 仍为 1 也必须显示未置顶
    expect(resolveTriStateFlag(0, 1)).toBe(false);
    // 反向：用户置顶（1），hermes 为 0 也显示置顶
    expect(resolveTriStateFlag(1, 0)).toBe(true);
    expect(resolveTriStateFlag(1, null)).toBe(true);
    expect(resolveTriStateFlag(0, null)).toBe(false);
  });

  it('回归防线：0 与 null 语义必须不同（二态退化会让这条挂掉）', () => {
    // null = 未覆盖 → 跟随 hermes 的 1
    expect(resolveTriStateFlag(null, 1)).toBe(true);
    // 0 = 显式取消 → 压过 hermes 的 1
    expect(resolveTriStateFlag(0, 1)).toBe(false);
  });
});
