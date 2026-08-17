// chat store：纯 reducer，所有 WS 事件在此聚合为消息流状态
// M4：新增 subagent.* / compression.* / run.queued / queue.updated / delegation.updated 九类事件
// 的 reducer（按 session_id 分发，subagent 再按 subagent_id 二级归组）。
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import {
  connectChatRun,
  startRun,
  abortRun,
  steerRun,
  respondApproval,
  respondClarify,
  respondPlan as respondPlanApi,
  invokeSkill as invokeSkillApi,
} from '../api/hermes/chat';
import {
  http,
  getModels,
  getSkills,
  getMcp,
  postMcp,
  deleteMcp,
  uploadFile as uploadFileApi,
  getSettings,
  putSettings,
  listQueue,
  deleteQueueItem as deleteQueueItemApi,
  sendQueueItem as sendQueueItemApi,
  getContextLength,
  patchSession,
  installAgent as installAgentApi,
  uninstallAgent as uninstallAgentApi,
} from '../api/client';
import { isDesktop, pickFolder, readTextFile, openPath } from '../utils/desktop-bridge';
import {
  WS_EVENTS,
  CHAT_MODES,
  type Message, type Session, type Usage, type ToolCall, type RunState,
  type ApprovalChoice, type PlanChoice, type HermesMode, type ProviderGroup,
  type Skill, type McpServer, type UploadRef, type Settings,
  type SubagentState, type SubagentStatus, type CompressionNotice,
  type QueueItem, type ContextEstimate, type ContextTokensPayload,
  type CronRun, type JobArtifactRef,
} from '../types/chat';
import type { RightPanelMode } from '../constants/layout';
import { isExpertTeam, isSkill, isMcp } from '../types/market';

