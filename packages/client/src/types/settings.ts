/**
 * types/settings.ts —— V3 设置域类型（设计文档 §3.1 类图逐字落地）。
 *
 * 依赖方向（单向，无环）：
 *   constants/layout.ts  →  types/settings.ts  →  constants/providers.ts
 *
 * 本文件只放「数据形状」，枚举字面量真源仍在 `constants/layout.ts`。
 */
import type { LogKind, LogLevel, SettingsCategory, TimeRange } from '../constants/layout';

// 便于消费方一处导入（避免组件里出现两条 import 路径）
export type { LogKind, LogLevel, SettingsCategory, TimeRange };

// ═══════════════════════ 通用 ═══════════════════════

/**
 * Naive UI NSelect 选项形状。
 *
 * 刻意用 type alias 而非 interface：naive-ui 的 `SelectMixedOption` 带索引签名，
 * 只有「对象字面量类型」才会被 TS 视为隐式带索引签名并允许赋值；
 * interface 不具备该特性，直接传给 `:options` 会报 TS2322。
 */
export type SelectOption = {
  label: string;
  value: string;
  disabled?: boolean;
};

// ═══════════════════════ Agent 角色（R-14 / R-15）═══════════════════════

/**
 * T08：角色来源从 hermes 解析。
 * - `builtin`：config.yaml agent.personalities 直接定义的
 * - `user`：agents/*.md front-matter 扩展的
 * - `manual`：前端手动创建（POST /api/agents 落盘）
 * - `market`：从市场添加（POST /api/agents 落盘）
 */
export type RoleSource = 'builtin' | 'user' | 'manual' | 'market';

/**
 * Agent 角色。
 * T08：数据源从 localStorage 切换为 `GET /api/agents?source=installed`。
 * 7 类可配置项：name / desc / agentMd / skills / mcp / tags / samplePrompts。
 *
 * source=builtin 的角色不可删除，可禁用。
 */
export interface AgentRole {
  id: string;
  name: string;
  /** emoji 或图标字符 */
  avatar: string;
  desc: string;
  /** 专长标签（市场专家来源时取 scenarios） */
  specialties: string[];
  /** Agent.md 正文（多行 Markdown） */
  agentMd: string;
  /** 附加技能 id 列表 */
  skills: string[];
  /** mcp-server 名称列表 */
  mcp: string[];
  /** 手动标签 */
  tags: string[];
  /** 样例 Prompts */
  samplePrompts: string[];
  source: RoleSource;
  /** T08：内置角色可禁用（不可删除） */
  disabled: boolean;
  createdAt: number;
  updatedAt: number;
}

// ═══════════════════════ 模型配置（R-19 ~ R-25）═══════════════════════

/** 4 种 API 调用方式（`API_METHOD_OPTIONS[0]` 为默认）。 */
export type ApiMethod =
  | 'openai-chat'
  | 'openai-response'
  | 'anthropic-chat'
  | 'anthropic-response';

/** 8 项模型能力开关。 */
export type ModelCapability =
  | 'text'
  | 'vision'
  | 'video'
  | 'audio'
  | 'image-gen'
  | 'video-gen'
  | 'audio-gen'
  | 'structured';

/** 5 个默认模型槽位。 */
export type DefaultModelSlot = 'default' | 'simple' | 'vision' | 'image' | 'fallback';

/** 单个模型配置。 */
export interface ModelConfig {
  id: string;
  /** 供应商侧模型名（如 gpt-4o） */
  name: string;
  /** 展示别名，为空时展示 name */
  alias: string;
  capabilities: ModelCapability[];
  /** 上下文长度（tokens），0 表示未知 */
  contextLength: number;
}

/**
 * 已配置的模型供应商。
 * ⚠️ `apiKey` 只存在于运行时内存，persist 前置空（设计 §7.3）；
 *    UI 用 `keyMasked` 展示「已配置」。
 */
export interface ModelProviderConfig {
  id: string;
  /** 对应 PRESET_PROVIDERS.key，自定义时为 'custom' */
  providerKey: string;
  name: string;
  url: string;
  apiMethod: ApiMethod;
  /** 明文 key（仅内存，不落 localStorage） */
  apiKey: string;
  /** 是否已配置过 key（可落盘） */
  keyMasked: boolean;
  models: ModelConfig[];
  /** 最近一次连通性测试是否通过 */
  verified: boolean;
  /** 最近一次测试时间戳，0 表示从未测试 */
  lastTestedAt: number;
}

