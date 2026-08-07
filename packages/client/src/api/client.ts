// REST 封装层：视图与 store 一律经此文件访问后端（NFR1 视图零直接网络调用）。
// 契约基准：docs/design/TECHNICAL-SOLUTION-M4.md §3.6 + packages/server/src/routes/*。
import type {
  ProviderGroup, Skill, McpServer, UploadRef, Settings,
  MemoryEntry, MemoryGroup,
  CronJob, CronRun,
  QueueItem,
  UsageStatRow, UsageTotals, UsageGroupBy,
  ContextEstimate,
  ProviderListResult, SetProviderKeyResult,
  ProfileListResult, UseProfileResult,
  HealthInfo,
  Session, SessionPatch,
} from '../types/chat';

const BASE = '';

function safeJsonParse(raw: string): unknown {
  try { return JSON.parse(raw); } catch { return null; }
}

/** 带状态码的 HTTP 错误（memory 409 stale_id / 423 locked 等分支判定用）。 */
export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly body: unknown;

  constructor(status: number, code: string, message: string, body: unknown) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

/**
 * 从异常中提取**人类可读**的错误文案（§7.5）。
 *
 * 缺陷 #1 的收敛点：`http()` 抛出的 `HttpError.message` 是
 * `` `${res.status} ${text}` `` —— 即「状态码 + 响应体原文」，例如
 * `400 {"ok":false,"error":"no_valid_field","message":"没有可更新的字段"}`。
 * 若沿用全仓惯例 `e instanceof Error ? e.message : String(e)` 直接 toast，
 * 用户会看到一坨裸 JSON。服务端那句干净的中文在 `.body.message` 里。
 *
 * 因此**所有面向用户的 toast 一律用本函数**，不要直接读 `.message`。
 *
 * @param e 任意异常
 * @param fallback 兜底文案（连 Error 都不是时使用）
 */
export function errText(e: unknown, fallback = '操作失败'): string {
  if (e instanceof HttpError) {
    const body = e.body as { message?: unknown; error?: unknown } | null;
    const msg = body?.message;
    if (typeof msg === 'string' && msg.trim() !== '') return msg;
    const code = body?.error;
    if (typeof code === 'string' && code.trim() !== '') return code;
    return `请求失败（${e.status}）`;
  }
  if (e instanceof Error && e.message.trim() !== '') return e.message;
  const s = String(e ?? '').trim();
  return s === '' ? fallback : s;
}

export async function http<T>(url: string, opts?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  const res = await fetch(BASE + url, {
    ...opts,
    signal: controller.signal,
    headers: { 'Content-Type': 'application/json', ...(opts?.headers ?? {}) },
  }).finally(() => clearTimeout(timer));
  if (!res.ok) {
    const text = await res.text();
    const parsed = safeJsonParse(text);
    const code = (parsed as { error?: string } | null)?.error ?? String(res.status);
    throw new HttpError(res.status, code, `${res.status} ${text}`, parsed);
  }
  const raw = await res.text();
  if (!raw) return undefined as unknown as T;
  const parsed = safeJsonParse(raw);
  if (parsed === null) throw new HttpError(500, 'PARSE_ERROR', 'Invalid JSON response', raw);
  return parsed as T;
}

