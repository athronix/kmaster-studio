// F13 记忆管理 REST：直接读写 <hermesHome>/memories/{MEMORY,USER}.md
// 写回三件套：.kmlock 自旋锁 → 写前备份 → tmp+rename 原子替换（见 hermes-proxy）
import Router from '@koa/router';
import {
  listMemory,
  getMemoryEntry,
  createMemoryEntry,
  updateMemoryEntry,
  deleteMemoryEntry,
} from '../hermes-proxy.js';
import type { MemoryGroup } from '../protocol.js';
import { failWith, badRequest, notFound } from './error.js';

export const memoryRouter = new Router();

const VALID_GROUPS: MemoryGroup[] = ['memory', 'user'];

function parseGroup(raw: unknown): MemoryGroup | undefined | null {
  if (raw === undefined || raw === null || raw === '') return undefined; // 不过滤
  const g = String(raw) as MemoryGroup;
  return VALID_GROUPS.includes(g) ? g : null; // null = 非法
}

// GET /api/memory?group=&q=
memoryRouter.get('/api/memory', async (ctx) => {
  try {
    const group = parseGroup(ctx.query.group);
    if (group === null) {
      badRequest(ctx, `group must be one of ${VALID_GROUPS.join(' | ')}`);
      return;
    }
    const q = ctx.query.q === undefined ? undefined : String(ctx.query.q);
    ctx.body = { entries: listMemory(group, q) };
  } catch (e) {
    failWith(ctx, e);
  }
});

// GET /api/memory/:id
memoryRouter.get('/api/memory/:id', async (ctx) => {
  try {
    const entry = getMemoryEntry(ctx.params.id);
    if (!entry) {
      notFound(ctx, `memory entry ${ctx.params.id} not found`);
      return;
    }
    ctx.body = { entry };
  } catch (e) {
    failWith(ctx, e);
  }
});

// POST /api/memory  { group, content }
memoryRouter.post('/api/memory', async (ctx) => {
  try {
    const body = (ctx.request.body ?? {}) as { group?: string; content?: string };
    const group = parseGroup(body.group ?? 'memory');
    if (!group) {
      badRequest(ctx, `group must be one of ${VALID_GROUPS.join(' | ')}`);
      return;
    }
    const content = String(body.content ?? '').trim();
    if (!content) {
      badRequest(ctx, 'content required');
      return;
    }
    ctx.body = { entry: await createMemoryEntry(group, content) };
  } catch (e) {
    failWith(ctx, e);
  }
});

// PUT /api/memory/:id  { content }   —— 内容寻址失效返回 409 stale_id
memoryRouter.put('/api/memory/:id', async (ctx) => {
  try {
    const body = (ctx.request.body ?? {}) as { content?: string };
    const content = String(body.content ?? '').trim();
    if (!content) {
      badRequest(ctx, 'content required');
      return;
    }
    ctx.body = { entry: await updateMemoryEntry(ctx.params.id, content) };
  } catch (e) {
    failWith(ctx, e);
  }
});

// DELETE /api/memory/:id  —— 返回备份文件路径供 UI 提示可回滚
memoryRouter.delete('/api/memory/:id', async (ctx) => {
  try {
    ctx.body = await deleteMemoryEntry(ctx.params.id);
  } catch (e) {
    failWith(ctx, e);
  }
});
