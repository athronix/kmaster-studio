/**
 * constants/layout.ts —— V3 跨文件契约「单一真源」。
 *
 * 设计文档 §7.2 铁律：所有枚举、localStorage key、布局边界一律在本文件定义，
 * **禁止在组件里写字面量**。本文件不 import 任何业务模块，杜绝循环依赖。
 *
 * 目录：
 *   1. 左栏导航态 NavMode
 *   2. 右栏内容态 RightPanelMode（9 态）+ 标题表
 *   3. 设置类别 SettingsCategory（12 项，顺序即展示顺序）
 *   4. 日志种类 / 级别 / 时间区间
 *   5. 布局边界 LAYOUT_LIMITS
 *   6. localStorage key 规范 LS_KEYS + lsGet/lsSet 包装
 *   7. 通用工具 clamp / debounce
 */

// ═══════════════════════ 1. 左栏导航态 ═══════════════════════

/** 左栏两种导航态：首页导航 / 设置导航。派生自 `route.path`，不做独立可写状态。 */
export type NavMode = 'home' | 'settings';

/** NavMode 全量枚举（遍历/校验用）。 */
export const NAV_MODES: readonly NavMode[] = ['home', 'settings'] as const;

/** 设置路由前缀。`navMode` 与 `settingsCategory` 均由此前缀解析。 */
export const SETTINGS_ROUTE_PREFIX = '/settings';

// ═══════════════════════ 2. 右栏内容态（9 态）═══════════════════════

/**
 * 右栏内容态。V2 的 `detail` 在 V3 被平铺细分为 expert/team/skill/mcp，
 * 另新增 job-artifact / agent-role / expert-picker 三态。
 * 扁平枚举可直接查 `RIGHT_PANEL_TITLE` 出标题，无需二次类型推断。
 */
export type RightPanelMode =
  | 'hidden'
  | 'output'
  | 'expert'
  | 'team'
  | 'skill'
  | 'mcp'
  | 'job-artifact'
  | 'agent-role'
  | 'expert-picker';

/** RightPanelMode 全量枚举（遍历/校验用）。 */
export const RIGHT_PANEL_MODES: readonly RightPanelMode[] = [
  'hidden',
  'output',
  'expert',
  'team',
  'skill',
  'mcp',
  'job-artifact',
  'agent-role',
  'expert-picker',
] as const;

/** 右栏 title 栏显示的内容态名称（R-10②）。`hidden` 为空串（不渲染）。 */
export const RIGHT_PANEL_TITLE: Record<RightPanelMode, string> = {
  hidden: '',
  output: '任务产物',
  expert: '专家详情',
  team: '专家团详情',
  skill: '技能详情',
  mcp: 'MCP 详情',
  'job-artifact': '任务产物',
  'agent-role': 'Agent 角色配置',
  'expert-picker': '从市场添加角色',
};

/** 右栏内容态类型守卫。 */
export function isRightPanelMode(v: unknown): v is RightPanelMode {
  return typeof v === 'string' && (RIGHT_PANEL_MODES as readonly string[]).includes(v);
}

/**
 * 由 V2 单一 `detail` 态平铺而来的 4 个市场实体详情态。
 * 用于「是否在渲染市场实体详情」这类归组判断，避免组件里写 4 连 `||`。
 */
export const DETAIL_PANEL_MODES: readonly RightPanelMode[] = [
  'expert',
  'team',
  'skill',
  'mcp',
] as const;

/** 是否为市场实体详情态（expert / team / skill / mcp）。 */
export function isDetailPanelMode(v: unknown): v is RightPanelMode {
  return typeof v === 'string' && (DETAIL_PANEL_MODES as readonly string[]).includes(v);
}

// ═══════════════════════ 3. 设置类别（12 项）═══════════════════════

/** 12 个设置类别 key，顺序即左栏展示顺序，`monitor` 为默认。 */
export type SettingsCategory =
  | 'monitor'
  | 'general'
  | 'account'
  | 'agent-role'
  | 'skills'
  | 'mcp'
  | 'tools'
  | 'plugins'
  | 'channel'
  | 'memory'
  | 'model'
  | 'jobs';

/** 设置类别定义（key / 标题 / 图标）。渲染组件映射见 `views/SettingsView.vue`。 */
export interface SettingsCategoryDef {
  key: SettingsCategory;
  label: string;
  icon: string;
}

