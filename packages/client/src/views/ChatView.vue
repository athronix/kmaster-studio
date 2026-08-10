<script setup lang="ts">
/**
 * ChatView — 会话交互页编排层（T04 重写）。
 *
 * 新布局结构：
 *   PageHeader（Agent/Mode/Model badge + 搜索 + 分享/大纲/右栏开关）
 *   → AgentTabBar（Agent 标签平铺栏）
 *   → .km-chat-body（ChatPanel + 右侧 RightPanel）
 *   → SessionConfigBar（底栏配置状态栏）
 */
import { computed, onMounted, onUnmounted, ref, watch, shallowRef } from 'vue';
import { useRouter } from 'vue-router';
import { NAlert, NButton, NPopover } from 'naive-ui';
import { useChatStore } from '../stores/chat';
import { useLayoutStore } from '../stores/layout';
import { CHAT_MODES, type HermesMode } from '../types/chat';
import { getAgents, type AgentEntry } from '../api/client';
import PageHeader from '../components/layout/PageHeader.vue';
import ChatPanel from '../components/chat/ChatPanel.vue';
import AgentTabBar from '../components/chat/AgentTabBar.vue';
import type { AgentTabItem } from '../components/chat/AgentTabBar.vue';
import SessionConfigBar from '../components/chat/SessionConfigBar.vue';
import ChatRightPanel from '../components/chat/RightPanel.vue';
import type { ChatRightPanelMode } from '../components/chat/RightPanel.vue';
import ShareDialog from '../components/chat/ShareDialog.vue';
import { keyboardActions } from '../composables/useKeyboard';
import KIcon from '../components/common/KIcon.vue';
import EmptyState from '../components/common/EmptyState.vue';
import SkeletonList from '../components/common/SkeletonList.vue';

const store = useChatStore();
const layout = useLayoutStore();
const router = useRouter();

const sid = computed(() => store.activeSessionId);
const running = computed(() => !!sid.value && store.runState[sid.value] === 'running');

// ── 会话/消息 三态（载态 / 空态 / 错误态）──
// store 里没有会话列表级别的 loading/error 标志（`openingSession` 只覆盖
// 「切换会话时拉取历史消息」这一段），因此这里用组件内最小 ref 补齐首屏
// `loadSessions()` 的加载与失败态，两者合流后驱动主体区分支。

/** 首屏 `/api/sessions` 拉取中。 */
const sessionsLoading = ref(false);

/** 会话列表 / 历史消息加载失败原因；空串表示无错误。 */
const loadError = ref('');

/**
 * 错误横幅标题。这条横幅被多个来源复用（会话加载 / 新建会话 / CH-C 工作区设置 /
 * CH-D Agent 切换），标题必须跟着来源走——否则「设置工作区失败」会顶着
 * 「会话加载失败」的帽子弹出来，用户完全对不上自己刚才点了什么。
 */
const loadErrorTitle = ref('会话加载失败');

/** 该错误是否能靠「重试」重新拉会话列表修复；配置类失败重试无意义，直接不给按钮。 */
const loadErrorRetryable = ref(true);

/** 统一置错入口（标题 / 文案 / 可重试性三者必须同时给，避免漏改其一）。 */
function setLoadError(title: string, e: unknown, fallback: string, retryable = false): void {
  loadErrorTitle.value = title;
  loadError.value = e instanceof Error ? e.message : fallback;
  loadErrorRetryable.value = retryable;
}

/** 载态：拉取会话列表，或切换会话时读取历史消息。 */
const historyLoading = computed<boolean>(() => sessionsLoading.value || store.openingSession);

/** 空态：加载完成且无错误，但还没有任何活动会话。 */
const conversationEmpty = computed<boolean>(
  () => !historyLoading.value && !loadError.value && !sid.value,
);

/** 空态副标题：区分「一个会话都没有」与「有历史会话但未选中」。 */
const emptyDescription = computed<string>(() =>
  store.sessions.length
    ? '从左侧会话列表选择一个已有会话，或直接新建一段对话。'
    : '还没有任何会话，点击下方按钮开始你的第一段对话。',
);

