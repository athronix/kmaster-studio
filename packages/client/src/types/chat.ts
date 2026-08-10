// ⚠️ 本文件与 packages/server/src/protocol.ts 为双端共享契约，任一侧变更必须同步。
import type { SkillAsset } from './asset';

export type Role = 'user' | 'assistant' | 'system' | 'tool' | 'command';

export interface ToolCall {
  id: string;
  tool: string;
  args?: unknown;
  status: 'running' | 'done' | 'error';
  result?: unknown;
  error?: string;
}

export interface Message {
  id: string;
  session_id: string;
  role: Role;
  content: string;
  reasoning?: string;
  toolCalls?: ToolCall[];
  guidance?: boolean;
  created_at: number;
  usage_json?: string | null;
  /** P1 #16：消息状态，未定义视为正常发送成功 */
  status?: 'sending' | 'sent' | 'error';
  /** K01.2 增量：消息所属 Agent ID，无值视为 'default' */
  agentId?: string;
}

// —— F8 模式：与 server/protocol.ts 保持双端结构一致 ——
export type ChatMode = 'craft' | 'plan' | 'ask';
// 网络/存储透传值 = hermes ACP 编辑审批令牌
export type HermesMode = 'default' | 'accept_edits' | 'dont_ask';

// 共享映射（server/client 各维护一份，保持同步）：UI 仅展示 label，网络/存储仅用 token
export const CHAT_MODES: {
  ui: ChatMode;
  token: HermesMode;
  label: string;
  autonomy: 'low' | 'mid' | 'high';
  desc: string;
}[] = [
  { ui: 'craft', token: 'dont_ask', label: 'Craft', autonomy: 'high', desc: '最自主：自动接受文件编辑并直接落地，关键操作也不打断用户' },
  { ui: 'plan', token: 'accept_edits', label: 'Plan', autonomy: 'mid', desc: '中等：自动接受工作区/tmp 编辑，敏感路径仍会询问' },
  { ui: 'ask', token: 'default', label: 'Ask', autonomy: 'low', desc: '最保守：每次文件编辑/关键操作前都向用户请求批准' },
];

// —— F9 模型枚举 ——
export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  context?: number;
  pricing?: any;
  capabilities?: any;
}
export interface ProviderGroup {
  provider: string;
  label: string;
  authenticated?: boolean;
  models: ModelInfo[];
  base_url?: string;
  api_mode?: string;
  api_key_set?: boolean;
  default_model?: string;
}

// —— F11 技能枚举 ——
export interface Skill {
  name: string;
  category: string;
  description?: string;
  enabled: boolean;
}

/**
 * `GET /api/skills` 的**完整**响应契约（T02/ST-01）。
 *
 * ⚠️ 后端 `routes/skills.ts` 恒返回这三段，🚫 **不存在** `{ skills: [...] }` 这种形态，
 * 也**不接受任何 query 过滤参数**（历史上那个候选过滤参数是幽灵参数，服务端从未消费）。
 * 与 `packages/server/src/routes/skills.ts` 的 `SkillsResponse` 逐字对齐。
 */
export interface SkillsResponse {
  /** 已安装技能 */
  installed: Skill[];
  /** 市场候选（可能与 installed 同名，按 D1 口径由前端过滤去重） */
  candidates: SkillAsset[];
  /** 分类枚举（installed + candidates 的 category 并集） */
  categories: string[];
}

/** SkillHub 在线搜索结果项（GET /api/skillhub/skills?q=）。 */
export interface SkillHubResult {
  name: string;
  description: string;
  icon: string;
  tags: string[];
  source: string;
}

// —— T02 插件枚举（GET /api/plugins）——
// ⚠️ 与 packages/server/src/protocol.ts 的同名类型为双端共享契约，任一侧变更必须同步。

/** 插件形态：来自 plugin.yaml `kind` 字段（未知值归一为 other）。 */
export type PluginKind = 'platform' | 'backend' | 'model-provider' | 'standalone' | 'other';

/** 插件来源：bundled = hermes-agent 内置；user = `$HERMES_HOME/plugins` 用户安装。 */
export type PluginSource = 'bundled' | 'user';

/**
 * 生效态（三态）：
 * - `enabled`      —— 无需额外配置，或所需环境变量已齐备，或 config.yaml 显式启用
 * - `needs_config` —— manifest 声明了 `requires_env` 但环境变量缺失
 * - `disabled`     —— config.yaml 显式关闭
 */
