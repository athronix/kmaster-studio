<script setup lang="ts">
/**
 * PageHeader — 8 个主体页共用的 title 栏（R-08，设计 §7.1 契约逐字落地）。
 *
 * 按钮位序（**8 页必须一致**）：
 *   `[☰ 左栏显隐] [Title] [#title-extra] ……… [🔍 搜索框] [#actions] [⧉ 右栏显隐]`
 *
 * 布局硬约束：高 48px（`LAYOUT_LIMITS.headerHeight`）、`padding: 0 12px`、
 * 左区 `flex:1; min-width:0`、右区 `flex-shrink:0; gap:4px`。
 *
 * 左/右栏显隐直接落到 `stores/layout`（唯一真源），同时向外 emit 便于页面附加行为。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { NButton, NInput } from 'naive-ui';
import { INTERACTION, LAYOUT_LIMITS } from '../../constants/layout';
import { useLayoutStore } from '../../stores/layout';
import { keyboardActions } from '../../composables/useKeyboard';
import KIcon from '../common/KIcon.vue';

const props = withDefaults(
  defineProps<{
    /** 页面标题（必填） */
    title: string;
    /** 隐藏「左栏显隐」按钮 */
    hideLeft?: boolean;
    /** 隐藏「右栏显隐」按钮 */
    hideRight?: boolean;
    /** 是否显示内容搜索框 */
    showSearch?: boolean;
    /** 搜索框占位文案 */
    searchPlaceholder?: string;
    /** 内嵌模式（设置类别页）：不渲染左右栏按钮，避免与外层 title 栏重复 */
    embedded?: boolean;
  }>(),
  {
    hideLeft: false,
    hideRight: false,
    showSearch: true,
    searchPlaceholder: '搜索…',
    embedded: false,
  }
);

const emit = defineEmits<{
  (e: 'toggle-left'): void;
  (e: 'toggle-right'): void;
  (e: 'search', q: string): void;
}>();

const layout = useLayoutStore();

/** 搜索框当前值（受控，防抖后才 emit）。 */
const query = ref<string>('');
const inputRef = ref<InstanceType<typeof NInput> | null>(null);

/** 头部高度锁定，避免各页各写一遍魔数。 */
const headerHeight = `${LAYOUT_LIMITS.headerHeight}px`;

const showLeftBtn = computed<boolean>(() => !props.embedded && !props.hideLeft);
const showRightBtn = computed<boolean>(() => !props.embedded && !props.hideRight);

// ── 搜索防抖 300ms（与 CardMarketLayout / LogSection 一致）──
let searchTimer: ReturnType<typeof setTimeout> | null = null;

function onSearchInput(value: string): void {
  query.value = value ?? '';
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    emit('search', query.value.trim());
  }, INTERACTION.searchDebounceMs);
}

/** 供 Ctrl+F 与父组件调用：聚焦搜索框。 */
function focusSearch(): void {
  const el = inputRef.value as unknown as { focus?: () => void } | null;
  el?.focus?.();
}

// ── 左右栏显隐 ──
function onToggleLeft(): void {
  layout.toggleLeft();
  emit('toggle-left');
}

function onToggleRight(): void {
  layout.toggleRight();
  emit('toggle-right');
}

// ── Ctrl+F 注册：同一时刻只有一个主体页挂载，卸载时归还 ──
onMounted(() => {
  if (props.showSearch) keyboardActions.focusPageSearch.value = focusSearch;
});

onBeforeUnmount(() => {
  if (searchTimer) clearTimeout(searchTimer);
  if (keyboardActions.focusPageSearch.value === focusSearch) {
    keyboardActions.focusPageSearch.value = null;
  }
});

defineExpose({ focusSearch });
</script>

<template>
  <header class="km-page-header" :style="{ height: headerHeight }">
    <!-- 左区：[☰] [Title] [#title-extra] -->
    <div class="km-ph-left">
      <n-button
        v-if="showLeftBtn"
        quaternary
        circle
        size="small"
        class="km-ph-icon"
        :title="layout.leftCollapsed ? '展开左栏（Ctrl+B）' : '折叠左栏（Ctrl+B）'"
        @click="onToggleLeft"
      >
        <template #icon><KIcon name="Menu2" :size="18" /></template>
      </n-button>

      <h1 class="km-ph-title">{{ title }}</h1>

      <slot name="title-extra" />
    </div>

    <!-- 右区：[🔍 搜索框] [#actions] [⧉] -->
    <div class="km-ph-right">
      <n-input
        v-if="showSearch"
        ref="inputRef"
        class="km-ph-search"
        size="small"
        clearable
        :value="query"
        :placeholder="searchPlaceholder"
        @update:value="onSearchInput"
      >
        <template #prefix><KIcon name="Search" :size="16" /></template>
      </n-input>

      <slot name="actions" />

      <n-button
        v-if="showRightBtn"
        quaternary
        circle
        size="small"
        class="km-ph-icon"
        :title="layout.rightCollapsed ? '展开右栏（Ctrl+\\）' : '折叠右栏（Ctrl+\\）'"
        @click="onToggleRight"
      >
        <template #icon><KIcon name="LayoutGrid" :size="18" /></template>
      </n-button>
    </div>
  </header>
</template>

<style scoped>
.km-page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  gap: 8px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--km-border);
  background: var(--km-panel);
  color: var(--km-text);
}

.km-ph-left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.km-ph-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 320px;
}

.km-ph-right {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.km-ph-search {
  width: 220px;
}

.km-ph-icon {
  flex-shrink: 0;
}

/* 窄屏收敛搜索框，保证按钮位序不被挤断 */
@media (max-width: 1100px) {
  .km-ph-search {
    width: 150px;
  }
}
</style>
