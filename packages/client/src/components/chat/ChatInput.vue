<script setup lang="ts">
/**
 * ChatInput — 精简输入核心（T04 重写）+ T03 增强。
 *
 * 结构：「+」菜单（文件/Skills/MCP）+ textarea + 附件 chips + 语音按钮 + sendMode dropdown + 发送按钮。
 * Agent 标签栏 → ChatView AgentTabBar；底栏配置 → SessionConfigBar。
 *
 * 保留 emit 接口：send / attach / toggle-skill / toggle-mcp（ChatPanel 兼容）。
 * T03 新增：NTag chips、文件缩略图、更多{N}聚合、语音输入、可配置快捷键、sendMode dropdown。
 */
import { ref, computed, watch } from 'vue';
import {
  NButton,
  NPopover,
  NCheckbox,
  NTag,
  NDropdown,
  useMessage,
} from 'naive-ui';
import { useChatStore } from '../../stores/chat';
import { useI18n } from '../../composables/useI18n';
import KIcon from '../common/KIcon.vue';

const store = useChatStore();
const { t } = useI18n();
const message = useMessage();

const text = ref('');
const fileInput = ref<HTMLInputElement | null>(null);
const dragging = ref(false);

const sid = computed(() => store.activeSessionId);
const running = computed(() => !!sid.value && store.runState[sid.value] === 'running');
const uploads = computed(() => (sid.value ? (store.uploads[sid.value] ?? []) : []));

// ── 编辑消息 ──
const isEditing = computed(() => !!store.editingMessage);
const editingPlaceholder = t('chat.editPlaceholder');

watch(
  () => store.editingMessage,
  (msg) => {
    if (msg) text.value = msg.content;
  },
  { immediate: false },
);

function cancelEdit(): void {
  store.clearEditingMessage();
  text.value = '';
}

// ── 工具函数 ──

/** 判断文件名是否为图片 */
function isImage(name: string): boolean {
  return /\.(png|jpg|jpeg|gif|webp|svg)$/i.test(name);
}

// ── 附件 chips（文件 / Skills / MCP）──
interface ChipItem {
  type: 'skill' | 'mcp' | 'file';
  id: string;
  name: string;
  /** 图片文件的对象 URL，用于缩略图预览 */
  url?: string;
}
const chips = ref<ChipItem[]>([]);

// ── Skills / MCP 勾选状态（+ 菜单内）──
const selectedSkills = ref<Set<string>>(new Set());
const selectedMcp = ref<Set<string>>(new Set());

function toggleSkill(name: string): void {
  if (selectedSkills.value.has(name)) {
    selectedSkills.value.delete(name);
    chips.value = chips.value.filter((c) => !(c.type === 'skill' && c.id === name));
  } else {
    selectedSkills.value.add(name);
    chips.value.push({ type: 'skill', id: name, name });
  }
}

function toggleMcp(name: string): void {
  if (selectedMcp.value.has(name)) {
    selectedMcp.value.delete(name);
    chips.value = chips.value.filter((c) => !(c.type === 'mcp' && c.id === name));
  } else {
    selectedMcp.value.add(name);
    chips.value.push({ type: 'mcp', id: name, name });
  }
}

function removeChip(idx: number): void {
  const c = chips.value[idx];
  if (!c) return;
  if (c.type === 'skill') selectedSkills.value.delete(c.id);
  if (c.type === 'mcp') selectedMcp.value.delete(c.id);
  // 释放图片对象 URL
  if (c.url) URL.revokeObjectURL(c.url);
  chips.value.splice(idx, 1);
}

// ── 文件上传 ──
function onFiles(e: Event): void {
  const input = e.target as HTMLInputElement;
  const files = Array.from(input.files ?? []);
  void attachFiles(files);
  input.value = '';
}

async function attachFiles(files: File[]): Promise<void> {
  if (!sid.value) return;
  for (const f of files) {
    const MAX_FILES = 5;
    const existingFileChips = chips.value.filter((c) => c.type === 'file');
    if (existingFileChips.length >= MAX_FILES) {
      break;
    }
    await store.uploadFile(sid.value, f).catch(() => {});
    const url = f.type.startsWith('image/') ? URL.createObjectURL(f) : undefined;
    chips.value.push({ type: 'file', id: f.name + Date.now(), name: f.name, url });
  }
}

