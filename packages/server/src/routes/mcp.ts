/**
 * routes/mcp.ts — MCP 连接器路由（从 sessions.ts 迁出，U-35，T07 扩展）
 *
 * GET    /api/mcp          → { deployed: McpServer[], candidates: McpAsset[] }
 * POST   /api/mcp          → { ok: true, servers: McpServer[] }
 * DELETE /api/mcp/:name    → { ok: true }
 *
 * @module routes/mcp
 */

import Router from '@koa/router';
import { listMcp, addMcp, removeMcp } from '../hermes-proxy.js';
import { mergeMcpLists } from '../services/hermes/aggregate/mcp.js';

export const mcpRouter = new Router();

mcpRouter.get('/api/mcp', async (ctx) => {
  const aggregated = mergeMcpLists();
  ctx.body = {
    deployed: aggregated.deployed,
    candidates: aggregated.candidates,
  };
});

mcpRouter.post('/api/mcp', async (ctx) => {
  const b = ctx.request.body as Record<string, unknown>;
  if (!b?.name || !b?.command) {
    ctx.status = 400;
    ctx.body = { error: 'name and command required' };
    return;
  }
  const servers = addMcp({
    name: String(b.name),
    command: String(b.command),
    args: b.args as string[] | undefined,
    env: b.env as Record<string, string> | undefined,
  });
  ctx.body = { ok: true, servers };
});

mcpRouter.delete('/api/mcp/:name', async (ctx) => {
  removeMcp(ctx.params.name);
  ctx.body = { ok: true };
});
