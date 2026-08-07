<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import type { Message } from '../../types/chat';
import { useChatStore } from '../../stores/chat';
import { useMessage } from 'naive-ui';
import AgentMarkdown from './AgentMarkdown.vue';
import ThoughtBlock from './ThoughtBlock.vue';
import ToolCallCard from './ToolCallCard.vue';
import ApprovalCard from './ApprovalCard.vue';
import ClarifyCard from './ClarifyCard.vue';
import PlanCard from './PlanCard.vue';
import SubagentCard from './SubagentCard.vue';

const props = defineProps<{ message: Message; sessionId: string | null }>();
const store = useChatStore();
const toast = useMessage();

const approvals = computed(() =>
  props.sessionId ? (store.pendingApprovals[props.sessionId] || []).filter((a) => a.session_id === props.sessionId) : []
);
const clarifies = computed(() =>
  props.sessionId ? (store.pendingClarifies[props.sessionId] || []).filter((c) => c.session_id === props.sessionId) : []
);
const plans = computed(() =>
  props.sessionId ? (store.pendingPlans[props.sessionId] || []).filter((p) => p.session_id === props.sessionId) : []
);

// —— P0 #1：子代理卡片 ——
const subagents = computed(() => {
  const group = props.sessionId ? store.subagentsBySession[props.sessionId] : undefined;
  return group ? Object.values(group) : [];
});

// —— P0 #6：消息时间戳格式化 ——
function formatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const time = `${hh}:${mm}`;

  const isToday =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (isToday) return time;

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday =
    d.getFullYear() === yesterday.getFullYear() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getDate() === yesterday.getDate();
  if (isYesterday) return `昨天 ${time}`;

  const MM = String(d.getMonth() + 1).padStart(2, '0');
  const DD = String(d.getDate()).padStart(2, '0');
  return `${MM}-${DD} ${time}`;
}

// —— F19 P1：把消息文本中的 @<path> 解析为可点击芯片（仅用户消息）——
const AT_RE = /@(\S+)/g;
const segments = computed<{ type: 'text' | 'file'; value: string }[] | null>(() => {
  if (props.message.role !== 'user') return null;
  const content = props.message.content ?? '';
  const out: { type: 'text' | 'file'; value: string }[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  AT_RE.lastIndex = 0;
  while ((m = AT_RE.exec(content))) {
    if (m.index > last) out.push({ type: 'text', value: content.slice(last, m.index) });
    out.push({ type: 'file', value: m[1] });
    last = m.index + m[0].length;
  }
  if (last < content.length) out.push({ type: 'text', value: content.slice(last) });
  return out;
});

function copyPath(p: string) {
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(p).then(
      () => toast.success('已复制路径'),
      () => toast.info(p),
    );
  } else {
    toast.info(p);
  }
}

