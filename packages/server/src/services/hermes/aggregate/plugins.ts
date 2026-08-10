/**
 * aggregate/plugins.ts — 插件聚合（T01）
 *
 * 数据源（只读磁盘扫描，🚫 不起 Python 子进程、🚫 不新增三方依赖）：
 *   1. `<agentRoot>/plugins/**\/plugin.yaml`   → source = 'bundled'（hermes-agent 内置，约 89 个）
 *   2. `$HERMES_HOME/plugins/**\/plugin.yaml`  → source = 'user'（用户安装，覆盖同名 bundled）
 *
 * ⚠️ Q2 背景：kmaster 侧 `config.yaml` **没有** `plugins:` 段（本机实测 32 版配置中不存在），
 * hermes-studio 是靠 Python `PluginManager` 做发现的。本实现改用等价的 manifest 磁盘扫描：
 * 扫不到任何 manifest 时**自然返回 `[]`**，前端走空态 —— 与 Q2 裁定的兜底行为一致。
 *
 * 生效态判定（三态，见 `PluginStatus`）：
 *   - config.yaml `plugins.<name>.enabled === false` → 'disabled'（显式关闭优先级最高）
 *   - config.yaml `plugins.<name>.enabled === true`  → 'enabled'
 *   - manifest 无 `requires_env`                     → 'enabled'
 *   - `requires_env` 全部命中（config.yaml `env:` 段或 process.env）→ 'enabled'
 *   - 否则                                            → 'needs_config'
 *
 * @module services/hermes/aggregate/plugins
 */

import path from 'node:path';
import fs from 'node:fs';
import yaml from 'js-yaml';
import { resolveActiveHermesHome } from '../env.js';
import { readConfigSafe } from '../write/config-yaml.js';
import type { PluginItem, PluginKind, PluginSource, PluginStatus } from '../../../protocol.js';

// ── 常量 ────────────────────────────────────────────────────────────────

/** manifest 文件名 */
const MANIFEST = 'plugin.yaml';

/**
 * 扫描深度：插件既可能直挂在 `plugins/<name>/`（如 disk-cleanup），
 * 也可能挂在分组下 `plugins/<group>/<name>/`（如 platforms/telegram、image_gen/fal）。
 * 实测最深两层即可覆盖全部 90 个 manifest，故上限 2 —— 避免深递归扫 `__pycache__`。
 */
const MAX_DEPTH = 2;

/** 已知 kind 白名单，其余归一为 'other' */
const KNOWN_KINDS: readonly string[] = ['platform', 'backend', 'model-provider', 'standalone'];

/** 明显不是插件的目录名，扫描时直接跳过 */
const SKIP_DIRS = new Set(['__pycache__', 'node_modules', '.git', '.venv', 'dist', 'build']);

// ── manifest 原始结构 ───────────────────────────────────────────────────

/** `requires_env` / `optional_env` 条目既可能是纯字符串也可能是对象 */
type EnvSpec = string | { name?: unknown; description?: unknown };

interface RawManifest {
  name?: unknown;
  label?: unknown;
  version?: unknown;
  description?: unknown;
  kind?: unknown;
  requires_env?: unknown;
  optional_env?: unknown;
  provides_tools?: unknown;
  hooks?: unknown;
}

// ── 工具函数 ────────────────────────────────────────────────────────────

