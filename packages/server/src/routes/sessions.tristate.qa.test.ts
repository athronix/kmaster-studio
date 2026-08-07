/**
 * QA 第二层验证（严过关）—— `GET /api/sessions` 与 `PATCH /api/sessions/:id`
 * 在三态改造（commit 690855e）后的真实 HTTP 行为。
 *
 * 做法：起真实 Koa server（真 sqlite 落盘到临时目录），只 mock hermes state.db
 * 这一个外部真源，其余全部走真实代码路径。
 *
 * 环境注意：本机 TUN 代理会拦 127.0.0.1 裸 TCP，请求一律用 `localhost`。
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

// —— 必须早于任何 import './db.js' 的传递依赖：把落盘目录指到临时目录 ——
const env = vi.hoisted(() => {
  const nodeFs = require('node:fs') as typeof import('node:fs');
  const nodeOs = require('node:os') as typeof import('node:os');
  const nodePath = require('node:path') as typeof import('node:path');
  const dir = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), 'kmaster-qa-api-'));
  process.env.KMASTER_STUDIO_HOME = dir;
  delete process.env.KMASTER_DB;
  // hermes 侧真源的可变夹具（各用例 beforeEach 重置）
  const hermes: { rows: any[] } = { rows: [] };
  return { dir, hermes };
});

vi.mock('../services/hermes/read/state-db.js', () => ({
  querySessions: () => env.hermes.rows,
  querySessionMessages: () => [],
  sessionCount: () => env.hermes.rows.length,
  closeStateDb: () => undefined,
}));
vi.mock('../hermes-proxy.js', () => ({
  getSettings: async () => ({}),
  setSettings: async () => ({}),
  probeHealth: async () => ({ ok: true }),
}));
vi.mock('../run-chat.js', () => ({ getContextEstimate: async () => ({ tokens: 0 }) }));
vi.mock('../services/terminal.js', () => ({
  terminalManager: { getInfo: () => ({ available: false, error: null }) },
}));

let base = '';
let server: http.Server;

/** 便捷 HTTP 客户端（统一走 localhost，规避 TUN 代理对 127.0.0.1 的拦截）。 */
async function api(method: string, url: string, body?: unknown) {
  const res = await fetch(`${base}${url}`, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* 非 JSON 响应 */ }
  return { status: res.status, body: json, raw: text };
}

/** hermes 会话夹具。 */
function hermesRow(over: Partial<Record<string, unknown>> & { id: string }) {
  return {
    title: 'H标题', archived: 0, pinned: 0, cwd: 'D:/h', profile_name: 'default',
    started_at: 1000, ended_at: 2000, message_count: 3, model: 'h-model', source: 'hermes',
    ...over,
  };
}

beforeAll(async () => {
  const Koa = (await import('koa')).default;
  const { bodyParser } = await import('@koa/bodyparser');
  const { sessionsRouter } = await import('./sessions.js');
  const app = new Koa();
  app.use(bodyParser());
  app.use(sessionsRouter.routes()).use(sessionsRouter.allowedMethods());
  server = http.createServer(app.callback());
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://localhost:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  const { db } = await import('../db.js');
  const store = await db();
  for (const s of store.listSessions()) store.deleteSession(s.id);
  try { fs.rmSync(env.dir, { recursive: true, force: true }); } catch { /* ignore */ }
});

beforeEach(async () => {
  env.hermes.rows = [];
  const { db } = await import('../db.js');
  const store = await db();
  // 清库（含被 archived 过滤掉的行，用 getSessionsByIds 兜底不到，改用已知 id 集合）
  for (const id of ['s-plain', 's-pin', 's-unpin', 's-arch', 's-skills', 's-legacy', 's-km-only']) {
    store.deleteSession(id);
  }
});

