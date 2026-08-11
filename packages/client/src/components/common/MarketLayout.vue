<script setup lang="ts">
/**
 * MarketLayout — 统一市场布局组件。
 *
 * 接受 MarketConfig，内部调用 config.useList(opts) 获取 MarketListState，
 * 渲染精选推荐 / 已安装 / 资源市场三大区域。
 *
 * T02 改动：
 *   ① 分类标签 + 排序合并一行（ml-tabs-sort-row）
 *   ② 分类标签显示数量
 *   ③ CSS Grid 替代 flex-wrap
 *   ④ handleCardClick emit card-click
 *
 * T3（三模块卡片布局）改动：
 *   ⑤ 列数不再按 window.innerWidth 断点，改由 useMarketLayout() 读系统设置
 *     （localStorage['km_grid_cols']），并随 market-layout-changed 事件即时重排
 *   ⑥ `--km-grid-cols` 从全局 documentElement 改为 .ml-root 局部 :style 注入
 *   ⑦ 精选推荐 / 已安装由 NScrollbar 横向滚动改为 CSS Grid + 独立 NPagination
 *   ⑧ 已安装徽标显示总数（installedCount）而非当前页长度
 *   ⑨ findItem 改用 marketState.findById（在全量数据中查，避免跨页误查）
 */
import { computed } from 'vue';
import KIcon from './KIcon.vue';
import {
  NInput,
  NButton,
  NTag,
  NPopover,
  NPagination,
  NText,
  NDropdown,
  useMessage,
} from 'naive-ui';
import ResourceCard from './ResourceCard.vue';
import SkeletonCard from './SkeletonCard.vue';
import { useInstall } from '../../composables/useInstall';
import { useMarketLayout } from '../../composables/useMarketLayout';
import { postMcp, deleteMcp as apiDeleteMcp } from '../../api/client';
import type { MarketConfig, ResourceItem, SortOrder } from '../../types/market';
import type { CssVars } from '../../types/settings';

// ═══════════════════ Props & Emits ═══════════════════

const props = defineProps<{
  config: MarketConfig;
}>();

const emit = defineEmits<{
  'card-click': [item: ResourceItem];
}>();

const message = useMessage();

// ═══════════════════ 数据源 ═══════════════════

// showFeatured 以 config 为单一真源下发，同时驱动「精选是否显示」与「市场是否 dedup」
const marketState = props.config.useList({ showFeatured: props.config.showFeatured });
const { install, uninstall, summon, isInstalling } = useInstall(props.config.entityType);

// ═══════════════════ 图标 fallback ═══════════════════

const FALLBACK_ICONS: Record<string, string> = {
  expert: 'Robot',
  skill: 'Puzzle',
  mcp: 'PlugConnected',
};

const fallbackIcon = computed(() => FALLBACK_ICONS[props.config.entityType] || 'Package');

// ═══════════════════ 排序 ═══════════════════

const sortOptions: Array<{ key: SortOrder; label: string }> = [
  { key: 'default', label: '综合' },
  { key: 'hot', label: '最热' },
  { key: 'newest', label: '最新' },
];

const sortDropdownOptions = computed(() =>
  sortOptions.map((opt) => ({
    key: opt.key,
    label: opt.label,
  }))
);

const currentSortLabel = computed(() => {
  const found = sortOptions.find((o) => o.key === marketState.sortOrder.value);
  return found ? found.label : '综合';
});

function onSortSelect(key: string): void {
  marketState.setSort(key as SortOrder);
}

// ═══════════════════ CSS Grid 列数（系统设置驱动）═══════════════════

const { gridCols } = useMarketLayout();

/** 局部注入 --km-grid-cols，作用域内所有 .ml-card-grid / .km-skel-grid 继承。 */
const rootStyle = computed<CssVars>(() => ({
  '--km-grid-cols': String(gridCols.value),
}));

/** 骨架屏卡片数量：与真实列数一致，加载态不跳变。 */
const skeletonCount = computed(() => gridCols.value * 2);

// ═══════════════════ 领域分类溢出 ═══════════════════

const MAX_VISIBLE_CATEGORIES = 6;

const visibleCategories = computed(() =>
  marketState.categories.value.slice(0, MAX_VISIBLE_CATEGORIES)
);

const overflowCategories = computed(() =>
  marketState.categories.value.slice(MAX_VISIBLE_CATEGORIES)
);

const hasOverflow = computed(() => overflowCategories.value.length > 0);

// ═══════════════════ 主操作按钮文案 ═══════════════════

const primaryActionLabel = computed(() => {
  switch (props.config.entityType) {
    case 'expert':
      return '召唤';
    case 'skill':
      return '安装';
    case 'mcp':
      return '部署';
    default:
      return '操作';
  }
});

// ═══════════════════ 操作回调 ═══════════════════

async function handleInstall(id: string): Promise<void> {
  try {
    const item = findItem(id);
    if (!item) return;
    if (props.config.entityType === 'mcp') {
      await postMcp({ name: item.name, command: item.name });
      message.success(`${item.name} 部署成功`);
      return;
    }
    await install(item.name);
    message.success(`${item.name} 安装成功`);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '操作失败';
    message.error(msg);
  }
}

