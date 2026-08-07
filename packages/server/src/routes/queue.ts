// F17 消息队列 REST：列表 / 移除 / 立即发送（手动冲刷入口，R-M4-5）
import Router from '@koa/router';
import { db } from '../db.js';
import { dropQueueItem, sendQueueItemNow } from '../run-chat.js';
import { failWith, notFound } from './error.js';

export const queueRouter = new Router();

// GET /api/queue?session_id=
queueRouter.get('/api/queue', async (ctx) => {
  try {
    const store = await db();
    const sessionId = ctx.query.session_id === undefined ? undefined : String(ctx.query.session_id);
    ctx.body = { items: store.listQueue(sessionId) };
  } catch (e) {
    failWith(ctx, e);
  }
});

// DELETE /api/queue/:id —— 移除排队项并广播 queue.updated
queueRouter.delete('/api/queue/:id', async (ctx) => {
  try {
    const ok = await dropQueueItem(ctx.params.id);
    if (!ok) {
      notFound(ctx, `queue item ${ctx.params.id} not found`);
      return;
    }
    ctx.body = { ok: true };
  } catch (e) {
    failWith(ctx, e);
  }
});

// POST /api/queue/:id/send —— 会话空闲则立即执行，忙则提到队首
queueRouter.post('/api/queue/:id/send', async (ctx) => {
  try {
    const result = await sendQueueItemNow(ctx.params.id);
    if (!result) {
      notFound(ctx, `queue item ${ctx.params.id} not found`);
      return;
    }
    ctx.body = result;
  } catch (e) {
    failWith(ctx, e);
  }
});