// —— V4：提取消息中的代码块内容 ——
function extractCodeBlocks(content: string): string[] {
  const blocks: string[] = [];
  const re = /```[\s\S]*?\n([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content))) {
    blocks.push(m[1]);
  }
  return blocks;
}
const hasCodeBlocks = computed(() => {
  return /```[\s\S]*?\n[\s\S]*?```/.test(props.message.content ?? '');
});

// —— P1 #11：复制消息内容 ——
function copyMessage() {
  const content = props.message.content ?? '';
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(content).then(
      () => toast.success('已复制'),
      () => toast.warning('复制失败'),
    );
  } else {
    toast.warning('剪贴板不可用');
  }
}

// —— V4：仅复制消息中所有代码块 —���
function copyAllCode() {
  const blocks = extractCodeBlocks(props.message.content ?? '');
  if (!blocks.length) {
    toast.warning('消息中无代码块');
    return;
  }
  const combined = blocks.join('\n\n');
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(combined).then(
      () => toast.success(`已复制 ${blocks.length} 个代码块`),
      () => toast.warning('复制失败'),
    );
  } else {
    toast.warning('剪贴板不可用');
  }
}

// —— P1 #12：编辑用户消息 ——
function startEdit() {
  store.editingMessage = props.message;
}

// —— P1 #16：重发错误消息 ——
function retryMessage() {
  store.resendMessage(props.message);
}

// —— P1 #16：是否为错误状态 ——
const isError = computed(() => props.message.status === 'error');

// —— V4：是否为当前会话最后一条 assistant 消息 ——
const isLastAssistant = computed(() => {
  if (props.message.role !== 'assistant') return false;
  if (!props.sessionId) return false;
  const msgs = store.messagesBySession[props.sessionId];
  if (!msgs || !msgs.length) return false;
  // 找出当前 session 最后一条 assistant 消息
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].role === 'assistant') {
      return msgs[i].id === props.message.id;
    }
  }
  return false;
});

// —— V4：重新生成（以当前消息之前的内容重新发送）——
function regenerate() {
  if (!props.sessionId) return;
  const sid = props.sessionId;
  const msgs = store.messagesBySession[sid];
  if (!msgs) return;
  // 找到当前消息位置，取之前的所有用户消息内容，重新发送最后一条用户消息
  const idx = msgs.findIndex((m) => m.id === props.message.id);
  if (idx < 0) return;
  // 向前查找最近一条用户消息
  let lastUserContent = '';
  for (let i = idx - 1; i >= 0; i--) {
    if (msgs[i].role === 'user' && !msgs[i].guidance) {
      lastUserContent = msgs[i].content;
      break;
    }
  }
  if (!lastUserContent) {
    toast.warning('未找到可重新生成的消息');
    return;
  }
  store.resendMessage({ ...msgs[idx], content: lastUserContent });
}

// —— V4：消息右键菜单 ——
interface MsgContextMenu {
  x: number;
  y: number;
}
const msgMenu = ref<MsgContextMenu | null>(null);

function onMsgContextMenu(e: MouseEvent) {
  e.preventDefault();
  msgMenu.value = { x: e.clientX, y: e.clientY };
}
function closeMsgMenu() {
  msgMenu.value = null;
}
function onMsgMenuAction(action: string) {
  closeMsgMenu();
  switch (action) {
    case 'copy':
      copyMessage();
      break;
    case 'copyCode':
      copyAllCode();
      break;
    case 'regenerate':
      regenerate();
      break;
  }
}

function onGlobalClickMsg(e: MouseEvent) {
  if (msgMenu.value) closeMsgMenu();
}
onMounted(() => document.addEventListener('click', onGlobalClickMsg, true));
onUnmounted(() => document.removeEventListener('click', onGlobalClickMsg, true));
</script>

<template>
  <!-- P1 #17：消息出现动画 -->
  <Transition name="msg-slide" appear>
    <div
      class="km-msg"
      :class="[message.role, { 'km-msg-error': isError }]"
      @contextmenu="onMsgContextMenu"
    >
      <div class="km-msg-bubble" :class="{ guidance: message.guidance }">
        <!-- 用户消息：渲染 @文件 芯片 -->
        <template v-if="message.role === 'user'">
          <template v-if="segments">
            <template v-for="(seg, i) in segments" :key="i">
              <span v-if="seg.type === 'text'" class="km-seg-text">{{ seg.value }}</span>
              <button v-else class="km-file-chip" :title="seg.value" @click="copyPath(seg.value)">📄 {{ seg.value }}</button>
            </template>
          </template>
          <div v-else>{{ message.content }}</div>
        </template>

        <template v-else>
          <ThoughtBlock v-if="message.reasoning" :text="message.reasoning" />
          <ToolCallCard v-for="t in message.toolCalls" :key="t.id" :tool="t" />
          <AgentMarkdown :source="message.content" />
        </template>

        <ApprovalCard
          v-for="a in approvals"
          :key="a.approval_id"
          :req="a"
          @respond="(c: string) => store.approve(sessionId!, a.approval_id, c as any)"
        />
        <ClarifyCard
          v-for="c in clarifies"
          :key="c.clarify_id"
          :req="c"
          @respond="(r: string) => store.clarify(sessionId!, c.clarify_id, r)"
        />
        <PlanCard
          v-for="p in plans"
          :key="p.plan_id"
          :req="p"
          @respond="(c: string) => store.respondPlan(sessionId!, p.plan_id, c as any)"
        />

        <!-- P0 #6：消息时间戳 -->
        <span class="km-msg-time">{{ formatTime(message.created_at) }}</span>

        <!-- P1 #11：助手消息复制按钮（hover 显示） -->
        <button
          v-if="message.role === 'assistant'"
          class="km-msg-copy"
          title="复制"
          @click="copyMessage"
        >📋</button>

        <!-- P1 #12：用户消息编辑按钮（hover 显示） -->
        <button
          v-if="message.role === 'user' && !message.guidance"
          class="km-msg-edit"
          title="编辑消息"
          @click="startEdit"
        >✎</button>

        <!-- P1 #16：错误态重试按钮 -->
        <button
          v-if="isError"
          class="km-msg-retry"
          title="重试"
          @click="retryMessage"
        >↻ 重试</button>
      </div>

      <!-- P1 #16：错误态提示 -->
      <div v-if="isError" class="km-msg-error-tip">
        <span>⚠ 发送失败，点击重试</span>
      </div>

      <!-- P0 #1：子代理卡片（仅助手消息下方渲染） -->
      <div v-if="message.role === 'assistant' && subagents.length" class="km-subagents">
        <SubagentCard v-for="sub in subagents" :key="sub.subagent_id" :subagent="sub" />
      </div>
    </div>
  </Transition>

  <!-- V4：消息右键上下文菜单 -->
  <Teleport to="body">
    <div
      v-if="msgMenu"
      class="km-msg-context-menu"
      :style="{ left: msgMenu.x + 'px', top: msgMenu.y + 'px' }"
      @click.stop
    >
      <button class="km-cm-item" @click="onMsgMenuAction('copy')">
        📋 复制文本
      </button>
      <button
        v-if="hasCodeBlocks"
        class="km-cm-item"
        @click="onMsgMenuAction('copyCode')"
      >
        📝 复制代码
      </button>
      <button
        v-if="message.role === 'assistant' && isLastAssistant"
        class="km-cm-item"
        @click="onMsgMenuAction('regenerate')"
      >
        🔄 重新生成
      </button>
    </div>
  </Teleport>
</template>

<style scoped>
.km-msg { display: flex; flex-direction: column; }
.km-msg.user { align-items: flex-end; }
.km-msg.assistant { align-items: flex-start; }
.km-msg-bubble {
  max-width: 80%;
  padding: var(--km-space-sm) var(--km-space-md);
  line-height: 1.6;
  font-size: 14px;
  min-width: 0;
  position: relative;
}
.km-seg-text { white-space: pre-wrap; word-break: break-word; }
.km-file-chip {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  margin: 0 2px;
  background: var(--km-file-chip-bg);
  border: 1px solid var(--km-accent);
  color: var(--km-accent);
  border-radius: 6px;
  padding: 1px 8px;
  font-size: 13px;
  cursor: pointer;
  max-width: 280px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: bottom;
}
.km-file-chip:hover { filter: brightness(1.15); }
.km-msg.user .km-msg-bubble {
  background: var(--km-user-bubble);
  border: 1px solid var(--km-border-light);
  border-radius: var(--km-radius-lg) var(--km-radius-sm) var(--km-radius-lg) var(--km-radius-lg);
}
.km-msg.user .km-msg-bubble.guidance {
  opacity: 0.7;
  font-style: italic;
}
.km-msg.assistant .km-msg-bubble {
  background: var(--km-panel);
  border: 1px solid var(--km-border);
  border-radius: var(--km-radius-sm) var(--km-radius-lg) var(--km-radius-lg) var(--km-radius-lg);
  width: 100%;
}

/* P0 #6：消息时间戳 */
.km-msg-time {
  display: block;
  font-size: 11px;
  color: var(--km-muted);
  margin-top: 4px;
  text-align: right;
}

/* P0 #1：子代理卡片容器 */
.km-subagents {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
  width: 100%;
}

/* ═══════════ P1 #11：复制按钮 ═══════════ */
.km-msg-copy {
  position: absolute;
  top: 6px;
  right: 8px;
  background: var(--km-hover-bg);
  border: 1px solid var(--km-border);
  color: var(--km-muted);
  border-radius: 4px;
  padding: 2px 6px;
  font-size: 12px;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s ease;
}
.km-msg-bubble:hover .km-msg-copy {
  opacity: 1;
}
.km-msg-copy:hover {
  background: var(--km-accent-bg);
  color: var(--km-accent);
  border-color: var(--km-accent);
}

/* ═══════════ P1 #12：编辑按钮 ═══════════ */
.km-msg-edit {
  position: absolute;
  top: 6px;
  right: 8px;
  background: var(--km-hover-bg);
  border: 1px solid var(--km-border);
  color: var(--km-muted);
  border-radius: 4px;
  padding: 2px 6px;
  font-size: 12px;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s ease;
}
.km-msg-bubble:hover .km-msg-edit {
  opacity: 1;
}
.km-msg-edit:hover {
  background: var(--km-accent-bg);
  color: var(--km-accent);
  border-color: var(--km-accent);
}

/* ═══════════ P1 #16：错误态 ═══════════ */
.km-msg-error .km-msg-bubble {
  border-left: 3px solid var(--km-danger) !important;
}
.km-msg-retry {
  display: block;
  margin-top: 6px;
  background: transparent;
  border: 1px solid var(--km-danger);
  color: var(--km-danger);
  border-radius: 4px;
  padding: 2px 10px;
  font-size: 12px;
  cursor: pointer;
}
.km-msg-retry:hover {
  background: var(--km-danger-bg);
}
.km-msg-error-tip {
  font-size: 11px;
  color: var(--km-danger);
  margin-top: 4px;
  text-align: right;
}

/* ═══════════ P1 #17：消息出现动画 ═══════════ */
.msg-slide-enter-from {
  opacity: 0;
  transform: translateY(12px);
}
.msg-slide-enter-active {
  transition: all 0.25s ease-out;
}
.msg-slide-leave-active {
  transition: all 0.15s ease-in;
}
.msg-slide-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

/* V4：消息右键上下文菜单 */
.km-msg-context-menu {
  position: fixed;
  z-index: 9999;
  background: var(--km-panel);
  border: 1px solid var(--km-border);
  border-radius: 8px;
  padding: 4px;
  min-width: 160px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
}
.km-cm-item {
  display: block;
  width: 100%;
  text-align: left;
  background: transparent;
  border: none;
  color: var(--km-text);
  font-size: 13px;
  padding: 8px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.12s ease;
}
.km-cm-item:hover { background: var(--km-hover-bg); }
</style>