/** 安全读目录项（目录不存在 / 无权限一律返回空数组，🚫 不抛错）。 */
function safeReadDir(dir: string): fs.Dirent[] {
  try {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

/** 解析 hermes-agent 源码根：显式环境变量 → `$HERMES_HOME/hermes-agent` → 同级 `../hermes-agent`。 */
function resolveAgentRoot(hermesHome: string): string {
  const explicit = process.env.HERMES_AGENT_ROOT;
  if (explicit && explicit.trim()) return path.normalize(explicit.trim());
  const nested = path.join(hermesHome, 'hermes-agent');
  if (fs.existsSync(nested)) return nested;
  return path.resolve(hermesHome, '..', 'hermes-agent');
}

/** 归一 `requires_env` / `optional_env` → 变量名数组。 */
function normalizeEnvNames(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const names: string[] = [];
  for (const item of raw as EnvSpec[]) {
    if (typeof item === 'string') {
      const trimmed = item.trim();
      if (trimmed) names.push(trimmed);
    } else if (item && typeof item === 'object' && typeof item.name === 'string') {
      const trimmed = item.name.trim();
      if (trimmed) names.push(trimmed);
    }
  }
  return names;
}

/** 归一字符串数组字段（provides_tools 等）。 */
function normalizeStringList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map((x) => x.trim());
}

/** 归一 kind。 */
function normalizeKind(raw: unknown): PluginKind {
  const value = typeof raw === 'string' ? raw.trim() : '';
  return (KNOWN_KINDS.includes(value) ? value : 'other') as PluginKind;
}

/** 单行化 description（YAML 折叠块会带换行）。 */
function normalizeDescription(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string') return fallback;
  const flat = raw.replace(/\s+/g, ' ').trim();
  return flat || fallback;
}

/** 读取并解析单个 manifest，失败返回 null（坏 YAML 不得拖垮整表）。 */
function readManifest(file: string): RawManifest | null {
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = yaml.load(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed as RawManifest;
  } catch {
    return null;
  }
}

// ── 扫描 ────────────────────────────────────────────────────────────────

/** 扫描命中的一条 manifest 及其位置信息 */
interface ScannedManifest {
  manifest: RawManifest;
  /** 目录名（manifest 缺 name 时兜底） */
  dirName: string;
  /** 分组目录名（顶层插件为 undefined） */
  group?: string;
  source: PluginSource;
}

/**
 * 在 `root` 下递归查找 `plugin.yaml`（深度上限 MAX_DEPTH）。
 * 命中 manifest 的目录不再向下递归 —— 一个插件目录内不会再嵌套另一个插件。
 */
function scanPluginRoot(root: string, source: PluginSource): ScannedManifest[] {
  const found: ScannedManifest[] = [];

  const walk = (dir: string, depth: number, group: string | undefined): void => {
    if (depth > MAX_DEPTH) return;
    for (const entry of safeReadDir(dir)) {
      if (!entry.isDirectory()) continue;
      if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;

      const child = path.join(dir, entry.name);
      const manifestPath = path.join(child, MANIFEST);
      if (fs.existsSync(manifestPath)) {
        const manifest = readManifest(manifestPath);
        if (manifest) found.push({ manifest, dirName: entry.name, group, source });
        continue; // 已是插件目录，不再下钻
      }
      walk(child, depth + 1, depth === 1 ? entry.name : group);
    }
  };

  walk(root, 1, undefined);
  return found;
}

// ── 配置叠加 ────────────────────────────────────────────────────────────

/** config.yaml 中与插件相关的两段：`plugins`（开关）与 `env`（凭据变量）。 */
interface ConfigOverlay {
  /** 插件名（小写）→ 显式开关；未声明则不在表中 */
  toggles: Map<string, boolean>;
  /** config.yaml `env:` 段中已配置的变量名（大写原样） */
  configuredEnv: Set<string>;
}

/** 读 config.yaml（缺失 / 损坏 / 抢锁失败一律降级为空叠加，🚫 不阻塞列表）。 */
async function loadConfigOverlay(): Promise<ConfigOverlay> {
  const toggles = new Map<string, boolean>();
  const configuredEnv = new Set<string>();

  let cfg: Record<string, unknown> = {};
  try {
    cfg = await readConfigSafe();
  } catch {
    return { toggles, configuredEnv };
  }

  // `plugins:` 段（本机实测不存在，此处为向前兼容的防御式解析）
  const plugins = cfg.plugins;
  if (plugins && typeof plugins === 'object' && !Array.isArray(plugins)) {
    for (const [key, value] of Object.entries(plugins as Record<string, unknown>)) {
      if (typeof value === 'boolean') {
        toggles.set(key.toLowerCase(), value);
      } else if (value && typeof value === 'object' && 'enabled' in (value as Record<string, unknown>)) {
        const enabled = (value as Record<string, unknown>).enabled;
        if (typeof enabled === 'boolean') toggles.set(key.toLowerCase(), enabled);
      }
    }
  }

  // `env:` 段 —— 值非空才算「已配置」
  const env = cfg.env;
  if (env && typeof env === 'object' && !Array.isArray(env)) {
    for (const [key, value] of Object.entries(env as Record<string, unknown>)) {
      if (value !== null && value !== undefined && String(value).trim() !== '') configuredEnv.add(key);
    }
  }

  return { toggles, configuredEnv };
}

/** 某个环境变量是否已配置（config.yaml `env:` 段优先，其次进程环境）。 */
function isEnvConfigured(name: string, overlay: ConfigOverlay): boolean {
  if (overlay.configuredEnv.has(name)) return true;
  const fromProcess = process.env[name];
  return typeof fromProcess === 'string' && fromProcess.trim() !== '';
}

// ── 转换 ────────────────────────────────────────────────────────────────

function toPluginItem(scanned: ScannedManifest, overlay: ConfigOverlay): PluginItem {
  const { manifest, dirName, group, source } = scanned;

  const name = typeof manifest.name === 'string' && manifest.name.trim() ? manifest.name.trim() : dirName;
  const label = typeof manifest.label === 'string' && manifest.label.trim() ? manifest.label.trim() : undefined;
  const version = typeof manifest.version === 'string' && manifest.version.trim()
    ? manifest.version.trim()
    : undefined;

  const requiresEnv = normalizeEnvNames(manifest.requires_env);
  const missingEnv = requiresEnv.filter((varName) => !isEnvConfigured(varName, overlay));

  let effectiveStatus: PluginStatus;
  const toggle = overlay.toggles.get(name.toLowerCase());
  if (toggle === false) {
    effectiveStatus = 'disabled';
  } else if (toggle === true) {
    effectiveStatus = 'enabled';
  } else if (requiresEnv.length === 0 || missingEnv.length === 0) {
    effectiveStatus = 'enabled';
  } else {
    effectiveStatus = 'needs_config';
  }

  return {
    id: `${source}:${group ? `${group}/` : ''}${dirName}`,
    name,
    kind: normalizeKind(manifest.kind),
    source,
    effectiveStatus,
    providesTools: normalizeStringList(manifest.provides_tools),
    description: normalizeDescription(manifest.description, name),
    label,
    version,
    requiresEnv: requiresEnv.length > 0 ? requiresEnv : undefined,
    missingEnv: missingEnv.length > 0 ? missingEnv : undefined,
    group,
  };
}

// ── 聚合 ────────────────────────────────────────────────────────────────

/**
 * 枚举全部 hermes 插件。
 *
 * 去重：同 `name` 时 **user 覆盖 bundled**（用户安装版优先）。
 * 排序：needs_config → enabled → disabled（待处理的排前面），组内按 name 字母序。
 *
 * @returns 插件列表；无任何 manifest 时返回 `[]`（Q2 空态兜底）
 */
export async function listAggregatePlugins(): Promise<PluginItem[]> {
  const hermesHome = resolveActiveHermesHome();
  const agentRoot = resolveAgentRoot(hermesHome);

  const scanned: ScannedManifest[] = [
    ...scanPluginRoot(path.join(agentRoot, 'plugins'), 'bundled'),
    ...scanPluginRoot(path.join(hermesHome, 'plugins'), 'user'),
  ];
  if (scanned.length === 0) return [];

  const overlay = await loadConfigOverlay();

  // 同名去重：user 后扫、直接覆盖 bundled
  const byName = new Map<string, PluginItem>();
  for (const entry of scanned) {
    const item = toPluginItem(entry, overlay);
    const key = item.name.toLowerCase();
    const existing = byName.get(key);
    if (existing && existing.source === 'user' && item.source === 'bundled') continue;
    byName.set(key, item);
  }

  const statusRank: Record<PluginStatus, number> = { needs_config: 0, enabled: 1, disabled: 2 };
  return [...byName.values()].sort((a, b) => {
    const diff = statusRank[a.effectiveStatus] - statusRank[b.effectiveStatus];
    if (diff !== 0) return diff;
    return a.name.localeCompare(b.name);
  });
}

/**
 * 枚举磁盘上可用的平台渠道类型（`<agentRoot>/plugins/platforms/<type>/plugin.yaml`）。
 * 供 `GET /api/config/platform` 的「新增渠道」下拉使用。
 */
export function listPlatformPluginTypes(): string[] {
  const hermesHome = resolveActiveHermesHome();
  const agentRoot = resolveAgentRoot(hermesHome);
  const platformsDir = path.join(agentRoot, 'plugins', 'platforms');

  const types: string[] = [];
  for (const entry of safeReadDir(platformsDir)) {
    if (!entry.isDirectory()) continue;
    if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
    if (!fs.existsSync(path.join(platformsDir, entry.name, MANIFEST))) continue;
    types.push(entry.name);
  }
  return types.sort((a, b) => a.localeCompare(b));
}
