<script setup lang="ts">
/**
 * DataStateBoundary.vue — 数据状态边界组件（U-18）
 *
 * 根据 DataSourceState 自动渲染对应的模板插槽。
 */
import { DataSourceState } from '../../types/dataSource';

defineProps<{
  state: DataSourceState;
  emptyText?: string;
  errorText?: string;
}>();
</script>

<template>
  <div v-if="state === DataSourceState.Live">
    <slot />
  </div>
  <div v-else-if="state === DataSourceState.Loading" class="ds-boundary-loading">
    <slot name="loading">
      <n-spin size="medium" />
    </slot>
  </div>
  <div v-else-if="state === DataSourceState.Empty" class="ds-boundary-empty">
    <slot name="empty">
      <n-empty :description="emptyText || '暂无数据'" />
    </slot>
  </div>
  <div v-else-if="state === DataSourceState.Error" class="ds-boundary-error">
    <slot name="error">
      <n-result status="500" :title="errorText || '数据加载失败'" />
    </slot>
  </div>
  <div v-else-if="state === DataSourceState.Offline" class="ds-boundary-offline">
    <n-alert type="warning" title="hermes 离线">
      部分功能不可用，数据为上次缓存快照
    </n-alert>
    <slot />
  </div>
</template>

<style scoped>
.ds-boundary-loading,
.ds-boundary-empty,
.ds-boundary-error {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 120px;
}
</style>
