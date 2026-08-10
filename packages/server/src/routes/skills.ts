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
import type { Skill } from '../protocol.js';
import type { SkillAsset } from '../types/asset.js';

export const skillsRouter = new Router();

/**
 * `GET /api/skills` 的响应契约（T01 显式标注）。
 *
 * ⚠️ 本端点**恒返回全量三段对象**，🚫 不支持任何 query 过滤参数
 * （历史上前端曾传 `?source=candidates`，那是幽灵参数，服务端从未消费）。
 * 前端如需「仅候选」视图，请自行取 `.candidates`。
 */
export interface SkillsResponse {
  /** 已安装技能（hermes 三来源合并去重后 enabled 的部分） */
  installed: Skill[];
  /** 市场候选（含 COS 资产，可能与 installed 同名，由前端按 D1 口径过滤） */
  candidates: SkillAsset[];
  /** 分类枚举（installed + candidates 的 category 并集） */
  categories: string[];
}

skillsRouter.get('/api/skills', async (ctx) => {
  const aggregated = mergeSkillLists();
  const body: SkillsResponse = {
    installed: aggregated.installed,
    candidates: aggregated.candidates,
    categories: aggregated.categories,
  };
  ctx.body = body;
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