function onDrop(e: DragEvent): void {
  dragging.value = false;
  const files = Array.from(e.dataTransfer?.files ?? []);
  void attachFiles(files);
}

function removeUpload(idx: number): void {
  if (!sid.value) return;
  const arr = store.uploads[sid.value];
  if (arr) arr.splice(idx, 1);
}

// ── 「+」菜单 ──
const plusOpen = ref(false);

// ── 发送 ──
function send(): void {
  const t = text.value.trim();
  if (!t) return;

  if (store.editingMessage) {
    store.editingMessage = { ...store.editingMessage, content: t };
    store.resendMessage(store.editingMessage);
    text.value = '';
    return;
  }

  // 拼装 chips 文本
  const chipText = chips.value.length
    ? chips.value.map((c) => `[${c.type}:${c.name}]`).join(' ')
    : '';
  const fullText = chipText ? `${chipText}\n${t}` : t;

  store.sendMessage(fullText);
  text.value = '';
  // 释放所有图片对象 URL
  for (const c of chips.value) {
    if (c.url) URL.revokeObjectURL(c.url);
  }
  chips.value = [];
  selectedSkills.value.clear();
  selectedMcp.value.clear();
}

/** 可配置快捷键：读取 localStorage 的 km_send_shortcut，默认 Enter */
function onKey(e: KeyboardEvent): void {
  const shortcut = localStorage.getItem('km_send_shortcut') || 'Enter';

  if (shortcut === 'Ctrl+Enter') {
    // Ctrl+Enter（或 macOS Cmd+Enter）发送，Enter 单独换行
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      send();
    }
  } else {
    // 默认 Enter 发送（不含 Shift/Ctrl/Meta）
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      send();
    }
  }
}

// ── 附件（uploads）──
function onFileInputClick(): void {
  fileInput.value?.click();
}

/** 已选文件 chips，超过 5 个只显示前 5 个 */
const visibleFileChips = computed<ChipItem[]>(() => {
  const fileChips = chips.value.filter((c) => c.type === 'file');
  return fileChips.slice(0, 5);
});

const extraFileCount = computed<number>(() => {
  const fileChips = chips.value.filter((c) => c.type === 'file');
  return Math.max(0, fileChips.length - 5);
});