/** 加载会话列表，失败写入 `loadError` 供错误态渲染。 */
async function loadSessionList(): Promise<void> {
  sessionsLoading.value = true;
  loadError.value = '';
  try {
    await store.loadSessions();
  } catch (e: unknown) {
    setLoadError('会话加载失败', e, '会话列表加载失败，请检查服务端连接', true);
  } finally {
    sessionsLoading.value = false;
  }
}

/** 错误态「重试」。 */
function retryLoad(): void {
  void loadSessionList();
}

/** 空态「新建会话」CTA。 */
async function handleCreateSession(): Promise<void> {
  try {
    await store.createSession();
  } catch (e: unknown) {
    setLoadError('新建会话失败', e, '新建会话失败，请检查服务端连接', true);
  }
}

// ── 标题 ──
const title = computed(() => {
  if (!store.activeSessionId) return 'kmaster-studio';
  return store.sessions.find((s) => s.id === store.activeSessionId)?.title || '聊天';
});

// ── 模式/模型/Agent badge ──
const currentModeLabel = computed(() => {
  if (!sid.value) return '';
  const mode = store.modeBySession[sid.value] ?? store.globalSettings.default_mode;
  const def = CHAT_MODES.find((m) => m.token === mode);
  return def ? def.label : mode;
});

const currentModelName = computed(() => {
  if (!sid.value) return '';
  const model = store.modelBySession[sid.value] ?? store.globalSettings.default_model;
  if (!model) return '';
  for (const g of store.models) {
    const m = g.models.find((x) => x.id === model);
    if (m) return m.name || m.id;
  }
  return model;
});

/** 顶栏 Agent badge：与底栏同一份解析结果，无会话时不出 badge。 */
const currentAgentName = computed<string>(() => (sid.value ? currentAgent.value : ''));

// ── 对话内搜索 ──
const searchQuery = ref('');

// ── 分享 ──
const shareOpen = ref(false);

// ── 右栏模式（会话内：share / outline / artifacts / hidden）──
const chatRightPanelMode = ref<ChatRightPanelMode>('hidden');

function toggleChatRightPanel(): void {
  if (chatRightPanelMode.value === 'hidden') {
    chatRightPanelMode.value = 'artifacts';
  } else {
    chatRightPanelMode.value = 'hidden';
  }
}

function showSharePanel(): void {
  chatRightPanelMode.value = 'share';
}

function showOutlinePanel(): void {
  chatRightPanelMode.value = 'outline';
}

// ── Agent 标签栏数据 ──
const realAgents = shallowRef<AgentEntry[]>([]);

/**
 * E-1 加强版：Tab 条 = 主 agent（1 个）+ 活跃子代理（N 个）。
 *
 * 数据源：
 * - 主 agent：store.agentStates[sid]（Record<sid, string>，存 agent id）
 * - 子代理：store.subagentsBySession[sid]（Record<sid, Record<string, SubagentState>>）
 *
 * 无会话时返回空数组 []，模板侧 v-if 据此隐藏整个 TabBar。
 */
const agentTabs = computed<AgentTabItem[]>(() => {
  const currentSid = sid.value;
  if (!currentSid) return [];

  const tabs: AgentTabItem[] = [];

  // 第 1 个 Tab：当前会话的主 agent
  const mainAgentId = store.agentStates[currentSid];
  if (mainAgentId) {
    const agentEntry = realAgents.value.find((a) => a.id === mainAgentId);
    tabs.push({
      id: mainAgentId,
      name: agentEntry?.name ?? mainAgentId,
      color: undefined,
    });
  }

  // 后续 Tab：活跃子代理（status === 'running'，排除已结束/失败/超时/出错）
  const subagents = store.subagentsBySession[currentSid];
  if (subagents) {
    for (const [subId, sub] of Object.entries(subagents)) {
      if (sub.status === 'running') {
        tabs.push({
          id: subId,
          name: sub.title || subId,
          color: undefined,
        });
      }
    }
  }

  return tabs;
});

