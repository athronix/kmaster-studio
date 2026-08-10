<script setup lang="ts">
/**
 * ProviderModelCard — 供应商模型卡片（T02：对齐 hermes ProviderCard）。
 *
 * 设计 §2.3：
 *   - 头部：名称 + provider 类型标签 + Key 状态标签 + 连通性标签
 *   - 信息行：Base URL / API 方法 / 模型数量
 *   - 模型标签云：最多 20 个模型标签
 *   - 操作栏：重测 / 编辑 / 删除（Popconfirm）
 */
import { computed } from 'vue';
import { NButton, NPopconfirm, NTag } from 'naive-ui';
import KIcon from '../common/KIcon.vue';
import { apiMethodLabel, providerLabel } from '../../constants/providers';
import type { ModelConfig, ModelProviderConfig } from '../../types/settings';

const props = defineProps<{
  /** 供应商配置 */
  provider: ModelProviderConfig;
  /** 当前正在测试的供应商 id（用于 loading 状态） */
  testingId: string;
  /** 模型展示名函数（来自 store.displayName） */
  modelDisplayName: (model: ModelConfig) => string;
}>();

const emit = defineEmits<{
  (e: 'retest', provider: ModelProviderConfig): void;
  (e: 'edit', provider: ModelProviderConfig): void;
  (e: 'delete', provider: ModelProviderConfig): void;
}>();

/** 最多展示的模型标签数 */
const MAX_PREVIEW = 20;

/** Key 状态标签 */
const keyState = computed<{ label: string; type: 'success' | 'warning' | 'default' }>(() => {
  if (props.provider.apiKey !== '') return { label: 'Key 已填写', type: 'success' };
  if (props.provider.keyMasked) return { label: 'Key 已配置（需重填以重测）', type: 'warning' };
  return { label: '未配置 Key', type: 'default' };
});

/** 连通性状态文本 */
const connectivityText = computed<string>(() => {
  if (props.provider.lastTestedAt === 0) return '从未测试';
  const prefix = props.provider.verified ? '通过' : '失败';
  return `${prefix} · ${new Date(props.provider.lastTestedAt).toLocaleString()}`;
});

/** 连通性标签类型 */
const connectivityType = computed<'success' | 'error' | 'default'>(() => {
  if (props.provider.lastTestedAt === 0) return 'default';
  return props.provider.verified ? 'success' : 'error';
});

/** 预览模型列表（最多 20 个） */
const previewModels = computed<ModelConfig[]>(() =>
  props.provider.models.slice(0, MAX_PREVIEW),
);

/** 隐藏的模型数 */
const hiddenCount = computed<number>(() =>
  Math.max(props.provider.models.length - previewModels.value.length, 0),
);

/** 是否正在测试 */
const isTesting = computed<boolean>(() => props.testingId === props.provider.id);

/** Base URL 展示文本 */
const baseUrlDisplay = computed<string>(() =>
  props.provider.url || '未填写 Base URL',
);

/** 获取 provider key 的类型标签 */
const providerTypeLabel = computed<string>(() => {
  const key = props.provider.providerKey;
  if (key === 'custom') return '自定义';
  return providerLabel(key);
});

/** provider key 类型标签样式 */
const providerTypeBadgeType = computed<'info' | 'default'>(() =>
  props.provider.providerKey === 'custom' ? 'default' : 'info',
);
</script>

