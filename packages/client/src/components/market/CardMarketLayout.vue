<script setup lang="ts">
/**
 * CardMarketLayout — 卡片市场共用布局组件。
 *
 * 适用场景：专家市场 / 技能市场 / MCP 管理三个页面，
 * V3 T4 起额外承担「设置 → Skills / MCP 管理」的已安装视图。
 *
 * 通过 props 注入实体列表、标题、精选等差异数据，
 * 通过 slots 注入卡片、精选卡片、已安装卡片的渲染差异。
 *
 * 结构：
 * - 顶栏：标题 + 搜索框（hideHeader 时由外层 PageHeader 接管）
 * - 首屏模块：
 *     · 默认         → 精选推荐（横向滚动）
 *     · installedMode → 已安装列表（独立搜索 + 标签平铺 + 2×5 网格 + 分页）
 * - 分类工具栏：大类标签 + 排序 + 领域标签（频度排序）
 * - 卡片网格（CSS Grid 5 列）+ 分页
 */
import { computed, ref, watch, type PropType } from 'vue';
import {
  NInput,
  NSelect,
  NTabs,
  NTabPane,
  NTag,
  NScrollbar,
  NPagination,
  NDropdown,
  NEmpty,
} from 'naive-ui';
import { useSortedDomains, recordDomainClick } from '../../composables/useDomainTags';
import { INTERACTION } from '../../constants/layout';
import type { EntityDef, SortOrder } from '../../types/market';

const props = defineProps({
  title: { type: String, required: true },
  entities: { type: Array as PropType<EntityDef[]>, required: true },
  featuredItems: { type: Array as PropType<EntityDef[]>, default: () => [] },
  categories: { type: Array as PropType<string[]>, default: () => [] },
  currentCategory: { type: String, default: '' },
  sort: { type: String as PropType<SortOrder>, default: 'default' },
  page: { type: Number, default: 1 },
  pageSize: { type: Number, default: 20 },
  total: { type: Number, default: 0 },
  /** 领域标签列表 */
  domainTags: { type: Array as PropType<string[]>, default: () => [] },
  /** 顶部标题+搜索栏是否隐藏（被外层 PageHeader 接管时使用） */
  hideHeader: { type: Boolean, default: false },
  /** V3 T4：以「已安装」模块替换首屏的精选推荐模块 */
  installedMode: { type: Boolean, default: false },
  /** 已安装实体列表（installedMode 生效时使用） */
  installedItems: { type: Array as PropType<EntityDef[]>, default: () => [] },
  /** 已安装模块标题 */
  installedTitle: { type: String, default: '已安装' },
});

const emit = defineEmits<{
  (e: 'update:category', v: string): void;
  (e: 'update:sort', v: SortOrder): void;
  (e: 'update:page', v: number): void;
  (e: 'update:pageSize', v: number): void;
  (e: 'search', v: string): void;
  (e: 'select', entity: EntityDef): void;
  (e: 'installed-action', entity: EntityDef): void;
}>();

const searchQuery = ref('');
const MAX_VISIBLE_DOMAIN_TAGS = 8;

// 搜索防抖 300ms
let searchTimer: ReturnType<typeof setTimeout> | null = null;
function onSearchInput(val: string): void {
  searchQuery.value = val;
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    emit('search', val);
  }, INTERACTION.searchDebounceMs);
}

// 领域标签排序
const { sortedTags, visibleTags, overflowTags } = useSortedDomains(
  computed(() => props.domainTags),
  MAX_VISIBLE_DOMAIN_TAGS
);

const activeDomainTag = ref('推荐');

function onDomainClick(tag: string): void {
  activeDomainTag.value = tag;
  if (tag !== '推荐') {
    recordDomainClick(tag);
  }
}

// 排序选项
const sortOptions = [
  { label: '综合', value: 'default' as SortOrder },
  { label: '最热', value: 'hot' as SortOrder },
  { label: '最新', value: 'newest' as SortOrder },
];

// 大类标签切换
function onCategoryChange(cat: string): void {
  emit('update:category', cat);
  activeDomainTag.value = '推荐';
}

// ═══════════════════════ 已安装模块（V3 T4 / S4.8） ═══════════════════════

/** 已安装模块的独立搜索关键字（不与市场搜索共用） */
const installedQuery = ref('');
const installedDebounced = ref('');
let installedTimer: ReturnType<typeof setTimeout> | null = null;

/** 已安装模块当前选中的标签，'全部' 表示不过滤 */
const installedTag = ref('全部');

/** 已安装模块当前页码（1 起） */
const installedPage = ref(1);

/** 每页 10 条（2 行 × 5 列，§7.5） */
const installedPageSize = INTERACTION.installedPageSize;

function onInstalledSearch(val: string): void {
  installedQuery.value = val;
  if (installedTimer) clearTimeout(installedTimer);
  installedTimer = setTimeout(() => {
    installedDebounced.value = val;
    installedPage.value = 1;
  }, INTERACTION.searchDebounceMs);
}

