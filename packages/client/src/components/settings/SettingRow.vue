<script setup lang="ts">
/**
 * SettingRow — 通用设置行组件（label + hint + slot）。
 *
 * 从 hermes-studio SettingRow.vue 移植，CSS 变量适配 kmaster 体系。
 * 纯展示组件，不耦合任何业务逻辑。
 */
defineProps<{
  label: string
  hint?: string
}>()
</script>

<template>
  <div class="sr-row">
    <div class="sr-info">
      <label class="sr-label">{{ label }}</label>
      <p v-if="hint" class="sr-hint">{{ hint }}</p>
    </div>
    <div class="sr-control">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.sr-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 0;
  border-bottom: 1px solid var(--km-border);
}

.sr-row:last-child {
  border-bottom: none;
}

.sr-info {
  flex: 1;
  margin-right: 16px;
}

.sr-label {
  font-size: var(--km-font-sm);
  color: var(--km-text);
  display: block;
}

.sr-hint {
  font-size: var(--km-font-xs);
  color: var(--km-text);
  opacity: 0.5;
  margin-top: 2px;
}

.sr-control {
  flex-shrink: 0;
}

@media (max-width: 600px) {
  .sr-row {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }

  .sr-info {
    margin-right: 0;
  }

  .sr-control {
    width: 100%;
  }
}
</style>