/** 设置类别单一真源（左栏 SettingsNav 与 SettingsView 共用，顺序即展示顺序）。 */
export const SETTINGS_CATEGORIES: readonly SettingsCategoryDef[] = [
  { key: 'monitor', label: '监控', icon: 'ChartBar' },
  { key: 'general', label: '系统设置', icon: 'Settings' },
  { key: 'account', label: '账号设置', icon: 'User' },
  { key: 'agent-role', label: 'Agent 角色管理', icon: 'Robot' },
  { key: 'skills', label: 'Skill 管理', icon: 'Puzzle' },
  { key: 'mcp', label: 'MCP 管理', icon: 'PlugConnected' },
  { key: 'tools', label: 'Tools 管理', icon: 'Tool' },
  { key: 'plugins', label: 'Plugins 管理', icon: 'Package' },
  { key: 'channel', label: 'Channel 管理', icon: 'Broadcast' },
  { key: 'memory', label: '记忆管理', icon: 'Brain' },
  { key: 'model', label: '模型管理', icon: 'Flask' },
  { key: 'jobs', label: '定时任务管理', icon: 'Clock' },
] as const;

/** 首次进入设置的默认类别（R-06）。 */
export const DEFAULT_SETTINGS_CATEGORY: SettingsCategory = 'monitor';

/** 设置类别类型守卫（URL 直达时校验 `:category` 参数）。 */
export function isSettingsCategory(v: unknown): v is SettingsCategory {
  return typeof v === 'string' && SETTINGS_CATEGORIES.some((c) => c.key === v);
}

/** 查表取类别定义；未知 key 回落默认类别。 */
export function settingsCategoryDef(key: string): SettingsCategoryDef {
  return (
    SETTINGS_CATEGORIES.find((c) => c.key === key) ??
    SETTINGS_CATEGORIES.find((c) => c.key === DEFAULT_SETTINGS_CATEGORY)!
  );
}

/**
 * 从路由 path 解析设置类别。
 * `/settings` → 默认类别；`/settings/model` → `model`；未知类别 → 默认类别。
 */
export function parseSettingsCategory(path: string): SettingsCategory {
  if (!path.startsWith(SETTINGS_ROUTE_PREFIX)) return DEFAULT_SETTINGS_CATEGORY;
  const rest = path.slice(SETTINGS_ROUTE_PREFIX.length).replace(/^\/+/, '');
  const seg = rest.split('/')[0] ?? '';
  return isSettingsCategory(seg) ? seg : DEFAULT_SETTINGS_CATEGORY;
}

// ═══════════════════════ 4. 日志枚举 ═══════════════════════

/** 4 类日志来源（对应 4 个日志目录）。 */
export type LogKind = 'hermes-agent' | 'bridge' | 'kmaster-server' | 'cron';

/** 日志种类选项（LogSection 过滤下拉）。 */
export const LOG_KIND_OPTIONS: readonly { label: string; value: LogKind }[] = [
  { label: 'Hermes Agent', value: 'hermes-agent' },
  { label: 'Bridge', value: 'bridge' },
  { label: 'kmaster Server', value: 'kmaster-server' },
  { label: '定时任务', value: 'cron' },
] as const;

/** 日志级别（3 档）。 */
export type LogLevel = 'info' | 'warning' | 'error';

/** 日志级别选项（LogSection 过滤下拉）。 */
export const LOG_LEVEL_OPTIONS: readonly { label: string; value: LogLevel }[] = [
  { label: '信息', value: 'info' },
  { label: '警告', value: 'warning' },
  { label: '错误', value: 'error' },
] as const;

/** 预设时间区间（不引日期选择器，见设计 §6.1）。 */
export type TimeRange = '1h' | '24h' | '7d' | '30d' | 'all';

/** 时间区间选项（首项为最窄区间，`all` 表示不限）。 */
export const TIME_RANGE_OPTIONS: readonly { label: string; value: TimeRange }[] = [
  { label: '近 1 小时', value: '1h' },
  { label: '近 24 小时', value: '24h' },
  { label: '近 7 天', value: '7d' },
  { label: '近 30 天', value: '30d' },
  { label: '全部', value: 'all' },
] as const;

/** 时间区间 → 毫秒跨度；`all` 为 `Infinity`。 */
export const TIME_RANGE_MS: Record<TimeRange, number> = {
  '1h': 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
  all: Number.POSITIVE_INFINITY,
};

/** 日志默认根目录（A2 决策；桌面端可在 LogSection 修改）。 */
export const DEFAULT_LOG_DIR = '~/.kmaster/logs';

