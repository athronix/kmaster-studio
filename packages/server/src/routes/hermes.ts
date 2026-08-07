/**
 * routes/hermes.ts — /api/hermes/probe 探测端点
 *
 * GET  /api/hermes/probe — 返回 HermesProbe 结构（含 checks[]、bridge 身份、幽灵检测）
 *
 * @module routes/hermes
 */

import Router from '@koa/router';
import { buildProbe } from '../services/hermes/probe.js';

export const hermesRouter = new Router();

hermesRouter.get('/api/hermes/probe', async (ctx) => {
  try {
    const probe = await buildProbe();
    ctx.body = probe;
  } catch (err: unknown) {
    ctx.status = 500;
    ctx.body = {
      error: 'PROBE_FAILED',
      message: err instanceof Error ? err.message : String(err),
    };
  }
});
