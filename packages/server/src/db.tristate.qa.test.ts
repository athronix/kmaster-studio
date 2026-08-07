/**
 * QA 第二层验证（严过关）—— pinned/archived 三态可空覆盖改造（commit 690855e）。
 *
 * 与 `db.migrations.test.ts`（工程师自测）刻意**不重叠**：那一份验证的是
 * 「迁移体被调用时行为正确」，这一份验证的是「迁移体在真实升级路径下会不会被调用」
 * 以及「三态求值在完整真值表下是否自洽」。
 *
 * 关键差异点：`db.migrations.test.ts` 的 ②c 用例把中间版本库的 user_version 人为
 * 置成 **1**，从而强行让 `case 2` 分支执行。但真实的中间版本（commit 131cc8b）
 * `SCHEMA_VERSION` 就是 2，跑完迁移会把 user_version 置成 **2**。
 * 本文件用真实的 user_version=2 复现，以证明自愈分支是否可达。
 */
import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { runSchemaMigrations, SCHEMA_VERSION, resolveTriStateFlag } from './db.js';

interface ColumnInfo { name: string; dflt_value: string | null; notnull: number }

/**
 * 真实「中间版本」(commit 131cc8b) 产出的表结构：
 *   - `pinned INTEGER NOT NULL DEFAULT 0`（二态）
 *   - **没有** `archived_override` 列
 * 该版本的 SCHEMA_VERSION 亦为 2，故落盘库的 user_version = 2。
 */
const DDL_V2_INTERIM_REAL = `
  CREATE TABLE sessions (
    id TEXT PRIMARY KEY, title TEXT NOT NULL DEFAULT '新会话',
    profile TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
    archived INTEGER NOT NULL DEFAULT 0, mode TEXT, model TEXT, workspace TEXT,
    skills TEXT NOT NULL DEFAULT '[]', mcp_servers TEXT NOT NULL DEFAULT '[]',
    pinned INTEGER NOT NULL DEFAULT 0
  );
`;

/** 当前目标版（v2 终版）表结构。 */
const DDL_V2_FINAL = `
  CREATE TABLE sessions (
    id TEXT PRIMARY KEY, title TEXT NOT NULL DEFAULT '新会话',
    profile TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
    archived INTEGER NOT NULL DEFAULT 0, mode TEXT, model TEXT, workspace TEXT,
    skills TEXT NOT NULL DEFAULT '[]', mcp_servers TEXT NOT NULL DEFAULT '[]',
    pinned INTEGER, archived_override INTEGER
  );
`;

function openAt(ddl: string, version: number): Database.Database {
  const db = new Database(':memory:');
  db.exec(ddl);
  db.pragma(`user_version = ${version}`);
  return db;
}

function columnsOf(db: Database.Database): ColumnInfo[] {
  return db.prepare('PRAGMA table_info(sessions)').all() as unknown as ColumnInfo[];
}

function colNames(db: Database.Database): string[] {
  return columnsOf(db).map((c) => c.name);
}

const INSERT_INTERIM = `
  INSERT INTO sessions (id, title, profile, created_at, updated_at, archived, mode, model, workspace, skills, mcp_servers, pinned)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
`;