// ════════════════════════════════════════════════════════════════════════
// 验证点 4：GET /api/sessions
// ════════════════════════════════════════════════════════════════════════
describe('[验证点4] GET /api/sessions merge 结果', () => {
  it('④-① 纯 hermes 会话（无侧车行）：pinned/archived 完全回落 hermes，skills/mcp 为空数组', async () => {
    env.hermes.rows = [hermesRow({ id: 's-pin', pinned: 1, archived: 0 })];
    const { body } = await api('GET', '/api/sessions');
    const s = body.sessions.find((x: any) => x.id === 's-pin');
    expect(s).toBeTruthy();
    expect(s.pinned).toBe(true);
    expect(s.archived).toBe(0);
    expect(s.skills).toEqual([]);
    expect(s.mcpServers).toEqual([]);
  });

  it('④-② 出参类型硬约定：pinned 是 boolean，archived 是 number(0/1)', async () => {
    env.hermes.rows = [
      hermesRow({ id: 's-pin', pinned: 1, archived: 1 }),
      hermesRow({ id: 's-plain', pinned: 0, archived: 0 }),
    ];
    const { body } = await api('GET', '/api/sessions');
    for (const s of body.sessions) {
      expect(typeof s.pinned, `会话 ${s.id} 的 pinned 必须是 boolean`).toBe('boolean');
      expect(typeof s.archived, `会话 ${s.id} 的 archived 必须是 number`).toBe('number');
      expect([0, 1]).toContain(s.archived);
    }
  });

  it('④-③ 侧车显式取消置顶(0) 必须压过 hermes 的 pinned=1', async () => {
    env.hermes.rows = [hermesRow({ id: 's-unpin', pinned: 1 })];
    await api('PATCH', '/api/sessions/s-unpin', { pinned: false });
    const { body } = await api('GET', '/api/sessions');
    const s = body.sessions.find((x: any) => x.id === 's-unpin');
    expect(s.pinned, '侧车 0 被当成 falsy 忽略 → 三态退化').toBe(false);
  });

  it('④-④ 侧车行存在但未覆盖（NULL）时仍回落 hermes 的 pinned=1', async () => {
    env.hermes.rows = [hermesRow({ id: 's-skills', pinned: 1 })];
    // 只 PATCH skills，pinned 不动 → 侧车行被建出来但 pinned 应保持 NULL
    await api('PATCH', '/api/sessions/s-skills', { skills: ['pdf'] });
    const { body } = await api('GET', '/api/sessions');
    const s = body.sessions.find((x: any) => x.id === 's-skills');
    expect(s.pinned, 'ensureSidecarRow 建行不得把回落态固化成 pinned=0').toBe(true);
    expect(s.skills).toEqual(['pdf']);
  });

  it('④-⑤ skills / mcpServers 回读正确（含 snake_case 写入路径）', async () => {
    env.hermes.rows = [hermesRow({ id: 's-skills' })];
    await api('PATCH', '/api/sessions/s-skills', { skills: ['pdf', 'xlsx'], mcp_servers: ['git'] });
    const { body } = await api('GET', '/api/sessions');
    const s = body.sessions.find((x: any) => x.id === 's-skills');
    expect(s.skills).toEqual(['pdf', 'xlsx']);
    expect(s.mcpServers).toEqual(['git']);
  });

  it('④-⑥ 归档：PATCH archived=true 后 GET 出参 archived === 1', async () => {
    env.hermes.rows = [hermesRow({ id: 's-arch', archived: 0 })];
    await api('PATCH', '/api/sessions/s-arch', { archived: true });
    const { body } = await api('GET', '/api/sessions');
    const s = body.sessions.find((x: any) => x.id === 's-arch');
    expect(s.archived).toBe(1);
  });

  it('④-⑦ 一致性：mergeSession(JS) 的归档求值必须与 listSessions(SQL COALESCE) 一致', async () => {
    // 复现真实场景：中间版本用 `UPDATE sessions SET archived = 1` 写过 legacy 列，
    // 升级后 archived_override 仍为 NULL，而 hermes 侧 archived = 0。
    env.hermes.rows = [hermesRow({ id: 's-legacy', archived: 0 })];
    const { db } = await import('../db.js');
    const store = await db();
    store.getOrCreateSession('s-legacy');
    // 直接改 legacy 列，模拟旧版本遗留数据
    const Database = (await import('better-sqlite3')).default;
    const raw = new Database(`${env.dir}/kmaster.db`);
    try {
      raw.prepare('UPDATE sessions SET archived = 1 WHERE id = ?').run('s-legacy');
    } finally { raw.close(); }

    // SQL 侧：listSessions 的 COALESCE 认为它已归档 → 不放出
    const listed = store.listSessions().map((r) => r.id);
    const sqlSaysArchived = !listed.includes('s-legacy');

    // JS 侧：mergeSession 的求值
    const { body } = await api('GET', '/api/sessions');
    const s = body.sessions.find((x: any) => x.id === 's-legacy');
    const jsSaysArchived = s.archived === 1;

    expect(
      jsSaysArchived,
      `SQL(COALESCE) 判定归档=${sqlSaysArchived}，但 mergeSession 判定归档=${jsSaysArchived}。` +
      ' 两套求值口径漂移 → legacy 已归档会话在列表接口里被「复活」成未归档。'
    ).toBe(sqlSaysArchived);
  });
});

