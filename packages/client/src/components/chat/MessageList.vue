<script setup lang="ts">
/**
 * MessageList — 消息列表（UI 重设计 T05 微调）。
 *
 * 新增：Agent 角色标签可点击过滤（prop: agentFilter）
 * 新增：对话内搜索定位（prop: search，来自 ChatView PageHeader 搜索框）
 */
import { ref, computed, watch, nextTick } from 'vue';
import KIcon from '../common/KIcon.vue';
import { useChatStore } from '../../stores/chat';
import { isDesktop } from '../../utils/desktop-bridge';
import MessageItem from './MessageItem.vue';
import EmptyState from '../common/EmptyState.vue';

const props = withDefaults(defineProps<{
  agentFilter?: string | null;
  /** 对话内搜索关键词：命中后滚动定位到首条消息。 */
  search?: string;
}>(), {
  agentFilter: null,
  search: '',
});

const store = useChatStore();
const sid = computed(() => store.activeSessionId);
const allMessages = computed(() => (sid.value ? store.messagesBySession[sid.value] || [] : []));

// ── Agent 过滤 ──
const messages = computed(() => {
  const rawMessages = allMessages.value;
  if (!props.agentFilter) return rawMessages;
  const filtered = rawMessages.filter((m) => {
    if (props.agentFilter === 'default') {
      return !(m as any).agentId || (m as any).agentId === 'default';
    }
    return (m as any).agentId === props.agentFilter;
  });
  return filtered;
});

// ── 自动滚动 ──
const scrollContainer = ref<HTMLElement | null>(null);
const showScrollBtn = ref(false);

function isNearBottom(): boolean {
  const el = scrollContainer.value;
  if (!el) return true;
  return el.scrollHeight - el.scrollTop - el.clientHeight < 100;
}

function scrollToBottom() {
  const el = scrollContainer.value;
  if (!el) return;
  el.scrollTop = el.scrollHeight;
}

watch(
  () => allMessages.value.length,
  () => {
    nextTick(() => {
      if (isNearBottom() || allMessages.value.length <= 1) {
        scrollToBottom();
      }
    });
  },
);

watch(
  () => {
    const msgs = allMessages.value;
    if (!msgs.length) return '';
    const last = msgs[msgs.length - 1];
    return last.content + (last.reasoning ?? '');
  },
  () => {
    nextTick(() => {
      if (isNearBottom()) scrollToBottom();
    });
  },
);

function onScroll() {
  showScrollBtn.value = !isNearBottom();
}

