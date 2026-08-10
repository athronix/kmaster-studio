/**
 * routes/plugins.ts — 插件枚举路由（T01 新增）
 *
 * `GET /api/plugins` → `{ plugins: PluginItem[] }`
 *
 * ⚠️ 只读端点，无写侧。插件的启停仍由 hermes 侧（config.yaml / 环境变量）决定，
 * kmaster 只做**如实呈现**，🚫 不在此追加安装 / 卸载 / 开关类端点。
 *
 * Q2 兜底：扫不到任何 `plugin.yaml` manifest 时返回 `{ plugins: [] }`，前端走空态。
 *
 * @module routes/plugins
 */

import Router from '@koa/router';
import { listAggregatePlugins } from '../services/hermes/aggregate/plugins.js';
import { failWith } from './error.js';
import type { PluginItem } from '../protocol.js';

export const pluginsRouter = new Router();

pluginsRouter.get('/api/plugins', async (ctx) => {
  try {
    const plugins: PluginItem[] = await listAggregatePlugins();
    ctx.body = { plugins };
  } catch (err) {
    failWith(ctx, err);
  }
});