async function loadAgents(): Promise<void> {
  try {
    const resp = await getAgents('installed');
    realAgents.value = resp.installed;
  } catch {
    // 静默容错
  }
}

// ── 底栏配置 computed ──
const currentMode = computed<HermesMode>(() =>
  (sid.value ? (store.modeBySession[sid.value] ?? undefined) : undefined) ?? store.globalSettings.default_mode,
);

const currentModel = computed<string>(() =>
  (sid.value ? (store.modelBySession[sid.value] ?? undefined) : undefined) ?? store.globalSettings.default_model ?? '',
);

const currentWorkspace = computed<string>(() => {
  if (!sid.value) return '';
  const s = store.sessions.find((x) => x.id === sid.value);
  return s?.workspace ?? '';
});

/**
 * 底栏 Agent 展示名。
 *
 * 侧车列 `session.agent` 存的是 `AgentEntry.id`（与 `createSession(agent)` 同一口径），
 * 而用户要看的是人类可读名，所以这里查一次 `realAgents` 做 id → name 解析。
 * 查不到就**原样显示**——可能是 Agent 已被卸载，或该值来自 hermes 的
 * `profile_name` 回落（服务端 `mergeSession`），此时把原值糊成 'Default'
 * 反而会掩盖「绑定还在、角色包没了」这个真问题。
 */
const currentAgent = computed<string>(() => {
  if (!sid.value) return 'Default';
  const bound = store.sessions.find((x) => x.id === sid.value)?.agent;
  if (!bound) return 'Default';
  return realAgents.value.find((a) => a.id === bound)?.name ?? bound;
});

const ctxRef = computed(() => (sid.value ? store.contextBySession[sid.value] : undefined));

/**
 * CH-B/L3：上下文用量是否**真的有数据**。
 *
 * 判据是 `context_max > 0`——没有分母就算不出百分比。缺数据时底栏整条隐藏，
 * 🚫 不渲染 0% 假环（`ctxPercentage` 的 `?? 0` 只是给 prop 一个合法数字，
 * 不代表「用量为零」，两者语义必须靠这个开关区分开）。
 */
const ctxAvailable = computed<boolean>(() => !!ctxRef.value && ctxRef.value.context_max > 0);
const ctxPercentage = computed(() => Math.round(ctxRef.value?.context_percent ?? 0));
const ctxUsed = computed(() => ctxRef.value?.context_used ?? 0);
const ctxMax = computed(() => ctxRef.value?.context_max ?? 0);

const sendMode = ref<'interrupt' | 'steer' | 'queue'>('queue');

// ── 底栏事件处理 ──
/**
 * CH-C：切换会话工作目录。
 *
 * 传 `null` 让 store 自己弹选择器（Electron 走原生对话框，web 走 prompt 兜底；
 * 用户取消时 store 内部静默 return）。改完 store 会乐观更新 `sessions`，
 * 会话列表分组随即重新归组，无需刷新页面。
 */
async function onChangeWorkspace(): Promise<void> {
  if (!sid.value) return;
  try {
    await store.setWorkspace(sid.value, null);
  } catch (e) {
    // 🚫 不吞异常：走 ChatView 既有的顶部 NAlert 错误条给可见反馈
    setLoadError('工作区设置失败', e, '设置工作区失败，请检查服务端连接');
  }
}

function onChangeMode(mode: HermesMode): void {
  if (sid.value) store.setMode(sid.value, mode);
}

/**
 * CH-D：Agent 角色可选列表（底栏下拉数据源）。
 *
 * 复用已装 Agent 清单 `realAgents`（`getAgents('installed')`，onMounted 拉一次），
 * 🚫 不另起接口、不造 mock 数据。
 */
const agentOptions = computed(() =>
  realAgents.value.map((a) => ({ label: a.name, key: a.id })),
);

