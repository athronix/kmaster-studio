<script setup lang="ts">
/**
 * ShareDialog — 任务分享弹窗（T04 重写）。
 *
 * 废弃死链生成，改为展示配置摘要 + 复制 JSON + 在右栏查看。
 */
import { computed } from 'vue';
import { NModal, NButton, NSpace, NTag, useMessage } from 'naive-ui';
import KIcon from '../common/KIcon.vue';
import { useChatStore } from '../../stores/chat';
import { CHAT_MODES } from '../../types/chat';

const props = defineProps<{
  show: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:show', v: boolean): void;
  (e: 'open-share-panel'): void;
}>();

const store = useChatStore();
const toast = useMessage();

const sid = computed(() => store.activeSessionId);

const sessionTitle = computed(() => {
  if (!sid.value) return '';
  return store.sessions.find((s) => s.id === sid.value)?.title || '会话';
});

/** 当前会话的 Agent 名称 */
const agentName = computed(() => {
  if (!sid.value) return 'Default';
  const s = store.sessions.find((x) => x.id === sid.value);
  return s?.agent ?? 'Default';
});

/** 当前会话的模型 */
const modelName = computed(() => {
  if (!sid.value) return '';
  const model = store.modelBySession[sid.value] ?? store.globalSettings.default_model;
  if (!model) return '';
  for (const g of store.models) {
    const m = g.models.find((x) => x.id === model);
    if (m) return m.name || m.id;
  }
  return model;
});

/** 当前会话的模式 */
const modeLabel = computed(() => {
  if (!sid.value) return '';
  const mode = store.modeBySession[sid.value] ?? store.globalSettings.default_mode;
  const def = CHAT_MODES.find((m) => m.token === mode);
  return def ? def.label : mode;
});

/** 启用的 Skills */
const enabledSkills = computed(() =>
  store.skills.filter((s) => s.enabled).map((s) => s.name),
);

/** 已连接的 MCP Servers */
const connectedMcp = computed(() =>
  store.mcpServers.filter((s) => s.status === 'connected').map((s) => s.name),
);

/** 配置摘要 JSON */
const configJson = computed(() => {
  const config = {
    title: sessionTitle.value,
    agent: agentName.value,
    mode: modeLabel.value,
    model: modelName.value || '未选择',
    skills: enabledSkills.value,
    mcp_servers: connectedMcp.value,
  };
  return JSON.stringify(config, null, 2);
});

async function copyConfigJson(): Promise<void> {
  try {
    await navigator.clipboard.writeText(configJson.value);
    toast.success('已复制配置 JSON');
  } catch {
    toast.error('复制失败');
  }
}

function openInRightPanel(): void {
  emit('open-share-panel');
  emit('update:show', false);
}

function close(): void {
  emit('update:show', false);
}
</script>

<template>
  <n-modal
    :show="show"
    @update:show="(v: boolean) => emit('update:show', v)"
    preset="card"
    title="分享配置"
    style="width: 480px"
    :mask-closable="true"
  >
    <div class="km-share">
      <div class="km-share-info">
        会话「{{ sessionTitle }}」的当前配置
      </div>

      <!-- 配置摘要 -->
      <div class="km-share-summary">
        <div class="km-share-row">
          <span class="km-share-label">Agent</span>
          <n-tag size="small" :bordered="false" type="info">{{ agentName }}</n-tag>
        </div>
        <div class="km-share-row">
          <span class="km-share-label">Model</span>
          <n-tag size="small" :bordered="false">{{ modelName || '未选择' }}</n-tag>
        </div>
        <div class="km-share-row">
          <span class="km-share-label">Mode</span>
          <n-tag size="small" :bordered="false" type="success">{{ modeLabel }}</n-tag>
        </div>
        <div class="km-share-row">
          <span class="km-share-label">Skills</span>
          <span v-if="!enabledSkills.length" class="km-share-none">无</span>
          <n-tag
            v-for="sk in enabledSkills"
            :key="sk"
            size="tiny"
            :bordered="false"
            type="warning"
          >
            {{ sk }}
          </n-tag>
        </div>
        <div class="km-share-row">
          <span class="km-share-label">MCP</span>
          <span v-if="!connectedMcp.length" class="km-share-none">无</span>
          <n-tag
            v-for="mc in connectedMcp"
            :key="mc"
            size="tiny"
            :bordered="false"
            type="error"
          >
            {{ mc }}
          </n-tag>
        </div>
      </div>

      <n-space justify="center" class="km-share-actions">
        <n-button size="small" @click="copyConfigJson"><template #icon><KIcon name="Clipboard" :size="16" /></template>复制配置 JSON</n-button>
        <n-button size="small" type="primary" @click="openInRightPanel"><template #icon><KIcon name="FolderOpen" :size="16" /></template>在右栏查看</n-button>
      </n-space>

      <n-space justify="end" class="km-share-footer">
        <n-button size="small" @click="close">关闭</n-button>
      </n-space>
    </div>
  </n-modal>
</template>

<style scoped>
.km-share {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.km-share-info {
  font-size: 13px;
  opacity: 0.7;
}

.km-share-summary {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.km-share-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.km-share-label {
  font-size: 12px;
  font-weight: 600;
  opacity: 0.6;
  min-width: 48px;
  flex-shrink: 0;
}

.km-share-none {
  font-size: 12px;
  opacity: 0.4;
}

.km-share-actions {
  padding: 4px 0;
}

.km-share-footer {
  border-top: 1px solid var(--km-border);
  padding-top: 12px;
}
</style>