export type PluginStatus = 'enabled' | 'needs_config' | 'disabled';

export interface PluginItem {
  /** 稳定标识：`<source>:<相对路径>` */
  id: string;
  name: string;
  kind: PluginKind;
  source: PluginSource;
  effectiveStatus: PluginStatus;
  providesTools: string[];
  description: string;
  /** 展示名，缺省回落 name */
  label?: string;
  version?: string;
  requiresEnv?: string[];
  /** requiresEnv 中尚未配置的部分（needs_config 的依据） */
  missingEnv?: string[];
  /** 分组目录名，如 `platforms` / `image_gen` */
  group?: string;
}

// —— T02 平台渠道配置（GET/PUT /api/config/platform）——

/** 渠道类型：与 hermes-agent `plugins/platforms/<id>` 目录同名。 */
export type PlatformChannelType =
  | 'telegram' | 'discord' | 'slack' | 'whatsapp' | 'matrix'
  | 'wecom' | 'feishu' | 'dingtalk' | 'qqbot' | 'teams'
  | 'email' | 'line' | 'sms' | 'irc' | 'mattermost'
  | 'google_chat' | 'homeassistant' | 'ntfy' | 'photon' | 'simplex' | 'raft'
  | 'other';

/**
 * 单个平台渠道配置。
 *
 * 🔒 `credentials` 只写不回显：GET 下行恒为 undefined，只给 `configuredKeys` / `maskedKeys`；
 * PUT 上行传空串表示**清除**该键，未提及的键保持原值。
 */
export interface PlatformChannelConfig {
  id: string;
  type: PlatformChannelType;
  enabled: boolean;
  /** 🔒 仅 PUT 上行使用 */
  credentials?: Record<string, string>;
  /** GET 下行：已配置的凭据键名 */
  configuredKeys?: string[];
  /** GET 下行：键 → 掩码值 */
  maskedKeys?: Record<string, string>;
  label?: string;
}

/** GET /api/config/platform 返回结构 */
export interface PlatformConfigResponse {
  channels: PlatformChannelConfig[];
  /** 磁盘上可用的渠道类型，用于「新增渠道」下拉 */
  availableTypes: PlatformChannelType[];
}

/** PUT /api/config/platform 返回结构 */
export interface PlatformConfigSaveResult {
  ok: boolean;
  /** config.yaml `_config_version` 写后值 */
  version: number;
  /** 保存后的掩码快照 */
  channels: PlatformChannelConfig[];
}

// —— F12 MCP 连接器 ——
export interface McpServer {
  name: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  status?: 'connected' | 'error' | 'unknown';
  tools?: number;
}

// —— F19 上传引用 ——
export interface UploadRef {
  filename: string;
  path: string;
  size: number;
  created_at: number;
}

// —— 全局设置 ——
// M5/FR21.9：新增字段全部可选，向后兼容（旧客户端不传即保持原语义）。
export interface Settings {
  default_mode: HermesMode;
  default_model: string;
  /** M5 新增：主题，与 styles/theme.ts 同源 */
  theme?: 'dark' | 'light';
  /** M5 新增：界面语言；V4 扩展 en */
  locale?: 'zh-CN' | 'en';
  /** M5 新增：FR20.6 终端默认工作目录 */
  terminal_cwd?: string;
  /** M5 新增：激活 profile 的只读镜像；写入一律走 PUT /api/profiles/active */
  active_profile?: string;
}

export interface Session {
  id: string;
  title: string;
  profile?: string | null;
  created_at: number;
  updated_at: number;
  /**
   * 归档标记。
   * ⚠️ 因历史原因出参保持 `number`（0/1）**不改为 boolean**（§7.1 / F27）。
   * 判据一律写 `!s.archived`，不要写 `s.archived === false`。
   */
  archived: number;
  // M3：每会话覆盖（继承自全局默认）
  mode?: string | null;
  model?: string | null;
  // V3/#19：每会话工作目录（终端 cwd 默认值；web 模式作为文件上下文锚点）
  workspace?: string | null;
  /**
   * B-02：置顶标记。新增字段，出参为 `boolean`（与 `archived` 的历史 number 形态刻意不同）。
   * 真源为服务端（kmaster.db 侧车 ?? hermes state.db），**不要**再读本地
   * `chatStore.pinnedSessions` Set —— 那份是刷新即丢的旧实现（F6 / B10-②）。
   */
  pinned?: boolean;
  /** B-01：会话绑定技能名列表。服务端 JSON 数组列，解析失败回落 `[]`（§7.1）。 */
  skills?: string[];
  /** B-01：会话绑定 MCP 服务列表（落库 `mcp_servers`，出参 camelCase，§7.1）。 */
  mcpServers?: string[];
  /** P0-8：Agent ID，新建默认 "default"。 */
  agent?: string | null;
}

