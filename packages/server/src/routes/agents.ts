/**
 * routes/agents.ts — Agent 角色 REST 端点（U-12 + T07 扩展 + T02 安装/卸载）
 *
 * GET /api/agents?source=installed|candidates|all
 *   → { installed: AgentEntry[], candidates: ExpertAsset[], categories: ExpertCategory[] }
 *
 * POST /api/agents/:name/install  (T02)
 *   → 200 { ok: true, agentId: string, message: string }
 *   → 400 { ok: false, error: "already_installed", message: string }
 *
 * DELETE /api/agents/:name/uninstall  (T02)
 *   → 200 { ok: true, message: string }
 *   → 404 { ok: false, error: "not_found", message: string }
 *
 * @module routes/agents
 */

import Router from '@koa/router';
import { getRealAgents } from '../services/hermes/read/agents.js';
import { upsertAgent, deleteAgent, installAgent, uninstallAgent } from '../services/hermes/write/agents.js';
import { mergeExpertLists } from '../services/hermes/aggregate/experts.js';

export const agentsRouter = new Router();

agentsRouter.get('/api/agents', async (ctx) => {
  const source = (ctx.query.source as string) ?? 'all';
  const validSources = ['installed', 'candidates', 'all'];
  const filter = validSources.includes(source) ? source as 'installed' | 'candidates' | 'all' : 'all';

  const aggregated = mergeExpertLists(filter);
  ctx.body = {
    installed: aggregated.installed,
    candidates: aggregated.candidates,
    categories: aggregated.categories,
  };
});

// U-22：创建 / 更新 Agent
agentsRouter.post('/api/agents', async (ctx) => {
  const b = ctx.request.body as Record<string, unknown>;
  const name = String(b?.name ?? '');
  if (!name) { ctx.status = 400; ctx.body = { error: 'name required' }; return; }
  const result = upsertAgent(name, {
    name,
    displayName: b?.displayName as string,
    icon: b?.icon as string,
    prompt: String(b?.prompt ?? ''),
    skills: Array.isArray(b?.skills) ? (b.skills as string[]) : undefined,
    mcp: Array.isArray(b?.mcp) ? (b.mcp as string[]) : undefined,
    specialties: Array.isArray(b?.specialties) ? (b.specialties as string[]) : undefined,
  });
  if (!result.ok) { ctx.status = 400; }
  ctx.body = result;
});

// U-22：删除 Agent（归档不销毁）
agentsRouter.delete('/api/agents/:name', async (ctx) => {
  const result = deleteAgent(ctx.params.name);
  if (!result.ok) { ctx.status = 404; }
  ctx.body = result;
});

// ═══════════════════ T02：Agent 安装 / 卸载 ═══════════════════

/**
 * POST /api/agents/:name/install — 从 COS 候选池安装 Agent 到本地。
 *
 * 契约：
 *   → 200 { ok: true, agentId: string, message: "Agent xxx 已安装" }
 *   → 400 { ok: false, error: "already_installed", message: "Agent xxx 已安装" }
 */
agentsRouter.post('/api/agents/:name/install', async (ctx) => {
  const name = ctx.params.name;
  const result = installAgent(name);
  if (!result.ok) {
    // already_installed / not_found / source_not_found → 400
    // 其他未知错误 → 500
    if (result.error === 'not_found') {
      ctx.status = 404;
    } else {
      ctx.status = 400;
    }
  }
  ctx.body = result;
});

/**
 * DELETE /api/agents/:name/uninstall — 卸载本地 Agent。
 *
 * 契约：
 *   → 200 { ok: true, message: "Agent xxx 已卸载" }
 *   → 404 { ok: false, error: "not_found", message: "Agent xxx 不存在" }
 */
agentsRouter.delete('/api/agents/:name/uninstall', async (ctx) => {
  const name = ctx.params.name;
  const result = uninstallAgent(name);
  if (!result.ok) {
    ctx.status = result.error === 'not_found' ? 404 : 400;
  }
  ctx.body = result;
});
