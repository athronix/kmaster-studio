// M5/F21 设置页专用 REST：Provider 凭据 + hermes Profile
//
// ⚠️ AC8 硬约束：M5 全部新增 REST 只有**两组**——
//   1. `/api/config/providers`（GET / PUT）
//   2. `/api/profiles`（GET）与 `/api/profiles/active`（PUT，同属一组资源）
// 外加 `/api/health` 的**字段扩展**（在 routes/sessions.ts，♻️ 复用既有端点，不新建）。
// 🚫 禁止在此文件追加技能 / MCP / 模型枚举类端点——它们已存在于 routes/sessions.ts。
//
// ⚠️ §0.2.1：切换 profile 只写 `<root>/active_profile`，**不会**改写任何已存在子进程的
// HERMES_HOME。因此切换成功后本路由必须：①失效 proxy 缓存（useProfile 内部已做）；
// ②重建 Bridge 连接；③经 `/chat-run` 广播 `settings.updated`；④返回 restart_required=true。
import Router from '@koa/router';
import {
  listProviders,
  setProviderKey,
  listProfiles,
  useProfile,
  getSettings,
} from '../hermes-proxy.js';
import { hasActiveRuns, restartBridge, broadcastSettingsUpdated } from '../run-chat.js';
import { failWith, badRequest } from './error.js';

export const configRouter = new Router();

// ───────────────────────── Provider 凭据（🔒 只写不回显）─────────────────────────

/**
 * `GET /api/config/providers`
 * → `{ providers: ProviderInfo[], current: string }`
 * 🔒 DTO 层面就不存在明文 Key 字段，只有 `configured` 与 `masked`（FR21.5 / NFR-M5-5）。
 */
configRouter.get('/api/config/providers', async (ctx) => {
  try {
    ctx.body = await listProviders();
  } catch (err) {
    failWith(ctx, err);
  }
});

/**
 * `PUT /api/config/providers`  body `{ provider: string, api_key: string }`
 * → `{ ok: true, provider, configured, masked }`
 * 写入经 `hermes config set <key_env> <value>` CLI（🚫 不直写 YAML/.env）；
 * `api_key` 传空串表示**清除**该 provider 的 Key。
 */
configRouter.put('/api/config/providers', async (ctx) => {
  const body = (ctx.request.body ?? {}) as { provider?: unknown; api_key?: unknown };
  const provider = typeof body.provider === 'string' ? body.provider.trim() : '';
  if (!provider) {
    badRequest(ctx, 'provider required');
    return;
  }
  if (body.api_key !== undefined && typeof body.api_key !== 'string') {
    badRequest(ctx, 'api_key must be a string');
    return;
  }
  try {
    ctx.body = await setProviderKey(provider, typeof body.api_key === 'string' ? body.api_key : '');
  } catch (err) {
    failWith(ctx, err);
  }
});

// ───────────────────────── hermes Profile ─────────────────────────

/**
 * `GET /api/profiles`
 * → `{ profiles: ProfileInfo[], active: string, root: string }`
 * 扫目录实现（Q8）：零子进程、毫秒级；`profiles/` 与 `active_profile` 懒创建，
 * 缺失时回落「仅 default 且激活」，🚫 绝不因目录不存在而报错。
 */
configRouter.get('/api/profiles', (ctx) => {
  try {
    ctx.body = listProfiles();
  } catch (err) {
    failWith(ctx, err);
  }
});

/**
 * `PUT /api/profiles/active`  body `{ name: string }`
 * → `{ ok: true, active, hermes_home, restart_required: true }`
 *
 * ⚠️ 有 run 正在执行时**拒绝切换**（409）：切换会重建 Bridge 连接并改写后续子进程的
 * HERMES_HOME，中途切换会让运行中的 agent 处于「一半旧 profile 一半新 profile」的错位态。
 */
configRouter.put('/api/profiles/active', async (ctx) => {
  const body = (ctx.request.body ?? {}) as { name?: unknown };
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) {
    badRequest(ctx, 'name required');
    return;
  }
  if (hasActiveRuns()) {
    ctx.status = 409;
    ctx.body = {
      error: 'run_in_progress',
      message: '有任务正在执行，请先等待当前任务结束再切换 profile',
    };
    return;
  }
  try {
    const result = await useProfile(name);
    // §0.2.1 ②：重建 Bridge（丢弃指向旧 profile 的连接），后续 run 自动按新 HERMES_HOME 重连
    restartBridge();
    // §0.2.1 ③：经 /chat-run 广播，让所有已打开的页面同步激活 profile
    broadcastSettingsUpdated(await getSettings());
    ctx.body = result;
  } catch (err) {
    failWith(ctx, err);
  }
});