// ═══════════════════════ 5. 布局边界 ═══════════════════════

/** 三栏布局硬边界（R-01②③ + 响应式底线）。 */
export const LAYOUT_LIMITS = {
  left: { min: 180, max: 500, default: 260 },
  right: { min: 320, max: 800, default: 420 },
  /** 拖拽句柄轨道宽（视觉 4px，命中区经 ::before 扩到 10px） */
  handle: 4,
  /** PageHeader 锁定高度 */
  headerHeight: 48,
  /** 主体轨道低于此宽度时自动收起右栏 */
  mainMinWidth: 480,
} as const;

/** 交互约定：搜索防抖 / 网络超时 / 轮询间隔 / 文件读取上限 / 分页（设计 §7.5）。 */
export const INTERACTION = {
  /** 搜索输入防抖（PageHeader / CardMarketLayout / LogSection 一致） */
  searchDebounceMs: 300,
  /** 拉取 models 超时 */
  fetchModelsTimeoutMs: 10_000,
  /** 连通性 test 超时 */
  testTimeoutMs: 10_000,
  /** 深度测试超时 */
  deepTestTimeoutMs: 30_000,
  /** /api/health 单次超时 */
  healthTimeoutMs: 5_000,
  /** /api/health 轮询间隔 */
  healthPollMs: 10_000,
  /** 单文件读取上限 1MB，超出截断 */
  maxFileBytes: 1_048_576,
  /** 已安装模块分页：2 行 × 5 列 */
  installedPageSize: 10,
} as const;

// ═══════════════════════ 6. localStorage 规范 ═══════════════════════

/**
 * V3 新增 localStorage key 一律 `km.v3.<domain>`，值为 JSON 字符串。
 * ⚠️ 存量 key（`km-domain-freq` / `km-locale`）不改名、不迁移。
 */
export const LS_KEYS = {
  layout: 'km.v3.layout',
  agentRoles: 'km.v3.agentRoles',
  modelConfig: 'km.v3.modelConfig',
  profile: 'km.v3.profile',
  logs: 'km.v3.logs',
  settings: 'km.v3.settings',
  session: 'km.v3.session',
  // ── B4：左栏增强新增 2 键（既有 7 键不改动、不迁移）──
  /** 左栏折叠态：单键存 `Record<string, boolean>`，true = 收起（D4） */
  sidebarCollapse: 'km.sidebar.collapse',
  /** Recent 分组口径的用户覆盖值：`{ maxCount, withinHours }`（P2，暂只读） */
  sidebarRecent: 'km.sidebar.recent',
  /** 归档会话可见性开关：boolean，默认 false（SL-04）。 */
  showArchived: 'km.sidebar.showArchived',
} as const;

export type LsKey = (typeof LS_KEYS)[keyof typeof LS_KEYS];

/** 取 localStorage 实例；Node（单测）/隐私模式下返回 undefined。 */
function storage(): Storage | undefined {
  try {
    if (typeof globalThis === 'undefined') return undefined;
    const ls = (globalThis as { localStorage?: Storage }).localStorage;
    return ls ?? undefined;
  } catch {
    // Safari 隐私模式访问 localStorage 会直接抛 SecurityError
    return undefined;
  }
}

/**
 * 安全读取 JSON 值。
 * 读不到 / 解析失败 / 无 localStorage 时一律返回 `fallback`（静默，不抛错）。
 */
export function lsGet<T>(key: string, fallback: T): T {
  const ls = storage();
  if (!ls) return fallback;
  try {
    const raw = ls.getItem(key);
    if (raw === null || raw === '') return fallback;
    const parsed = JSON.parse(raw) as T;
    return parsed === null || parsed === undefined ? fallback : parsed;
  } catch {
    return fallback;
  }
}

/**
 * 安全写入 JSON 值。
 * 写入失败（超限 / 隐私模式 / 无 localStorage）时静默返回 `false`，绝不抛错。
 */
export function lsSet(key: string, value: unknown): boolean {
  const ls = storage();
  if (!ls) return false;
  try {
    ls.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** 安全删除 key；失败静默返回 false。 */
export function lsRemove(key: string): boolean {
  const ls = storage();
  if (!ls) return false;
  try {
    ls.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

// ═══════════════════════ 7. 通用工具 ═══════════════════════

/** 数值夹取到 [min, max]；非有限数回落 min。 */
export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/** 生成短随机 id（无外部依赖，够用于本地实体主键）。 */
export function shortId(prefix = 'id'): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}-${rand}`;
}