/**
 * CH-D：切换当前会话绑定的 Agent 角色。
 *
 * 服务端只改 kmaster.db 侧车的 `agent` 列；store 内部做乐观更新 + 失败回滚，
 * 这里只负责把回滚后上抛的错误呈现给用户。
 *
 * ⚠️ `agentId === null` 是**合法入参**（底栏「默认角色（解除绑定）」项），
 * 不能当空值 early-return 掉——那会让「解除绑定」变成一个静默无反应的按钮。
 */
async function onChangeAgent(agentId: string | null): Promise<void> {
  if (!sid.value) return;
  try {
    await store.setSessionAgent(sid.value, agentId);
  } catch (e) {
    setLoadError('Agent 切换失败', e, '切换 Agent 失败，请检查服务端连接');
  }
}

function onChangeModel(model: string): void {
  if (sid.value && model) store.setModel(sid.value, model);
}

function onChangeSendMode(mode: 'interrupt' | 'steer' | 'queue'): void {
  sendMode.value = mode;
}

function onAddModel(): void {
  router.push('/settings/model');
}

// ── AgentTabBar 事件 ──

/**
 * E-1：Tab 选中。
 * - 主 agent → 无需额外操作（当前会话就是主 agent）
 * - 子代理 → 设置 activeAgentId 用于消息路由/过滤
 */
function onAgentSelect(agentId: string): void {
  const currentSid = sid.value;
  if (!currentSid) return;

  const mainAgentId = store.agentStates[currentSid];
  // 主 agent：无需操作（会话本身就是主 agent 的上下文）
  if (agentId === mainAgentId) return;

  // 子代理：设置活跃 ID 供消息过滤/路由使用
  store.activeAgentId = agentId;
}

/**
 * E-1：Tab 关闭。
 * - 关主 agent → store.setSessionAgent(sid, null)（解绑，回落默认角色）
 * - 关子代理 → 忽略（运行时子代理不可关闭）
 * - 数据不足判断 → 静默 return
 */
function onAgentClose(agentId: string): void {
  const currentSid = sid.value;
  if (!currentSid) return;

  const mainAgentId = store.agentStates[currentSid];

  // 关的是主 agent → 解绑
  if (agentId === mainAgentId) {
    void store.setSessionAgent(currentSid, null);
    return;
  }

  // 关的是子代理 → 忽略（closable: false，运行时事实不可关闭）
  const subagents = store.subagentsBySession[currentSid];
  if (subagents && agentId in subagents) {
    return;
  }

  // 无法判断 → 静默 return
}

// ── 提问历史 ──
const historyOpen = ref(false);
const recentMessages = computed(() => {
  if (!sid.value) return [];
  const msgs = store.messagesBySession[sid.value] ?? [];
  return msgs
    .filter((m) => m.role === 'user')
    .slice(-20)
    .reverse();
});

