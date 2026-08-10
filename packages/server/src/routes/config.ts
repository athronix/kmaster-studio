// M5/F21 设置页专用 REST：Provider 凭据 + hermes Profile
//
// ⚠️ AC8 硬约束：M5 全部新增 REST 只有**两组**——
//   1. `/api/config/providers`（GET / PUT）
//   2. `/api/profiles`（GET）与 `/api/profiles/active`（PUT，同属一组资源）
// 外加 `/api/health` 的**字段扩展**（在 routes/sessions.ts，♻️ 复用既有端点，不新建）。
// 🚫 禁止在此文件追加技能 / MCP / 模型枚举类端点——它们已存在于 routes/sessions.ts。
//
// 📌 T01 扩展（页面数据逻辑对齐 hermes-studio）：新增第 3 组 `/api/config/platform`（GET / PUT）。
//   它与 providers 同属「设置页凭据类配置」，共用同一套「只写不回显 + 掩码」范式，故并入本文件，
//   仍不触碰 AC8 关于技能 / MCP / 模型枚举端点的禁令。
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
import { readConfigSafe, safeWriteConfig } from '../services/hermes/write/config-yaml.js';
import { listPlatformPluginTypes } from '../services/hermes/aggregate/plugins.js';
import type {
  PlatformChannelConfig,
  PlatformChannelType,
  PlatformConfigResponse,
} from '../protocol.js';

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

// ───────────────────────── T01：平台渠道配置（🔒 凭据只写不回显）─────────────────────────
//
// 持久化位置：config.yaml `platform.channels[]`。
// 写侧一律经 services/hermes/write/config-yaml.ts 的 safeWriteConfig（跨进程锁 + 备份 +
// 原子替换 + 回读校验），🚫 不直写 YAML。

/** 已知渠道类型（与 hermes-agent `plugins/platforms/<id>` 目录同名），未知值归一为 'other'。 */
const PLATFORM_CHANNEL_TYPES: readonly PlatformChannelType[] = [
  'telegram', 'discord', 'slack', 'whatsapp', 'matrix',
  'wecom', 'feishu', 'dingtalk', 'qqbot', 'teams',
  'email', 'line', 'sms', 'irc', 'mattermost',
  'google_chat', 'homeassistant', 'ntfy', 'photon', 'simplex', 'raft',
];

/** config.yaml 中单条渠道的原始形态（一切字段都当不可信处理）。 */
interface RawChannel {
  id?: unknown;
  type?: unknown;
  enabled?: unknown;
  label?: unknown;
  credentials?: unknown;
}

function normalizeChannelType(raw: unknown): PlatformChannelType {
  const value = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return (PLATFORM_CHANNEL_TYPES as readonly string[]).includes(value)
    ? (value as PlatformChannelType)
    : 'other';
}

/**
 * 🔒 凭据掩码：只暴露首 3 位 + 末 4 位，中间恒为 4 个星号。
 * 长度 ≤ 8 的短值一律整体打码，避免小样本被还原。
 */
function maskSecret(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) return '';
  if (trimmed.length <= 8) return '****';
  return `${trimmed.slice(0, 3)}****${trimmed.slice(-4)}`;
}

/** 从 config.yaml 原始对象中取出渠道数组（缺失 / 类型不对一律回落空数组）。 */
function readRawChannels(cfg: Record<string, unknown>): RawChannel[] {
  const platform = cfg.platform;
  if (!platform || typeof platform !== 'object' || Array.isArray(platform)) return [];
  const channels = (platform as Record<string, unknown>).channels;
  if (!Array.isArray(channels)) return [];
  return channels.filter((c): c is RawChannel => !!c && typeof c === 'object' && !Array.isArray(c));
}

/** 原始渠道 → 下行 DTO（🔒 剥离明文 credentials，只留 configuredKeys / maskedKeys）。 */
function toChannelDto(raw: RawChannel): PlatformChannelConfig {
  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  const configuredKeys: string[] = [];
  const maskedKeys: Record<string, string> = {};

  if (raw.credentials && typeof raw.credentials === 'object' && !Array.isArray(raw.credentials)) {
    for (const [key, value] of Object.entries(raw.credentials as Record<string, unknown>)) {
      const text = value === null || value === undefined ? '' : String(value);
      if (text.trim() === '') continue;
      configuredKeys.push(key);
      maskedKeys[key] = maskSecret(text);
    }
  }

  return {
    id,
    type: normalizeChannelType(raw.type),
    enabled: raw.enabled === true,
    label: typeof raw.label === 'string' && raw.label.trim() ? raw.label.trim() : undefined,
    configuredKeys,
    maskedKeys,
    // 🔒 credentials 恒不回显
  };
}

/**
 * `GET /api/config/platform`
 * → `{ channels: PlatformChannelConfig[], availableTypes: PlatformChannelType[] }`
 *
 * config.yaml 缺失 / 无 `platform` 段 → `channels: []`（前端空态），🚫 不报错。
 */