// ── 语音输入（K02.1）──
const SpeechRecognitionAPI =
  (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
const recognition = SpeechRecognitionAPI ? new SpeechRecognitionAPI() : null;
const isListening = ref(false);

function onVoiceClick(): void {
  if (!recognition) {
    message.warning('浏览器不支持语音输入');
    return;
  }
  if (isListening.value) {
    recognition.stop();
    return;
  }
  recognition.lang = 'zh-CN';
  recognition.interimResults = false;
  recognition.onresult = (e: any) => {
    text.value += e.results[0][0].transcript;
  };
  recognition.onend = () => {
    isListening.value = false;
  };
  recognition.onerror = () => {
    isListening.value = false;
  };
  recognition.start();
  isListening.value = true;
}

// ── sendMode dropdown（K01.6c）──
const props = withDefaults(
  defineProps<{
    sendMode?: 'interrupt' | 'steer' | 'queue';
  }>(),
  { sendMode: 'queue' },
);

const emit = defineEmits<{
  (e: 'change-send-mode', mode: 'interrupt' | 'steer' | 'queue'): void;
}>();

const sendModeOptions = [
  { label: '📋 Queue', key: 'queue' as const },
  { label: '⏸ Interrupt', key: 'interrupt' as const },
  { label: '🎯 Steer', key: 'steer' as const },
];

const sendModeLabel = computed(() => {
  const opt = sendModeOptions.find((o) => o.key === props.sendMode);
  return opt?.label ?? '📋 Queue';
});

function onSelectSendMode(key: string): void {
  emit('change-send-mode', key as 'interrupt' | 'steer' | 'queue');
}
</script>

<template>
  <div
    class="km-input"
    :class="{ 'km-input-drag': dragging, 'km-input-editing': isEditing }"
    @dragover.prevent="dragging = true"
    @dragleave.prevent="dragging = false"
    @drop.prevent="onDrop"
  >
    <!-- 编辑提示条 -->
    <div v-if="isEditing" class="km-editing-bar">
      <span class="km-editing-label">{{ t('chat.editing') }}</span>
      <button class="km-editing-cancel" @click="cancelEdit">{{ t('chat.cancelEdit') }}</button>
    </div>

    <!-- 输入主体 -->
    <div class="km-input-body">
      <!-- 附件 chips 行（T03: NTag 替换） -->
      <div v-if="chips.length" class="km-input-chips">
        <n-tag
          v-for="(c, i) in chips"
          :key="`${c.type}-${c.id}-${i}`"
          closable
          size="small"
          @close="removeChip(i)"
        >
          <template v-if="c.type === 'file' && isImage(c.name) && c.url">
            <img class="km-chip-img" :src="c.url" width="40" height="40" alt="" />
          </template>
          <KIcon v-if="c.type === 'skill'" name="Puzzle" :size="14" />
          <KIcon v-else-if="c.type === 'mcp'" name="PlugConnected" :size="14" />
          <KIcon v-else-if="isImage(c.name)" name="Photo" :size="14" />
          <KIcon v-else name="File" :size="14" />
          {{ c.name }}
        </n-tag>
        <!-- T03: 更多{N} 聚合 -->
        <n-tag v-if="extraFileCount > 0" size="small" type="default">
          +{{ extraFileCount }} 更多文件
        </n-tag>
      </div>

      <!-- 已上传附件 chips -->
      <div v-if="uploads.length" class="km-attach-chips">
        <span
          v-for="(u, i) in uploads"
          :key="u.path"
          class="km-chip"
          :title="u.path"
        >📄 {{ u.filename }}<button class="km-chip-x" @click="removeUpload(i)">×</button></span>
      </div>

      <div class="km-input-row">
        <!-- 「+」菜单按钮 -->
        <n-popover
          :show="plusOpen"
          trigger="click"
          placement="top-start"
          @update:show="(v: boolean) => (plusOpen = v)"
        >
          <template #trigger>
            <n-button
              circle
              size="tiny"
              class="km-plus-btn"
              @click="plusOpen = !plusOpen"
              title="添加上下文"
            >
              <template #icon><KIcon name="Plus" :size="16" /></template>
            </n-button>
          </template>
          <div class="km-plus-panel">
            <!-- 文件/图片 -->
            <div class="km-plus-section">
              <div class="km-plus-title">文件</div>
              <div
                class="km-plus-item"
                @click="onFileInputClick(); plusOpen = false"
              >📄 选择文件</div>
            </div>

            <!-- Skills -->
            <div class="km-plus-section">
              <div class="km-plus-title">Skills</div>
              <div
                v-for="skill in store.skills"
                :key="skill.name"
                class="km-plus-item km-plus-check"
              >
                <n-checkbox
                  size="small"
                  :checked="selectedSkills.has(skill.name)"
                  @update:checked="toggleSkill(skill.name)"
                >🧩 {{ skill.name }}</n-checkbox>
              </div>
              <div v-if="!store.skills.length" class="km-plus-empty">暂无技能</div>
            </div>

            <!-- MCP Servers -->
            <div class="km-plus-section">
              <div class="km-plus-title">MCP Servers</div>
              <div
                v-for="mcp in store.mcpServers"
                :key="mcp.name"
                class="km-plus-item km-plus-check"
              >
                <n-checkbox
                  size="small"
                  :checked="selectedMcp.has(mcp.name)"
                  @update:checked="toggleMcp(mcp.name)"
                >🔌 {{ mcp.name }}</n-checkbox>
              </div>
              <div v-if="!store.mcpServers.length" class="km-plus-empty">暂无 MCP 服务器</div>
            </div>
          </div>
        </n-popover>

        <!-- 文本输入 -->
        <textarea
          v-model="text"
          class="km-textarea"
          aria-label="输入消息"
          :placeholder="isEditing ? editingPlaceholder : t('chat.placeholder')"
          rows="2"
          @keydown="onKey"
        />

        <!-- 语音按钮（T03: 实现 Web Speech API） -->
        <n-button
          quaternary
          circle
          size="small"
          class="km-voice-btn"
          :class="{ 'km-voice-listening': isListening }"
          title="语音输入"
          @click="onVoiceClick"
        >
          <template #icon><KIcon name="Microphone" :size="16" /></template>
        </n-button>

        <!-- T03: sendMode dropdown -->
        <n-dropdown
          trigger="click"
          placement="top-end"
          :options="sendModeOptions"
          @select="onSelectSendMode"
        >
          <n-button size="small" class="km-sendmode-btn">
            {{ sendModeLabel }}
          </n-button>
        </n-dropdown>

        <!-- 发送按钮 -->
        <n-button
          type="primary"
          circle
          size="small"
          class="km-send-btn"
          :disabled="!text.trim()"
          @click="send"
        >
          <template #icon><KIcon name="Send" :size="16" /></template>
        </n-button>
      </div>
    </div>

    <input ref="fileInput" type="file" multiple style="display: none" @change="onFiles" />
  </div>
</template>

<style scoped>
.km-input {
  border-top: 1px solid var(--km-border);
  padding: 8px 12px 10px;
  background: var(--km-bg);
  flex-shrink: 0;
}

.km-input-drag {
  outline: 2px dashed var(--km-accent);
  outline-offset: -6px;
  border-radius: 8px;
}

.km-input-editing {
  border-top: 2px solid var(--km-accent);
}

/* ── 编辑提示 ── */
.km-editing-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: rgba(59, 130, 246, 0.1);
  border: 1px solid rgba(59, 130, 246, 0.3);
  border-radius: 6px;
  padding: 4px 10px;
  margin-bottom: 6px;
}

