<script setup lang="ts">
/**
 * RightPanel — 会话内右侧栏（T04）。
 *
 * 三态切换：share（分享配置）/ outline（会话大纲）/ artifacts（产物，默认）。
 * 样式上参照 layout/RightPanel.vue 的外壳结构。
 */
import { computed, ref } from 'vue';
import { NButton, NEmpty, useMessage } from 'naive-ui';
import { useChatStore } from '../../stores/chat';
import { CHAT_MODES, type HermesMode } from '../../types/chat';
import OutputPanel from './OutputPanel.vue';
import KIcon from '../common/KIcon.vue';

export type ChatRightPanelMode = 'hidden' | 'share' | 'outline' | 'artifacts';

const props = withDefaults(
  defineProps<{
    mode: ChatRightPanelMode;
  }>(),
  {
    mode: 'hidden' as ChatRightPanelMode,
  },
);

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'update:mode', mode: ChatRightPanelMode): void;
}>();

const store = useChatStore();
const message = useMessage();

const visible = computed<boolean>(() => props.mode !== 'hidden');

/** title 栏文案 */
const titleText = computed<string>(() => {
  switch (props.mode) {
    case 'share': {
      const sname = sessionTitle.value;
      return sname ? `分享配置 · ${sname}` : '分享配置';
    }
    case 'outline':
      return '会话大纲';
    case 'artifacts':
      return '任务产物';
    default:
      return '';
  }
});

/** 当前会话标题 */
const sessionTitle = computed(() => {
  if (!sid.value) return '';
  return store.sessions.find((s) => s.id === sid.value)?.title || '';
});

// ── 分享页：当前会话配置 JSON ──
const sid = computed(() => store.activeSessionId);

const sessionConfigJson = computed<string>(() => {
  if (!sid.value) return '{}';
  const session = store.sessions.find((s) => s.id === sid.value);
  const mode = store.modeBySession[sid.value] ?? store.globalSettings.default_mode;
  const model = store.modelBySession[sid.value] ?? store.globalSettings.default_model;
  const modeLabel = CHAT_MODES.find((m) => m.token === mode)?.label ?? mode;
  const skills = store.skills.filter((s) => s.enabled).map((s) => s.name);
  const mcpServers = store.mcpServers.filter((s) => s.status === 'connected').map((s) => s.name);

  const config = {
    title: session?.title ?? '',
    agent: session?.agent ?? 'default',
    mode: modeLabel,
    model: model || '未选择',
    workspace: session?.workspace ?? '',
    skills: skills,
    mcp_servers: mcpServers,
  };

  return JSON.stringify(config, null, 2);
});

async function copyConfig(): Promise<void> {
  try {
    await navigator.clipboard.writeText(sessionConfigJson.value);
    message.success('已复制配置到剪贴板');
  } catch {
    message.error('复制失败');
  }
}

// ── 大纲页：用户消息列表 ──
const userMessages = computed(() => {
  if (!sid.value) return [];
  const msgs = store.messagesBySession[sid.value] ?? [];
  return msgs
    .filter((m) => m.role === 'user')
    .slice()
    .reverse();
});

function scrollToMessage(msgId: string): void {
  const el = document.querySelector(`[data-msg-id="${msgId}"]`);
  el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function onClose(): void {
  emit('close');
}
</script>

<template>
  <aside v-if="visible" class="km-chat-right">
    <!-- title 栏 -->
    <div class="km-chat-right-head">
      <span class="km-chat-right-title">{{ titleText }}</span>
      <n-button quaternary circle size="tiny" title="关闭" @click="onClose">
        <template #icon><KIcon name="X" :size="16" /></template>
      </n-button>
    </div>

    <!-- 内容区 -->
    <div class="km-chat-right-body">
      <!-- 分享配置页 -->
      <div v-if="mode === 'share'" class="km-chat-right-scroll">
        <div class="km-share-section">
          <div class="km-share-actions">
            <n-button size="tiny" @click="copyConfig"><template #icon><KIcon name="Clipboard" :size="14" /></template>复制 JSON</n-button>
          </div>
          <pre class="km-share-json">{{ sessionConfigJson }}</pre>
        </div>
      </div>

      <!-- 大纲页 -->
      <div v-else-if="mode === 'outline'" class="km-chat-right-scroll">
        <div v-if="!userMessages.length" class="km-outline-empty">
          <n-empty size="small" description="暂无提问记录" />
        </div>
        <div
          v-for="msg in userMessages"
          :key="msg.id"
          class="km-outline-item"
          @click="scrollToMessage(msg.id)"
        >
          <span class="km-outline-time">{{ new Date(msg.created_at).toLocaleTimeString() }}</span>
          <span class="km-outline-text">
            {{ msg.content.slice(0, 80) }}{{ msg.content.length > 80 ? '…' : '' }}
          </span>
        </div>
      </div>

      <!-- 产物标签页（默认） -->
      <div v-else-if="mode === 'artifacts'" class="km-chat-right-output">
        <OutputPanel />
      </div>
    </div>
  </aside>
</template>

<style scoped>
.km-chat-right {
  display: flex;
  flex-direction: column;
  width: 360px;
  min-width: 280px;
  max-width: 480px;
  height: 100%;
  background: var(--km-panel);
  border-left: 1px solid var(--km-border);
  overflow: hidden;
  flex-shrink: 0;
}

.km-chat-right-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 40px;
  padding: 0 8px 0 12px;
  border-bottom: 1px solid var(--km-border);
  flex-shrink: 0;
}

.km-chat-right-title {
  font-size: 13px;
  font-weight: 600;
}

.km-chat-right-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.km-chat-right-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px;
}

.km-chat-right-output {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* ── 分享页 ── */
.km-share-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.km-share-actions {
  display: flex;
  gap: 6px;
}

.km-share-json {
  background: var(--km-bg);
  border: 1px solid var(--km-border);
  border-radius: 6px;
  padding: 10px;
  font-size: 12px;
  font-family: 'SFMono-Regular', Consolas, 'Cascadia Mono', Menlo, monospace;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
  color: var(--km-text);
  user-select: all;
}

/* ── 大纲页 ── */
.km-outline-empty {
  padding: 24px 0;
}

.km-outline-item {
  display: flex;
  gap: 8px;
  padding: 6px 4px;
  cursor: pointer;
  border-radius: 4px;
  font-size: 12px;
  transition: background 0.12s ease;
}

.km-outline-item:hover {
  background: rgba(255, 255, 255, 0.05);
}

.km-outline-time {
  opacity: 0.45;
  white-space: nowrap;
  flex-shrink: 0;
  font-size: 11px;
}

.km-outline-text {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ── 滚动条 ── */
.km-chat-right-scroll::-webkit-scrollbar {
  width: 6px;
}

.km-chat-right-scroll::-webkit-scrollbar-track {
  background: transparent;
}

.km-chat-right-scroll::-webkit-scrollbar-thumb {
  background: var(--km-border);
  border-radius: 3px;
}

.km-chat-right-scroll::-webkit-scrollbar-thumb:hover {
  background: var(--km-muted);
}
</style>
