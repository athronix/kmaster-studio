// 共享协议层：Socket.IO /chat-run 事件契约（M1 子集，继承 hermes-studio 语义）
// M4：扩展 subagent.* / compression.* / queue.* 事件与 F13/F15/F17/F18/F22 数据类型。
// ⚠️ 本文件与 packages/client/src/types/chat.ts 为双端共享契约，任一侧变更必须同步。
// 上行（前端 → server）
export interface ClientToServerEvents {
  run: (req: StartRunRequest, cb?: (resp: RunStarted) => void) => void;
  abort: (req: { session_id: string }) => void;
  steer: (req: { session_id: string; text: string }) => void;
  resume: (req: { session_id: string; profile?: string }) => void;
  'approval.respond': (req: { session_id: string; approval_id: string; choice: ApprovalChoice }) => void;
  'clarify.respond': (req: { session_id: string; clarify_id: string; response: string }) => void;
  'plan.respond': (req: { session_id: string; plan_id: string; choice: PlanChoice }) => void;
}

// 下行（server → 前端）
export interface ServerToClientEvents {
  'run.started': (p: { run_id: string; session_id: string }) => void;
  // M4/F17：实装队列语义，载荷携带排队项与剩余待发数
  'run.queued': (p: { session_id: string; item: QueueItem; pending: number }) => void;
  // T01/L3：`context_tokens` 为**可选**扩展字段（不新增 WS 事件类型），
  // 供前端在一次往返内同步上下文占用条，缺省时前端回落 REST `/api/context/estimate`。
  'run.completed': (p: {
    session_id: string;
    message_id: string;
    message: string;
    usage: Usage;
    context_tokens?: ContextTokensPayload;
  }) => void;
  'run.failed': (p: { session_id: string; error: string }) => void;
  'message.delta': (p: { session_id: string; message_id: string; delta: string; guidance?: boolean }) => void;
  'reasoning.delta': (p: { session_id: string; message_id: string; delta: string }) => void;
  'tool.started': (p: { session_id: string; message_id: string; tool: string; args?: unknown }) => void;
  'tool.completed': (p: { session_id: string; message_id: string; tool: string; result?: unknown }) => void;
  'tool.failed': (p: { session_id: string; message_id: string; tool: string; error?: string }) => void;
  'approval.requested': (p: { session_id: string; approval_id: string; tool: string; args?: unknown; risk?: string }) => void;
  'approval.resolved': (p: { session_id: string; approval_id: string }) => void;
  'clarify.requested': (p: { session_id: string; clarify_id: string; question: string; options?: string[] }) => void;
  'clarify.resolved': (p: { session_id: string; clarify_id: string }) => void;
  'plan.requested': (p: { session_id: string; plan_id: string; title: string; steps: string[] }) => void;
  'plan.resolved': (p: { session_id: string; plan_id: string }) => void;
  'artifact.created': (p: { session_id: string; artifact: Artifact }) => void;
  'artifact.updated': (p: { session_id: string; artifact: Artifact }) => void;
  'usage.updated': (p: {
    session_id: string;
    input_tokens: number;
    output_tokens: number;
    cost?: number;
    context_tokens?: ContextTokensPayload;
  }) => void;
  'session.title.updated': (p: { session_id: string; title: string }) => void;
  'abort.started': (p: { session_id: string }) => void;
  'abort.timeout': (p: { session_id: string }) => void;
  'abort.completed': (p: { session_id: string }) => void;

  // —— M4/F16 子代理（字段逐字对齐 delegate_tool.py，下行统一多带 session_id + message_id 锚点）——
  'subagent.start': (p: SubagentDownlink & { preview: string }) => void;
  'subagent.tool': (p: SubagentDownlink & { tool: string; preview?: string; args?: unknown }) => void;
  'subagent.text': (p: SubagentDownlink & { preview: string }) => void;
  'subagent.thinking': (p: SubagentDownlink & { preview: string }) => void;
  'subagent.progress': (p: SubagentDownlink & { preview: string }) => void;
  'subagent.complete': (p: SubagentDownlink & {
    preview?: string;
    status?: SubagentStatus;
    duration_seconds?: number;
  }) => void;
  // P1 占位（tools/async_delegation.py 后台委派清单）
  'delegation.updated': (p: { session_id: string; delegations: unknown[] }) => void;

