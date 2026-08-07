/**
 * routes/models.ts — 模型枚举路由（从 sessions.ts 迁出，U-35，T07 扩展）
 *
 * GET /api/models → { providers: ProviderGroup[], usage: Record<string, { calls: number, tokens: number }> }
 *
 * @module routes/models
 */

import Router from '@koa/router';
import { getModels } from '../hermes-proxy.js';
import { queryModelUsage } from '../services/hermes/read/state-db.js';

export const modelsRouter = new Router();

modelsRouter.get('/api/models', async (ctx) => {
  const providers = await getModels();
  let usage: Record<string, { calls: number; tokens: number }> = {};
  try {
    usage = queryModelUsage();
  } catch { /* state.db 不可用或 session_model_usage 表不存在 */ }
  ctx.body = { providers, usage };
});