export const useChatStore = defineStore('chat', () => {
  const sessions = ref<Session[]>([]);
  const messagesBySession = ref<Record<string, Message[]>>({});
  const runState = ref<Record<string, RunState>>({});
  const activeSessionId = ref<string | null>(null);
  const pendingApprovals = ref<Record<string, any[]>>({});
  const pendingClarifies = ref<Record<string, any[]>>({});
  const pendingPlans = ref<Record<string, any[]>>({});
  const artifactsBySession = ref<Record<string, any[]>>({});
  const usageBySession = ref<Record<string, Usage>>({});
  const socketReady = ref(false);
  /**
   * K-RESP：每会话最近一次 run 失败原因（来自 WS `run.failed` 的 `error`）。
   * 此前 `run.failed` 被静默吞掉（仅 reset runState），用户只看到「正在输入…」戛然而止，
   * 表现为「对话框无响应」。现在把错误留存于此，供组件 watch 弹 toast / 角标；
   * 同时在 dispatch 里补一条助手错误气泡，让失败在消息流里也可见、可定位。
   */
  const runErrorBySession = ref<Record<string, string>>({});

  // —— M3 管理面状态 ——
  const globalSettings = ref<Settings>({ default_mode: 'default', default_model: '' });
  // 每会话覆盖（token = hermes 令牌）
  const modeBySession = ref<Record<string, HermesMode>>({});
  const modelBySession = ref<Record<string, string>>({});
  const models = ref<ProviderGroup[]>([]);
  const skills = ref<Skill[]>([]);
  const mcpServers = ref<McpServer[]>([]);
  // 当前待发送附件（未随消息发出前），按会话归集
  const uploads = ref<Record<string, UploadRef[]>>({});

  // —— M4 状态 ——
  /** F16：会话 → 子代理 id → 卡片状态 */
  const subagentsBySession = ref<Record<string, Record<string, SubagentState>>>({});
  /** F18：会话 → 最近一次压缩提示（started 显示「压缩中」，completed 显示释放量） */
  const compressionBySession = ref<Record<string, CompressionNotice>>({});
  /** F17：会话 → 排队消息（与 /queue 整页同数据源） */
  const queueBySession = ref<Record<string, QueueItem[]>>({});
  /** F18：会话 → 上下文占用估算 */
  const contextBySession = ref<Record<string, ContextEstimate>>({});
  /** P1 占位：后台委派清单（async_delegation） */
  const delegationsBySession = ref<Record<string, unknown[]>>({});

  // —— P1 #12：编辑消息状态 ——
  const editingMessage = ref<Message | null>(null);

  // —— UI 重设计 T02：置顶会话 & Agent ���态 ——
  /** 置顶会话 id 集合 */
  const pinnedSessions = ref<Set<string>>(new Set());
  /** Agent 状态：sessionId → agentState */
  const agentStates = ref<Record<string, string>>({});
  /** K01.2：当前活跃 Agent ID，默认 'default' */
  const activeAgentId = ref<string>('default');

  // —— V2 增量：高亮 / 右栏模式 / 详情实体 ——
  /** V2：新建任务后高亮会话 ID，驱动左栏闪烁动画 */
  const highlightedSessionId = ref<string | null>(null);
  /** FIX-8：openSession 加载中标志 */
  const openingSession = ref(false);
  /**
   * U4：冷启动「会话恢复中」标志，用于消解首页默认态与 `restoreLastSession()` 的时序竞争。
   *
   * 问题：会话列表由异步请求灌入，`activeSessionId` 在恢复完成前恒为 null，
   * 若 ChatView 只按 `sid` 二分支渲染，冷启动会先闪一下「首页空态」再跳进会话。
   * 解法：LeftSidebar 恢复流程前后置位本标志，ChatView 用**三分支**渲染
   * （恢复中 → 骨架 / 有会话 → ChatPanel / 空 → HomeDefaultPane）。
   */
  const restoring = ref(true);
  /** U4：标记冷启动恢复流程结束（成功进入会话或确认无会话可恢复）。 */
  function finishRestoring(): void {
    restoring.value = false;
  }
  /**
   * V3：右栏内容态（9 态，真源 `constants/layout.ts`）。
   * V2 的单一 `detail` 已平铺为 expert / team / skill / mcp，另加
   * job-artifact / agent-role / expert-picker 三态。
   */
  const rightPanelMode = ref<RightPanelMode>('hidden');
  /** V2：当前右栏详情实体引用（expert/team/skill/mcp 四态共用） */
  const detailEntity = ref<import('../types/market').EntityDef | null>(null);
  /** V3/R-31：右栏定时任务产物（job-artifact 态） */
  const jobArtifact = ref<JobArtifactRef | null>(null);
  /** V3/R-14：右栏正在编辑的 Agent 角色 id；空串表示「新建」 */
  const editingRoleId = ref<string>('');

  /** V2：清除高亮 */
  function clearHighlight(): void {
    highlightedSessionId.value = null;
  }

  /** 市场实体 → 右栏细分内容态（未知实体回落 expert）。 */
  function detailModeOf(entity: import('../types/market').EntityDef): RightPanelMode {
    if (isExpertTeam(entity)) return 'team';
    if (isSkill(entity)) return 'skill';
    if (isMcp(entity)) return 'mcp';
    return 'expert';
  }

  /**
   * V2→V3：打开右栏市场实体详情。
   * 签名保持不变（调用方 ExpertsView / SkillsView / McpView 无需改动），
   * 内部按实体类型映射到 expert / team / skill / mcp 四态之一。
   */
  function openDetail(entity: import('../types/market').EntityDef): void {
    detailEntity.value = entity;
    jobArtifact.value = null;
    editingRoleId.value = '';
    rightPanelMode.value = detailModeOf(entity);
  }

  /** 单文件读取上限 1MB，与 `INTERACTION.maxFileBytes` 对齐（store 层不反向依赖常量层）。 */
  const JOB_ARTIFACT_MAX_BYTES = 1_048_576;

  /**
   * V3/R-31：在右栏打开定时任务产物，并立即发起全文读取。
   *
   * 三档回落（A2）：桌面读到全文 → 读不到落 `run.excerpt` → 都没有则空态。
   * Web 端无文件系统桥，`readTextFile` 解析为 null，此处静默收敛为「无全文」，
   * 不弹错误（§7.5：双宿主等价，Web 不暴露读不到文件的技术细节）。
   */
  function openJobArtifact(run: CronRun): void {
    detailEntity.value = null;
    editingRoleId.value = '';
    jobArtifact.value = { run, content: '', loading: true, error: '' };
    rightPanelMode.value = 'job-artifact';
    void loadJobArtifactContent(run);
  }

  /** 异步读取产物全文；期间用户若切换到别的产物则丢弃本次结果（防竞态）。 */
  async function loadJobArtifactContent(run: CronRun): Promise<void> {
    const file = (run.file ?? '').trim();
    /** 竞态判定：仍停留在同一条运行记录才允许写回。 */
    const stillCurrent = (): boolean => jobArtifact.value?.run.file === run.file;
    if (file === '') {
      if (stillCurrent()) setJobArtifactContent('');
      return;
    }
    try {
      const text = await readTextFile(file, JOB_ARTIFACT_MAX_BYTES);
      if (!stillCurrent()) return;
      setJobArtifactContent(text ?? '');
    } catch (e) {
      if (!stillCurrent()) return;
      setJobArtifactContent('', String((e as Error)?.message ?? e));
    }
  }

  /** V3/R-31：产物读取完成（content 为空串表示 Web 端读不到，UI 回落 excerpt）。 */
  function setJobArtifactContent(content: string, error = ''): void {
    if (!jobArtifact.value) return;
    jobArtifact.value = { ...jobArtifact.value, content, error, loading: false };
  }

  /** V3/R-14：在右栏打开 Agent 角色配置；不传 roleId 表示新建。 */
  function openAgentRole(roleId = ''): void {
    detailEntity.value = null;
    jobArtifact.value = null;
    editingRoleId.value = roleId;
    rightPanelMode.value = 'agent-role';
  }

  /** V3/R-15：在右栏打开「从市场添加角色」选择器。 */
  function openExpertPicker(): void {
    detailEntity.value = null;
    jobArtifact.value = null;
    rightPanelMode.value = 'expert-picker';
  }

  /** V2：关闭右栏详情（清空所有内容态载荷） */
  function closeDetail(): void {
    detailEntity.value = null;
    jobArtifact.value = null;
    editingRoleId.value = '';
    rightPanelMode.value = 'hidden';
  }

  /** V2：显示产物面板 */
  function showOutput(): void {
    rightPanelMode.value = 'output';
  }

  /** V2：带配置创建 session */
  async function createSessionWithConfig(config?: Partial<import('../types/newTask').NewTaskConfig>): Promise<string> {
    const body: Record<string, unknown> = {};
    if (config) {
      if (config.workspace) body.workspace = config.workspace;
      if (config.model) body.model = config.model;
      if (config.agent) body.agent = config.agent;
      if (config.provider) body.provider = config.provider;
      if (config.skills && config.skills.length > 0) body.skills = config.skills;
      if (config.mcpServers && config.mcpServers.length > 0) body.mcp_servers = config.mcpServers;
      if (config.securityMode) body.mode = config.securityMode;
    }
    const { session } = await http<{ session: Session }>('/api/sessions', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    sessions.value = [session, ...sessions.value];
    activeSessionId.value = session.id;
    ensure(session.id);
    // CH-F：服务端 mode 是 `string | null`，经 normalizeMode 收敛后再入 store
    if (session.mode) modeBySession.value[session.id] = normalizeMode(session.mode);
    if (session.model) modelBySession.value[session.id] = session.model;
    if (config?.agent) agentStates.value[session.id] = config.agent;
    // 高亮新会话
    highlightedSessionId.value = session.id;
    rightPanelMode.value = 'hidden';
    // 2.5s 后清除高亮
    setTimeout(() => clearHighlight(), 2500);
    return session.id;
  }

  /**
   * B-02：切换会话置顶（乐观更新 + PATCH 持久化 + 失败回滚，§7.5）。
   *
   * ⚠️ 与旧实现的区别（B10-② / F6）：真源已从本地 `pinnedSessions` Set 换成
   * `session.pinned`（服务端字段）。`pinnedSessions` 仅作为兼容镜像同步维护，
   * **分组逻辑不再读它**——旧实现刷新即丢，是「后端存对了、界面看不出」的元凶。
   *
   * @throws 请求失败时回滚本地状态并上抛，由调用方 toast（§7.2：不在此吞异常）
   */
  async function togglePin(sessionId: string): Promise<void> {
    const target = sessions.value.find((x) => x.id === sessionId);
    if (!target) return;
    const before = !!target.pinned;
    const next = !before;

    // 1. 立即改本地
    target.pinned = next;
    syncPinnedMirror(sessionId, next);
    try {
      // 2. 发请求
      await patchSession(sessionId, { pinned: next });
    } catch (e) {
      // 3. 失败回滚 + 上抛给 UI toast
      const rollback = sessions.value.find((x) => x.id === sessionId);
      if (rollback) rollback.pinned = before;
      syncPinnedMirror(sessionId, before);
      throw e;
    }
  }

  /** 维护 `pinnedSessions` 兼容镜像（存量组件可能仍在读，保持不漂移）。 */
  function syncPinnedMirror(sessionId: string, pinned: boolean): void {
    const s = new Set(pinnedSessions.value);
    if (pinned) s.add(sessionId);
    else s.delete(sessionId);
    pinnedSessions.value = s;
  }

  /**
   * B-03：归档 / 取消归档会话（乐观更新 + PATCH + 失败回滚）。
   *
   * ⚠️ `archived` 出参是 `number`（0/1）不是 boolean（§7.1 / F27），本地赋值同样用 0/1。
   * 归档后会话会被 `useSessionList` 的 `list` 过滤掉（B10-③），若归档的是当前
   * 活动会话则一并清空 `activeSessionId`，避免右侧停留在一个左栏已看不见的会话上。
   */
  async function archiveSession(sessionId: string, archived = true): Promise<void> {
    const target = sessions.value.find((x) => x.id === sessionId);
    if (!target) return;
    const before = target.archived;
    const next = archived ? 1 : 0;

    target.archived = next;
    const wasActive = activeSessionId.value === sessionId;
    if (archived && wasActive) activeSessionId.value = null;
    try {
      await patchSession(sessionId, { archived: next });
    } catch (e) {
      const rollback = sessions.value.find((x) => x.id === sessionId);
      if (rollback) rollback.archived = before;
      if (archived && wasActive) activeSessionId.value = sessionId;
      throw e;
    }
  }

  /**
   * F-07：在系统文件管理器中打开会话工作目录。
   *
   * 桌面端走 desktop-bridge 的 `openPath`；Web 端无此能力，静默返回 `false`
   * 由调用方决定是否提示（§7.5：双宿主等价，不暴露技术细节）。
   *
   * @returns 是否成功唤起
   */
  async function revealSessionFolder(sessionId: string): Promise<boolean> {
    const target = sessions.value.find((x) => x.id === sessionId);
    const dir = (target?.workspace ?? '').trim();
    if (dir === '') return false;
    return openPath(dir);
  }

  // —— F4/R2：多端镜像（desktop + web 共用同一 server 实例）——
  /**
   * 本端已发起、但尚未收到终态（run.completed / run.failed）的 run 计数，按会话累计。
   * 用计数而非布尔：会话忙时服务端会把消息入队并在前一轮结束后自动续发，
   * 计数能让「自动续发那一轮」仍被识别为本端发起，不会误报镜像。
   * 仅参与判定、不参与渲染，故无需响应式。
   */
  const localPendingRuns = new Map<string, number>();
  /** 会话 → 是否处于「镜像中」（另一端正在跑同一会话，本端只读跟随）。 */
  const mirroredBySession = ref<Record<string, boolean>>({});

  /** 本端发起一轮 run（emit 'run' 之前调用）。 */
  function markLocalRun(sid: string): void {
    localPendingRuns.set(sid, (localPendingRuns.get(sid) ?? 0) + 1);
  }
  /** 本端某轮 run 收到终态，计数递减到 0 即摘除。 */
  function settleLocalRun(sid: string): void {
    const left = (localPendingRuns.get(sid) ?? 0) - 1;
    if (left > 0) localPendingRuns.set(sid, left);
    else localPendingRuns.delete(sid);
  }

  /** 全局排队总数（导航徽标用）。 */
  const queuedTotal = computed(() =>
    Object.values(queueBySession.value).reduce((n, list) => n + list.length, 0)
  );

  function ensure(sid: string) {
    if (!messagesBySession.value[sid]) messagesBySession.value[sid] = [];
  }
  function findMsg(sid: string, mid: string): Message | undefined {
    return messagesBySession.value[sid]?.find((m) => m.id === mid);
  }
  function findOrCreateAssistant(sid: string, mid: string): Message {
    ensure(sid);
    let m = findMsg(sid, mid);
    if (!m) {
      m = { id: mid, session_id: sid, role: 'assistant', content: '', reasoning: '', created_at: Date.now() };
      messagesBySession.value[sid].push(m);
    }
    return m;
  }
  function findOrCreateTool(sid: string, mid: string, tool: string): ToolCall {
    const m = findOrCreateAssistant(sid, mid);
    if (!m.toolCalls) m.toolCalls = [];
    let t = m.toolCalls.find((x) => x.tool === tool && x.status === 'running');
    if (!t) {
      t = { id: `${tool}-${Date.now()}`, tool, status: 'running' };
      m.toolCalls.push(t);
    }
    return t;
  }

  /**
   * F16：按 (session_id, subagent_id) 定位卡片状态，缺失时按事件 identity 建卡。
   * 兜底允许 start 事件丢失（真实链路乱序）时仍能渲染。
   */
  function findOrCreateSubagent(sid: string, p: any): SubagentState {
    const group = (subagentsBySession.value[sid] ||= {});
    const id = String(p?.subagent_id ?? 'unknown');
    let s = group[id];
    if (!s) {
      s = {
        subagent_id: id,
        session_id: sid,
        message_id: String(p?.message_id ?? ''),
        status: 'running',
        title: String(p?.goal ?? p?.preview ?? '子代理任务'),
        text: '',
        thinking: '',
        tools: [],
        started_at: Date.now(),
        updated_at: Date.now(),
      };
      group[id] = s;
    }
    // identity 字段以服务端为准逐次覆盖（tool_count 等由服务端算好，前端不自增）
    if (p.parent_id !== undefined) s.parent_id = p.parent_id;
    if (p.task_index !== undefined) s.task_index = p.task_index;
    if (p.task_count !== undefined) s.task_count = p.task_count;
    if (p.goal !== undefined) s.goal = p.goal;
    if (p.depth !== undefined) s.depth = p.depth;
    if (p.model !== undefined) s.model = p.model;
    if (p.toolsets !== undefined) s.toolsets = p.toolsets;
    if (p.child_session_id !== undefined) s.child_session_id = p.child_session_id;
    if (p.tool_count !== undefined) s.tool_count = p.tool_count;
    if (p.message_id !== undefined) s.message_id = p.message_id;
    s.updated_at = Date.now();
    return s;
  }

  function upsertQueueItem(sid: string, item: QueueItem) {
    const list = (queueBySession.value[sid] ||= []);
    const idx = list.findIndex((x) => x.id === item.id);
    if (idx >= 0) list[idx] = item;
    else list.push(item);
    list.sort((a, b) => a.position - b.position);
  }

  /** 是否为合法的 hermes 编辑审批令牌（真源 `CHAT_MODES`，types/chat.ts:37）。 */
  function isHermesMode(value: unknown): value is HermesMode {
    return typeof value === 'string' && CHAT_MODES.some((m) => m.token === value);
  }

  /**
   * T04/CH-F：把任意来源的 mode 原始值收敛为合法 `HermesMode`（单点归一）。
   *
   * 背景：服务端 `SessionSummary.mode` 是 `string | null`，历史库里混有 UI 值
   * （`craft` / `plan` / `ask`）、空串以及早期实验令牌。此前三处写的都是
   * `session.mode as HermesMode` 裸断言，脏值会被原样灌进 `modeBySession`，
   * 下游 `CHAT_MODES.find()` 查不到就退化成「按钮上直接显示原始 token」，
   * 而发送时又把这个非法值透传给 hermes——一处脏、两处坏。
   *
   * 回落顺序：合法原值 → 全局默认（同样校验，防止全局设置本身是脏的）→ `'default'`。
   *
   * @param raw 任意原始值（含 `null` / `undefined` / 非法字符串）
   * @returns 一定合法的 `HermesMode`
   */
  function normalizeMode(raw: unknown): HermesMode {
    if (isHermesMode(raw)) return raw;
    const fallback = globalSettings.value.default_mode;
    return isHermesMode(fallback) ? fallback : 'default';
  }

  /**
   * T04/CH-A：把 `usage.updated` / `run.completed` 随行的 `context_tokens`
   * 合入 `contextBySession`（契约见 `ContextTokensPayload`，types/chat.ts:497）。
   *
   * 两条硬语义：
   * 1. **缺失即不写**。该字段在两个事件上都是可选的（`usage.updated` 仅在服务端
   *    估算缓存命中时携带），缺失时保留上一次的估算值，🚫 不得回落 0 / NaN
   *    ——否则底栏的上下文环会在每一轮 run 中途闪回 0%。
   * 2. **只覆盖四个字段**。WS 快照只有 `total_tokens` / `context_length` 两枚数字，
   *    整体替换会把 REST 估算带来的 `categories` / `model` / `estimated_total`
   *    富字段冲掉（右栏分类明细随即变空），因此这里是浅合并而非赋值。
   *
   * `context_length <= 0` 视同「拿不到模型上下文窗口」→ 按缺失处理：没有分母就
   * 算不出百分比，写进去只会得到一个恒为 0% 的假环（CH-B 的隐藏判据也依赖于此）。
   */
  function applyContextTokens(sid: string, raw: unknown): void {
    const payload = raw as Partial<ContextTokensPayload> | null | undefined;
    if (!payload) return;
    const used = Number(payload.total_tokens);
    const max = Number(payload.context_length);
    if (!Number.isFinite(used) || !Number.isFinite(max)) return;
    if (used < 0 || max <= 0) return;
    const prev = contextBySession.value[sid];
    contextBySession.value[sid] = {
      ...prev,
      context_used: used,
      context_max: max,
      // L3 公式：`min(total_tokens / context_length * 100, 100)`。上限必须夹——
      // 服务端在压缩窗口边界上会短暂报出 used > max（估算滞后于实际裁剪），
      // 不夹会让底栏渲染出「117%」这种越界环。
      context_percent: Math.min((used / max) * 100, 100),
      estimated: true,
    };
  }

  function dispatch(ev: string, p: any) {
    const sid = p?.session_id;
    if (!sid) return;
    ensure(sid);
    switch (ev) {
      case 'run.started':
        runState.value[sid] = 'running';
        // K-RESP：新一轮开始，清除上一轮的失败标记（避免旧错误角标滞留）。
        delete runErrorBySession.value[sid];
        // F4/R2：/chat-run 是全命名空间广播，另一端（desktop / web）发起的 run
        // 本端同样会收到。非本端发起 → 标记「镜像中」，仅加一条只读提示条，
        // 消息流照常聚合（不改任何既有 reducer 行为）。
        if (!localPendingRuns.has(sid)) mirroredBySession.value[sid] = true;
        // K01.2：WS 下行标注当前 session 的 agent。
        // ⚠️ T04 实测：这是**死分支**——服务端 `run.started` 载荷只有
        // `{ run_id, session_id }`（protocol.ts:17 类型如此，run-chat.ts:127
        // 实际 emit 也如此），从未透传过 `agent`。
        // 保留而不删：① L3 红线要求 WS 注册表/载荷零改动，🚫 不得为了「激活」
        // 它去给 run.started 加字段；② 后端若来日补上该字段，这里即刻生效。
        // 因此 `agentStates` 的真实写入点只有 createSession / createSessionWithConfig
        // / setSessionAgent 三处，语义是「会话绑定的 agent」而非「正在跑的 agent」。
        if (p.agent) agentStates.value[sid] = p.agent;
        break;
      case 'message.delta': {
        if (p.guidance) {
          messagesBySession.value[sid].push({
            id: p.message_id, session_id: sid, role: 'user', content: p.delta, guidance: true, created_at: Date.now(),
          });
        } else {
          findOrCreateAssistant(sid, p.message_id).content += p.delta;
        }
        break;
      }
      case 'reasoning.delta':
        findOrCreateAssistant(sid, p.message_id).reasoning = (findOrCreateAssistant(sid, p.message_id).reasoning ?? '') + p.delta;
        break;
      case 'tool.started': {
        const t = findOrCreateTool(sid, p.message_id, p.tool);
        t.args = p.args;
        break;
      }
      case 'tool.completed': {
        const t = findOrCreateTool(sid, p.message_id, p.tool);
        t.status = 'done';
        t.result = p.result;
        break;
      }
      case 'tool.failed': {
        const t = findOrCreateTool(sid, p.message_id, p.tool);
        t.status = 'error';
        t.error = p.error;
        break;
      }
      case 'approval.requested':
        (pendingApprovals.value[sid] ||= []).push(p);
        break;
      case 'approval.resolved':
        pendingApprovals.value[sid] = (pendingApprovals.value[sid] || []).filter((a) => a.approval_id !== p.approval_id);
        break;
      case 'clarify.requested':
        (pendingClarifies.value[sid] ||= []).push(p);
        break;
      case 'clarify.resolved':
        pendingClarifies.value[sid] = (pendingClarifies.value[sid] || []).filter((c) => c.clarify_id !== p.clarify_id);
        break;
      case 'plan.requested':
        (pendingPlans.value[sid] ||= []).push(p);
        break;
      case 'plan.resolved':
        pendingPlans.value[sid] = (pendingPlans.value[sid] || []).filter((x: any) => x.plan_id !== p.plan_id);
        break;
      case 'artifact.created': {
        const list = (artifactsBySession.value[sid] ||= []);
        const idx = list.findIndex((a: any) => a.id === p.artifact.id);
        if (idx >= 0) list[idx] = p.artifact; else list.push(p.artifact);
        break;
      }
      case 'artifact.updated': {
        const list = (artifactsBySession.value[sid] ||= []);
        const idx = list.findIndex((a: any) => a.id === p.artifact.id);
        if (idx >= 0) list[idx] = p.artifact;
        break;
      }
      case 'usage.updated':
        usageBySession.value[sid] = { input_tokens: p.input_tokens, output_tokens: p.output_tokens, cost: p.cost };
        // CH-A：随行上下文快照（仅缓存命中时携带，缺失即保持旧值不动）
        applyContextTokens(sid, p?.context_tokens);
        break;
      case 'run.completed':
        runState.value[sid] = 'idle';
        // 终态到达：结算本端计数并撤下镜像提示（abort 不结算——服务端 abort 之后
        // 仍会补发 run.completed / run.failed，在那里统一结算，避免重复递减）
        settleLocalRun(sid);
        delete mirroredBySession.value[sid];
        // CH-A：run.completed 恒携带（服务端强制重算，除非估算本身失败）；
        applyContextTokens(sid, p?.context_tokens);
        break;
      case 'run.failed': {
        runState.value[sid] = 'idle';
        // 终态到达：结算本端计数并撤下镜像提示
        settleLocalRun(sid);
        delete mirroredBySession.value[sid];
        applyContextTokens(sid, p?.context_tokens);
        // K-RESP：关键修复——此前 `run.failed` 被静默吞掉，用户只看到「正在输入…」戛然而止，
        // 表现就是「对话框无响应」。现在：① 在会话里补一条助手错误气泡，让失败可见可定位；
        // ② 留存到 runErrorBySession 供组件弹 toast / 角标。
        const errMsg =
          typeof p?.error === 'string' && p.error.trim() ? p.error : '未知错误（run 异常终止）';
        const errMid =
          typeof p?.message_id === 'string' && p.message_id
            ? p.message_id
            : `run-failed-${sid}-${Date.now()}`;
        const errObj = findOrCreateAssistant(sid, errMid);
        errObj.content = `⚠️ 本次运行失败：${errMsg}`;
        errObj.status = 'error';
        runErrorBySession.value = { ...runErrorBySession.value, [sid]: errMsg };
        break;
      }
      case 'abort.started':
        runState.value[sid] = 'aborting';
        break;
      case 'abort.completed':
        runState.value[sid] = 'idle';
        delete mirroredBySession.value[sid];
        break;
      case 'session.title.updated': {
        const s = sessions.value.find((x) => x.id === sid);
        if (s) s.title = p.title;
        break;
      }

      // ═════════ M4/F16 子代理状态机 ═════════
      case 'subagent.start': {
        const s = findOrCreateSubagent(sid, p);
        s.status = 'running';
        s.title = String(p.goal ?? p.preview ?? s.title);
        s.started_at = Date.now();
        break;
      }
      case 'subagent.tool': {
        const s = findOrCreateSubagent(sid, p);
        s.tools.push({ tool: String(p.tool ?? ''), preview: p.preview, args: p.args });
        break;
      }
      case 'subagent.text': {
        const s = findOrCreateSubagent(sid, p);
        s.text += String(p.preview ?? '');
        break;
      }
      case 'subagent.thinking': {
        const s = findOrCreateSubagent(sid, p);
        s.thinking += String(p.preview ?? '');
        break;
      }
      case 'subagent.progress': {
        const s = findOrCreateSubagent(sid, p);
        s.progress = String(p.preview ?? '');
        break;
      }
      case 'subagent.complete': {
        const s = findOrCreateSubagent(sid, p);
        // 缺省状态视为成功（对齐 delegate_tool.py：无 status 即正常结束）
        s.status = (p.status as SubagentStatus) ?? 'ok';
        if (p.preview !== undefined) s.summary = String(p.preview);
        if (p.duration_seconds !== undefined) s.duration_seconds = Number(p.duration_seconds);
        break;
      }
      case 'delegation.updated':
        delegationsBySession.value[sid] = Array.isArray(p.delegations) ? p.delegations : [];
        break;

      // ═════════ M4/F18 上下文压缩 ═════════
      case 'compression.started':
        compressionBySession.value[sid] = {
          session_id: sid, phase: 'started', reason: p.reason, ts: Date.now(),
        };
        break;
      case 'compression.completed':
        compressionBySession.value[sid] = {
          session_id: sid,
          phase: 'completed',
          old_session_id: p.old_session_id,
          in_place: p.in_place,
          compression_count: p.compression_count,
          tokens_before: p.tokens_before,
          tokens_after: p.tokens_after,
          ts: Date.now(),
        };
        // 上下文已变化，估算值作废，等待下次拉取
        delete contextBySession.value[sid];
        break;

      // ═════════ M4/F17 队列 ═════════
      case 'run.queued':
        if (p.item) upsertQueueItem(sid, p.item as QueueItem);
        break;
      case 'queue.updated':
        queueBySession.value[sid] = Array.isArray(p.items)
          ? [...(p.items as QueueItem[])].sort((a, b) => a.position - b.position)
          : [];
        break;
    }
  }

  function registerSocket() {
    if (socketReady.value) return;
    const socket = connectChatRun();
    WS_EVENTS.forEach((e) => socket.on(e, (p: any) => dispatch(e, p)));
    socketReady.value = true;
  }

  async function loadSessions() {
    const { sessions: list } = await http<{ sessions: Session[] }>('/api/sessions');
    sessions.value = list;
  }
  async function createSession(agent = 'default'): Promise<string> {
    const now = new Date();
    const pad = (n: number): string => (n < 10 ? `0${n}` : String(n));
    const title = `新会话-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    const { session } = await http<{ session: Session }>('/api/sessions', {
      method: 'POST',
      body: JSON.stringify({ agent, title, mode: 'dont_ask' }),
    });
    sessions.value = [session, ...sessions.value];
    activeSessionId.value = session.id;
    ensure(session.id);
    // 新会话继承全局默认（服务端已写入 mode/model/workspace）
    // CH-F：同 createSessionWithConfig，统一走 normalizeMode
    if (session.mode) modeBySession.value[session.id] = normalizeMode(session.mode);
    if (session.model) modelBySession.value[session.id] = session.model;
    if (session.agent) agentStates.value[session.id] = session.agent;
    return session.id;
  }
  async function openSession(sid: string) {
    openingSession.value = true;
    try {
      activeSessionId.value = sid;
      ensure(sid);
      // 从 SessionRow 恢复每会话覆盖的 mode/model/workspace
      const { session } = await http<{ session: Session }>(`/api/sessions/${sid}`);
      // CH-F：历史会话的 mode 最脏（可能是早期 UI 值 craft/plan/ask），必须归一
      if (session.mode) modeBySession.value[sid] = normalizeMode(session.mode);
      if (session.model) modelBySession.value[sid] = session.model;
      // V3/#19：会话级工作目录（终端 cwd 默认值）。UI 不缓存到独立 ref——
      // store 之外需要 cwd 时直接从 session 列表读取，避免状态漂移。
      const { messages } = await http<{ messages: Message[] }>(`/api/sessions/${sid}/messages`);
      messagesBySession.value[sid] = messages;
      // M4：打开会话时同步队列与上下文估算（失败不影响会话打开）
      await Promise.allSettled([loadQueue(sid), loadContextEstimate(sid)]);
    } finally {
      openingSession.value = false;
    }
  }
  async function sendMessage(text: string) {
    let sid = activeSessionId.value;
    if (!sid) sid = await createSession();
    ensure(sid);

    // P0-8: 首次发送消息后自动将会话标题从默认格式更新为消息前20字
    const target = sessions.value.find((s) => s.id === sid);
    if (target && target.title && target.title.startsWith('新会话-')) {
      const newTitle = text.slice(0, 20) + (text.length > 20 ? '...' : '');
      target.title = newTitle;
      // 异步持久化，不阻塞消息发送
      http(`/api/sessions/${sid}`, { method: 'PATCH', body: JSON.stringify({ title: newTitle }) }).catch(() => {});
    }

    // 拼接待发送附件的 @引用（F19）
    const atts = uploads.value[sid] ?? [];
    const full = atts.length
      ? `${text}\n${atts.map((u) => '@' + u.path).join('\n')}`
      : text;
    messagesBySession.value[sid].push({
      id: `u-${Date.now()}`, session_id: sid, role: 'user', content: full, created_at: Date.now(),
      agentId: activeAgentId.value,
    });
    runState.value[sid] = 'running';
    markLocalRun(sid); // F4/R2：本端发起，后续 run.started 不算镜像
    startRun({
      session_id: sid,
      message: full,
      model: modelBySession.value[sid],
      mode: modeBySession.value[sid],
    });
    // 发出后清空待发送附件
    uploads.value[sid] = [];
  }
  function stop(sid: string) { abortRun(sid); }
  function steer(sid: string, text: string) { steerRun(sid, text); }

  // —— P1 #12：编辑消息后重发 ——
  async function resendMessage(msg: Message) {
    const sid = msg.session_id;
    ensure(sid);
    // 标记原消息为错误态（将被新消息替代）
    const msgs = messagesBySession.value[sid];
    const idx = msgs.findIndex((m) => m.id === msg.id);
    if (idx >= 0) {
      msgs[idx] = { ...msgs[idx], status: 'error' };
    }
    // 以原内容重新发送
    messagesBySession.value[sid].push({
      id: `u-${Date.now()}`,
      session_id: sid,
      role: 'user',
      content: msg.content,
      created_at: Date.now(),
    });
    runState.value[sid] = 'running';
    editingMessage.value = null;
    markLocalRun(sid); // F4/R2：本端发起
    startRun({
      session_id: sid,
      message: msg.content,
      model: modelBySession.value[sid],
      mode: modeBySession.value[sid],
    });
  }
  function clearEditingMessage() {
    editingMessage.value = null;
  }

  function approve(sid: string, approvalId: string, choice: ApprovalChoice) { respondApproval(sid, approvalId, choice); }
  function clarify(sid: string, clarifyId: string, response: string) { respondClarify(sid, clarifyId, response); }
  function respondPlan(sid: string, planId: string, choice: PlanChoice) { respondPlanApi(sid, planId, choice); }
  async function deleteSession(sid: string) {
    await http(`/api/sessions/${sid}`, { method: 'DELETE' });
    sessions.value = sessions.value.filter((x) => x.id !== sid);
    delete messagesBySession.value[sid];
    if (activeSessionId.value === sid) activeSessionId.value = null;
  }
  async function renameSession(sid: string, title: string) {
    await http(`/api/sessions/${sid}`, { method: 'PATCH', body: JSON.stringify({ title }) });
    const s = sessions.value.find((x) => x.id === sid);
    if (s) s.title = title;
  }

  // ───────── M3 管理面 action ─────────
  function uint8ToBase64(bytes: Uint8Array): string {
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }
  function setMode(sid: string, token: HermesMode) {
    modeBySession.value[sid] = token;
    // 立即持久化每会话覆盖（FR8.2：切换/刷新后恢复）
    http(`/api/sessions/${sid}`, { method: 'PATCH', body: JSON.stringify({ mode: token }) }).catch(() => {});
  }
  function setModel(sid: string, model: string) {
    modelBySession.value[sid] = model;
    http(`/api/sessions/${sid}`, { method: 'PATCH', body: JSON.stringify({ model }) }).catch(() => {});
  }

  /**
   * V3/#19：设置会话级工作目录（终端 cwd 默认值）。
   *
   * @param sid 会话 id
   * @param path 路径；`null` 表示「未指定」：
   *   - Electron 模式 → 调 `bridge.pickFolder()` 让用户选目录；
   *   - Web 模式 → 调用方**必须先经 `DirPickerModal` 拿到路径再传字符串过来**，
   *     直接传 `null` 会被安全忽略（Web 端无原生文件夹对话框，禁止 prompt 手输）。
   *   传字符串则视为「用户已经提供了路径」，直接写入（清空传空串 → null）。
   *
   * ⚠️ 不会跨页面持久化全局 `Settings.terminal_cwd`——那是全局默认；
   *    本函数只动当前会话列。
   */
  async function setWorkspace(sid: string, path: string | null): Promise<void> {
    let resolved: string | null;
    if (path === null) {
      // 调用方未提供路径：
      //  - Electron 下走原生文件夹选择器；
      //  - Web 下禁止 prompt，必须由组件层用 DirPickerModal 选好后传字符串。
      const picked = await pickWorkspacePath(sid);
      if (picked === undefined) return; // 桌面端取消 / Web 端未提供路径
      resolved = picked;
    } else {
      resolved = path;
    }
    const trimmed = (resolved ?? '').trim();
    await http(`/api/sessions/${sid}`, {
      method: 'PUT',
      body: JSON.stringify({ workspace: trimmed || null }),
    });
    // 乐观更新本地 session 列表（无需刷新整个会话列表）。
    const target = sessions.value.find((x) => x.id === sid);
    if (target) target.workspace = trimmed || null;
  }

  /**
   * T04/CH-D：设置会话绑定的 Agent 角色（乐观更新 + PUT 持久化 + 失败回滚）。
   *
   * 服务端只写 kmaster.db 侧车的 `agent` 列（🚫 不碰 hermes state.db）；
   * 传 `null` / 空串表示解除绑定，出参会回落 hermes 的 `profile_name`。
   *
   * 同步维护 `agentStates` 镜像：另两个写入点是 `createSession()` 与
   * `createSessionWithConfig()`，存的都是 `AgentEntry.id`，本函数必须同口径，
   * 否则「建会话时选的」与「事后改的」两份值会长成不同形状。
   * （`run.started` 分支看着也在写，但服务端从不透传 `agent`，是死分支。）
   *
   * ⚠️ 口径：侧车 `agent` 列存 **id 不存 name**。`name` 在 `agents/*.md` 分支
   * 可被 front-matter 覆盖成任意展示名，不唯一也不稳定，只配做展示。
   *
   * @param sid   会话 id
   * @param agent Agent **id**（= `AgentEntry.id`）；`null` / 空串 = 解除绑定
   * @throws 请求失败时回滚本地状态并上抛，由调用方给可见反馈（§7.2：不在此吞异常）
   */
  async function setSessionAgent(sid: string, agent: string | null): Promise<void> {
    const next = (agent ?? '').trim() || null;
    const target = sessions.value.find((x) => x.id === sid);
    const beforeAgent = target?.agent ?? null;
    const beforeState = agentStates.value[sid];

    if (target) target.agent = next;
    if (next) agentStates.value[sid] = next;
    else delete agentStates.value[sid];

    try {
      await http(`/api/sessions/${sid}`, {
        method: 'PUT',
        body: JSON.stringify({ agent: next }),
      });
    } catch (e) {
      const rollback = sessions.value.find((x) => x.id === sid);
      if (rollback) rollback.agent = beforeAgent;
      if (beforeState === undefined) delete agentStates.value[sid];
      else agentStates.value[sid] = beforeState;
      throw e;
    }
  }
  async function loadGlobalSettings() {
    globalSettings.value = await getSettings();
  }
  async function setGlobalSettings(mode: HermesMode, model: string) {
    globalSettings.value = await putSettings({ default_mode: mode, default_model: model });
  }
  async function loadModels() { const res = await getModels(); models.value = res.providers; }

  /**
   * MD-01：强制刷新 models 列表（供 modelConfig store 写后同步调用）。
   *
   * 设置页新增/删除/修改模型后，聊天选择器必须立即可见变化。
   * API 不可用时静默失败，保留现有数据——旧列表总比空列表好。
   */
  async function reloadModels(): Promise<void> {
    try {
      const res = await getModels();
      models.value = res.providers;
    } catch {
      // 静默失败，保留现有数据
    }
  }
  /** ST-01：`getSkills()` 现返回 `{ installed, candidates, categories }`，store 只关心已装列表。 */
  async function loadSkills() { skills.value = (await getSkills()).installed; }
  async function loadMcp() { mcpServers.value = await getMcp(); }
  async function addMcp(server: { name: string; command: string; args?: string[]; env?: Record<string, string> }) {
    mcpServers.value = await postMcp(server);
  }
  async function removeMcp(name: string) {
    await deleteMcp(name);
    mcpServers.value = await getMcp();
  }
  /**
   * T01：安装 Agent（乐观更新 + 失败回滚）。
   *
   * 调用 api/client.installAgent，成功后刷新会话列表以同步
   * agentStates（后续 T02 市场面板会据此判定已装状态）。
   */
  async function installAgent(name: string): Promise<void> {
    await installAgentApi(name);
    await loadSessions();
  }
  /**
   * T01：卸载 Agent（乐观更新 + 失败回滚）。
   *
   * 调用 api/client.uninstallAgent，成功后刷新会话列表。
   */
  async function uninstallAgent(name: string): Promise<void> {
    await uninstallAgentApi(name);
    await loadSessions();
  }
  async function uploadFile(sid: string, file: File | Blob & { name?: string }) {
    const buf = new Uint8Array(await file.arrayBuffer());
    const contentBase64 = uint8ToBase64(buf);
    const upload = await uploadFileApi(sid, (file as any).name ?? 'file', contentBase64);
    (uploads.value[sid] ||= []).push(upload);
    return upload;
  }
  function clearUploads(sid: string) { uploads.value[sid] = []; }
  function invokeSkill(sid: string, name: string) {
    markLocalRun(sid); // F4/R2：/skill 触发语等价一条本端消息
    invokeSkillApi(sid, name);
  }

  // V3/#19：根据运行环境选取工作区路径。
  // - Electron：通过 `bridge.pickFolder()` 走原生文件夹对话框，返回路径或 ''（取消）。
  // - Web：一律返回 undefined —— 禁止 prompt 手输，调用方必须改用 DirPickerModal 选路径。
  // 返回 `undefined` 表示「未选取（Web）/ 桌面端取消」，`string` 表示最终路径（含空串即「清空」）。
  async function pickWorkspacePath(_sid: string): Promise<string | undefined> {
    if (!isDesktop()) return undefined; // Web 端无原生选择器，禁止 prompt
    try {
      const path = await pickFolder();
      // pickFolder 取消时返回 null —— 用 undefined 表示「不写入」，
      // 因此把 null 也视作「清空」并把空串交给调用方归一化。
      return path ?? '';
    } catch {
      return undefined;
    }
  }

  // ───────── M4 action（F17 队列 / F18 上下文）─────────

  /** 拉取队列：传 sid 只刷该会话，不传则全量刷新（/queue 整页）。 */
  async function loadQueue(sid?: string) {
    const items = await listQueue(sid);
    if (sid) {
      queueBySession.value[sid] = items.slice().sort((a, b) => a.position - b.position);
      return items;
    }
    const grouped: Record<string, QueueItem[]> = {};
    for (const it of items) (grouped[it.session_id] ||= []).push(it);
    for (const list of Object.values(grouped)) list.sort((a, b) => a.position - b.position);
    queueBySession.value = grouped;
    return items;
  }

  /** 移除排队项（服务端会广播 queue.updated，本地先行乐观更新）。 */
  async function removeQueueItem(id: string) {
    await deleteQueueItemApi(id);
    for (const [sid, list] of Object.entries(queueBySession.value)) {
      queueBySession.value[sid] = list.filter((x) => x.id !== id);
    }
  }

  /** 立即发送排队项：空闲即刻执行，忙则提到队首（R-M4-5 手动冲刷入口）。 */
  async function sendQueueItemNow(id: string) {
    // F4/R2：无论是即刻执行还是提到队首，这一轮都由本端触发。
    // 必须在 await 之前登记——run.started 走 WS，可能早于 REST 响应返回。
    const owner = Object.entries(queueBySession.value)
      .find(([, list]) => list.some((x) => x.id === id))?.[0];
    if (owner) markLocalRun(owner);
    let res: Awaited<ReturnType<typeof sendQueueItemApi>>;
    try {
      res = await sendQueueItemApi(id);
    } catch (err) {
      if (owner) settleLocalRun(owner); // 请求失败，撤销登记
      throw err;
    }
    if (res.started) {
      for (const [sid, list] of Object.entries(queueBySession.value)) {
        queueBySession.value[sid] = list.filter((x) => x.id !== id);
      }
    } else {
      // 提到队首：以服务端为准重新拉取该会话队列
      if (owner) await loadQueue(owner);
    }
    return res;
  }

  /**
   * 拉取上下文占用估算（REST 全量版，含 `categories` 等富字段，UI 恒标注「估算值」）。
   *
   * ⚠️ 调用点只有 `openSession()` 一处（打开会话时与队列并行拉取）。
   * 旧注释写的「run.completed 后各一次」是**假的**——run 结束后的刷新走的是
   * WS 随行的 `context_tokens`（CH-A `applyContextTokens`，浅合并两枚数字），
   * 不再发 REST。因此 `categories` 等富字段只在打开会话那一刻拿到一次，
   * 之后由 WS 快照就地更新数值部分。
   */
  async function loadContextEstimate(sid: string, force = false) {
    const est = await getContextLength(sid, force);
    contextBySession.value[sid] = est;
    return est;
  }

  /** 关闭压缩横幅。 */
  function dismissCompression(sid: string) {
    delete compressionBySession.value[sid];
  }

  /** 清空某会话的子代理卡片（新一轮 run 开始时可选调用）。 */
  function clearSubagents(sid: string) {
    delete subagentsBySession.value[sid];
  }

  /** F4/R2：手动收起「镜像中」提示条（下一次异端 run.started 会再次出现）。 */
  function dismissMirror(sid: string) {
    delete mirroredBySession.value[sid];
  }

  return {
    sessions, messagesBySession, runState, activeSessionId,
    pendingApprovals, pendingClarifies, pendingPlans, artifactsBySession, usageBySession, socketReady,
    // K-RESP：run 失败原因（供组件弹 toast / 角标，治愈「无响应」静默黑洞）
    runErrorBySession,
    globalSettings, modeBySession, modelBySession, models, skills, mcpServers, uploads,
    // M4 状态
    subagentsBySession, compressionBySession, queueBySession, contextBySession, delegationsBySession,
    queuedTotal,
    // F4/R2 多端镜像
    mirroredBySession,
    dispatch, ensure, registerSocket, loadSessions, createSession, openSession, sendMessage,
    stop, steer, approve, clarify, respondPlan, deleteSession, renameSession,
    setMode, setModel, loadGlobalSettings, setGlobalSettings,
    // CH-F：mode 脏值单点归一（导出供 UI / 单测直接校验）
    normalizeMode,
    // V3/#19：会话级工作目录
    setWorkspace,
    // T04/CH-D：会话级 Agent 角色
    setSessionAgent,
    loadModels, reloadModels, loadSkills, loadMcp, addMcp, removeMcp, installAgent, uninstallAgent, uploadFile, clearUploads, invokeSkill,
    // P1 #12
    editingMessage, resendMessage, clearEditingMessage,
    // M4 action
    loadQueue, removeQueueItem, sendQueueItemNow, loadContextEstimate,
    dismissCompression, clearSubagents,
    // F4/R2 多端镜像
    dismissMirror,
    // UI 重设计 T02：置顶 & Agent 状态
    // B0：`getGroupedSessions` 死代码副本已删除 —— 分组唯一真源是
    // `composables/useSessionList.ts`。store 上这份无任何组件消费，
    // 留着只会让人改错地方（改完界面没反应，§7.7）。
    pinnedSessions, agentStates, activeAgentId, togglePin,
    // B12：会话写操作（乐观更新 + PATCH 持久化）
    archiveSession, revealSessionFolder,
    // U4：冷启动会话恢复中标志，驱动 ChatView 三分支
    restoring, finishRestoring,
    // V2 增量
    highlightedSessionId, rightPanelMode, detailEntity,
    openingSession,
    clearHighlight, openDetail, closeDetail, showOutput,
    createSessionWithConfig,
    // —— V3 右栏扩展 ——
    jobArtifact, editingRoleId,
    openJobArtifact, setJobArtifactContent, openAgentRole, openExpertPicker,
  };
});