/**
 * `PATCH /api/sessions/:id` 的补丁体（B6）。
 * 全部字段可选；空 body 服务端返回 `400 no_valid_field`（§7.2）。
 */
export interface SessionPatch {
  title?: string;
  mode?: string | null;
  model?: string | null;
  workspace?: string | null;
  /**
   * T04/CH-D：会话绑定的 Agent 角色。
   *
   * 只写 kmaster.db 侧车 `agent` 列；`null` / 空串表示解除绑定，
   * 出参 `Session.agent` 随即回落 hermes 的 `profile_name`。
   */
  agent?: string | null;
  /** 置顶：`boolean` 显式覆盖；`null` 清除覆盖回落 hermes（服务端三态） */
  pinned?: boolean | null;
  /** 归档：入参兼容 `boolean` 与 `number`（0/1）；`null` 清除覆盖 */
  archived?: boolean | number | null;
  skills?: string[];
  mcpServers?: string[];
}

export interface Usage {
  input_tokens: number;
  output_tokens: number;
  cost?: number;
}

export type RunState = 'idle' | 'running' | 'aborting';
export type ApprovalChoice = 'once' | 'session' | 'always' | 'deny';

// M2：计划卡 / Artifact
export type PlanChoice = 'approve' | 'reject' | 'revise';
export interface PlanRequest {
  plan_id: string;
  title: string;
  steps: string[];
  session_id: string;
}
export interface Artifact {
  id: string;
  name: string;
  kind: 'markdown' | 'code' | 'text' | 'image' | 'html' | 'svg' | 'diff';
  language?: string;
  content?: string;
  dataUrl?: string;
}

// ═══════════════════════ M4 新增类型 ═══════════════════════
// ⚠️ 与 packages/server/src/protocol.ts 为双端共享契约，任一侧变更必须同步。

// —— F16 子代理（字段名逐字对齐 hermes delegate_tool.py）——
export interface SubagentIdentity {
  subagent_id: string;
  parent_id?: string;
  task_index?: number;
  task_count?: number;
  goal?: string;
  depth?: number;
  model?: string;
  toolsets?: string[];
  child_session_id?: string;
  tool_count?: number;
}
export type SubagentStatus = 'running' | 'ok' | 'failed' | 'error' | 'timeout';
/** 下行事件统一锚点：会话 + 宿主消息。 */
export type SubagentDownlink = { session_id: string; message_id: string } & SubagentIdentity;

/** 前端聚合后的子代理卡片状态（stores/chat.ts 的 reducer 产物）。 */
export interface SubagentState extends SubagentIdentity {
  session_id: string;
  message_id: string;
  status: SubagentStatus;
  /** 目标一句话（来自 goal 或 start.preview） */
  title: string;
  /** 流式正文累积 */
  text: string;
  /** 思考片段累积 */
  thinking: string;
  /** 最近一次进度摘要 */
  progress?: string;
  /** 已调用工具列表（按事件顺序追加） */
  tools: { tool: string; preview?: string; args?: unknown }[];
  /** complete.preview：最终摘要 */
  summary?: string;
  duration_seconds?: number;
  started_at: number;
  updated_at: number;
}

// —— F18 压缩提示 ——
export interface CompressionNotice {
  session_id: string;
  phase: 'started' | 'completed';
  reason?: string;
  old_session_id?: string;
  in_place?: boolean;
  compression_count?: number;
  tokens_before?: number;
  tokens_after?: number;
  ts: number;
}

// —— F13 记忆条目 ——
export type MemoryGroup = 'memory' | 'user';
export interface MemoryEntry {
  id: string;
  group: MemoryGroup;
  content: string;
  index: number;
  updated_at: number;
}

