<script setup lang="ts">
/**
 * InstalledCard — 「已安装」列表专用紧凑卡片（V3 T4 / S4.8）。
 *
 * 与 EntityCard 的差异：
 *   - 更矮（2×5 网格里两行也不撑爆首屏）；
 *   - 操作按钮默认是删除语义，内置 NPopconfirm 二次确认（§7.5 硬约束）；
 *   - 不展示标签云，只保留名称 + 一行简介。
 */
import { computed } from 'vue';
import { NButton, NCard, NPopconfirm, NText } from 'naive-ui';
import type { EntityDef } from '../../types/market';

const props = withDefaults(
  defineProps<{
    entity: EntityDef;
    /** 操作按钮文案 */
    actionLabel?: string;
    /** 操作按钮类型 */
    actionType?: 'primary' | 'error' | 'default';
    /** 是否需要二次确认（删除类默认需要） */
    confirm?: boolean;
    /** 二次确认文案；留空时按 actionLabel + 名称自动拼装 */
    confirmText?: string;
  }>(),
  { actionLabel: '删除', actionType: 'error', confirm: true, confirmText: '' }
);

const emit = defineEmits<{
  (e: 'action', entity: EntityDef): void;
  (e: 'cardClick', entity: EntityDef): void;
}>();

const resolvedConfirm = computed<string>(() =>
  props.confirmText !== ''
    ? props.confirmText
    : `确认${props.actionLabel}「${props.entity.name}」？此操作不可撤销。`
);

function onClick(): void {
  emit('cardClick', props.entity);
}

function onAction(): void {
  emit('action', props.entity);
}
</script>

<template>
  <n-card size="small" hoverable class="km-installed-card" @click="onClick">
    <div class="km-installed-body">
      <span class="km-installed-icon">{{ entity.icon || 'Package' }}</span>
      <div class="km-installed-info">
        <n-text strong class="km-installed-name" tag="div">{{ entity.name }}</n-text>
        <n-text depth="3" class="km-installed-desc" tag="div">{{ entity.description }}</n-text>
      </div>
    </div>
    <div class="km-installed-ops" @click.stop>
      <n-popconfirm v-if="confirm" @positive-click="onAction">
        <template #trigger>
          <n-button size="tiny" :type="actionType" ghost>{{ actionLabel }}</n-button>
        </template>
        {{ resolvedConfirm }}
      </n-popconfirm>
      <n-button v-else size="tiny" :type="actionType" ghost @click="onAction">{{ actionLabel }}</n-button>
    </div>
  </n-card>
</template>

<style scoped>
.km-installed-card {
  cursor: pointer;
  position: relative;
  height: 104px;
  transition: transform 0.12s ease, box-shadow 0.12s ease;
}

.km-installed-card:hover {
  transform: translateY(-1px);
  box-shadow: var(--km-shadow-card-hover);
}

.km-installed-body {
  display: flex;
  gap: var(--km-space-sm);
  align-items: flex-start;
}

.km-installed-icon {
  font-size: var(--km-font-22);
  line-height: 1.2;
  flex-shrink: 0;
}

.km-installed-info {
  flex: 1;
  min-width: 0;
}

.km-installed-name {
  font-size: var(--km-font-13);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding-right: 44px;
}

.km-installed-desc {
  font-size: var(--km-font-sm);
  line-height: 1.5;
  margin-top: 2px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.km-installed-ops {
  position: absolute;
  top: 8px;
  right: 8px;
}
</style>