function onInstalledTag(tag: string): void {
  installedTag.value = tag;
  installedPage.value = 1;
}

/** 已安装项里出现过的标签（平铺展示，最多 12 个 + 全部） */
const installedTagOptions = computed<string[]>(() => {
  const counter = new Map<string, number>();
  for (const item of props.installedItems) {
    for (const tag of item.tags ?? []) {
      counter.set(tag, (counter.get(tag) ?? 0) + 1);
    }
  }
  const sorted = Array.from(counter.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 12)
    .map(([tag]) => tag);
  return ['全部', ...sorted];
});

/** 搜索 + 标签过滤后的已安装项 */
const installedFiltered = computed<EntityDef[]>(() => {
  const q = installedDebounced.value.trim().toLowerCase();
  const tag = installedTag.value;
  return props.installedItems.filter((item) => {
    if (tag !== '全部' && !(item.tags ?? []).includes(tag)) return false;
    if (q === '') return true;
    const hay = `${item.name} ${item.description} ${(item.tags ?? []).join(' ')}`.toLowerCase();
    return hay.includes(q);
  });
});

/** 当前页的已安装项 */
const installedPaged = computed<EntityDef[]>(() => {
  const start = (installedPage.value - 1) * installedPageSize;
  return installedFiltered.value.slice(start, start + installedPageSize);
});

/** 过滤后总数变化时把越界页码拉回最后一页 */
watch(installedFiltered, (list) => {
  const maxPage = Math.max(1, Math.ceil(list.length / installedPageSize));
  if (installedPage.value > maxPage) installedPage.value = maxPage;
});

function resetInstalledFilters(): void {
  installedQuery.value = '';
  installedDebounced.value = '';
  installedTag.value = '全部';
  installedPage.value = 1;
}
</script>

<template>
  <div class="km-market">
    <!-- 顶栏 -->
    <div v-if="!hideHeader" class="km-market-header">
      <h2 class="km-market-title">{{ title }}</h2>
      <n-input
        v-model:value="searchQuery"
        placeholder="搜索…"
        clearable
        class="km-market-search"
        @update:value="onSearchInput"
      />
    </div>

    <!-- 首屏模块 A：已安装（installedMode） -->
    <div v-if="installedMode" class="km-market-installed">
      <div class="km-market-installed-head">
        <h3 class="km-market-featured-title">
          {{ installedTitle }}
          <span class="km-market-installed-count">{{ installedFiltered.length }}</span>
        </h3>
        <n-input
          :value="installedQuery"
          size="small"
          placeholder="在已安装中搜索…"
          clearable
          class="km-market-installed-search"
          @update:value="onInstalledSearch"
        />
      </div>

      <div v-if="installedTagOptions.length > 1" class="km-market-installed-tags">
        <n-tag
          v-for="tag in installedTagOptions"
          :key="tag"
          :type="installedTag === tag ? 'primary' : 'default'"
          size="small"
          :bordered="false"
          class="km-domain-tag"
          @click="onInstalledTag(tag)"
        >{{ tag }}</n-tag>
      </div>

      <div class="km-market-installed-grid">
        <slot
          name="installed-card"
          v-for="item in installedPaged"
          :key="item.id"
          :entity="item"
        />
      </div>

      <n-empty
        v-if="!installedFiltered.length"
        class="km-market-installed-empty"
        :description="installedItems.length ? '没有符合条件的已安装项' : '尚未安装任何项目，可在下方市场中挑选'"
      >
        <template v-if="installedItems.length" #extra>
          <n-tag size="small" :bordered="false" class="km-domain-tag" @click="resetInstalledFilters">
            清除筛选
          </n-tag>
        </template>
      </n-empty>

      <div v-if="installedFiltered.length > installedPageSize" class="km-market-installed-pager">
        <n-pagination
          :page="installedPage"
          :page-size="installedPageSize"
          :item-count="installedFiltered.length"
          size="small"
          @update:page="(p: number) => (installedPage = p)"
        />
      </div>
    </div>

    <!-- 首屏模块 B：精选推荐（默认） -->
    <div v-else-if="featuredItems.length" class="km-market-featured">
      <h3 class="km-market-featured-title">精选推荐</h3>
      <n-scrollbar x-scrollable>
        <div class="km-market-featured-scroll">
          <slot
            name="featured-card"
            v-for="item in featuredItems"
            :key="item.id"
            :entity="item"
          />
        </div>
      </n-scrollbar>
    </div>

    <!-- 分类工具栏 -->
    <div class="km-market-toolbar">
      <!-- 大类标签 + 排序 -->
      <div class="km-market-main-tags">
        <n-tabs
          v-if="categories.length"
          :value="currentCategory || categories[0]"
          type="line"
          size="small"
          @update:value="onCategoryChange"
        >
          <n-tab-pane v-for="cat in categories" :key="cat" :name="cat" :tab="cat" />
        </n-tabs>
        <div class="km-market-toolbar-spacer"></div>
        <n-select
          :value="sort"
          :options="sortOptions"
          size="small"
          style="width: 100px"
          @update:value="(v: SortOrder) => emit('update:sort', v)"
        />
      </div>

      <!-- 领域标签 -->
      <div v-if="sortedTags.length > 1" class="km-market-sub-tags">
        <n-tag
          v-for="tag in visibleTags"
          :key="tag"
          :type="activeDomainTag === tag ? 'primary' : 'default'"
          size="small"
          :bordered="false"
          class="km-domain-tag"
          @click="onDomainClick(tag)"
        >
          {{ tag }}
        </n-tag>
        <n-dropdown
          v-if="overflowTags.length"
          trigger="click"
          :options="overflowTags.map((t) => ({ label: t, key: t }))"
          @select="(key: string) => onDomainClick(key)"
        >
          <n-tag size="small" :bordered="false" class="km-domain-tag">…</n-tag>
        </n-dropdown>
      </div>
    </div>

    <!-- 卡片网格 -->
    <div class="km-market-grid">
      <slot
        name="card"
        v-for="entity in entities"
        :key="entity.id"
        :entity="entity"
      />

      <div v-if="!entities.length" class="km-market-empty">
        暂无匹配结果
      </div>
    </div>

    <!-- 分页 -->
    <div v-if="total > pageSize" class="km-market-pagination">
      <n-pagination
        :page="page"
        :page-size="pageSize"
        :item-count="total"
        :page-sizes="[20, 50, 100]"
        @update:page="(p: number) => emit('update:page', p)"
        @update:page-size="(ps: number) => emit('update:pageSize', ps)"
      />
    </div>
  </div>