function qs(params: Record<string, string | number | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

// ───────────────────────── M3 管理面 REST 封装 ─────────────────────────

/** T07: /api/models 返回体含 usage 聚合 */
export interface ModelsResponse {
  providers: ProviderGroup[];
  usage: Record<string, { calls: number; tokens: number }>;
}

export async function getModels(): Promise<ModelsResponse> {
  return http<ModelsResponse>('/api/models');
}

export async function getSkills(): Promise<Skill[]> {
  const { skills } = await http<{ skills: Skill[] }>('/api/skills');
  return skills;
}

/** T07: MCP 聚合端点 → { deployed, candidates } */
export interface McpAsset {
  id: string;
  name: string;
  description: string;
  source: string;
  category?: string;
  icon?: string;
  installed: boolean;
  version?: string;
  transport: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  authMode: string;
  timeout?: number;
}

export interface McpAggregate {
  deployed: McpServer[];
  candidates: McpAsset[];
}

export async function getMcpList(): Promise<McpAggregate> {
  return http<McpAggregate>('/api/mcp');
}

/** ♻️ 旧版兼容：仅返回 deployed 列表（供现有 useMcpList / chat store 使用） */
export async function getMcp(): Promise<McpServer[]> {
  const { deployed } = await getMcpList();
  return deployed;
}

export async function postMcp(server: { name: string; command: string; args?: string[]; env?: Record<string, string> }): Promise<McpServer[]> {
  const { servers } = await http<{ ok: boolean; servers: McpServer[] }>('/api/mcp', {
    method: 'POST',
    body: JSON.stringify(server),
  });
  return servers;
}
export async function deleteMcp(name: string): Promise<void> {
  await http(`/api/mcp/${encodeURIComponent(name)}`, { method: 'DELETE' });
}
export async function uploadFile(sessionId: string, filename: string, contentBase64: string): Promise<UploadRef> {
  const { upload } = await http<{ upload: UploadRef }>('/api/upload', {
    method: 'POST',
    body: JSON.stringify({ session_id: sessionId, filename, content_base64: contentBase64 }),
  });
  return upload;
}
export async function getSettings(): Promise<Settings> {
  const { settings } = await http<{ settings: Settings }>('/api/settings');
  return settings;
}
/**
 * M5/FR21.9：入参扩展 theme / locale / terminal_cwd（全部可选，未传即保持原值）。
 * ⚠️ `active_profile` 是只读镜像，**不可**经此写入 —— 走 `useProfile()`。
 */
export async function putSettings(body: {
  default_mode?: string;
  default_model?: string;
  theme?: 'dark' | 'light';
  locale?: 'zh-CN' | 'en';
  terminal_cwd?: string;
}): Promise<Settings> {
  const { settings } = await http<{ settings: Settings }>('/api/settings', {
    method: 'PUT',
    body: JSON.stringify(body),
  });
  return settings;
}

// ───────────────────────── M5/F21 设置页（Provider / Profile / 诊断）─────────────────────────

/**
 * `GET /api/config/providers` —— provider 配置态。
 * 🔒 返回体不含明文 Key，只有 `configured` 与 `masked`（FR21.5）。
 */
export async function getProviders(): Promise<ProviderListResult> {
  return http<ProviderListResult>('/api/config/providers');
}

/**
 * `PUT /api/config/providers` —— 写入 / 清除 API Key。
 * @param apiKey 明文 Key；传空串表示清除。🔒 响应永不回显明文。
 */
export async function putProvider(provider: string, apiKey: string): Promise<SetProviderKeyResult> {
  return http<SetProviderKeyResult>('/api/config/providers', {
    method: 'PUT',
    body: JSON.stringify({ provider, api_key: apiKey }),
  });
}

/** `GET /api/profiles` —— hermes profile 列表（懒创建缺失时回落「仅 default」）。 */
export async function getProfiles(): Promise<ProfileListResult> {
  return http<ProfileListResult>('/api/profiles');
}

/**
 * `PUT /api/profiles/active` —— 切换激活 profile。
 * 有 run 正在执行时后端返回 409 `run_in_progress`（HttpError.code 判定）。
 */
export async function useProfile(name: string): Promise<UseProfileResult> {
  return http<UseProfileResult>('/api/profiles/active', {
    method: 'PUT',
    body: JSON.stringify({ name }),
  });
}

/** `GET /api/health` —— ♻️ 复用既有端点的扩展返回体（FR21.8，字段全部可选需容错）。 */
export async function getHealth(): Promise<HealthInfo> {
  return http<HealthInfo>('/api/health');
}

// ───────────────────────── M4/F13 记忆管理 ─────────────────────────

export async function getMemory(params: { group?: MemoryGroup; q?: string } = {}): Promise<MemoryEntry[]> {
  const { entries } = await http<{ entries: MemoryEntry[] }>(
    `/api/memory${qs({ group: params.group, q: params.q })}`
  );
  return entries;
}
export async function createMemory(group: MemoryGroup, content: string): Promise<MemoryEntry> {
  const { entry } = await http<{ entry: MemoryEntry }>('/api/memory', {
    method: 'POST',
    body: JSON.stringify({ group, content }),
  });
  return entry;
}
export async function updateMemory(id: string, content: string): Promise<MemoryEntry> {
  const { entry } = await http<{ entry: MemoryEntry }>(`/api/memory/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify({ content }),
  });
  return entry;
}
/** 删除后返回备份文件路径（UI 提示「已自动备份，可回滚」）。 */
export async function deleteMemory(id: string): Promise<{ ok: boolean; backup: string }> {
  return http<{ ok: boolean; backup: string }>(`/api/memory/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

// ───────────────────────── M4/F15 自动化任务 ─────────────────────────

export interface CronJobCreate {
  schedule: string;
  prompt?: string;
  name?: string;
  deliver?: string;
  repeat?: number;
  script?: string;
  no_agent?: boolean;
  workdir?: string;
}
export interface CronJobPatch {
  name?: string;
  schedule?: string;
  prompt?: string;
  deliver?: string;
  repeat?: number;
  workdir?: string;
  enabled?: boolean;
}
export interface CronRunAck {
  ok: boolean;
  note: string;
  scheduler_running: boolean;
}

export async function listJobs(): Promise<CronJob[]> {
  const { jobs } = await http<{ jobs: CronJob[] }>('/api/jobs');
  return jobs;
}
export async function createJob(req: CronJobCreate): Promise<CronJob[]> {
  const { jobs } = await http<{ ok: boolean; jobs: CronJob[] }>('/api/jobs', {
    method: 'POST',
    body: JSON.stringify(req),
  });
  return jobs;
}
export async function updateJob(id: string, patch: CronJobPatch): Promise<CronJob[]> {
  const { jobs } = await http<{ ok: boolean; jobs: CronJob[] }>(`/api/jobs/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  return jobs;
}
export async function deleteJob(id: string): Promise<void> {
  await http(`/api/jobs/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
/** 202 语义：标记为在下一个调度器 tick 执行，note 说明调度器状态。 */
export async function runJob(id: string): Promise<CronRunAck> {
  return http<CronRunAck>(`/api/jobs/${encodeURIComponent(id)}/run`, { method: 'POST' });
}
export async function getCronHistory(params: { job_id?: string; limit?: number } = {}): Promise<CronRun[]> {
  const { runs } = await http<{ runs: CronRun[] }>(
    `/api/cron-history${qs({ job_id: params.job_id, limit: params.limit })}`
  );
  return runs;
}
export async function getCronStatus(): Promise<{ running: boolean; raw: string }> {
  return http<{ running: boolean; raw: string }>('/api/cron-status');
}

// ───────────────────────── M4/F17 消息队列 ─────────────────────────

export async function listQueue(sessionId?: string): Promise<QueueItem[]> {
  const { items } = await http<{ items: QueueItem[] }>(`/api/queue${qs({ session_id: sessionId })}`);
  return items;
}
export async function deleteQueueItem(id: string): Promise<void> {
  await http(`/api/queue/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
/** 立即发送：会话空闲即刻执行（started=true），忙则提到队首（started=false）。 */
export async function sendQueueItem(id: string): Promise<{ ok: boolean; started: boolean; note: string }> {
  return http<{ ok: boolean; started: boolean; note: string }>(
    `/api/queue/${encodeURIComponent(id)}/send`,
    { method: 'POST' }
  );
}

// ───────────────────────── M4/F22 用量统计 ─────────────────────────

export interface UsageStatsResponse {
  group: UsageGroupBy;
  rows: UsageStatRow[];
  totals: UsageTotals;
}
export async function getUsageStats(
  group: UsageGroupBy = 'day',
  from?: string,
  to?: string
): Promise<UsageStatsResponse> {
  return http<UsageStatsResponse>(`/api/usage/stats${qs({ group, from, to })}`);
}

// ───────────────────────── M4/F18 上下文估算 ─────────────────────────

export async function getContextLength(sessionId: string, force = false): Promise<ContextEstimate> {
  return http<ContextEstimate>(
    `/api/sessions/${encodeURIComponent(sessionId)}/context-length${qs({ force: force ? 1 : undefined })}`
  );
}

// ═══════════════════ B6：会话局部更新（PATCH）═══════════════════

/**
 * 局部更新会话字段（B-01/B-02/B-03）。
 *
 * 用于置顶 / 归档 / 重命名 / 改 skills·mcp。落库走 kmaster.db 侧车
 * （U2：hermes state.db 硬只读，无 session 写通道）。
 *
 * ⚠️ 错误处理：`http()` 抛出的是 `HttpError`，其 `.message` 为
 * 「状态码 + 响应体原文」，**不是**服务端那句干净的 `message`（缺陷 #1）。
 * 本函数**不做 try/catch**，交由上层做乐观更新回滚 + toast；
 * 上层 toast 必须走 `errText(e)` 而不是 `e.message`（§7.2 / §7.5）。
 *
 * @param sessionId 会话 id
 * @param patch 补丁体；空对象服务端返回 `400 no_valid_field`
 * @returns 合并后的最新会话
 */
export async function patchSession(sessionId: string, patch: SessionPatch): Promise<Session> {
  const { session } = await http<{ session: Session }>(
    `/api/sessions/${encodeURIComponent(sessionId)}`,
    { method: 'PATCH', body: JSON.stringify(patch) }
  );
  return session;
}

// ═══════════════════ P1 #18：会话导出 ═══════════════════
/** 导出会话为 Markdown Blob，客户端触发下载。 */
export async function exportSession(sessionId: string): Promise<Blob> {
  const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/export`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`导出失败: ${res.status} ${text}`);
  }
  return res.blob();
}

// ═══════════════════ T04：新增端点 ═══════════════════

export interface AgentEntry {
  id: string;
  name: string;
  prompt: string;
  agentMd?: string;
  skills?: string[];
  mcp?: string[];
  specialties?: string[];
}

/** T07: /api/agents 聚合响应 */
export interface AgentsResponse {
  installed: AgentEntry[];
  candidates: Array<{
    id: string;
    name: string;
    description: string;
    source: string;
    category?: string;
    icon?: string;
    installed: boolean;
    profession: string;
    tags: string[];
    doNotRedistribute: boolean;
  }>;
  categories: Array<{ id: string; name: string }>;
}

export async function getAgents(source: 'installed' | 'candidates' | 'all' = 'installed'): Promise<AgentsResponse> {
  return http<AgentsResponse>(`/api/agents${qs({ source })}`);
}

export interface LogEntry {
  file: string;
  line: number;
  timestamp: string | null;
  level: string;
  message: string;
  kind: string;
}

export async function getLogs(params: {
  kind?: string; level?: string; since?: string; q?: string; limit?: number;
} = {}): Promise<{ logs: LogEntry[]; count: number }> {
  return http<{ logs: LogEntry[]; count: number }>(
    `/api/logs${qs(params as Record<string, string | number | undefined>)}`
  );
}

export interface HermesProbeResult {
  configured: boolean;
  hermesHome: string;
  bridgeMode: 'real' | 'mock' | 'unknown';
  bridgeReachable: boolean;
  ghostHomeDetected: boolean;
  checks: Array<{ name: string; status: string; message?: string }>;
}

export async function getHermesProbe(): Promise<HermesProbeResult> {
  return http<HermesProbeResult>('/api/hermes/probe');
}

export async function installSkill(name: string): Promise<{ ok: boolean; installKind?: string }> {
  return http<{ ok: boolean; installKind?: string }>('/api/skills/install', {
    method: 'POST',
    body: JSON.stringify({ skillName: name }),
  });
}

export async function uninstallSkill(name: string): Promise<{ ok: boolean }> {
  return http<{ ok: boolean }>(`/api/skills/${encodeURIComponent(name)}`, { method: 'DELETE' });
}

export async function createAgent(body: {
  name: string; displayName?: string; icon?: string; prompt: string;
  skills?: string[]; mcp?: string[]; specialties?: string[];
}): Promise<{ ok: boolean; agentId: string }> {
  return http<{ ok: boolean; agentId: string }>('/api/agents', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export async function deleteAgent(name: string): Promise<{ ok: boolean }> {
  return http<{ ok: boolean }>(`/api/agents/${encodeURIComponent(name)}`, { method: 'DELETE' });
}

// ═══════════════════ T01：Agent 安装/卸载 API ═══════════════════

/**
 * 安装 Agent（marketplace → 本地）。
 * stub：等 T02 后端就绪后对接真实端点。
 */
export async function installAgent(name: string): Promise<{ ok: boolean; agentId: string; message: string }> {
  return http<{ ok: boolean; agentId: string; message: string }>(
    `/api/agents/${encodeURIComponent(name)}/install`,
    { method: 'POST' }
  );
}

/**
 * 卸载 Agent（本地 → 移除）。
 * stub：等 T02 后端就绪后对接真实端点。
 */
export async function uninstallAgent(name: string): Promise<{ ok: boolean; message: string }> {
  return http<{ ok: boolean; message: string }>(
    `/api/agents/${encodeURIComponent(name)}/uninstall`,
    { method: 'DELETE' }
  );
}