<template>
  <div class="pmc">
    <!-- 头部 -->
    <div class="pmc-header">
      <div class="pmc-header-left">
        <span class="pmc-name">{{ provider.name }}</span>
        <n-tag size="tiny" :bordered="false" :type="providerTypeBadgeType">
          {{ providerTypeLabel }}
        </n-tag>
      </div>
      <div class="pmc-header-badges">
        <n-tag size="tiny" :bordered="false" :type="keyState.type">
          {{ keyState.label }}
        </n-tag>
        <n-tag size="tiny" :bordered="false" :type="connectivityType">
          {{ connectivityText }}
        </n-tag>
      </div>
    </div>

    <!-- 信息行 -->
    <div class="pmc-body">
      <div class="pmc-info-row">
        <span class="pmc-info-label">Base URL</span>
        <code class="pmc-info-value pmc-mono">{{ baseUrlDisplay }}</code>
      </div>
      <div class="pmc-info-row">
        <span class="pmc-info-label">API 方法</span>
        <span class="pmc-info-value">{{ apiMethodLabel(provider.apiMethod) }}</span>
      </div>
      <div class="pmc-info-row">
        <span class="pmc-info-label">模型数量</span>
        <span class="pmc-info-value pmc-model-count">{{ provider.models.length }} 个</span>
      </div>

      <!-- 模型标签云 -->
      <div v-if="previewModels.length > 0" class="pmc-tag-cloud">
        <span
          v-for="m in previewModels"
          :key="m.id"
          class="pmc-tag"
          :title="m.id"
        >{{ modelDisplayName(m) }}</span>
        <span v-if="hiddenCount > 0" class="pmc-tag pmc-tag-more">
          +{{ hiddenCount }}
        </span>
      </div>
      <div v-else class="pmc-no-models">暂无模型</div>
    </div>

    <!-- 操作栏 -->
    <div class="pmc-actions">
      <n-button
        size="tiny"
        tertiary
        :loading="isTesting"
        @click="emit('retest', provider)"
      >
        <template #icon><KIcon name="Refresh" :size="14" /></template>
        重测
      </n-button>
      <n-button
        size="tiny"
        tertiary
        @click="emit('edit', provider)"
      >
        <template #icon><KIcon name="Pencil" :size="14" /></template>
        编辑
      </n-button>
      <n-popconfirm @positive-click="emit('delete', provider)">
        <template #trigger>
          <n-button size="tiny" quaternary type="error">
            <template #icon><KIcon name="Trash" :size="14" /></template>
            删除
          </n-button>
        </template>
        删除供应商「{{ provider.name }}」会同时移除其全部模型，并清空引用这些模型的默认槽位。确认删除？
      </n-popconfirm>
    </div>
  </div>
</template>

<style scoped>
.pmc {
  display: flex;
  flex-direction: column;
  gap: var(--km-space-10);
  padding: var(--km-space-md);
  border: 1px solid var(--km-border);
  border-radius: var(--km-radius-lg);
  background: var(--km-panel);
  transition: border-color 0.15s ease;
}

.pmc:hover {
  border-color: var(--km-accent);
}

/* 头部 */
.pmc-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--km-space-sm);
}

.pmc-header-left {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--km-space-6);
  min-width: 0;
}

.pmc-name {
  font-size: var(--km-font-sm);
  font-weight: 600;
  color: var(--km-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pmc-header-badges {
  display: flex;
  align-items: center;
  gap: var(--km-space-6);
  flex-shrink: 0;
}

/* 信息区 */
.pmc-body {
  display: flex;
  flex-direction: column;
  gap: var(--km-space-6);
}

.pmc-info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--km-space-sm);
}

.pmc-info-label {
  font-size: var(--km-font-xs);
  opacity: 0.55;
  flex-shrink: 0;
}

.pmc-info-value {
  font-size: var(--km-font-xs);
  color: var(--km-text);
  text-align: right;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pmc-mono {
  font-family: var(--km-mono, ui-monospace, monospace);
  font-size: var(--km-font-xs);
}

.pmc-model-count {
  font-weight: 500;
}

/* 模型标签云 */
.pmc-tag-cloud {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 6px;
  margin-top: var(--km-space-xs);
  max-height: 80px;
  overflow-y: auto;
  align-content: flex-start;
}

.pmc-tag {
  display: inline-block;
  font-size: 10px;
  font-family: var(--km-mono, ui-monospace, monospace);
  padding: 2px 6px;
  border-radius: var(--km-radius-sm);
  background: color-mix(in srgb, var(--km-accent) 8%, transparent);
  color: var(--km-text);
  opacity: 0.7;
  white-space: nowrap;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: default;
  transition: opacity 0.12s ease, background 0.12s ease;
}

.pmc-tag:hover {
  opacity: 1;
  background: color-mix(in srgb, var(--km-accent) 16%, transparent);
}

.pmc-tag-more {
  background: color-mix(in srgb, var(--km-accent) 15%, transparent);
  opacity: 1;
  color: var(--km-accent);
  font-weight: 600;
}

.pmc-no-models {
  font-size: var(--km-font-xs);
  opacity: 0.4;
  margin-top: var(--km-space-xs);
  font-style: italic;
}

/* 操作栏 */
.pmc-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--km-space-6);
  padding-top: var(--km-space-10);
  border-top: 1px solid var(--km-border);
}
</style>