  // —— M4/F18 上下文压缩（对齐 conversation_compression.py）——
  'compression.started': (p: { session_id: string; reason?: string }) => void;
  'compression.completed': (p: {
    session_id: string;
    old_session_id?: string;
    in_place?: boolean;
    compression_count?: number;
    tokens_before?: number;
    tokens_after?: number;
  }) => void;

  // —— M4/F17 队列同步（出队/删除后托盘刷新）——
  'queue.updated': (p: { session_id: string; items: QueueItem[] }) => void;
}

// —— F8 模式：UI 三态标签（WorkBuddy Craft/Plan/Ask）映射到 hermes ACP 编辑审批令牌 ——
// 语义唯一来源，UI 仅展示 label，网络/存储仅使用 token（hermes 令牌）。
export type ChatMode = 'craft' | 'plan' | 'ask';
// hermes ACP edit-approval mode 令牌（acp_adapter/server.py:624）
export type HermesMode = 'default' | 'accept_edits' | 'dont_ask';

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

// F8 模式映射常量：ChatMode(ui) → HermesMode(token)（不可逆，按自主度对齐）
export const MODE_TO_HERMES_APPROVAL: Record<ChatMode, HermesMode> = {
  craft: 'dont_ask',
  plan: 'accept_edits',
  ask: 'default',
};

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
  /** base_url from config.yaml */
  base_url?: string;
  /** api_mode from config.yaml (openai, anthropic_messages, etc.) */
  api_mode?: string;
  /** Whether api_key is set (never expose actual key) */
  api_key_set?: boolean;
  /** Default model name from config.yaml */
  default_model?: string;
}

