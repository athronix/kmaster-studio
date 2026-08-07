/**
 * routes/skills.ts — 技能枚举路由（从 sessions.ts 迁出，U-35，T07 扩展）
 *
 * GET /api/skills → { installed: Skill[], candidates: SkillAsset[], categories: string[] }
 *
 * @module routes/skills
 */

import Router from '@koa/router';
import { installSkill, uninstallSkill, listManagedSkills } from '../services/hermes/write/skills-install.js';
import { mergeSkillLists } from '../services/hermes/aggregate/skills.js';

export const skillsRouter = new Router();

skillsRouter.get('/api/skills', async (ctx) => {
  const aggregated = mergeSkillLists();
  ctx.body = {
    installed: aggregated.installed,
    candidates: aggregated.candidates,
    categories: aggregated.categories,
  };
});

// U-21：安装技能
skillsRouter.post('/api/skills/install', async (ctx) => {
  const b = ctx.request.body as Record<string, unknown>;
  const name = String(b?.skillName ?? b?.name ?? '');
  if (!name) { ctx.status = 400; ctx.body = { error: 'skillName required' }; return; }
  const result = installSkill(name);
  if (!result.ok) { ctx.status = 400; }
  ctx.body = result;
});

// U-21：卸载技能
skillsRouter.delete('/api/skills/:name', async (ctx) => {
  const result = uninstallSkill(ctx.params.name);
  ctx.body = result;
});

// U-21：kmaster 管理的技能元数据
skillsRouter.get('/api/skills/managed', async (ctx) => {
  ctx.body = { managed: listManagedSkills() };
});
