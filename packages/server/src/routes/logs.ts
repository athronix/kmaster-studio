/**
 * routes/logs.ts — 日志 REST 端点（U-07）
 *
 * GET /api/logs?kind=hermes&level=ERROR&since=2026-08-01&q=timeout&limit=50
 *
 * @module routes/logs
 */

import Router from '@koa/router';
import { getRealLogs } from '../services/hermes/read/logs.js';

export const logsRouter = new Router();

logsRouter.get('/api/logs', async (ctx) => {
  const q = ctx.query as Record<string, string | undefined>;

  const logs = getRealLogs({
    kind: q.kind,
    level: q.level,
    since: q.since,
    q: q.q,
    limit: q.limit ? parseInt(q.limit, 10) || 200 : 200,
  });

  ctx.body = { logs, count: logs.length };
});
