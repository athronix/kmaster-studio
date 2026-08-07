<script setup lang="ts">
/**
 * ResourceCard — 统一资源卡片组件（T02 重写）。
 *
 * 专家 / 技能 / MCP 三类资源共用，通过 props 控制行为。
 * 新布局：header（icon+name 左 + 操作按钮右）/ 简介两行截断 / footer tags。
 */
import { ref, computed } from 'vue';
import { NTag, NButton, NText } from 'naive-ui';
import type { ResourceItem } from '../../types/market';

// ═══════════════════ Props & Emits ═══════════════════

const props = withDefaults(
  defineProps<{
    item: ResourceItem;
    /** img 加载失败时的 fallback emoji */
    fallbackIcon?: string;
    /** 主操作按钮文案（召唤/安装/部署） */
    actionLabel?: string;
  }>(),
  {
    fallbackIcon: '🤖',
    actionLabel: '',
  }
);

const emit = defineEmits<{
  summon: [id: string];
  install: [id: string];
  uninstall: [id: string];
  click: [item: ResourceItem];
}>();

// ═══════════════════ 图标 fallback ═══════════════════

const imgFailed = ref(false);

function onIconError(): void {
  imgFailed.value = true;
}

const showFallback = computed(() => imgFailed.value || !props.item.icon);

// ═══════════════════ 操作按钮文案 ═══════════════════

const primaryLabel = computed(() => {
  if (props.actionLabel) return props.actionLabel;
  return '安装';
});

// ═══════════════════ 事件 ═══════════════════

function onCardClick(): void {
  emit('click', props.item);
}

function onPrimaryAction(): void {
  if (primaryLabel.value === '召唤') {
    emit('summon', props.item.id);
  } else {
    emit('install', props.item.id);
  }
}

function onUninstall(): void {
  emit('uninstall', props.item.id);
}
</script>

<template>
  <div
    class="rc-card"
    :style="{ background: 'var(--km-card-bg)', borderColor: 'var(--km-card-border)' }"
    @click="onCardClick"
  >
    <!-- header：icon + name 左 | 按钮右 -->
    <div class="rc-header">
      <div class="rc-header-left">
        <div class="rc-icon-wrap">
          <img
            v-if="!showFallback"
            :src="item.icon"
            alt=""
            @error="onIconError"
          />
          <span v-else class="rc-icon-fallback">{{ fallbackIcon }}</span>
        </div>
        <NText strong class="rc-name">{{ item.name }}</NText>
      </div>
      <div class="rc-header-right">
        <NTag v-if="item.installed" type="success" size="small">installed</NTag>
        <NButton v-if="item.installed" size="tiny" quaternary @click.stop="onUninstall">卸载</NButton>
        <NButton size="small" type="primary" @click.stop="onPrimaryAction">{{ primaryLabel }}</NButton>
      </div>
    </div>

    <!-- 简介：两行截断 -->
    <p class="rc-desc">{{ item.description }}</p>

    <!-- footer tags -->
    <div class="rc-footer">
      <NTag v-if="item.category" size="tiny" :bordered="false" type="default">{{ item.category }}</NTag>
      <NTag v-for="tag in item.tags.slice(0, 5)" :key="tag" size="tiny" :bordered="false" type="default">{{ tag }}</NTag>
    </div>
  </div>
</template>

<style scoped>
.rc-card {
  position: relative;
  border-radius: 8px;
  padding: 12px;
  width: 100%;
  cursor: pointer;
  border: 1px solid var(--km-card-border);
  transition: box-shadow 0.18s ease, transform 0.18s ease;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.rc-card:hover {
  box-shadow: var(--km-shadow-card);
  transform: translateY(-2px);
}

/* header：icon + name 左 | 操作按钮右 */
.rc-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.rc-header-left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.rc-header-right {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

/* 图标 32×32 */
.rc-icon-wrap {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--km-icon-bg, #f5f5f5);
  flex-shrink: 0;
}

.rc-icon-wrap img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.rc-icon-fallback {
  font-size: 18px;
  line-height: 1;
}

/* 名称 flex-1 左对齐 */
.rc-name {
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  text-align: left;
}

/* 简介：两行截断 */
.rc-desc {
  margin: 0;
  font-size: 11px;
  line-height: 1.45;
  color: var(--km-text-secondary, #888);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-all;
}

/* footer tags flex-wrap */
.rc-footer {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: auto;
}
</style>