function scrollToMessage(msgId: string): void {
  historyOpen.value = false;
  const el = document.querySelector(`[data-msg-id="${msgId}"]`);
  el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// ── 生命周期 ──
onMounted(async () => {
  store.registerSocket();
  await loadSessionList();
  loadAgents();

  keyboardActions.createSession.value = () => store.createSession();
  keyboardActions.focusSearch.value = () => {};
});

onUnmounted(() => {
  keyboardActions.createSession.value = null;
  keyboardActions.focusSearch.value = null;
});

// ── 产出到达自动展开右栏（R-11 联动）──
watch(
  () => (store.activeSessionId ? store.artifactsBySession[store.activeSessionId]?.length ?? 0 : 0),
  (count) => {
    if (count > 0 && chatRightPanelMode.value === 'hidden') {
      chatRightPanelMode.value = 'artifacts';
    }
  },
);
</script>

<template>
  <div class="km-chatview">
    <!-- PageHeader：title + badge + 搜索 + 操作按钮 -->
    <PageHeader
      :title="title"
      search-placeholder="在对话中搜索…"
      @search="(q: string) => (searchQuery = q)"
    >
      <template #title-extra>
        <span v-if="sid && currentAgentName" class="km-header-badge km-header-agent">{{ currentAgentName }}</span>
        <span v-if="sid && currentModeLabel" class="km-header-badge km-header-mode">{{ currentModeLabel }}</span>
        <span v-if="sid && currentModelName" class="km-header-badge km-header-model">{{ currentModelName }}</span>
      </template>

      <template #actions>
        <!-- 分享 -->
        <n-button
          quaternary
          circle
          size="small"
          title="分享任务"
          @click="shareOpen = true"
        >
          <template #icon><KIcon name="Share" :size="18" /></template>
        </n-button>

        <!-- 大纲 -->
        <n-button
          quaternary
          circle
          size="small"
          title="会话大纲"
          @click="showOutlinePanel"
        >
          <template #icon><KIcon name="List" :size="18" /></template>
        </n-button>

        <!-- 提问历史 -->
        <n-popover
          :show="historyOpen"
          trigger="click"
          placement="bottom-end"
          @update:show="(v: boolean) => (historyOpen = v)"
        >
          <template #trigger>
            <n-button
              quaternary
              circle
              size="small"
              title="提问历史"
              @click="historyOpen = !historyOpen"
            >
              <template #icon><KIcon name="ScrollText" :size="16" /></template>
            </n-button>
          </template>
          <div class="km-history-popover">
            <div class="km-history-title">提问历史</div>
            <div v-if="!recentMessages.length" class="km-history-empty">暂无提问记录</div>
            <div
              v-for="msg in recentMessages"
              :key="msg.id"
              class="km-history-item"
              @click="scrollToMessage(msg.id)"
            >
              <span class="km-history-time">{{ new Date(msg.created_at).toLocaleTimeString() }}</span>
              <span class="km-history-text">{{ msg.content.slice(0, 60) }}{{ msg.content.length > 60 ? '…' : '' }}</span>
            </div>
          </div>
        </n-popover>

        <!-- 右栏开关 -->
        <n-button
          quaternary
          circle
          size="small"
          :title="chatRightPanelMode === 'hidden' ? '展开右栏' : '收起右栏'"
          @click="toggleChatRightPanel"
        >
          <template #icon><KIcon name="LayoutGrid" :size="16" /></template>
        </n-button>

        <!-- 停止 -->
        <button v-if="running" class="km-stop-btn" @click="sid && store.stop(sid)"><KIcon name="Square" :size="14" /> 停止</button>
      </template>
    </PageHeader>

    <!-- Agent 标签平铺栏（无会话或仅主 agent 时隐藏，避免冗余单 Tab 条） -->
    <AgentTabBar
      v-if="sid && agentTabs.length > 1"
      :agents="agentTabs"
      :active-agent-id="store.activeAgentId || currentAgentName"
      @select="onAgentSelect"
      @close="onAgentClose"
    />

    <!-- 主体区域：ChatPanel + 右侧栏 -->
    <div class="km-chat-body">
      <div class="km-chat-main">
        <!-- 错误态：会话列表 / 历史消息加载失败，横幅提示 + 重试 -->
        <n-alert
          v-if="loadError"
          class="km-chat-alert"
          type="error"
          :title="loadErrorTitle"
          closable
          @close="loadError = ''"
        >
          <div class="km-chat-alert-body">
            <span class="km-chat-alert-text">{{ loadError }}</span>
            <n-button v-if="loadErrorRetryable" size="tiny" tertiary @click="retryLoad">重试</n-button>
          </div>
        </n-alert>

        <!-- 载态：拉取会话列表 / 切换会话读取历史消息 -->
        <SkeletonList v-if="historyLoading" class="km-chat-state" />

        <!-- 空态：尚未选中任何会话 -->
        <EmptyState
          v-else-if="conversationEmpty"
          class="km-chat-state"
          icon="MessageCircle"
          title="开始一段新对话"
          :description="emptyDescription"
          action-label="新建会话"
          @action="handleCreateSession"
        />

        <!-- 正常态：消息区 + 输入框 -->
        <ChatPanel v-else :search="searchQuery" :send-mode="sendMode" />
      </div>

      <ChatRightPanel
        :mode="chatRightPanelMode"
        @close="chatRightPanelMode = 'hidden'"
      />
    </div>

    <!-- 底栏：会话配置状态栏 -->
    <SessionConfigBar
      :workspace="currentWorkspace"
      :mode="currentMode"
      :agent="currentAgent"
      :agent-options="agentOptions"
      :model="currentModel"
      :context-available="ctxAvailable"
      :context-percent="ctxPercentage"
      :context-used="ctxUsed"
      :context-max="ctxMax"
      :send-mode="sendMode"
      @change-workspace="onChangeWorkspace"
      @change-mode="onChangeMode"
      @change-agent="onChangeAgent"
      @change-model="onChangeModel"
      @change-send-mode="onChangeSendMode"
      @add-model="onAddModel"
    />

    <!-- 分享弹窗 -->
    <ShareDialog v-model:show="shareOpen" @open-share-panel="showSharePanel" />
  </div>
</template>

<style scoped>
.km-chatview {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
  flex: 1;
}

/* 主体：ChatPanel + 右侧栏 */
.km-chat-body {
  flex: 1;
  min-height: 0;
  display: flex;
}

/* 主体左列：错误横幅 + 三态区（载态 / 空态 / ChatPanel） */
.km-chat-main {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

/* 错误态横幅 */
.km-chat-alert {
  flex: 0 0 auto;
  margin: var(--km-space-sm) var(--km-space-lg) 0;
}

.km-chat-alert-body {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--km-space-sm);
}

.km-chat-alert-text {
  min-width: 0;
  word-break: break-word;
}

/* 载态 / 空态占位区：撑满 ChatPanel 原有空间 */
.km-chat-state {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

/* badge */
.km-header-badge {
  display: inline-flex;
  align-items: center;
  font-size: var(--km-font-xs);
  padding: 1px var(--km-space-6);
  border-radius: 999px;
  white-space: nowrap;
  font-weight: 500;
}

.km-header-agent {
  background: var(--km-agent-purple-bg);
  color: var(--km-agent-purple);
  border: 1px solid var(--km-agent-purple-border);
}

.km-header-mode {
  background: var(--km-accent-bg-strong);
  color: var(--km-accent);
  border: 1px solid var(--km-accent-border);
}

.km-header-model {
  background: var(--km-panel);
  color: var(--km-muted);
  border: 1px solid var(--km-border);
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* stop */
.km-stop-btn {
  background: var(--km-danger);
  color: var(--km-text-on-accent);
  border: none;
  border-radius: var(--km-radius-md);
  padding: var(--km-space-xs) var(--km-space-10);
  cursor: pointer;
  font-size: var(--km-font-sm);
  font-weight: 500;
}

/* history popover */
.km-history-popover {
  width: 300px;
  max-height: 360px;
  overflow-y: auto;
  padding: var(--km-space-sm);
}

.km-history-title {
  font-size: var(--km-font-sm);
  font-weight: 600;
  margin-bottom: 8px;
}

.km-history-empty {
  font-size: var(--km-font-sm);
  opacity: 0.5;
  text-align: center;
  padding: var(--km-space-md) 0;
}

.km-history-item {
  display: flex;
  gap: var(--km-space-sm);
  padding: var(--km-space-6) var(--km-space-xs);
  cursor: pointer;
  border-radius: var(--km-radius-sm);
  font-size: var(--km-font-sm);
  transition: background 0.12s ease;
}

.km-history-item:hover {
  background: var(--km-hover-bg);
}

.km-history-time {
  opacity: 0.45;
  white-space: nowrap;
  flex-shrink: 0;
}

.km-history-text {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