// —— F15 自动化任务 ——
export interface CronJob {
  id: string;
  name: string;
  prompt: string;
  schedule_expr: string;
  schedule_display: string;
  enabled: boolean;
  state: string;
  next_run_at?: string | null;
  last_run_at?: string | null;
  last_status?: 'ok' | 'error' | null;
  last_error?: string | null;
  deliver?: string | null;
  script?: string | null;
  no_agent?: boolean;
  workdir?: string | null;
  created_at?: string | null;
  repeat_completed?: number;
  repeat_times?: number | null;
}
/**
 * 定时任务单次运行记录。
 *
 * 前 7 个为基础字段（F14，必有）；后 5 个为 A8 渐进增强字段（§7.1）：
 * **后端解析不到时一律省略 key**，不会填 `''`/`0`/`null`。
 * 前端渲染用 `?? '—'`，且要区分「显示 —」与「整行隐藏」两种缺失语义（§7.6c）。
 */
export interface CronRun {
  job_id: string;
  job_name: string;
  run_time: string;
  status: string;
  mode: string;
  excerpt: string;
  file: string;
  /** A8 增强：运行命令原文（**优先 join CronJob 取真值**，本字段仅兜底） */
  command?: string;
  /** A8 增强：进程退出码。无值时**整行隐藏**，不显示 — */
  exit_code?: number;
  /** A8 增强：耗时毫秒。**唯一允许长期显示 — 的字段**（§3.7 第 2b 项） */
  duration_ms?: number;
  /** A8 增强：独立日志文件路径（当前架构下通常拿不到，见 F22） */
  log_file?: string;
  /** A8 增强：触发方式原文（**优先 join CronJob 推导**，本字段仅兜底） */
  trigger?: string;
}

/**
 * 计数徽标的「已装 / 总数」数对（§3.6 / §7.9）。
 * `total === 0` 时不渲染徽标，避免 `0 / 0` 噪声。
 */
export interface CountPair {
  installed: number;
  total: number;
}

/** 左栏三类计数徽标聚合（B7 `useSidebarCounts` 产物）。 */
export interface SidebarCounts {
  experts: CountPair;
  skills: CountPair;
  mcp: CountPair;
}

/**
 * V3/R-31：定时任务产物在右栏的引用。
 *
 * `run` 为列表行原始数据（保证标题 / 时间 / 状态一定有值）；
 * `content` 为经 desktop-bridge 读到的产物全文，Web 端读不到时为空串，
 * 此时 UI 回落展示 `run.excerpt`。
 */
export interface JobArtifactRef {
  run: CronRun;
  /** 产物全文；未读到为空串 */
  content: string;
  /** 是否正在读取文件 */
  loading: boolean;
  /** 读取失败原因；成功为空串 */
  error: string;
}

/**
 * V3：右栏内容态（9 态）。
 * ⚠️ 真源在 `constants/layout.ts`，此处仅转出，方便 chat 域消费方一处 import。
 */
export type { RightPanelMode } from '../constants/layout';

// —— F17 队列项 ——
export interface QueueItem {
  id: string;
  session_id: string;
  message: string;
  mode?: string | null;
  model?: string | null;
  position: number;
  created_at: number;
}

// —— F22 用量聚合 ——
export interface UsageStatRow {
  key: string;
  input_tokens: number;
  output_tokens: number;
  cost: number;
  runs: number;
}
export type UsageStat = UsageStatRow;
export interface UsageTotals {
  input_tokens: number;
  output_tokens: number;
  cost: number;
  sessions: number;
}
export type UsageGroupBy = 'day' | 'model' | 'session';

// —— F18 上下文占用估算 ——
export interface ContextCategory {
  id: string;
  label: string;
  tokens: number;
  color?: string;
}
export interface ContextEstimate {
  context_used: number;
  context_max: number;
  context_percent: number;
  estimated_total?: number;
  model?: string;
  categories?: ContextCategory[];
  estimated: true;
}

/**
 * T02/L3：`usage.updated` 与 `run.completed` 事件随行的上下文占用快照。
 *
 * ⚠️ 不是新事件类型，`WS_EVENTS` 注册表保持不变；该字段在两个事件上都是**可选**的：
 * - `run.completed` 恒携带（服务端强制重算），除非估算本身失败
 * - `usage.updated` 仅在服务端估算缓存命中时携带
 *
 * 因此消费方（如 ContextUsageBar）**必须处理缺失**：缺失即整条隐藏，
 * 🚫 不得回落 0 / NaN 造成进度条闪烁。
 *
 * 字段映射自 `ContextEstimate`：
 * - `total_tokens`   ← `context_used`
 * - `context_length` ← `context_max`
 */
export interface ContextTokensPayload {
  total_tokens: number;
  context_length: number;
}

