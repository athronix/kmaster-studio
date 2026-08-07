<script setup lang="ts">
/**
 * SessionConfigBar — 会话配置状态栏（底栏）（T04）。
 *
 * 布局：左侧（工作区 / Agent / 模式），右侧（上下文环 / 模型 / 发送模式）。
 * 所有切换使用 Naive UI NDropdown。
 */
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { NButton, NDropdown, NTooltip } from 'naive-ui';
import KIcon from '../common/KIcon.vue';
import type { HermesMode } from '../../types/chat';
import { CHAT_MODES } from '../../types/chat';
import ContextRing from './ContextRing.vue';

const router = useRouter();

const props = withDefaults(
  defineProps<{
    workspace: string;
    mode: HermesMode;
    agent: string;
    model: string;
    contextPercent: number;
    contextUsed?: number;
    contextMax?: number;
    sendMode: 'interrupt' | 'steer' | 'queue';
  }>(),
  {
    workspace: '',
    mode: 'default' as HermesMode,
    agent: 'Default',
    model: '',
    contextPercent: 0,
    contextUsed: 0,
    contextMax: 0,
    sendMode: 'queue',
  },
);

const emit = defineEmits<{
  (e: 'change-workspace'): void;
  (e: 'change-mode', mode: HermesMode): void;
  (e: 'change-agent'): void;
  (e: 'change-model', model: string): void;
  (e: 'change-send-mode', mode: 'interrupt' | 'steer' | 'queue'): void;
  (e: 'add-model'): void;
}>();

/** 模式选项（Ask / Plan / Craft） */
const modeOptions = CHAT_MODES.map((m) => ({
  label: m.label,
  key: m.token,
  title: m.desc,
}));

const currentModeLabel = computed<string>(() => {
  const def = CHAT_MODES.find((m) => m.token === props.mode);
  return def ? def.label : props.mode;
});

/** 发送模式选项 */
const sendModeOptions = [
  { label: 'Interrupt — 中断并引导', key: 'interrupt' as const },
  { label: 'Steer — 引导', key: 'steer' as const },
  { label: 'Queue — 排队', key: 'queue' as const },
];

const sendModeIcon = computed<string>(() => {
  const opt = sendModeOptions.find((o) => o.key === props.sendMode);
  if (!opt) return 'Clipboard';
  const icons: Record<string, string> = { interrupt: 'PlayerPause', steer: 'Target', queue: 'Clipboard' };
  return icons[opt.key] ?? 'Clipboard';
});

const sendModeLabel = computed<string>(() => {
  const opt = sendModeOptions.find((o) => o.key === props.sendMode);
  return opt?.label ?? 'Queue';
});

/** 工作区短名 */
const workspaceShort = computed<string>(() => {
  if (!props.workspace) return '';
  const parts = props.workspace.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || props.workspace;
});

/** 模型短名 */
const modelShort = computed<string>(() => {
  if (!props.model) return '未选择';
  return props.model.length > 20 ? props.model.slice(0, 20) + '…' : props.model;
});

/** ContextRing tooltip */
const ctxTooltip = computed<string>(() => {
  const u = props.contextUsed ?? 0;
  const m = props.contextMax ?? 100000;
  const p = m > 0 ? Math.round((u / m) * 100) : 0;
  return `${p}%: ${(u / 256).toFixed(1)}kb/${(m / 256).toFixed(1)}kb 上下文已使用`;
});

// ── 模型选择 dropdown options（最后一行"添加模型"）──
const modelDropdownOptions = computed(() => {
  return [
    { label: modelShort.value, key: props.model || '__current__', disabled: true },
    { key: '__divider__', type: 'divider' as const },
    { label: '添加模型…', key: '__add_model__' },
  ];
});

function onModeSelect(key: string): void {
  emit('change-mode', key as HermesMode);
}

function onSendModeSelect(key: string): void {
  emit('change-send-mode', key as 'interrupt' | 'steer' | 'queue');
}

function onModelSelect(key: string): void {
  if (key === '__add_model__') {
    router.push('/settings/model');
  } else {
    emit('change-model', key);
  }
}
</script>

<template>
  <div class="km-session-config">
    <!-- 左侧：工作区 / Agent / 模式 -->
    <div class="km-config-left">
      <!-- 工作区 -->
      <n-button
        size="tiny"
        text
        class="km-config-btn"
        :title="workspace || '选择工作区'"
        @click="emit('change-workspace')"
      >
        <span class="km-config-icon"><KIcon name="Folder" :size="14" /></span>
        <span v-if="workspaceShort" class="km-config-label">{{ workspaceShort }}</span>
        <span v-else class="km-config-label km-config-placeholder">工作区</span>
      </n-button>

      <!-- Agent -->
      <n-button
        size="tiny"
        text
        class="km-config-btn"
        :title="'Agent: ' + agent"
        @click="emit('change-agent')"
      >
        <span class="km-config-icon"><KIcon name="Robot" :size="14" /></span>
        <span class="km-config-label">{{ agent }}</span>
      </n-button>

      <!-- 模式 -->
      <n-dropdown
        trigger="click"
        placement="top-start"
        :options="modeOptions"
        @select="onModeSelect"
      >
        <n-button size="tiny" text class="km-config-btn" title="切换权限模式">
          <span class="km-config-icon"><KIcon name="Shield" :size="14" /></span>
          <span class="km-config-label">{{ currentModeLabel }}</span>
        </n-button>
      </n-dropdown>
    </div>

    <!-- 右侧：上下文环 / 模型 / 发送模式 -->
    <div class="km-config-right">
      <!-- 上下文用量环 -->
      <n-tooltip trigger="hover" placement="top">
        <template #trigger>
          <div class="km-config-ring-wrap">
            <ContextRing
              :percentage="contextPercent"
              :used="contextUsed"
              :max="contextMax"
            />
          </div>
        </template>
        {{ ctxTooltip }}
      </n-tooltip>

      <!-- 模型 -->
      <n-dropdown
        trigger="click"
        placement="top-end"
        :options="modelDropdownOptions"
        @select="onModelSelect"
      >
        <n-button size="tiny" text class="km-config-btn" title="切换模型">
          <span class="km-config-icon"><KIcon name="Brain" :size="14" /></span>
          <span class="km-config-label">{{ modelShort }}</span>
        </n-button>
      </n-dropdown>

    </div>
  </div>
</template>

<style scoped>
.km-session-config {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: var(--km-space-3xl);
  padding: 0 var(--km-space-md);
  gap: var(--km-space-sm);
  flex-shrink: 0;
  border-top: 1px solid var(--km-border);
  background: var(--km-panel);
}

.km-config-left,
.km-config-right {
  display: flex;
  align-items: center;
  gap: var(--km-space-xs);
}

.km-config-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--km-space-xs);
  font-size: var(--km-font-xs);
  padding: var(--km-space-2xs) var(--km-space-6);
  border-radius: var(--km-radius-sm);
  color: var(--km-muted);
  transition: color 0.12s ease, background 0.12s ease;
}

.km-config-btn:hover {
  color: var(--km-text);
  background: var(--km-hover-bg);
}

.km-config-icon {
  font-size: var(--km-font-sm);
  flex-shrink: 0;
}

.km-config-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100px;
}

.km-config-placeholder {
  opacity: 0.5;
}

.km-config-ring-wrap {
  display: flex;
  align-items: center;
  cursor: pointer;
}
</style>