async function handleUninstall(id: string): Promise<void> {
  try {
    const item = findItem(id);
    if (!item) return;
    if (props.config.entityType === 'mcp') {
      await apiDeleteMcp(item.name);
      message.success(`${item.name} 已卸载`);
      return;
    }
    await uninstall(item.name);
    message.success(`${item.name} 已卸载`);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '卸载失败';
    message.error(msg);
  }
}

async function handleSummon(id: string): Promise<void> {
  try {
    const item = findItem(id);
    if (!item) return;
    await summon(item.name);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '召唤失败';
    message.error(msg);
  }
}

function handleCardClick(item: ResourceItem): void {
  emit('card-click', item);
}

function findItem(id: string): ResourceItem | undefined {
  return marketState.findById(id);
}

// ═══════════════════ 搜索 ═══════════════════

function onSearchInput(value: string): void {
  marketState.search(value);
}
</script>

<template>
  <div class="ml-root" :style="rootStyle">
    <!-- 搜索框 -->
    <div class="ml-toolbar">
      <NInput
        :value="marketState.searchQuery.value"
        placeholder="搜索…"
        clearable
        class="ml-search"
        @update:value="onSearchInput"
      >
        <template #prefix><KIcon name="Search" :size="16" /></template>
      </NInput>
    </div>

    <!-- 加载状态：骨架屏 -->
    <div v-if="marketState.state.value.loading" class="ml-body">
      <div class="km-skel-grid">
        <SkeletonCard v-for="n in skeletonCount" :key="n" />
      </div>
    </div>

    <!-- 正常内容 -->
    <div v-else class="ml-body">
      <!-- 错误提示 -->
      <div v-if="marketState.state.value.error" class="ml-error">
        <NText type="error">{{ marketState.state.value.error }}</NText>
      </div>

      <template v-if="!marketState.state.value.error">
        <!-- 1. 精选推荐 -->
        <section
          v-if="config.showFeatured && marketState.featuredItems.value.length"
          class="ml-section"
        >
          <h3 class="ml-section-title"><KIcon name="Sparkles" :size="16" /> 精选推荐</h3>
          <div class="ml-card-grid">
            <ResourceCard
              v-for="item in marketState.featuredItems.value"
              :key="`feat-${item.id}`"
              :item="item"
              :fallback-icon="fallbackIcon"
              :action-label="primaryActionLabel"
              @install="handleInstall"
              @uninstall="handleUninstall"
              @summon="handleSummon"
              @click="handleCardClick"
            />
          </div>
          <div v-if="marketState.featuredTotalPages.value > 1" class="ml-pagination">
            <NPagination
              :page="marketState.featuredPage.value"
              :page-count="marketState.featuredTotalPages.value"
              size="small"
              @update:page="marketState.goToFeaturedPage"
            />
          </div>
        </section>

        <!-- 2. 已安装 -->
        <section
          v-if="marketState.installedCount.value"
          class="ml-section"
        >
          <h3 class="ml-section-title">
            已安装
            <span class="ml-count">{{ marketState.installedCount.value }}</span>
          </h3>
          <div class="ml-card-grid">
            <ResourceCard
              v-for="item in marketState.installedItems.value"
              :key="`inst-${item.id}`"
              :item="item"
              :fallback-icon="fallbackIcon"
              :action-label="primaryActionLabel"
              @install="handleInstall"
              @uninstall="handleUninstall"
              @summon="handleSummon"
              @click="handleCardClick"
            />
          </div>
          <div v-if="marketState.installedTotalPages.value > 1" class="ml-pagination">
            <NPagination
              :page="marketState.installedPage.value"
              :page-count="marketState.installedTotalPages.value"
              size="small"
              @update:page="marketState.goToInstalledPage"
            />
          </div>
        </section>

        <!-- 3. 资源市场 -->
        <section class="ml-section">
          <h3 class="ml-section-title">资源市场</h3>

          <!-- 3a/3b. 分类标签 + 排序合并一行（T02 N3） -->
          <div class="ml-tabs-sort-row">
            <div class="ml-primary-tabs">
              <NButton
                v-for="tab in config.primaryTabs"
                :key="tab.key"
                size="small"
                :type="marketState.selectedCategory.value === tab.key ? 'primary' : 'default'"
                :secondary="marketState.selectedCategory.value !== tab.key"
                @click="marketState.filterByCategory(tab.key)"
              >
                {{ tab.label }} ({{ tab.count }})
              </NButton>
            </div>
            <NDropdown trigger="click" :options="sortDropdownOptions" @select="onSortSelect">
              <NButton size="small">{{ currentSortLabel }}</NButton>
            </NDropdown>
          </div>

          <!-- 3c. 领域分类标签 -->
          <div v-if="marketState.categories.value.length" class="ml-category-row">
            <!-- 第一项固定"推荐" -->
            <NTag
              :type="marketState.selectedCategory.value === '' ? 'primary' : 'default'"
              size="small"
              :bordered="false"
              class="ml-chip"
              @click="marketState.filterByCategory('')"
            >
              推荐
            </NTag>
            <!-- 选中项插入第2位 -->
            <NTag
              v-if="marketState.selectedCategory.value"
              type="primary"
              size="small"
              :bordered="false"
              class="ml-chip"
              @click="marketState.filterByCategory('')"
            >
              {{ marketState.selectedCategory.value }}
            </NTag>
            <!-- 其余分类 -->
            <NTag
              v-for="cat in visibleCategories"
              :key="cat"
              :type="marketState.selectedCategory.value === cat ? 'primary' : 'default'"
              size="small"
              :bordered="false"
              class="ml-chip"
              @click="marketState.filterByCategory(cat)"
            >
              {{ cat }}
            </NTag>
            <!-- 溢出 "…更多" -->
            <NPopover v-if="hasOverflow" trigger="click" placement="bottom">
              <template #trigger>
                <NTag size="small" :bordered="false" class="ml-chip ml-chip-more">
                  …更多
                </NTag>
              </template>
              <div class="ml-popover-cats">
                <NTag
                  v-for="cat in overflowCategories"
                  :key="cat"
                  size="small"
                  :bordered="false"
                  class="ml-chip"
                  @click="marketState.filterByCategory(cat)"
                >
                  {{ cat }}
                </NTag>
              </div>
            </NPopover>
          </div>

          <!-- 3d. 卡片 Grid（CSS Grid） -->
          <div class="ml-card-grid">
            <ResourceCard
              v-for="item in marketState.candidateItems.value"
              :key="`cand-${item.id}`"
              :item="item"
              :fallback-icon="fallbackIcon"
              :action-label="primaryActionLabel"
              @install="handleInstall"
              @uninstall="handleUninstall"
              @summon="handleSummon"
              @click="handleCardClick"
            />
          </div>

          <!-- 空状态 -->
          <NText
            v-if="!marketState.candidateItems.value.length"
            depth="3"
            class="ml-empty"
          >
            暂无资源
          </NText>

          <!-- 3e. 分页器 -->
          <div
            v-if="marketState.totalPages.value > 1"
            class="ml-pagination"
          >
            <NPagination
              :page="marketState.currentPage.value"
              :page-count="marketState.totalPages.value"
              size="small"
              @update:page="marketState.goToPage"
            />
          </div>
        </section>
      </template>
    </div>
  </div>