</template>

<style scoped>
.km-market {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.km-market-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--km-space-lg) var(--km-space-20) var(--km-space-md);
  flex-shrink: 0;
}

.km-market-title {
  font-size: var(--km-font-xl);
  font-weight: 700;
  margin: 0;
  white-space: nowrap;
}

.km-market-search {
  width: 280px;
  flex-shrink: 0;
}

/* ── 精选推荐 ── */
.km-market-featured {
  padding: 0 var(--km-space-20) var(--km-space-md);
  flex-shrink: 0;
}

.km-market-featured-title {
  font-size: var(--km-font-13);
  font-weight: 600;
  opacity: 0.6;
  margin: 0 0 var(--km-space-sm);
}

.km-market-featured-scroll {
  display: flex;
  gap: var(--km-space-md);
}

/* ── 已安装模块 ── */
.km-market-installed {
  padding: var(--km-space-md) var(--km-space-20);
  flex-shrink: 0;
  border-bottom: 1px solid var(--km-border);
}

.km-market-installed-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--km-space-md);
  margin-bottom: var(--km-space-sm);
}

.km-market-installed-count {
  display: inline-block;
  margin-left: 6px;
  padding: 0 var(--km-space-6);
  background: var(--km-bg);
  font-size: 11px;
  font-weight: 600;
  opacity: 0.8;
}

.km-market-installed-search {
  width: 220px;
  flex-shrink: 0;
}

.km-market-installed-tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--km-space-6);
  margin-bottom: var(--km-space-10);
}

.km-market-installed-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: var(--km-space-md);
}

.km-market-installed-empty {
  padding: var(--km-space-xl) 0;
}

.km-market-installed-pager {
  display: flex;
  justify-content: center;
  padding-top: 12px;
}

/* ── 工具栏 ── */
.km-market-toolbar {
  padding: var(--km-space-md) var(--km-space-20) var(--km-space-sm);
  flex-shrink: 0;
}

.km-market-main-tags {
  display: flex;
  align-items: center;
  gap: var(--km-space-sm);
}

.km-market-toolbar-spacer {
  flex: 1;
}

.km-market-sub-tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--km-space-6);
  padding: var(--km-space-sm) 0;
}

.km-domain-tag {
  cursor: pointer;
  transition: transform 0.12s ease;
}

.km-domain-tag:hover {
  transform: translateY(-1px);
}

/* ── 卡片网格 ── */
.km-market-grid {
  flex: 1;
  overflow-y: auto;
  padding: 0 var(--km-space-20) var(--km-space-20);
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: var(--km-space-lg);
  align-content: start;
}

.km-market-empty {
  grid-column: 1 / -1;
  text-align: center;
  padding: var(--km-space-40);
  opacity: 0.5;
  font-size: var(--km-font-md);
}

/* ── 分页 ── */
.km-market-pagination {
  display: flex;
  justify-content: center;
  padding: var(--km-space-md) var(--km-space-20) var(--km-space-lg);
  flex-shrink: 0;
}
</style>
