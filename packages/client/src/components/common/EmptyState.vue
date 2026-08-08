<script setup lang="ts">
/**
 * EmptyState — 通用空状态组件（Phase C1）。
 *
 * 用于列表/搜索为空时的统一占位：
 * - icon: Tabler 图标名（如 Clock、Database、Message）
 * - title: 主标题
 * - description: 副标题（可选）
 * - actionLabel: 操作按钮文案（可选），点击 emit('action')
 */
defineProps<{
  icon?: string;
  title: string;
  description?: string;
  actionLabel?: string;
}>();

defineEmits<{
  action: [];
}>();
</script>

<template>
  <div class="km-empty">
    <KIcon v-if="icon" :name="icon" :size="48" class="km-empty-icon" />
    <p class="km-empty-title">{{ title }}</p>
    <p v-if="description" class="km-empty-desc">{{ description }}</p>
    <NButton v-if="actionLabel" size="small" @click="$emit('action')">
      {{ actionLabel }}
    </NButton>
  </div>
</template>

<style scoped>
.km-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--km-space-3xl) var(--km-space-xl);
  text-align: center;
}

.km-empty-icon {
  color: var(--km-muted);
  margin-bottom: 16px;
}

.km-empty-title {
  font-size: var(--km-font-lg);
  color: var(--km-text);
  margin: 0 0 8px;
}

.km-empty-desc {
  color: var(--km-muted);
  margin: 0 0 16px;
}
</style>