// ── 对话内搜索：滚动定位首条命中 ──
function scrollToFirstMatch(q: string): void {
  const query = (q ?? '').trim().toLowerCase();
  if (!query) return;
  const hit = allMessages.value.find((m) => (m.content ?? '').toLowerCase().includes(query));
  if (!hit) return;
  nextTick(() => {
    const el = document.querySelector(`[data-msg-id="${hit.id}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
}

watch(
  () => props.search,
  (q) => scrollToFirstMatch(q)
);

// ── 压缩横幅 ──
const compression = computed(() => (sid.value ? store.compressionBySession[sid.value] : undefined));
function dismissCompression() {
  if (sid.value) store.dismissCompression(sid.value);
}

// ── 多端镜像 ──
const mirrored = computed(() => !!sid.value && !!store.mirroredBySession[sid.value]);
const peerLabel = computed(() => (isDesktop() ? '网页端' : '桌面端'));
function dismissMirror() {
  if (sid.value) store.dismissMirror(sid.value);
}

// ── 流式输出指示器 ──
const running = computed(() => !!sid.value && store.runState[sid.value] === 'running');
const lastIsAssistant = computed(() => {
  const msgs = allMessages.value;
  if (!msgs.length) return false;
  return msgs[msgs.length - 1].role === 'assistant';
});
const showStreaming = computed(() => running.value && lastIsAssistant.value);
</script>

<template>
  <div
    ref="scrollContainer"
    class="km-msglist"
    role="log"
    aria-live="polite"
    @scroll="onScroll"
  >
    <!-- 压缩横幅 -->
    <div v-if="compression && compression.phase === 'completed'" class="km-compression-banner">
      <span>
        上下文已压缩
        <template v-if="compression.tokens_before !== undefined && compression.tokens_after !== undefined">
          ，节省 {{ (compression.tokens_before - compression.tokens_after).toLocaleString() }} tokens
        </template>
        <template v-if="compression.compression_count !== undefined">
          （第 {{ compression.compression_count }} 次压缩）
        </template>
      </span>
      <button class="km-compression-dismiss" @click="dismissCompression" title="关闭" aria-label="关闭压缩提示"><KIcon name="X" :size="14" /></button>
    </div>

    <!-- 多端镜像 -->
    <div v-if="mirrored" class="km-mirror-banner" role="status">
      <span class="km-mirror-dot"></span>
      <span class="km-mirror-text">镜像中：{{ peerLabel }}正在该会话运行，以下内容为实时同步</span>
      <button class="km-mirror-dismiss" @click="dismissMirror" title="收起" aria-label="收起镜像提示"><KIcon name="X" :size="14" /></button>
    </div>

    <!-- 消息列表（带过渡动画） -->
    <transition-group name="km-msg-fade" tag="div" class="km-msglist-inner">
      <MessageItem
        v-for="m in messages"
        :key="m.id"
        :message="m"
        :session-id="sid"
        :data-msg-id="m.id"
      />
    </transition-group>

    <!-- 流式输出指示器 -->
    <div v-if="showStreaming" class="km-streaming">
      <span class="km-streaming-dot"></span>
      <span>正在生成…</span>
    </div>

    <!-- 空状态 -->
    <EmptyState
      v-if="!allMessages.length"
      icon="Message"
      title="开始新对话"
      description="输入您的问题开始与 Agent 对话"
    />

    <!-- 滚动到底部按钮 -->
    <button v-if="showScrollBtn" class="km-scroll-btn" @click="scrollToBottom" title="滚动到底部" aria-label="滚动到消息底部">
      <KIcon name="ArrowDown" :size="14" /> 滚动到底部
    </button>
  </div>
</template>

<style scoped>
.km-msglist {
  flex: 1;
  overflow: auto;
 padding: var(--km-space-lg);
  display: flex;
  flex-direction: column;
  gap: var(--km-space-14);
  position: relative;
}

.km-msglist-inner {
  display: flex;
  flex-direction: column;
  gap: var(--km-space-14);
}

/* ── 消息过渡动画 ── */
.km-msg-fade-enter-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}

.km-msg-fade-leave-active {
  transition: opacity 0.2s ease;
}

.km-msg-fade-enter-from {
  opacity: 0;
  transform: translateY(8px);
}

.km-msg-fade-leave-to {
  opacity: 0;
}

/* 压缩横幅 */
.km-compression-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--km-space-sm);
  background: rgba(59, 130, 246, 0.12);
  border: 1px solid var(--km-accent);
  border-radius: var(--km-radius-lg);
  padding: var(--km-space-sm) var(--km-space-md);
  font-size: var(--km-font-sm);
  color: var(--km-text);
}

.km-compression-dismiss {
  background: none;
  border: none;
  color: var(--km-muted);
  cursor: pointer;
  font-size: var(--km-font-lg);
  line-height: 1;
  padding: 0 var(--km-space-2xs);
}

.km-compression-dismiss:hover { color: var(--km-text); }

/* 多端镜像 */
.km-mirror-banner {
  display: flex;
  align-items: center;
  gap: var(--km-space-sm);
  background: var(--km-panel);
  border: 1px dashed var(--km-border);
  border-radius: var(--km-radius-lg);
  padding: var(--km-space-6) var(--km-space-md);
  font-size: var(--km-font-sm);
  color: var(--km-muted);
}


.km-mirror-text { flex: 1; min-width: 0; }
.km-mirror-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--km-muted);
  flex: none;
  animation: km-pulse 1.6s ease-in-out infinite;
}

.km-mirror-dismiss {
  background: none;
  border: none;
  color: var(--km-muted);
  cursor: pointer;
  font-size: var(--km-font-base);
  line-height: 1;
  padding: 0 var(--km-space-2xs);
  flex: none;
}

.km-mirror-dismiss:hover { color: var(--km-text); }

/* 流式输出指示器 */
.km-streaming {
  display: flex;
  align-items: center;
  gap: var(--km-space-sm);
  font-size: var(--km-font-sm);
  color: var(--km-muted);
  padding: var(--km-space-6) 0;
}

.km-streaming-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--km-accent);
  animation: km-pulse 1.2s ease-in-out infinite;
}

/* 滚动按钮 */
.km-scroll-btn {
  position: sticky;
  bottom: 16px;
  align-self: center;
  z-index: 10;
  background: var(--km-accent);
  color: #fff;
  border: none;
  border-radius: 20px;
  padding: var(--km-space-6) var(--km-space-lg);
  font-size: var(--km-font-sm);
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  opacity: 0.9;
  transition: opacity 0.15s;
  margin-top: auto;
}

.km-scroll-btn:hover { opacity: 1; }

@keyframes km-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
}
</style>
