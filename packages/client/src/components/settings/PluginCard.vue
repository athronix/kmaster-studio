<script setup lang="ts">
/**
 * PluginCard — 插件卡片组件（T03）。
 *
 * 展示单个插件的关键信息：名称、类型、来源、状态、工具数。
 * 用于 PluginsSection 的卡片列表布局。
 */
import { NTag } from 'naive-ui';
import type { PluginItem, PluginKind, PluginStatus } from '../../types/chat';

defineProps<{
  plugin: PluginItem;
}>();

const emit = defineEmits<{
  click: [plugin: PluginItem];
}>();

const KIND_LABEL: Record<PluginKind, string> = {
  platform: 'Platform',
  backend: 'Backend',
  'model-provider': 'Model',
  standalone: '独立',
  other: '其它',
};

function sourceLabel(source: string): string {
  return source === 'bundled' ? '内置' : '用户';
}

function sourceType(source: string): 'info' | 'default' {
  return source === 'bundled' ? 'info' : 'default';
}

function statusTag(status: PluginStatus): { label: string; type: 'success' | 'warning' | 'default' } {
  switch (status) {
    case 'enabled':
      return { label: '已启用', type: 'success' };
    case 'needs_config':
      return { label: '需配置', type: 'warning' };
    default:
      return { label: '已禁用', type: 'default' };
  }
}

function onClick(plugin: PluginItem): void {
  emit('click', plugin);
}
</script>

<template>
  <div class="pkc-card" @click="onClick(plugin)">
    <div class="pkc-header">
      <span class="pkc-name">{{ plugin.label || plugin.name }}</span>
      <div class="pkc-tags">
        <n-tag size="tiny" :bordered="false">{{ KIND_LABEL[plugin.kind] ?? plugin.kind }}</n-tag>
        <n-tag size="tiny" :bordered="false" :type="sourceType(plugin.source)">
          {{ sourceLabel(plugin.source) }}
        </n-tag>
        <n-tag
          size="tiny"
          :bordered="false"
          :type="statusTag(plugin.effectiveStatus).type"
        >
          {{ statusTag(plugin.effectiveStatus).label }}
        </n-tag>
      </div>
    </div>
    <div class="pkc-id">{{ plugin.id }}</div>
    <p v-if="plugin.description" class="pkc-desc">{{ plugin.description }}</p>
    <div class="pkc-footer">
      <span v-if="(plugin.requiresEnv?.length ?? 0) === 0" class="pkc-na">—</span>
      <template v-else>
        <n-tag
          v-for="env in plugin.requiresEnv"
          :key="env"
          size="tiny"
          :bordered="false"
          :type="plugin.missingEnv?.includes(env) ? 'warning' : 'success'"
          class="pkc-env-tag"
        >
          {{ env }}
        </n-tag>
      </template>
      <span class="pkc-tools">
        工具数：<strong>{{ plugin.providesTools?.length ?? 0 }}</strong>
      </span>
    </div>
  </div>
</template>

<style scoped>
.pkc-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: var(--km-space-10) var(--km-space-md);
  border: 1px solid var(--km-border);
  border-radius: var(--km-radius-lg);
  background: var(--km-panel);
  cursor: pointer;
  transition: background 0.12s ease, border-color 0.12s ease;
}

.pkc-card:hover {
  background: var(--km-hover);
  border-color: var(--km-accent);
}

.pkc-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--km-space-sm);
  flex-wrap: wrap;
}

.pkc-name {
  font-weight: 600;
  font-size: var(--km-font-sm);
  color: var(--km-text);
}

.pkc-tags {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.pkc-id {
  font-size: var(--km-font-xs);
  opacity: 0.45;
  font-family: var(--km-mono, ui-monospace, monospace);
}

.pkc-desc {
  margin: 0;
  font-size: var(--km-font-xs);
  color: var(--km-text);
  opacity: 0.65;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.pkc-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--km-space-sm);
  flex-wrap: wrap;
  margin-top: 2px;
}

.pkc-na {
  font-size: var(--km-font-xs);
  opacity: 0.4;
}

.pkc-env-tag {
  margin-right: 2px;
}

.pkc-tools {
  font-size: var(--km-font-xs);
  color: var(--km-text);
  opacity: 0.6;
  margin-left: auto;
}

.pkc-tools strong {
  font-family: var(--km-mono, ui-monospace, monospace);
  opacity: 1;
}
</style>