</template>

<style scoped>
.ml-root {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
  flex: 1;
}

.ml-toolbar {
  padding: var(--km-space-md) var(--km-space-xl) var(--km-space-sm);
}

.ml-search {
  max-width: 360px;
}

.ml-body {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
  padding: 0 var(--km-space-xl) var(--km-space-xl);
}

.ml-error {
  padding: var(--km-space-xl) 0;
  text-align: center;
}

/* 区域 */
.ml-section {
  margin-bottom: var(--km-space-xl);
}

.ml-section-title {
  font-size: var(--km-font-sm);
  font-weight: 600;
  opacity: 0.6;
  margin: 0 0 var(--km-space-10);
  display: flex;
  align-items: center;
  gap: var(--km-space-6);
}

.ml-count {
  display: inline-block;
  padding: 0 var(--km-space-6);
  border-radius: var(--km-radius-lg);
  background: var(--km-bg, #f0f0f0);
  font-size: var(--km-font-xs);
  font-weight: 600;
  opacity: 0.8;
}

/* T02：分类标签 + 排序合并一行 */
.ml-tabs-sort-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--km-space-sm);
}

/* 大分类标签 */
.ml-primary-tabs {
  display: flex;
  gap: var(--km-space-sm);
}

/* 领域分类行 */
.ml-category-row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--km-space-6);
  margin-bottom: var(--km-space-10);
  align-items: center;
}


.ml-chip {
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  transition: transform 0.12s ease;
}

.ml-chip:hover {
  transform: translateY(-1px);
}

.ml-chip-more {
  opacity: 0.7;
}

.ml-popover-cats {
  display: flex;
  flex-wrap: wrap;
  gap: var(--km-space-6);
  max-width: 220px;
 padding: var(--km-space-sm);
}

/* T02：CSS Grid 替代 flex-wrap */
.ml-card-grid {
  display: grid;
  grid-template-columns: repeat(var(--km-grid-cols, 5), 1fr);
  gap: var(--km-space-md);
}

/* 骨架屏网格 */
.km-skel-grid {
  display: grid;
  grid-template-columns: repeat(var(--km-grid-cols, 5), 1fr);
  gap: var(--km-space-md);
}

/* 空状态 */
.ml-empty {
  display: block;
  padding: var(--km-space-xl) 0;
  text-align: center;
}

/* 分页 */
.ml-pagination {
  display: flex;
  justify-content: center;
  padding: var(--km-space-lg) 0 var(--km-space-sm);
}
</style>