configRouter.get('/api/config/platform', async (ctx) => {
  try {
    let cfg: Record<string, unknown> = {};
    try {
      cfg = await readConfigSafe();
    } catch {
      cfg = {}; // 配置文件尚未创建 / 抢锁失败 → 降级为空配置
    }
    const channels = readRawChannels(cfg)
      .map(toChannelDto)
      .filter((c) => c.id !== '');
    const availableTypes = listPlatformPluginTypes().map(normalizeChannelType);
    const body: PlatformConfigResponse = { channels, availableTypes };
    ctx.body = body;
  } catch (err) {
    failWith(ctx, err);
  }
});

/**
 * `PUT /api/config/platform`  body `{ channels: PlatformChannelConfig[] }`
 * → `{ ok: true, version, channels }`（channels 为掩码后的最新快照）
 *
 * 语义：**整表替换**渠道列表；单个渠道的 `credentials` 走**增量合并**——
 *   - 未出现的键     → 保留原值（前端不回显明文，故不可能原样回传）
 *   - 值为空串的键   → 删除该凭据
 *   - 其余           → 覆盖写入
 */
configRouter.put('/api/config/platform', async (ctx) => {
  const body = (ctx.request.body ?? {}) as { channels?: unknown };
  if (!Array.isArray(body.channels)) {
    badRequest(ctx, 'channels must be an array');
    return;
  }

  // ── 入参校验（全部通过后才动配置文件）──
  const incoming: Array<{
    id: string;
    type: PlatformChannelType;
    enabled: boolean;
    label?: string;
    credentials: Record<string, string>;
  }> = [];
  const seenIds = new Set<string>();

  for (const item of body.channels as RawChannel[]) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      badRequest(ctx, 'each channel must be an object');
      return;
    }
    const id = typeof item.id === 'string' ? item.id.trim() : '';
    if (!id) {
      badRequest(ctx, 'channel.id required');
      return;
    }
    if (seenIds.has(id)) {
      badRequest(ctx, `duplicate channel id: ${id}`);
      return;
    }
    seenIds.add(id);

    if (item.enabled !== undefined && typeof item.enabled !== 'boolean') {
      badRequest(ctx, `channel[${id}].enabled must be a boolean`);
      return;
    }

    const credentials: Record<string, string> = {};
    if (item.credentials !== undefined) {
      if (!item.credentials || typeof item.credentials !== 'object' || Array.isArray(item.credentials)) {
        badRequest(ctx, `channel[${id}].credentials must be an object`);
        return;
      }
      for (const [key, value] of Object.entries(item.credentials as Record<string, unknown>)) {
        if (typeof value !== 'string') {
          badRequest(ctx, `channel[${id}].credentials.${key} must be a string`);
          return;
        }
        credentials[key] = value;
      }
    }

    incoming.push({
      id,
      type: normalizeChannelType(item.type),
      enabled: item.enabled === true,
      label: typeof item.label === 'string' && item.label.trim() ? item.label.trim() : undefined,
      credentials,
    });
  }

  try {
    let merged: RawChannel[] = [];

    const result = await safeWriteConfig((current) => {
      const existing = new Map<string, RawChannel>();
      for (const raw of readRawChannels(current)) {
        const id = typeof raw.id === 'string' ? raw.id.trim() : '';
        if (id) existing.set(id, raw);
      }

      merged = incoming.map((channel) => {
        const prev = existing.get(channel.id);
        const prevCreds: Record<string, string> = {};
        if (prev?.credentials && typeof prev.credentials === 'object' && !Array.isArray(prev.credentials)) {
          for (const [key, value] of Object.entries(prev.credentials as Record<string, unknown>)) {
            if (value === null || value === undefined) continue;
            prevCreds[key] = String(value);
          }
        }

        // 增量合并：空串 = 清除，其余覆盖，未提及的保留
        for (const [key, value] of Object.entries(channel.credentials)) {
          if (value.trim() === '') delete prevCreds[key];
          else prevCreds[key] = value;
        }

        const next: RawChannel = {
          id: channel.id,
          type: channel.type,
          enabled: channel.enabled,
        };
        if (channel.label) next.label = channel.label;
        if (Object.keys(prevCreds).length > 0) next.credentials = prevCreds;
        return next;
      });

      const prevPlatform =
        current.platform && typeof current.platform === 'object' && !Array.isArray(current.platform)
          ? (current.platform as Record<string, unknown>)
          : {};

      return { ...current, platform: { ...prevPlatform, channels: merged } };
    });

    if (!result.ok) {
      ctx.status = 500;
      ctx.body = { error: 'config_write_failed', message: result.error ?? 'config write failed' };
      return;
    }

    // 🔒 回包同样只给掩码视图
    ctx.body = { ok: true, version: result.version, channels: merged.map(toChannelDto) };
  } catch (err) {
    failWith(ctx, err);
  }
});
