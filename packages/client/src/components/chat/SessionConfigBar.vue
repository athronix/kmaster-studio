<script setup lang="ts">
/**
 * SessionConfigBar — 会话配置状态栏（底栏）（T04）。
 *
 * 布局：左侧（工作区 / Agent / 模式），右侧（上下文环 / 模型 / 发送模式）。
 * 所有切换使用 Naive UI NDropdown。
 */
import { computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { NButton, NDropdown, NTooltip, type DropdownOption } from 'naive-ui';
import KIcon from '../common/KIcon.vue';
import type { HermesMode } from '../../types/chat';
import { CHAT_MODES } from '../../types/chat';
import { useModelConfigStore } from '../../stores/modelConfig';
import ContextRing from './ContextRing.vue';

/** 聊天模型下拉的数据源：与「设置→模型管理」共用 modelConfig store（已聚合后端 /api/models + 本地）。 */
const modelStore = useModelConfigStore();

const router = useRouter();

/** T04/CH-D：Agent 下拉的候选项（由 ChatView 从 `getAgents('installed')` 灌入）。 */
export interface AgentOption {
  /** 写回会话侧车 `agent` 列的值，等于 `AgentEntry.id`（与 `createSession(agent)` 同口径） */
  key: string;
  /** 人类可读展示名，等于 `AgentEntry.name` */
  label: string;
}

const props = withDefaults(
  defineProps<{
    workspace: string;
    mode: HermesMode;
    agent: string;
    model: string;
    contextPercent: number;
    contextUsed?: number;
    contextMax?: number;
    /**
     * T04/CH-B：上下文用量是否可展示。
     *
     * `false` 时整个上下文环（含 tooltip）**不渲染**——数据缺失就该隐藏，
     * 🚫 不得渲染一个 0% 的假环（见 `ContextTokensPayload` doc）。
     */
    contextAvailable?: boolean;
    /** T04/CH-D：可选的 Agent 角色列表；空数组时下拉显示占位项。 */
    agentOptions?: AgentOption[];
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
    contextAvailable: false,
    agentOptions: () => [],
    sendMode: 'queue',
  },
);

const emit = defineEmits<{
  (e: 'change-workspace'): void;
  (e: 'change-mode', mode: HermesMode): void;
  /** T04/CH-D：`null` 表示「解除绑定，回落默认角色」。 */
  (e: 'change-agent', agent: string | null): void;
  (e: 'change-model', model: string): void;
  (e: 'change-send-mode', mode: 'interrupt' | 'steer' | 'queue'): void;
  (e: 'add-model'): void;
}>();

/** 解除 Agent 绑定的哨兵 key（不会与真实 Agent 名冲突）。 */
const AGENT_CLEAR_KEY = '__agent_default__';

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

/**
 * ContextRing tooltip。
 *
 * ⚠️ 分母兜底为 0（此前写死 100000）：假分母会让「服务端没给上下文窗口」的会话
 * 显示出一个煞有介事的百分比。真正的缺失处理在 `contextAvailable` —— 整条隐藏。
 */
const ctxTooltip = computed<string>(() => {
  const u = props.contextUsed ?? 0;
  const m = props.contextMax ?? 0;
  const p = m > 0 ? Math.round((u / m) * 100) : 0;
  return `${p}%: ${(u / 256).toFixed(1)}kb/${(m / 256).toFixed(1)}kb 上下文已使用`;
});

// ── T04/CH-D：Agent 选择 dropdown ──
const agentDropdownOptions = computed(() => {
  if (props.agentOptions.length === 0) {
    return [{ label: '暂无已安装的 Agent', key: '__agent_empty__', disabled: true }];
  }
  return [
    ...props.agentOptions.map((o) => ({ label: o.label, key: o.key })),
    { key: '__agent_divider__', type: 'divider' as const },
    { label: '默认角色（解除绑定）', key: AGENT_CLEAR_KEY },
  ];
});

function onAgentSelect(key: string): void {
  if (key === '__agent_empty__') return;
  emit('change-agent', key === AGENT_CLEAR_KEY ? null : key);
}

// ── 模型选择 dropdown options（从 modelConfig store 聚合 hermes 后台模型列表）──
const modelDropdownOptions = computed(() => {
  const opts: DropdownOption[] = [
    // 当前模型（禁用，仅展示）
    { label: modelShort.value, key: props.model || '__current__', disabled: true },
  ];
  // 真实模型列表：后端 /api/models（config.yaml custom_providers）经 modelConfig store 聚合
  const models = modelStore.allModels;
  if (models.length > 0) {
    opts.push({ key: '__divider__', type: 'divider' });
    for (const { provider, model } of models) {
      const value = model.id;
      if (value === props.model) continue; // 当前已作为禁用项展示，避免重复可选
      opts.push({
        label: `${provider.name} / ${modelStore.displayName(model)}`,
        key: value,
      });
    }
  }
  opts.push({ key: '__divider__', type: 'divider' });
  opts.push({ label: '添加模型…', key: '__add_model__' });
  return opts;
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
  } else if (key === '__current__' || key === props.model) {
    // 当前已选模型 / 禁用项：不动作
  } else {
    // 选中 hermes 后台真实模型 → 经 ChatView.onChangeModel → chat.setModel 写入会话
    emit('change-model', key);
  }
}

/**
 * 确保聊天框打开时模型列表已就绪：若 modelConfig store 尚未加载（用户可能没进过设置），
 * 主动拉一次后端 /api/models。下拉只在有数据时列出可选项，否则仅显示「当前模型 + 添加模型…」。
 */
onMounted(() => {
  if (modelStore.providers.length === 0) {
    void modelStore.loadModelsAndUsage();
  }
});
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

      <!-- Agent（CH-D：改为 NDropdown，与模式/模型同一交互口径） -->
      <n-dropdown
        trigger="click"
        placement="top-start"
        :options="agentDropdownOptions"
        @select="onAgentSelect"
      >
        <n-button
          size="tiny"
          text
          class="km-config-btn"
          :title="'Agent: ' + agent"
        >
          <span class="km-config-icon"><KIcon name="Robot" :size="14" /></span>
          <span class="km-config-label">{{ agent }}</span>
        </n-button>
      </n-dropdown>

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
      <!-- 上下文用量环（CH-B：数据缺失即整条隐藏，不渲染 0% 假环） -->
      <n-tooltip v-if="contextAvailable" trigger="hover" placement="top">
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
