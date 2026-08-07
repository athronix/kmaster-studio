<script setup lang="ts">
/**
 * EntityCard — 卡片市场共用卡片组件。
 *
 * V3 T4（§7.1）：actionLabel / actionType 由「entity 派生」升级为「可选 props 覆盖」。
 *   - 不传时保持 V2 行为（按实体类型推导「召唤 / 安装 / 卸载 / 部署」）；
 *   - 传入时以 props 为准，供「已安装」列表复用同一张卡片渲染「删除」等异构动作。
 *
 * 事件：
 *   - action(entity)     操作按钮点击（已 stopPropagation，不会冒泡成卡片点击）
 *   - cardClick(entity)  卡片本体点击
 */
import { computed } from 'vue';
import { NCard, NButton, NTag, NText } from 'naive-ui';
import type { EntityDef } from '../../types/market';
import { getActionLabel } from '../../types/market';

const props = withDefaults(
  defineProps<{
    entity: EntityDef;
    /** 覆盖操作按钮文案；不传按实体类型推导 */
    actionLabel?: string;
    /** 覆盖操作按钮类型；不传按实体类型推导 */
    actionType?: 'primary' | 'error' | 'default';
    /** 隐藏左上角操作按钮（纯展示场景） */
    hideAction?: boolean;
  }>(),
  { actionLabel: '', actionType: undefined, hideAction: false }
);

const emit = defineEmits<{
  (e: 'action', entity: EntityDef): void;
  (e: 'cardClick', entity: EntityDef): void;
}>();

/** 最终按钮文案：props 优先，其次按实体类型推导 */
const resolvedLabel = computed<string>(() =>
  props.actionLabel !== '' ? props.actionLabel : getActionLabel(props.entity)
);

/** 按实体类型推导的默认按钮类型 */
const derivedType = computed<'primary' | 'error' | 'default'>(() => {
  const e = props.entity;
  if (e.entityType === 'expert' || e.entityType === 'expertTeam') return 'primary';
  if (e.entityType === 'skill') return e.installed ? 'error' : 'primary';
  if (e.entityType === 'mcp') return e.deployed ? 'error' : 'primary';
  return 'default';
});

/** 最终按钮类型：props 优先 */
const resolvedType = computed<'primary' | 'error' | 'default'>(
  () => props.actionType ?? derivedType.value
);

/** 标签最多显示 4 个 */
const visibleTags = computed<string[]>(() => (props.entity.tags ?? []).slice(0, 4));

function onClick(): void {
  emit('cardClick', props.entity);
}

function onAction(e: MouseEvent): void {
  e.stopPropagation();
  emit('action', props.entity);
}
</script>

<template>
  <n-card
    size="small"
    hoverable
    class="km-entity-card"
    @click="onClick"
  >
    <!-- 左上角操作按钮 -->
    <div v-if="!hideAction" class="km-entity-card-action">
      <n-button
        size="tiny"
        :type="resolvedType"
        ghost
        @click="onAction"
      >
        {{ resolvedLabel }}
      </n-button>
    </div>

    <!-- 图标 -->
    <div class="km-entity-card-icon">
      <span class="km-entity-card-icon-text">{{ entity.icon || '📦' }}</span>
    </div>

    <!-- 名称 -->
    <n-text strong class="km-entity-card-name" tag="div">
      {{ entity.name }}
    </n-text>

    <!-- 简介 -->
    <n-text depth="3" class="km-entity-card-desc">
      {{ entity.description }}
    </n-text>

    <!-- 标签 -->
    <div class="km-entity-card-tags">
      <n-tag
        v-for="tag in visibleTags"
        :key="tag"
        size="tiny"
        :bordered="false"
      >
        {{ tag }}
      </n-tag>
    </div>
  </n-card>
</template>

<style scoped>
.km-entity-card {
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
  display: flex;
  flex-direction: column;
  position: relative;
  height: 220px;
}

.km-entity-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
}

.km-entity-card-action {
  position: absolute;
  top: 10px;
  left: 10px;
  z-index: 2;
}

.km-entity-card-icon {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 16px 0 8px;
}

.km-entity-card-icon-text {
  font-size: 40px;
  line-height: 1;
}

.km-entity-card-name {
  text-align: center;
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding: 0 8px;
}

.km-entity-card-desc {
  font-size: 12px;
  line-height: 1.5;
  text-align: center;
  padding: 6px 8px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  flex: 1;
}

.km-entity-card-tags {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 4px;
  padding: 4px 8px 0;
}
</style>