// ════════════════════════════════════════════════════════════════════════
// 验证点 5：PATCH /api/sessions/:id 白名单与侧车行 ensure
// ════════════════════════════════════════════════════════════════════════
describe('[验证点5] PATCH /api/sessions/:id', () => {
  it('⑤-① 白名单接受 skills', async () => {
    env.hermes.rows = [hermesRow({ id: 's-skills' })];
    const { status, body } = await api('PATCH', '/api/sessions/s-skills', { skills: ['pdf'] });
    expect(status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.session.skills).toEqual(['pdf']);
  });

  it('⑤-② 白名单接受 mcpServers（camelCase）与 mcp_servers（snake_case）', async () => {
    env.hermes.rows = [hermesRow({ id: 's-skills' })];
    const camel = await api('PATCH', '/api/sessions/s-skills', { mcpServers: ['git'] });
    expect(camel.body.session.mcpServers).toEqual(['git']);
    const snake = await api('PATCH', '/api/sessions/s-skills', { mcp_servers: ['fs', 'http'] });
    expect(snake.body.session.mcpServers).toEqual(['fs', 'http']);
  });

  it('⑤-③ 白名单接受 pinned（boolean 与 number 双形态）', async () => {
    env.hermes.rows = [hermesRow({ id: 's-pin', pinned: 0 })];
    expect((await api('PATCH', '/api/sessions/s-pin', { pinned: true })).body.session.pinned).toBe(true);
    expect((await api('PATCH', '/api/sessions/s-pin', { pinned: false })).body.session.pinned).toBe(false);
    expect((await api('PATCH', '/api/sessions/s-pin', { pinned: 1 })).body.session.pinned).toBe(true);
    expect((await api('PATCH', '/api/sessions/s-pin', { pinned: 0 })).body.session.pinned).toBe(false);
  });

  it('⑤-④ 白名单接受 archived（boolean 与 number 双形态）', async () => {
    env.hermes.rows = [hermesRow({ id: 's-arch', archived: 0 })];
    expect((await api('PATCH', '/api/sessions/s-arch', { archived: true })).body.session.archived).toBe(1);
    expect((await api('PATCH', '/api/sessions/s-arch', { archived: false })).body.session.archived).toBe(0);
    expect((await api('PATCH', '/api/sessions/s-arch', { archived: 1 })).body.session.archived).toBe(1);
  });

  it('⑤-⑤ ensure 侧车行：对「只存在于 hermes」的会话首次 PATCH 必须真正落库（不得静默无效）', async () => {
    env.hermes.rows = [hermesRow({ id: 's-plain', title: 'hermes原名', cwd: 'D:/from-hermes' })];
    const { db } = await import('../db.js');
    const store = await db();
    expect(store.getSession('s-plain'), '前置条件：侧车行此时不应存在').toBeUndefined();

    await api('PATCH', '/api/sessions/s-plain', { pinned: true });

    const row = store.getSession('s-plain');
    expect(row, 'ensureSidecarRow 未建行 → UPDATE 打空，用户操作静默丢失').toBeDefined();
    expect(row!.pinned).toBe(1);
  });

  it('⑤-⑥ 传 null 清除覆盖：pinned=null 后回落 hermes 值', async () => {
    env.hermes.rows = [hermesRow({ id: 's-unpin', pinned: 1 })];
    // 先显式取消置顶
    expect((await api('PATCH', '/api/sessions/s-unpin', { pinned: false })).body.session.pinned).toBe(false);
    // 再清除覆盖 → 应回落 hermes 的 1
    const cleared = await api('PATCH', '/api/sessions/s-unpin', { pinned: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body.session.pinned, 'null 应清除覆盖回落 hermes').toBe(true);

    const { db } = await import('../db.js');
    const store = await db();
    expect(store.getSession('s-unpin')!.pinned, '库里应为 NULL 而非 0').toBeNull();
  });

  it('⑤-⑦ 传 null 清除归档覆盖', async () => {
    env.hermes.rows = [hermesRow({ id: 's-arch', archived: 1 })];
    expect((await api('PATCH', '/api/sessions/s-arch', { archived: false })).body.session.archived).toBe(0);
    const cleared = await api('PATCH', '/api/sessions/s-arch', { archived: null });
    expect(cleared.body.session.archived, 'null 应清除覆盖回落 hermes 的 archived=1').toBe(1);
    const { db } = await import('../db.js');
    const store = await db();
    expect((store.getSession('s-arch') as any).archived_override).toBeNull();
  });

  it('⑤-⑧ 部分更新语义：只 PATCH skills 不得把 mcpServers/pinned 抹掉', async () => {
    env.hermes.rows = [hermesRow({ id: 's-skills' })];
    await api('PATCH', '/api/sessions/s-skills', { skills: ['pdf'], mcpServers: ['git'], pinned: true });
    const res = await api('PATCH', '/api/sessions/s-skills', { skills: ['xlsx'] });
    expect(res.body.session.skills).toEqual(['xlsx']);
    expect(res.body.session.mcpServers, '未传的 mcpServers 被清空').toEqual(['git']);
    expect(res.body.session.pinned, '未传的 pinned 被清空').toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════
// 验证点 6：边界与错误路径
// ════════════════════════════════════════════════════════════════════════
describe('[验证点6] 边界与错误路径', () => {
  it('⑥-① skills 传非数组（字符串/对象/数字）→ 视为未提供，不写库', async () => {
    env.hermes.rows = [hermesRow({ id: 's-skills' })];
    await api('PATCH', '/api/sessions/s-skills', { skills: ['pdf'] });
    for (const bad of ['pdf', { a: 1 }, 42, true]) {
      const res = await api('PATCH', '/api/sessions/s-skills', { skills: bad });
      // 补丁体不含任何合法字段 → 400，且原值不被破坏
      expect(res.status, `skills=${JSON.stringify(bad)} 应被拒绝`).toBe(400);
      expect(res.body.error).toBe('no_valid_field');
    }
    const { body } = await api('GET', '/api/sessions');
    expect(body.sessions.find((x: any) => x.id === 's-skills').skills).toEqual(['pdf']);
  });

  it('⑥-② skills 数组内含非字符串/空白项 → 过滤后落库', async () => {
    env.hermes.rows = [hermesRow({ id: 's-skills' })];
    const res = await api('PATCH', '/api/sessions/s-skills', { skills: ['pdf', 1, null, '', '  ', { x: 1 }, 'git'] });
    expect(res.status).toBe(200);
    expect(res.body.session.skills).toEqual(['pdf', 'git']);
  });

  it('⑥-③ skills 传空数组 → 清空该会话技能', async () => {
    env.hermes.rows = [hermesRow({ id: 's-skills' })];
    await api('PATCH', '/api/sessions/s-skills', { skills: ['pdf'] });
    const res = await api('PATCH', '/api/sessions/s-skills', { skills: [] });
    expect(res.status).toBe(200);
    expect(res.body.session.skills).toEqual([]);
  });

  it('⑥-④ 会话 id 不存在（hermes 与 kmaster 皆无）→ 404 session_not_found', async () => {
    env.hermes.rows = [];
    const res = await api('PATCH', '/api/sessions/does-not-exist', { pinned: true });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('session_not_found');
  });

  it('⑥-⑤ 空补丁体 → 400 no_valid_field', async () => {
    env.hermes.rows = [hermesRow({ id: 's-plain' })];
    const res = await api('PATCH', '/api/sessions/s-plain', {});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('no_valid_field');
  });

  it('⑥-⑥ pinned 传非法类型（字符串）→ 视为未提供，不误写', async () => {
    env.hermes.rows = [hermesRow({ id: 's-pin', pinned: 1 })];
    const res = await api('PATCH', '/api/sessions/s-pin', { pinned: 'true' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('no_valid_field');
    const { db } = await import('../db.js');
    const store = await db();
    expect(store.getSession('s-pin')?.pinned ?? null, '非法入参不得写库').toBeNull();
  });

  it('⑥-⑦ PUT 与 PATCH 行为一致（路由别名）', async () => {
    env.hermes.rows = [hermesRow({ id: 's-pin', pinned: 0 })];
    const res = await api('PUT', '/api/sessions/s-pin', { pinned: true });
    expect(res.status).toBe(200);
    expect(res.body.session.pinned).toBe(true);
  });
});