/** 预置供应商（`constants/providers.ts` 维护，Q4 决策）。 */
export interface PresetProvider {
  key: string;
  name: string;
  url: string;
  apiMethod: ApiMethod;
  /** 预置模型（可在 AddModelDialog 内增删） */
  models: ModelConfig[];
}

/** 默认模型槽位映射：slot → modelId（空串表示未指定）。 */
export type DefaultsMap = Record<DefaultModelSlot, string>;

/** localStorage['km.v3.modelConfig'] 的持久化形状。 */
export interface ModelConfigSnapshot {
  providers: ModelProviderConfig[];
  defaults: DefaultsMap;
}

/** 连通性测试 / 深度测试结果（统一走 ResultDialog）。 */
export interface ConnectivityResult {
  ok: boolean;
  durationMs: number;
  /** test：拉到的模型数量 */
  modelCount?: number;
  /** 深度测试：模型返回的样例文本 */
  sample?: string;
  error?: string;
}

// ═══════════════════════ 日志（R-27 / R-32 / R-33）═══════════════════════

/** 单条日志。 */
export interface LogEntry {
  id: string;
  /** 毫秒时间戳 */
  ts: number;
  kind: LogKind;
  level: LogLevel;
  /** 单行摘要（列表展示） */
  summary: string;
  /** 全文（弹窗展示） */
  content: string;
  /** 来源文件绝对路径，用于「在外部应用打开」 */
  file: string;
  /** 关联会话 id，无关联时为空串 */
  sessionId: string;
}

/** 日志 4 维过滤条件（空串 / 'all' 表示该维不过滤）。 */
export interface LogFilter {
  time: TimeRange;
  sessionId: string;
  kind: LogKind | 'all';
  level: LogLevel | 'all';
  /** 关键字搜索 */
  q: string;
}

/** localStorage['km.v3.logs'] 的持久化形状。 */
export interface LogsSnapshot {
  dir: string;
  filter: LogFilter;
}

// ═══════════════════════ 本地账号（R-28 / Q6）═══════════════════════

/** 本地 profile，`localStorage['km.v3.profile']` 为唯一真源。 */
export interface LocalProfile {
  name: string;
  email: string;
  bio: string;
  updatedAt: number;
}

/** 密码重置结果（Q6：mock 成功）。 */
export interface PasswordResetResult {
  ok: boolean;
  message: string;
}

// ═══════════════════════ 结果反馈弹窗（T5 / §7.1）═══════════════════════

/** ResultDialog 的展示语义，决定图标 / 配色 / 默认标题。 */
export type ResultVariant = 'success' | 'error' | 'warning' | 'info';

/** ResultDialog 的完整状态；页面用单个 ref 持有，避免散落一堆布尔量。 */
export interface ResultDialogState {
  show: boolean;
  variant: ResultVariant;
  title: string;
  message: string;
  detail: string;
  durationMs: number;
}

/** ResultDialog 的初始（关闭）状态。 */
export function emptyResultDialog(): ResultDialogState {
  return { show: false, variant: 'info', title: '', message: '', detail: '', durationMs: 0 };
}

// ═══════════════════════ 布局持久化 ═══════════════════════

/** localStorage['km.v3.layout'] 的持久化形状。 */
export interface LayoutSnapshot {
  leftWidth: number;
  rightWidth: number;
  leftCollapsed: boolean;
  rightCollapsed: boolean;
}

/** localStorage['km.v3.settings'] 的持久化形状。 */
export interface SettingsSnapshot {
  lastCategory: SettingsCategory;
}

/**
 * LayoutShell 下发的 Grid 轨道 CSS 变量。
 * 用 `--${string}` 索引签名而非固定 4 键，使其可直接绑定到 Vue 的 `:style`
 * （Vue 的 `CSSProperties` 仅识别 `--${string}` 形式的自定义属性）。
 */
export interface CssVars {
  [key: `--${string}`]: string;
}
