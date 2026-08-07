/**
 * QA 第二层验证（严过关）—— 真实落盘库升级的**端到端**后果验证。
 *
 * 单独成文件的原因：`db.ts` 在**模块加载时**就用 `KMASTER_STUDIO_HOME` 算出 `dbPath`，
 * 且 `ready` 是模块级单例。必须在 import 之前把环境变量指到临时目录，
 * 且一个文件只能验证一种落盘形态。
 *
 * 验证目标：用户从 commit 131cc8b（v2 中间版本，pinned NOT NULL / 无 archived_override，
 * user_version 已置为 2）升级到 690855e 后，`db()` 是否仍能正常走 sqlite。
 * 若回落 MemoryStore，则该用户的会话/设置/队列/用量**全部不再落盘**（重启即丢），
 * 且 `/api/health` 会报出误导性的 "better-sqlite3 unavailable"。
 */
import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { vi } from 'vitest';

// —— 必须在 import('./db.js') 之前完成：构造一个「中间版本落盘库」——
const home = vi.hoisted(() => {
  const nodeFs = require('node:fs') as typeof import('node:fs');
  const nodeOs = require('node:os') as typeof import('node:os');
  const nodePath = require('node:path') as typeof import('node:path');
  const Database = require('better-sqlite3') as typeof import('better-sqlite3');

  const dir = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), 'kmaster-qa-interim-'));
  const file = nodePath.join(dir, 'kmaster.db');
  const seed = new Database(file);
  seed.pragma('journal_mode = WAL');
  seed.exec(`
    CREATE TABLE sessions (
      id TEXT PRIMARY KEY, title TEXT NOT NULL DEFAULT '新会话',
      profile TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
      archived INTEGER NOT NULL DEFAULT 0, mode TEXT, model TEXT, workspace TEXT,
      skills TEXT NOT NULL DEFAULT '[]', mcp_servers TEXT NOT NULL DEFAULT '[]',
      pinned INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE messages (
      id TEXT PRIMARY KEY, session_id TEXT NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL,
      created_at INTEGER NOT NULL, usage_json TEXT, guidance INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `);
  seed.prepare(
    `INSERT INTO sessions (id,title,profile,created_at,updated_at,archived,mode,model,workspace,skills,mcp_servers,pinned)
     VALUES ('legacy-1','老会话','default',1000,2000,0,'craft','claude','D:/ws','["pdf"]','["git"]',1)`
  ).run();
  // 中间版本的 SCHEMA_VERSION 就是 2，跑完迁移会把 user_version 置成 2
  seed.pragma('user_version = 2');
  seed.close();

  process.env.KMASTER_STUDIO_HOME = dir;
  delete process.env.KMASTER_DB; // 确保不被 memory 模式旁路
  return { dir, file };
});

afterAll(() => {
  try { fs.rmSync(home.dir, { recursive: true, force: true }); } catch { /* ignore */ }
});

describe('[验证点2-E2E] v2 中间版本落盘库升级到当前版本', () => {
  it('db() 必须仍然走 sqlite，不得静默回落 MemoryStore', async () => {
    const { db, getStoreInfo } = await import('./db.js');
    const store = await db();
    const info = getStoreInfo();
    expect(
      info.kind,
      `持久层回落到 ${info.kind}，原因：${info.error ?? '(无)'}\n` +
      '→ 该用户的会话/设置/队列/用量将只存内存，重启即丢。'
    ).toBe('sqlite');
    expect(store).toBeTruthy();
  });

  it('升级后老数据必须可读（listSessions 不炸、老会话仍在）', async () => {
    const { db } = await import('./db.js');
    const store = await db();
    const rows = store.listSessions();
    expect(rows.map((r) => r.id)).toContain('legacy-1');
    const row = store.getSession('legacy-1');
    expect(row?.title).toBe('老会话');
    expect(row?.skills).toBe('["pdf"]');
    expect(row?.pinned, '中间版本的 pinned=1 是用户显式置顶，升级后必须保留').toBe(1);
  });

  it('升级后落盘库的 sessions 表必须含 archived_override 且 pinned 可空', async () => {
    const { db } = await import('./db.js');
    await db(); // 触发迁移
    const Database = (await import('better-sqlite3')).default;
    const probe = new Database(home.file, { readonly: true });
    try {
      const cols = probe.prepare('PRAGMA table_info(sessions)').all() as Array<{ name: string; notnull: number }>;
      expect(cols.map((c) => c.name)).toContain('archived_override');
      expect(cols.find((c) => c.name === 'pinned')?.notnull).toBe(0);
    } finally {
      probe.close();
    }
  });
});