// ═══════════════════════ WS 下行事件注册表 ═══════════════════════
// 单一事实源：stores/chat.ts 逐项 socket.on(e) → dispatch(e, payload)（NFR2 按 session_id 分发）。
// ⚠️ 必须与 packages/server/src/protocol.ts 的 ServerToClientEvents 键集合保持一致。

/** M1-M3 既有下行事件。 */
export const WS_EVENTS_BASE = [
  'run.started', 'run.completed', 'run.failed',
  'message.delta', 'reasoning.delta',
  'tool.started', 'tool.completed', 'tool.failed',
  'approval.requested', 'approval.resolved',
  'clarify.requested', 'clarify.resolved',
  'plan.requested', 'plan.resolved',
  'artifact.created', 'artifact.updated',
  'usage.updated', 'abort.started', 'abort.timeout', 'abort.completed',
  'session.title.updated',
] as const;

/** M4 新增下行事件（F16 子代理 ×6 / F18 压缩 ×2 / F17 队列 ×2 / 委派占位 ×1）。 */
export const WS_EVENTS_M4 = [
  'subagent.start', 'subagent.tool', 'subagent.text',
  'subagent.thinking', 'subagent.progress', 'subagent.complete',
  'delegation.updated',
  'compression.started', 'compression.completed',
  'run.queued', 'queue.updated',
] as const;

/** 全量注册表（chat store 遍历注册）。 */
export const WS_EVENTS = [...WS_EVENTS_BASE, ...WS_EVENTS_M4] as const;
export type WsEvent = (typeof WS_EVENTS)[number];

// ═══════════════════════ M5 新增类型（F20 终端 / F21 设置）═══════════════════════
// ⚠️ 本段与 packages/server/src/protocol.ts 的 M5 段为双端共享契约，任一侧变更必须同步。
// 注意：`/terminal` 命名空间的 socket 只允许出现在 api/terminal.ts（分层纪律，方案 §7）。

// —— F20 终端：socket.io `/terminal` 命名空间协议（方案 §3.2）——

/** `/terminal` 命名空间路径。双端唯一来源，禁止在业务代码里硬编码字符串。 */
export const TERMINAL_NAMESPACE = '/terminal';

/** 服务端 pty 并发硬上限；可经环境变量 `KMASTER_MAX_TERMS` 覆盖（Q7）。 */
export const DEFAULT_MAX_TERMS = 8;

/** pty 输出微批合并窗口（毫秒），降低高频小包开销。 */
export const TERMINAL_BATCH_MS = 8;

/** 客户端 resize 节流窗口（毫秒）。 */
export const TERMINAL_RESIZE_THROTTLE_MS = 100;

/** 上行 `term.open`：cwd 缺省顺序 = req.cwd → Settings.terminal_cwd → server 启动 cwd。 */
export interface TerminalOpenRequest {
  cols: number;
  rows: number;
  cwd?: string;
  shell?: string;
}

/** 上行 `term.input`：键盘输入原样透传。 */
export interface TerminalInputMessage {
  term_id: string;
  data: string;
}

/** 上行 `term.resize`：由 addon-fit + ResizeObserver 驱动，客户端 100ms 节流。 */
export interface TerminalResizeMessage {
  term_id: string;
  cols: number;
  rows: number;
}

/** 上行 `term.close`：主动关闭，服务端 kill 后回 `term.exit`。 */
export interface TerminalCloseMessage {
  term_id: string;
}

/** 终端错误码（前端据此渲染降级提示而非白屏，AC4）。 */
export type TerminalErrorCode =
  | 'pty_unavailable'
  | 'spawn_failed'
  | 'bad_cwd'
  | 'limit_exceeded'
  | 'not_found';

/** pty 元信息：既是服务端 `TerminalManager.open()` 返回值，也是 `term.opened` 载荷。 */
export interface PtyInfo {
  term_id: string;
  shell: string;
  cwd: string;
  pid: number;
  cols: number;
  rows: number;
}

/** 下行 `term.opened`。 */
export type TerminalOpenedPayload = PtyInfo;

/** 下行 `term.data`：pty 输出（服务端 8ms 微批合并）。 */
export interface TerminalDataPayload {
  term_id: string;
  data: string;
}

/** 下行 `term.exit`：pty 退出（含主动 close）。 */
export interface TerminalExitPayload {
  term_id: string;
  exit_code: number;
  signal?: number;
}

