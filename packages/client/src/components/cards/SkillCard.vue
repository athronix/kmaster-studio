<script setup lang="ts">
/**
 * SkillCard — 技能卡片组件（T09）。
 *
 * 展示：图标/名称/版本/描述/来源标记（hermes=紫/COS=蓝/SkillHub=橙）。
 * 安装/卸载操作。点击卡片 → 父组件展示 SKILL.md 预览。
 */
import { computed } from 'vue';
import { NCard, NButton, NTag, NText } from 'naive-ui';

export interface SkillCardData {
  id: string;
  name: string;
  icon: string;
  description: string;
  tags: string[];
  source: string;
  installed: boolean;
  version?: string;
  category?: string;
}

const props = defineProps<{
  skill: SkillCardData;
  /** 是否为 SkillHub 在线搜索结果 */
  isSkillHub?: boolean;
}>();

const emit = defineEmits<{
  (e: 'click', skill: SkillCardData): void;
  (e: 'install', skill: SkillCardData): void;
  (e: 'uninstall', skill: SkillCardData): void;
}>();

/** 来源标记色 */
const sourceColors: Record<string, {
  label: string;
  type: 'info' | 'success' | 'warning' | 'default';
}> = {
  hermes: { label: 'hermes', type: 'warning' },
  cos: { label: 'COS', type: 'info' },
  skillhub: { label: 'SkillHub', type: 'warning' },
  marketplace: { label: 'Market', type: 'info' },
  local: { label: '本地', type: 'success' },
  url: { label: 'URL', type: 'warning' },
};

const sourceInfo = computed(() => {
  const src = props.isSkillHub ? 'skillhub' : props.skill.source;
  return sourceColors[src] ?? { label: src, type: 'default' as const };
});

function onClick(): void {
  emit('click', props.skill);
}

function onInstall(e: MouseEvent): void {
  e.stopPropagation();
  emit('install', props.skill);
}

function onUninstall(e: MouseEvent): void {
  e.stopPropagation();
  emit('uninstall', props.skill);
}
</script>

<template>
  <n-card size="small" hoverable class="km-skill-card" @click="onClick">
    <!-- 来源标记 -->
    <div class="km-skill-source">
      <n-tag :type="sourceInfo.type" size="tiny" :bordered="false">
        {{ sourceInfo.label }}
      </n-tag>
    </div>

    <!-- 图标 -->
    <div class="km-skill-icon">
      <span class="km-skill-icon-text">{{ skill.icon || 'Tool' }}</span>
    </div>

    <!-- 名称 + 版本 -->
    <div class="km-skill-head">
      <n-text strong class="km-skill-name" tag="div">
        {{ skill.name }}
      </n-text>
      <n-text v-if="skill.version" depth="3" class="km-skill-version" tag="span">
        v{{ skill.version }}
      </n-text>
    </div>

    <!-- 简介（2行截断） -->
    <n-text depth="3" class="km-skill-desc">
      {{ skill.description }}
    </n-text>

    <!-- 操作区 -->
    <div class="km-skill-actions" @click.stop>
      <n-button
        v-if="skill.installed"
        size="tiny"
        type="error"
        ghost
        @click="onUninstall"
      >
        卸载
      </n-button>
      <n-button
        v-else
        size="tiny"
        type="primary"
        ghost
        @click="onInstall"
      >
        安装
      </n-button>
    </div>
  </n-card>
</template>

<style scoped>
.km-skill-card {
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
  height: 210px;
}

.km-skill-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--km-shadow-card-hover);
}

.km-skill-source {
  position: absolute;
  top: 10px;
  left: 10px;
  z-index: 2;
}

.km-skill-icon {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: var(--km-space-lg) 0 var(--km-space-6);
}

.km-skill-icon-text {
  font-size: var(--km-font-3xl);
  line-height: 1;
}

.km-skill-head {
  display: flex;
  align-items: baseline;
  gap: var(--km-space-xs);
  padding: 0 var(--km-space-sm);
  max-width: 100%;
}

.km-skill-name {
  font-size: var(--km-font-base);
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.km-skill-version {
  font-size: var(--km-font-xs);
  flex-shrink: 0;
}

.km-skill-desc {
  font-size: var(--km-font-sm);
  line-height: 1.5;
  text-align: center;
  padding: var(--km-space-xs) var(--km-space-sm) 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  flex: 1;
}

.km-skill-actions {
  padding: var(--km-space-sm) 0 var(--km-space-xs);
}
</style>
