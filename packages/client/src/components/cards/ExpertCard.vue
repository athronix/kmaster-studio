<script setup lang="ts">
/**
 * ExpertCard — 专家卡片组件（T09）。
 *
 * 展示：头像/名称/职业标签/简介2行截断/来源标记（hermes=紫/COS=蓝/自建=绿）。
 * TencentZone 专家加「仅供自用」标签。可编辑模式显示删除按钮。
 *
 * Props 接受两个联合类型以满足已装和候选池的不同数据源。
 */
import { computed } from 'vue';
import { NCard, NButton, NTag, NText } from 'naive-ui';

export interface ExpertCardData {
  id: string;
  name: string;
  icon: string;
  description: string;
  tags: string[];
  source: string;
  /** 候选专家特有 */
  profession?: string;
  doNotRedistribute?: boolean;
}

const props = defineProps<{
  expert: ExpertCardData;
  /** 是否可编辑（自建专家可删除） */
  editable?: boolean;
}>();

const emit = defineEmits<{
  (e: 'click', expert: ExpertCardData): void;
  (e: 'import', expert: ExpertCardData): void;
  (e: 'delete', expert: ExpertCardData): void;
}>();

/** 来源标记色 */
const sourceColors: Record<string, {
  label: string;
  type: 'info' | 'success' | 'warning' | 'default';
}> = {
  hermes: { label: 'hermes', type: 'warning' },
  cos: { label: 'COS', type: 'info' },
  user: { label: '自建', type: 'success' },
};

const sourceInfo = computed(() => {
  const src = props.expert.source ?? 'cos';
  return sourceColors[src] ?? { label: src, type: 'default' as const };
});

/** TencentZone 标记 */
const isTencentOnly = computed(() => {
  return props.expert.doNotRedistribute === true;
});

/** 职业标签 */
const jobTag = computed(() => {
  if (props.expert.profession) return props.expert.profession;
  const tags = props.expert.tags ?? [];
  const skip = ['tencent', '腾讯', 'featured', 'hot', 'new'];
  return tags.find((t: string) => !skip.includes(t.toLowerCase())) ?? '';
});

function onClick(): void {
  emit('click', props.expert);
}

function onImport(e: MouseEvent): void {
  e.stopPropagation();
  emit('import', props.expert);
}

function onDelete(e: MouseEvent): void {
  e.stopPropagation();
  emit('delete', props.expert);
}
</script>

<template>
  <n-card size="small" hoverable class="km-expert-card" @click="onClick">
    <!-- 来源标记 -->
    <div class="km-expert-source">
      <n-tag :type="sourceInfo.type" size="tiny" :bordered="false">
        {{ sourceInfo.label }}
      </n-tag>
      <n-tag
        v-if="isTencentOnly"
        type="error"
        size="tiny"
        :bordered="false"
        style="margin-left: 4px"
      >
        仅供自用
      </n-tag>
    </div>

    <!-- 头像图标 -->
    <div class="km-expert-icon">
      <span class="km-expert-icon-text">{{ expert.icon || 'Robot' }}</span>
    </div>

    <!-- 名称 -->
    <n-text strong class="km-expert-name" tag="div">
      {{ expert.name }}
    </n-text>

    <!-- 职业标签 -->
    <div v-if="jobTag" class="km-expert-job">
      <n-tag size="tiny" :bordered="false" round>{{ jobTag }}</n-tag>
    </div>

    <!-- 简介（2行截断） -->
    <n-text depth="3" class="km-expert-desc">
      {{ expert.description }}
    </n-text>

    <!-- 操作区 -->
    <div class="km-expert-actions" @click.stop>
      <n-button
        v-if="editable"
        size="tiny"
        type="error"
        ghost
        @click="onDelete"
      >
        删除
      </n-button>
      <n-button
        v-else-if="expert.source !== 'hermes' && expert.source !== 'user'"
        size="tiny"
        type="primary"
        ghost
        @click="onImport"
      >
        导入为角色
      </n-button>
    </div>
  </n-card>
</template>

<style scoped>
.km-expert-card {
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
  height: 240px;
}

.km-expert-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
}

.km-expert-source {
  position: absolute;
  top: 10px;
  left: 10px;
  z-index: 2;
  display: flex;
  align-items: center;
}

.km-expert-icon {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 20px 0 8px;
}

.km-expert-icon-text {
  font-size: 40px;
  line-height: 1;
}

.km-expert-name {
  text-align: center;
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding: 0 8px;
  max-width: 100%;
}

.km-expert-job {
  margin-top: 4px;
}

.km-expert-desc {
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

.km-expert-actions {
  padding: 8px 0 4px;
}
</style>