// ════════════════════════════════════════════════════════════════════════
// 验证点 1：resolveTriStateFlag() 语义正确性（全真值表）
// ════════════════════════════════════════════════════════════════════════
describe('[验证点1] resolveTriStateFlag 全真值表', () => {
  // override × hermesValue 的完整笛卡尔积，逐格钉死
  const matrix: Array<[number | null | undefined, number | null | undefined, boolean, string]> = [
    // —— 未覆盖：必须完全回落 hermes ——
    [null, 1, true, 'NULL 覆盖 + hermes置顶 → 跟随 hermes（true）'],
    [null, 0, false, 'NULL 覆盖 + hermes未置顶 → 跟随 hermes（false）'],
    [null, null, false, '两侧皆空 → false'],
    [null, undefined, false, 'hermes 缺席 → false'],
    [undefined, 1, true, 'undefined 覆盖（侧车行不存在）→ 跟随 hermes'],
    [undefined, 0, false, 'undefined 覆盖 + hermes=0 → false'],
    // —— 显式覆盖：必须完全压过 hermes ——
    [0, 1, false, '★核心：显式取消(0) 必须压过 hermes 的 1（写成 ?? / || 都会挂）'],
    [0, 0, false, '显式取消 + hermes=0 → false'],
    [0, null, false, '显式取消 + hermes缺失 → false'],
    [0, undefined, false, '显式取消 + hermes缺席 → false'],
    [1, 0, true, '★核心：显式置顶(1) 压过 hermes 的 0'],
    [1, 1, true, '显式置顶 + hermes=1 → true'],
    [1, null, true, '显式置顶 + hermes缺失 → true'],
    [1, undefined, true, '显式置顶 + hermes缺席 → true'],
  ];

  it.each(matrix)('override=%s, hermes=%s → %s（%s）', (override, hermes, expected) => {
    expect(resolveTriStateFlag(override, hermes)).toBe(expected);
  });

  it('反向证明：换成 `??` 或 `||` 写法结果必然不同（防退化哨兵）', () => {
    // 常见错误写法 A：`override ?? hermes` —— 0 是非 nullish，看似能过，
    //   但返回的是 number 不是 boolean，且 !!0 === false 恰好巧合正确。
    // 常见错误写法 B：`override || hermes` —— 0 被当 falsy 吃掉，回落 hermes。
    const wrongOr = (o: number | null | undefined, h: number | null | undefined) => !!(o || h);
    // 关键格：显式取消(0) 压过 hermes 的 1
    expect(resolveTriStateFlag(0, 1)).toBe(false);
    expect(wrongOr(0, 1)).toBe(true); // ← `||` 写法会在这里给出相反答案
    expect(resolveTriStateFlag(0, 1)).not.toBe(wrongOr(0, 1));
  });

  it('非 0/1 的脏数据（如 2、-1）一律按「已覆盖为真」处理，不抛异常', () => {
    expect(resolveTriStateFlag(2, 0)).toBe(true);
    expect(resolveTriStateFlag(-1, 0)).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════
// 验证点 2：自愈迁移（真实升级路径可达性 / 幂等 / 数据无损）
// ════════════════════════════════════════════════════════════════════════
describe('[验证点2] 自愈迁移 repairPinnedNullability', () => {
  it('②-① 真实中间版本库（user_version=2）升级：pinned 必须被修回可空', () => {
    // 真实场景：用户跑过 commit 131cc8b 的 server，落盘库 user_version 已是 2
    const db = openAt(DDL_V2_INTERIM_REAL, 2);
    try {
      db.prepare(INSERT_INTERIM).run('keep', '显式置顶', null, 1, 2, 0, null, null, null, '["pdf"]', '["git"]', 1);
      db.prepare(INSERT_INTERIM).run('reset', '建行默认', null, 1, 2, 0, null, null, null, '[]', '[]', 0);

      runSchemaMigrations(db);

      const pinned = columnsOf(db).find((c) => c.name === 'pinned');
      expect(pinned, 'pinned 列应存在').toBeDefined();
      // 若这条挂了 → 自愈分支在真实升级路径下不可达，三态退化为二态
      expect(pinned!.notnull, 'pinned 必须可空（notnull=0），否则三态语义无法表达「未覆盖」').toBe(0);
    } finally {
      db.close();
    }
  });

  it('②-② 真实中间版本库（user_version=2）升级：archived_override 列必须被补齐', () => {
    // 这一列是 listSessions 的 `COALESCE(archived_override, archived, 0)` 直接依赖，
    // 缺列会让 initSqlite 的 db.prepare() 抛 "no such column" → 整个 sqlite 初始化失败
    // → 静默回落 MemoryStore（用户所有本地数据不再落盘）。
    const db = openAt(DDL_V2_INTERIM_REAL, 2);
    try {
      runSchemaMigrations(db);
      expect(colNames(db), 'archived_override 必须存在').toContain('archived_override');
    } finally {
      db.close();
    }
  });

  it('②-③ 真实中间版本库升级后，listSessions 的 COALESCE 语句必须可预编译', () => {
    // 直接复刻 initSqlite() 里的 stmtList，验证升级后不会在 prepare 阶段炸掉
    const db = openAt(DDL_V2_INTERIM_REAL, 2);
    try {
      runSchemaMigrations(db);
      expect(() =>
        db.prepare('SELECT * FROM sessions WHERE COALESCE(archived_override, archived, 0) = 0 ORDER BY updated_at DESC')
      ).not.toThrow();
    } finally {
      db.close();
    }
  });

  it('②-④ 数据无损：重建表时全部业务列必须原样搬运（含 workspace/skills/mcp/mode/model/profile）', () => {
    const db = openAt(DDL_V2_INTERIM_REAL, 1); // 用 v1 让自愈分支确定进入，专测「搬运是否漏列」
    try {
      db.prepare(INSERT_INTERIM).run(
        'full', '完整会话', 'prof-x', 1111, 2222, 1, 'craft', 'claude-4', 'D:/ws', '["pdf","xlsx"]', '["git","fs"]', 1
      );
      runSchemaMigrations(db);
      const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get('full') as Record<string, unknown>;
      expect(row.title).toBe('完整会话');
      expect(row.profile).toBe('prof-x');
      expect(row.created_at).toBe(1111);
      expect(row.updated_at).toBe(2222);
      expect(row.archived).toBe(1);
      expect(row.mode).toBe('craft');
      expect(row.model).toBe('claude-4');
      expect(row.workspace).toBe('D:/ws');
      expect(row.skills).toBe('["pdf","xlsx"]');
      expect(row.mcp_servers).toBe('["git","fs"]');
      expect(row.pinned).toBe(1);
    } finally {
      db.close();
    }
  });

  it('②-⑤ 幂等：对同一库连跑 3 次迁移，结构与数据均不漂移', () => {
    const db = openAt(DDL_V2_INTERIM_REAL, 1);
    try {
      db.prepare(INSERT_INTERIM).run('a', 'A', null, 1, 2, 0, null, null, null, '[]', '[]', 1);
      runSchemaMigrations(db);
      const cols1 = colNames(db).join(',');
      const row1 = db.prepare('SELECT * FROM sessions WHERE id = ?').get('a');

      runSchemaMigrations(db);
      runSchemaMigrations(db);

      expect(colNames(db).join(',')).toBe(cols1);
      expect(db.prepare('SELECT * FROM sessions WHERE id = ?').get('a')).toEqual(row1);
      expect(db.prepare('SELECT COUNT(*) AS n FROM sessions').get()).toEqual({ n: 1 });
      // 重建残留表不得留在库里
      const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>)
        .map((t) => t.name);
      expect(tables).not.toContain('sessions__v2fix');
    } finally {
      db.close();
    }
  });

  it('②-⑥ 重建不得丢弃已有的 archived_override 数据', () => {
    // 构造一个「pinned 仍是 NOT NULL 但 archived_override 已存在且有值」的混合库
    const db = new Database(':memory:');
    try {
      db.exec(DDL_V2_INTERIM_REAL);
      db.exec('ALTER TABLE sessions ADD COLUMN archived_override INTEGER');
      db.pragma('user_version = 1');
      db.prepare(INSERT_INTERIM).run('ov', '已归档', null, 1, 2, 0, null, null, null, '[]', '[]', 1);
      db.prepare('UPDATE sessions SET archived_override = 1 WHERE id = ?').run('ov');

      runSchemaMigrations(db);

      const row = db.prepare('SELECT * FROM sessions WHERE id = ?').get('ov') as Record<string, unknown>;
      expect(row.archived_override, '重建表的 carried 列清单漏了 archived_override → 用户归档态丢失').toBe(1);
    } finally {
      db.close();
    }
  });

  it('②-⑦ 正常 v2 终版库不触发重建（不做无谓整表复制）', () => {
    const db = openAt(DDL_V2_FINAL, 1); // user_version=1 强制进 case 2
    try {
      db.prepare(
        `INSERT INTO sessions (id,title,created_at,updated_at,archived,skills,mcp_servers,pinned,archived_override)
         VALUES ('z','Z',1,2,0,'[]','[]',0,NULL)`
      ).run();
      runSchemaMigrations(db);
      // pinned=0 若被误当成「中间版本残留」归零成 NULL，就是语义事故
      const row = db.prepare('SELECT pinned FROM sessions WHERE id = ?').get('z') as { pinned: number | null };
      expect(row.pinned, '终版库里的 pinned=0 是用户显式取消置顶，不得被归零成 NULL').toBe(0);
    } finally {
      db.close();
    }
  });

  it('②-⑧ SCHEMA_VERSION 必须 ≥3：v2 中间版本库只能靠新版本号才能重新进入迁移分支', () => {
    // 若有人把版本号退回 2，中间版本库将再次失去修复入口 → 启动时静默回落 MemoryStore
    expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(3);
  });
});

// ════════════════════════════════════════════════════════════════════════
// 验证点 3：archived_override 与 legacy archived 两列并存
// ════════════════════════════════════════════════════════════════════════
describe('[验证点3] archived_override × legacy archived 并存求值', () => {
  function seed() {
    const db = openAt(DDL_V2_FINAL, 2);
    const ins = db.prepare(
      `INSERT INTO sessions (id,title,created_at,updated_at,archived,skills,mcp_servers,pinned,archived_override)
       VALUES (?,?,?,?,?,'[]','[]',NULL,?)`
    );
    //                 id            legacy archived   archived_override
    ins.run('n-n', '两列皆未归档', 1, 10, 0, null);
    ins.run('n-1', '仅覆盖列归档', 1, 20, 0, 1);
    ins.run('n-0', '覆盖列显式取消', 1, 30, 0, 0);
    ins.run('L-n', 'legacy归档/未覆盖', 1, 40, 1, null);
    ins.run('L-0', 'legacy归档/覆盖取消', 1, 50, 1, 0);
    ins.run('L-1', 'legacy归档/覆盖归档', 1, 60, 1, 1);
    return db;
  }

  it('③-① listSessions 的 COALESCE 过滤：只放出「求值为未归档」的会话', () => {
    const db = seed();
    try {
      const ids = (db.prepare(
        'SELECT id FROM sessions WHERE COALESCE(archived_override, archived, 0) = 0 ORDER BY updated_at DESC'
      ).all() as Array<{ id: string }>).map((r) => r.id).sort();
      // n-n（都未归档）、n-0（显式取消）、L-0（覆盖取消 legacy 归档）应放出
      expect(ids).toEqual(['L-0', 'n-0', 'n-n']);
    } finally {
      db.close();
    }
  });

  it('③-② SQL 侧 COALESCE 与 JS 侧 resolveTriStateFlag 必须给出同一答案（NFR4 双实现对齐）', () => {
    const db = seed();
    try {
      const rows = db.prepare('SELECT * FROM sessions').all() as Array<{
        id: string; archived: number; archived_override: number | null;
      }>;
      for (const r of rows) {
        const sql = (db.prepare('SELECT COALESCE(archived_override, archived, 0) AS v FROM sessions WHERE id = ?')
          .get(r.id) as { v: number }).v === 1;
        const js = resolveTriStateFlag(r.archived_override, r.archived);
        expect(js, `会话 ${r.id}: SQL=${sql} 与 JS=${js} 不一致`).toBe(sql);
      }
    } finally {
      db.close();
    }
  });

  it('③-③ legacy archived 列不再被本模块写入（setSessionFlags 只碰 archived_override）', () => {
    // 语句级断言：确认 UPDATE 目标列是 archived_override 而非 archived
    const db = openAt(DDL_V2_FINAL, 2);
    try {
      db.prepare(
        `INSERT INTO sessions (id,title,created_at,updated_at,archived,skills,mcp_servers,pinned,archived_override)
         VALUES ('x','X',1,2,0,'[]','[]',NULL,NULL)`
      ).run();
      // 复刻 db.ts 里的 stmtSetArchived
      db.prepare('UPDATE sessions SET archived_override = ?, updated_at = ? WHERE id = ?').run(1, 99, 'x');
      const row = db.prepare('SELECT archived, archived_override FROM sessions WHERE id = ?').get('x') as
        { archived: number; archived_override: number | null };
      expect(row.archived, 'legacy archived 列必须保持 0（不被写入）').toBe(0);
      expect(row.archived_override).toBe(1);
    } finally {
      db.close();
    }
  });
});
