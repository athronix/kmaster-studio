<script setup lang="ts">
/**
 * SettingsDetailPanel — 设置详情右栏（T02 新建）。
 *
 * 在设置页右侧展示当前选中资源的详情：
 * - 图标 / 名称 / installed 标签
 * - 简介
 * - 操作按钮（卸载 / 召唤）
 * - 标签列表
 */
import { NTag, NButton, NText } from 'naive-ui'
import type { ResourceItem } from '../../types/market'

defineProps<{
  item: ResourceItem | null
  entityType: 'expert' | 'skill' | 'mcp'
}>()

defineEmits<{
  install: [id: string]
  uninstall: [id: string]
  summon: [id: string]
}>()
</script>
<template>
  <div class="sdp-panel" v-if="item">
    <img :src="item.icon" class="sdp-icon" />
    <NText strong class="sdp-name">{{ item.name }}</NText>
    <NTag v-if="item.installed" type="success" size="small" style="margin-left:8px">installed</NTag>
    <p class="sdp-desc">{{ item.description }}</p>
    <div class="sdp-actions">
      <NButton v-if="item.installed" size="small" quaternary @click="$emit('uninstall', item.id)">卸载</NButton>
      <NButton size="small" type="primary" @click="$emit('summon', item.id)">召唤</NButton>
    </div>
    <div class="sdp-tags">
      <NTag v-if="item.category" size="tiny" :bordered="false" type="default">{{ item.category }}</NTag>
      <NTag v-for="tag in item.tags.slice(0, 10)" :key="tag" size="tiny" :bordered="false" type="default">{{ tag }}</NTag>
    </div>
  </div>
  <div class="sdp-empty" v-else>
    <NText depth="3">点击左侧卡片查看详情</NText>
  </div>
</template>
<style scoped>
.sdp-panel {
  padding: var(--km-space-lg);
}
.sdp-icon {
  width: 48px;
  height: 48px;
  border-radius: 8px;
}
.sdp-name {
  font-size: var(--km-font-18);
  margin-top: 8px;
}
.sdp-desc {
  margin: var(--km-space-md) 0;
  color: var(--n-text-color-2);
}
.sdp-actions {
  margin: var(--km-space-sm) 0;
  display: flex;
  gap: var(--km-space-sm);
}
.sdp-tags {
  margin-top: 12px;
  display: flex;
  flex-wrap: wrap;
  gap: var(--km-space-xs);
}
.sdp-empty {
  padding: var(--km-space-xl);
  text-align: center;
}
</style>