/** 下行 `term.error`：`term_id` 可缺省（连接期错误尚无会话）。 */
export interface TerminalErrorPayload {
  term_id?: string;
  code: TerminalErrorCode;
  message: string;
}

/** 下行事件的判别联合（方案 §3.4 原型），便于 store 侧统一 switch 分发。 */
export type TerminalEvent =
  | ({ type: 'opened' } & TerminalOpenedPayload)
  | ({ type: 'data' } & TerminalDataPayload)
  | ({ type: 'exit' } & TerminalExitPayload)
  | ({ type: 'error' } & TerminalErrorPayload);

/** 上行事件表（client → server），用于 socket.io-client 泛型标注。 */
export interface TerminalClientToServerEvents {
  'term.open': (req: TerminalOpenRequest) => void;
  'term.input': (msg: TerminalInputMessage) => void;
  'term.resize': (msg: TerminalResizeMessage) => void;
  'term.close': (msg: TerminalCloseMessage) => void;
}

/** 下行事件表（server → client），用于 socket.io-client 泛型标注。 */
export interface TerminalServerToClientEvents {
  'term.opened': (p: TerminalOpenedPayload) => void;
  'term.data': (p: TerminalDataPayload) => void;
  'term.exit': (p: TerminalExitPayload) => void;
  'term.error': (p: TerminalErrorPayload) => void;
}

/** `/terminal` 下行事件名注册表（api/terminal.ts 遍历注册，与 server 键集合一致）。 */
export const TERMINAL_WS_EVENTS = ['term.opened', 'term.data', 'term.exit', 'term.error'] as const;
export type TerminalWsEvent = (typeof TERMINAL_WS_EVENTS)[number];

// —— F21 设置页：Provider / Profile / 诊断（方案 §3.1、§3.3）——

/** Provider 配置态。🔒 DTO 层面就不存在明文 Key 字段。 */
export interface ProviderInfo {
  slug: string;
  name: string;
  /** 写入 Key 时使用的环境变量名，如 ANTHROPIC_API_KEY */
  key_env: string;
  /** key_env 在 .env 中存在且非空 */
  configured: boolean;
  /** 脱敏值：length <= 8 ? '****' : '****' + slice(-4) */
  masked: string;
  is_current?: boolean;
  authenticated?: boolean;
  auth_type?: string;
  total_models?: number;
  warning?: string;
}

/** `GET /api/config/providers` 响应。 */
export interface ProviderListResult {
  providers: ProviderInfo[];
  current: string;
}

/** `PUT /api/config/providers` 响应（🔒 永不回显明文）。 */
export interface SetProviderKeyResult {
  ok: true;
  provider: string;
  configured: boolean;
  masked: string;
}

/**
 * hermes profile 条目。
 * 运行时字段（model/provider/skill_count…）在「扫目录」实现下可能缺失（Q8），UI 显示「—」。
 */
export interface ProfileInfo {
  name: string;
  path: string;
  is_default: boolean;
  is_active: boolean;
  model?: string;
  provider?: string;
  has_env?: boolean;
  skill_count?: number;
  description?: string;
  distribution_name?: string;
  distribution_version?: string;
}

/** `GET /api/profiles` 响应（profiles/ 与 active_profile 懒创建，缺失时仅 default 且激活）。 */
export interface ProfileListResult {
  profiles: ProfileInfo[];
  active: string;
  root: string;
}

/** `PUT /api/profiles/active` 响应；`restart_required` 为语义必需（§0.2.1）。 */
export interface UseProfileResult {
  ok: true;
  active: string;
  hermes_home: string;
  restart_required: boolean;
}

/** `GET /api/health` 扩展返回体。除 ok/service/ts 外全部可选，消费侧需做 `?? false` 容错。 */
export interface HealthInfo {
  ok: boolean;
  service: string;
  ts: number;
  version?: string;
  port?: number;
  bridge_mock?: boolean;
  hermes_home?: string;
  python_ok?: boolean;
  hermes_cli_ok?: boolean;
  /** F20：node-pty 是否可用 */
  terminal_available?: boolean;
  /** F20：node-pty 加载失败原因（可用时为空） */
  node_pty_error?: string;
  /** M5/Q4：当前持久层实现，memory 表示 better-sqlite3 已降级（重启丢数据） */
  db_kind?: 'sqlite' | 'memory';
  /** M5/Q4：better-sqlite3 加载失败原因 */
  db_error?: string;
}