// —— F11 技能枚举 ——
export interface Skill {
  name: string;
  category: string;
  description?: string;
  enabled: boolean;
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

// —— T01 插件枚举（GET /api/plugins，对齐 hermes-studio HermesPluginInfo）——

/** 插件形态：来自 plugin.yaml `kind` 字段（未知值归一为 other）。 */
export type PluginKind = 'platform' | 'backend' | 'model-provider' | 'standalone' | 'other';

/** 插件来源：bundled = hermes-agent 内置；user = `$HERMES_HOME/plugins` 用户安装。 */
export type PluginSource = 'bundled' | 'user';

/**
 * 生效态（三态，非用户开关本身）：
 * - `enabled`      —— 无需额外配置，或所需环境变量已齐备，或 config.yaml 显式启用
 * - `needs_config` —— manifest 声明了 `requires_env` 但环境变量缺失
 * - `disabled`     —— config.yaml `plugins.<name>.enabled === false` 显式关闭
 */
export type PluginStatus = 'enabled' | 'needs_config' | 'disabled';

export interface PluginItem {
  /** 稳定标识：`<source>:<相对路径>`，跨来源同名不冲突 */
  id: string;
  /** manifest `name` */
  name: string;
  kind: PluginKind;
  source: PluginSource;
  effectiveStatus: PluginStatus;
  /** manifest `provides_tools`（缺省空数组） */
  providesTools: string[];
  description: string;
  /** manifest `label`（展示名，缺省回落 name） */
  label?: string;
  version?: string;
  /** manifest `requires_env` 归一化后的变量名列表 */
  requiresEnv?: string[];
  /** requiresEnv 中当前尚未配置的部分（effectiveStatus=needs_config 的依据） */
  missingEnv?: string[];
  /** 分组目录名，如 `platforms` / `image_gen`（顶层插件为 undefined） */
  group?: string;
}

// —— T01 平台渠道配置（GET/PUT /api/config/platform）——

/** 渠道类型：与 hermes-agent `plugins/platforms/<id>` 目录同名。 */
export type PlatformChannelType =
  | 'telegram' | 'discord' | 'slack' | 'whatsapp' | 'matrix'
  | 'wecom' | 'feishu' | 'dingtalk' | 'qqbot' | 'teams'
  | 'email' | 'line' | 'sms' | 'irc' | 'mattermost'
  | 'google_chat' | 'homeassistant' | 'ntfy' | 'photon' | 'simplex' | 'raft'
  | 'other';

/**
 * 单个平台渠道的配置。
 *
 * 🔒 `credentials` 为**只写**字段：GET 一律不回显明文，只经 `configuredKeys` / `maskedKeys`
 * 告知「哪些键已配置 / 掩码预览」；PUT 时传空串表示清除该键。
 */
export interface PlatformChannelConfig {
  id: string;
  type: PlatformChannelType;
  enabled: boolean;
  /** 🔒 仅 PUT 上行使用，GET 下行恒为 undefined */
  credentials?: Record<string, string>;
  /** GET 下行：已配置的凭据键名 */
  configuredKeys?: string[];
  /** GET 下行：键 → 掩码值（如 `123****cdef`） */
  maskedKeys?: Record<string, string>;
  /** 展示名（缺省回落 id） */
  label?: string;
}

/** GET /api/config/platform 返回结构 */
export interface PlatformConfigResponse {
  channels: PlatformChannelConfig[];
  /** 磁盘上可用的渠道类型（来自 hermes-agent `plugins/platforms/`），用于「新增渠道」下拉 */
  availableTypes: PlatformChannelType[];
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
  /** M5 新增：主题，与 client styles/theme.ts 同源 */
  theme?: 'dark' | 'light';
  /** M5 新增：界面语言，当前占位单语言 */
  locale?: 'zh-CN';
  /** M5 新增：FR20.6 终端默认工作目录 */
  terminal_cwd?: string;
  /** M5 新增：激活 profile 的只读镜像；写入一律走 PUT /api/profiles/active */
  active_profile?: string;
}

// ═══════════════════════ M4 新增数据类型 ═══════════════════════

// —— F16 子代理身份（字段名逐字对齐 delegate_tool.py `_identity_kwargs`）——
export interface SubagentIdentity {
  subagent_id: string;
  parent_id?: string;
  task_index?: number; // 本批第几个
  task_count?: number; // 本批总数
  goal?: string; // 委派目标
  depth?: number;
  model?: string;
  toolsets?: string[];
  child_session_id?: string; // 子代理自己的会话 id（UI 可跳转）
  tool_count?: number;
}
export type SubagentStatus = 'running' | 'ok' | 'failed' | 'error' | 'timeout';
// 下行统一锚点：会话 + 宿主消息，便于前端按 message 归组渲染 SubagentCard
export type SubagentDownlink = { session_id: string; message_id: string } & SubagentIdentity;

// —— F13 记忆条目（<hermesHome>/memories/{MEMORY,USER}.md，`§` 分隔）——
export type MemoryGroup = 'memory' | 'user';
export interface MemoryEntry {
  id: string; // `${group}:${sha1(content).slice(0,8)}` 内容寻址
  group: MemoryGroup; // MEMORY.md / USER.md
  content: string; // 单条正文（§ 分隔的一段）
  index: number; // 当前文件内序号（展示用，不作寻址）
  updated_at: number; // 文件 mtime
}

// —— F15 自动化任务（映射 <hermesHome>/cron/jobs.json 实测 schema）——
export interface CronJob {
  id: string;
  name: string;
  prompt: string;
  schedule_expr: string; // schedule.expr
  schedule_display: string;
  enabled: boolean;
  state: string; // scheduled / paused …
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
// 运行历史：output/<job_id>/<ts>.md 文件头解析
export interface CronRun {
  job_id: string;
  job_name: string;
  run_time: string;
  status: string;
  mode: string;
  excerpt: string;
  file: string;
  // —— F-10 运行详情渐进增强（A8）——
  // 全部可选：`parseCronRunFile` 抽不到对应 label 时**一律省略该 key**，
  // 不得填 ''/0/null（§7.1「可选字段缺失语义」）。前端统一 `?? '—'` 渲染。
  /** 运行命令（run md 头 `**Command:**`）。 */
  command?: string;
  /** 进程退出码（`**Exit Code:**`）。0 是合法值，故仅在解析成功时设置。 */
  exit_code?: number;
  /** 运行耗时，毫秒（`**Duration:**`，支持 `48.3s` / `1m30s` / `48300ms` 等写法）。 */
  duration_ms?: number;
  /** 日志文件绝对路径（`**Log:**`）。F22：server 认知内无独立 log 目录，多数情况缺失。 */
  log_file?: string;
  /** 触发方式（`**Trigger:**`）：schedule | manual | unknown。 */
  trigger?: string;
}

// ═══════════════════════ 会话 REST 契约（B-01/B-02/B-03）═══════════════════════
// ⚠️ 出参一律 camelCase（`mcp_servers → mcpServers`），落库一律 snake_case（§7.1）。
// `archived` 因历史原因保持 number（0/1）不改；`pinned` 为新增字段，出参用 boolean。

/** `GET /api/sessions` 列表项。 */
export interface SessionSummary {
  id: string;
  title: string;
  /** 历史语义：0/1 数字，**不要**改成 boolean */
  archived: number;
  /** B-02 新增：持久化置顶态 */
  pinned: boolean;
  /** hermes `cwd` 的出参名 */
  workspace: string;
  profile: string;
  model: string;
  source: string;
  mode: string | null;
  created_at: number;
  updated_at: number;
  message_count: number;
  /** B-01 新增：kmaster.db 侧车列，无记录时返回 [] */
  skills: string[];
  /** B-01 新增：同上 */
  mcpServers: string[];
  /** T02 新增：会话绑定的 Agent ID（创建时指定），未指定时为 null */
  agent: string | null;
}

/** `GET /api/sessions/:id`、`POST /api/sessions`、`PATCH /api/sessions/:id` 的会话出参。 */
export interface SessionDetail extends SessionSummary {
  /** 会话级模型覆盖（列表接口取 hermes 值，详情接口以 kmaster 覆盖优先） */
  model: string;
}

/** `PATCH|PUT /api/sessions/:id` 请求体。全部可选，但至少需命中 1 个字段。 */
export interface SessionPatch {
  title?: string;
  mode?: string | null;
  model?: string | null;
  workspace?: string | null;
  /** B-02 */
  pinned?: boolean;
  /** B-03（boolean 入参，服务端转 0/1） */
  archived?: boolean;
  /** B-01 */
  skills?: string[];
  /** B-01；同时接受 snake_case 的 `mcp_servers`（F5 兼容） */
  mcpServers?: string[];
  mcp_servers?: string[];
}

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

// —— F22 用量聚合行（key 依 group 而定：day / model / session_id）——
export interface UsageStatRow {
  key: string;
  input_tokens: number;
  output_tokens: number;
  cost: number;
  runs: number;
}
/** 兼容别名（PRD 中以 UsageStat 指代同一结构）。 */
export type UsageStat = UsageStatRow;

export interface UsageTotals {
  input_tokens: number;
  output_tokens: number;
  cost: number;
  sessions: number;
}
export type UsageGroupBy = 'day' | 'model' | 'session';

// —— F18 上下文占用估算（镜像 context_breakdown.py 返回结构）——
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
  estimated: true; // UI 恒标注「估算值」
}

/**
 * T01/L3：WS 事件随行的上下文占用快照（挂在 `usage.updated` / `run.completed` 的可选字段上）。
 *
 * ⚠️ 不是新事件类型，`WS_EVENTS` 注册表保持不变。字段映射自 `ContextEstimate`：
 * - `total_tokens`    ← `ContextEstimate.context_used`
 * - `context_length`  ← `ContextEstimate.context_max`（bridge `estimateContext()` 按模型上下文窗口给出）
 */
export interface ContextTokensPayload {
  /** 已占用 token 数（估算值，等价 `ContextEstimate.context_used`） */
  total_tokens: number;
  /** 当前模型上下文窗口上限（等价 `ContextEstimate.context_max`） */
  context_length: number;
}

// ═══════════════════════ 运行请求 / 通用结构 ═══════════════════════

export interface StartRunRequest {
  session_id: string;
  message: string;
  profile?: string;
  model?: string;
  // F8：UI Craft/Plan/Ask → 映射为 hermes 令牌 default/accept_edits/dont_ask（以 mode 字段透传，非 instructions 注入）
  mode?: HermesMode;
  instructions?: string;
}

export interface RunStarted {
  run_id: string;
  session_id: string;
}

export interface Usage {
  input_tokens: number;
  output_tokens: number;
  cost?: number;
}

export type ApprovalChoice = 'once' | 'session' | 'always' | 'deny';
export type PlanChoice = 'approve' | 'reject' | 'revise';

export interface Artifact {
  id: string;
  name: string;
  kind: 'markdown' | 'code' | 'text' | 'image';
  language?: string;
  content?: string;
  dataUrl?: string;
}

// Bridge → server 内部事件（与 hermes-agent 能力面一一对应）
export type BridgeEvent =
  | { type: 'message.delta'; delta: string; sessionId?: string; runId?: string }
  | { type: 'reasoning.delta'; delta: string; sessionId?: string; runId?: string }
  | { type: 'thinking.delta'; delta: string; sessionId?: string; runId?: string }
  | { type: 'tool.started'; tool: string; args?: unknown; toolCallId?: string; sessionId?: string; runId?: string }
  | { type: 'tool.completed'; tool: string; result?: unknown; toolCallId?: string; sessionId?: string; runId?: string }
  | { type: 'tool.failed'; tool: string; error?: string; toolCallId?: string; sessionId?: string; runId?: string }
  | { type: 'approval.requested'; approval_id: string; tool: string; args?: unknown; risk?: string; approvalId?: string; sessionId?: string }
  | { type: 'approval.resolved'; approval_id?: string; approvalId?: string; choice?: string; sessionId?: string }
  | { type: 'clarify.requested'; clarify_id: string; question: string; options?: string[]; clarifyId?: string; sessionId?: string }
  | { type: 'clarify.resolved'; clarify_id?: string; clarifyId?: string; sessionId?: string }
  | { type: 'plan.requested'; plan_id: string; title: string; steps: string[] }
  | { type: 'artifact'; artifact: Artifact }
  | { type: 'usage.updated'; input_tokens: number; output_tokens: number; cost?: number; model?: string; sessionId?: string; runId?: string }
  // —— T04 新增：运行态与错误 ——
  | { type: 'run.started'; sessionId: string; runId: string }
  | { type: 'completed'; text: string; sessionId?: string; runId?: string; usage?: unknown }
  | { type: 'error'; sessionId?: string; code?: string; message?: string; requestId?: string; runId?: string }
  // —— T04 新增：中断事件 ——
  | { type: 'abort.started'; sessionId: string; runId?: string }
  | { type: 'abort.completed'; sessionId: string; runId?: string }
  | { type: 'abort.timeout'; sessionId: string; runId?: string }
  // —— T04 新增：会话与兜底事件 ——
  | { type: 'session.title.updated'; sessionId?: string; title: string }
  | { type: 'session.command'; sessionId?: string; command?: string; ok?: boolean; output?: string; error?: string }
  | { type: 'agent.event'; sessionId?: string; runId?: string; raw?: unknown }
  | { type: 'result'; sessionId?: string; ok?: boolean; data?: unknown; error?: string; requestId?: string }
  // —— M4/F16：字段名逐字对齐 delegate_tool.py，真实链路零转换透传 ——
  | ({ type: 'subagent.start'; preview: string } & SubagentIdentity)
  | ({ type: 'subagent.tool'; tool: string; preview?: string; args?: unknown } & SubagentIdentity)
  | ({ type: 'subagent.text'; preview: string } & SubagentIdentity)
  | ({ type: 'subagent.thinking'; preview: string } & SubagentIdentity)
  | ({ type: 'subagent.progress'; preview: string } & SubagentIdentity)
  | ({
      type: 'subagent.complete';
      preview?: string;
      status?: SubagentStatus;
      duration_seconds?: number;
    } & SubagentIdentity)
  // —— M4/F18：对齐 conversation_compression.py 的 session:compress ——
  | { type: 'compression.started'; reason?: string }
  | {
      type: 'compression.completed';
      old_session_id?: string;
      in_place?: boolean;
      compression_count?: number;
      tokens_before?: number;
      tokens_after?: number;
    }
  // ── M2 新增：MCP 状态变更 / 后台通知 / 用户决策压缩请求 / 委派更新 ──
  | { type: 'mcp.status.changed'; server: string; status: string; sessionId?: string }
  | { type: 'background.notification'; notificationId: string; payload?: unknown; sessionId?: string }
  | { type: 'compression.requested'; compressionId: string; estimated_savings?: number; preview?: string; sessionId?: string }
  | { type: 'delegation.updated'; delegationId?: string; status?: string; progress?: number; sessionId?: string };

// ═══════════════════════ M5 新增数据类型（F20 终端 / F21 设置）═══════════════════════
// ⚠️ 本段与 packages/client/src/types/chat.ts 的 M5 段为双端共享契约，任一侧变更必须同步。

// —— F20 终端：socket.io `/terminal` 命名空间协议（方案 §3.2）——

/** `/terminal` 命名空间路径。双端唯一来源，禁止在业务代码里硬编码字符串。 */
export const TERMINAL_NAMESPACE = '/terminal';

/** 服务端 pty 并发硬上限；可经环境变量 `KMASTER_MAX_TERMS` 覆盖（Q7）。 */
export const DEFAULT_MAX_TERMS = 8;

/** pty 输出微批合并窗口（毫秒），降低高频小包开销。 */
export const TERMINAL_BATCH_MS = 8;

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

/** pty 元信息：既是 `TerminalManager.open()` 的返回值，也是 `term.opened` 的载荷。 */
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

/** 上行事件表（client → server），用于 socket.io 泛型标注。 */
export interface TerminalClientToServerEvents {
  'term.open': (req: TerminalOpenRequest) => void;
  'term.input': (msg: TerminalInputMessage) => void;
  'term.resize': (msg: TerminalResizeMessage) => void;
  'term.close': (msg: TerminalCloseMessage) => void;
}

/** 下行事件表（server → client），用于 socket.io 泛型标注。 */
export interface TerminalServerToClientEvents {
  'term.opened': (p: TerminalOpenedPayload) => void;
  'term.data': (p: TerminalDataPayload) => void;
  'term.exit': (p: TerminalExitPayload) => void;
  'term.error': (p: TerminalErrorPayload) => void;
}

// —— F21 设置页：Provider / Profile / 诊断（方案 §3.1、§3.3）——

/** Provider 配置态。🔒 DTO 层面就不存在明文 Key 字段。 */
export interface ProviderInfo {
  slug: string;
  name: string;
  /** 写入 Key 时使用的环境变量名，如 ANTHROPIC_API_KEY（复用 M3 build_models_payload） */
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

/**
 * `GET /api/profiles` 响应。
 * ⚠️ `<root>/profiles/` 与 `<root>/active_profile` 均为懒创建，缺失时回落「仅 default 且激活」。
 */
export interface ProfileListResult {
  profiles: ProfileInfo[];
  active: string;
  root: string;
}

/**
 * `PUT /api/profiles/active` 响应。
 * ⚠️ `restart_required` 不是可选提示而是语义必需：hermes 不会据 active_profile 改写子进程的
 * HERMES_HOME（§0.2.1），切换后必须失效缓存并重启 Bridge 子进程。
 */
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
  /** M5/Q4：当前持久层实现，memory 表示 better-sqlite3 不可用已降级（重启丢数据） */
  db_kind?: 'sqlite' | 'memory';
  /** M5/Q4：better-sqlite3 加载失败原因 */
  db_error?: string;
}

// ═══════════════════════ T01：Hermes Probe 探测端点 ═══════════════════════

/** 单条探针检查结果 */
export interface HermesCheck {
  name: string;
  status: 'pass' | 'fail' | 'warn' | 'skipped';
  message?: string;
  elapsedMs?: number;
  detail?: Record<string, unknown>;
}

/** 降级数据源记录 */
export interface DegradedSource {
  source: string;
  reason: string;
  fallback: string;
}

/** Bridge 身份信息（进程级） */
export interface BridgeIdentity {
  brokerPid: number | null;
  workerPid: number | null;
  workerEndpoint: string | null;
  pythonExe: string | null;
}

/** GET /api/hermes/probe 返回结构 */
export interface HermesProbe {
  configured: boolean;
  hermesHome: string;
  agentDir: string;
  configPath: string;
  gatewayState: 'running' | 'stopped' | 'unknown';
  gatewayPid: number | null;
  activeAgents: number;
  hermesVersion: string;
  ghostHomeDetected: boolean;
  bridgeMode: 'real' | 'mock' | 'unknown';
  bridgeReachable: boolean;
  bridgeIdentity?: BridgeIdentity;
  checks: HermesCheck[];
  degradedSources: DegradedSource[];
  pathAnomalies?: Array<{
    type: string;
    raw: string;
    normalized: string;
    detectedAt: number;
  }>;
}