.km-editing-label {
  font-size: 12px;
  color: var(--km-accent);
  font-weight: 500;
}

.km-editing-cancel {
  background: none;
  border: 1px solid var(--km-border);
  color: var(--km-muted);
  border-radius: 4px;
  padding: 1px 8px;
  font-size: 12px;
  cursor: pointer;
}

.km-editing-cancel:hover {
  color: var(--km-text);
}

/* ── 输入主体 ── */
.km-input-body {
  position: relative;
}

.km-input-chips {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  margin-bottom: 6px;
  align-items: center;
}

/* T03: NTag 内嵌缩略图 */
.km-chip-img {
  border-radius: 4px;
  object-fit: cover;
  vertical-align: middle;
}

.km-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: var(--km-panel);
  border: 1px solid var(--km-border);
  border-radius: 999px;
  padding: 1px 8px;
  font-size: 11px;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.km-chip-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.km-chip-x {
  background: transparent;
  border: none;
  color: var(--km-text);
  cursor: pointer;
  font-size: 13px;
  opacity: 0.6;
  line-height: 1;
}

.km-chip-x:hover {
  opacity: 1;
  color: var(--km-danger);
}

.km-input-row {
  display: flex;
  gap: 6px;
  align-items: flex-end;
}

.km-plus-btn {
  flex-shrink: 0;
  align-self: flex-end;
  margin-bottom: 4px;
}

.km-textarea {
  flex: 1;
  resize: none;
  min-height: 40px;
  max-height: 160px;
  background: var(--km-panel);
  color: var(--km-text);
  border: 1px solid var(--km-border);
  border-radius: 8px;
  padding: 8px 10px;
  font-family: inherit;
  font-size: 14px;
  outline: none;
}

.km-textarea:focus {
  border-color: var(--km-accent);
}

.km-voice-btn {
  flex-shrink: 0;
  align-self: flex-end;
  margin-bottom: 2px;
}

/* T03: 语音录音中动画 */
.km-voice-listening {
  color: var(--km-danger);
  animation: km-pulse 1.5s ease-in-out infinite;
}

@keyframes km-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.4;
  }
}

/* T03: sendMode 按钮 */
.km-sendmode-btn {
  flex-shrink: 0;
  align-self: flex-end;
  margin-bottom: 2px;
  font-size: 12px;
}

.km-send-btn {
  flex-shrink: 0;
  align-self: flex-end;
  margin-bottom: 2px;
}

/* ── [+] 面板 ── */
.km-plus-panel {
  width: 240px;
  max-height: 360px;
  overflow-y: auto;
  padding: 4px;
}

.km-plus-section {
  margin-bottom: 8px;
}

.km-plus-title {
  font-size: 11px;
  font-weight: 600;
  opacity: 0.5;
  padding: 4px 6px;
  text-transform: uppercase;
}

.km-plus-item {
  padding: 6px 10px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  transition: background 0.12s ease;
}

.km-plus-item:hover {
  background: var(--km-hover-bg);
}

.km-plus-check {
  padding: 2px 10px;
}

.km-plus-empty {
  font-size: 12px;
  opacity: 0.4;
  padding: 4px 10px;
}

/* ── 附件 chips ── */
.km-attach-chips {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 6px;
}
</style>
