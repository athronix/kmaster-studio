// F22 用量统计 REST：按天 / 模型 / 会话聚合（sqlite 与内存实现同语义）
import Router from '@koa/router';
import { db } from '../db.js';
import type { UsageGroupBy } from '../protocol.js';
import { failWith, badRequest } from './error.js';

export const usageRouter = new Router();

const VALID_GROUPS: UsageGroupBy[] = ['day', 'model', 'session'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// GET /api/usage/stats?group=day|model|session&from=YYYY-MM-DD&to=YYYY-MM-DD
usageRouter.get('/api/usage/stats', async (ctx) => {
  try {
    const rawGroup = ctx.query.group === undefined ? 'day' : String(ctx.query.group);
    if (!VALID_GROUPS.includes(rawGroup as UsageGroupBy)) {
      badRequest(ctx, `group must be one of ${VALID_GROUPS.join(' | ')}`);
      return;
    }
    const from = ctx.query.from === undefined ? undefined : String(ctx.query.from);
    const to = ctx.query.to === undefined ? undefined : String(ctx.query.to);
    if (from && !DATE_RE.test(from)) {
      badRequest(ctx, 'from must be YYYY-MM-DD');
      return;
    }
    if (to && !DATE_RE.test(to)) {
      badRequest(ctx, 'to must be YYYY-MM-DD');
      return;
    }

    const store = await db();
    const { rows, totals } = store.queryUsage(rawGroup as UsageGroupBy, from, to);
    ctx.body = { group: rawGroup, rows, totals };
  } catch (e) {
    failWith(ctx, e);
  }
});
