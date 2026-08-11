/**
 * useMarketList — 统一市场数据 composable。
 *
 * 接受一个 fetchAll 工厂函数（适配 agent/skill/mcp 三种数据源），
 * 返回 MarketListState —— 含精选推荐 / 已安装 / 资源市场三模块的
 * 独立分页、分类过滤、搜索、排序的完整状态。
 *
 * 核心约定：
 *   - 布局参数（列数 / 三模块行数）唯一来自 `useMarketLayout()`，
 *     本文件**不得**再直接读 localStorage。
 *   - 每页卡片数 = 列数 × 对应模块行数（三份独立）：
 *       featuredPageSize / installedPageSize / marketPageSize
 *   - 精选池 = candidates 前 `featuredPoolSize` 项
 *     （= min(FEATURED_POOL_MAX, featuredPageSize × FEATURED_MAX_PAGES)）。
 *   - `featuredActive = opts.showFeatured && 搜索为空 && 未选分类`；
 *     它**同时**决定「精选是否有数据」与「资源市场是否 dedup」，二者同生同灭。
 *     用户一旦搜索/选分类，精选让位且 dedup 关闭，保证结果不漏项。
 *   - dedup 位于 `filteredCandidates` 最前端（先于 category/search/sort，
 *     且必然早于分页切片），否则 totalPages 与实际卡片数会对不上。
 *   - filterByCategory 按 item.tags 包含过滤
 *   - search 按 item.name / item.description 模糊匹配
 *   - sortOrder: 'hot' = installed 优先, 'newest' = 数组逆序, 'default' = 原序
 *
 * 数据流为单向派生链：raw refs → computed 过滤 → computed 分页切片。
 * 唯一可写状态是三个页码，且对外暴露为**可写 computed**：读时按
 * `Math.min(raw, totalPages)` 钳制、写时同样钳制。
 * 这样 pageSize / 数据量变化后页码立即自洽（无需 watch，也就没有
 * 「composable 里创建却永不 stop 的 watcher」这一泄漏点）。
 */
import { computed, ref, type ComputedRef, type Ref, type WritableComputedRef } from 'vue';
import type {
  ResourceItem,
  SortOrder,
  MarketListOptions,
  MarketListState,
} from '../types/market';
import { useMarketLayout } from './useMarketLayout';

/** 取 `src` 的第 `page` 页（1-based），每页 `size` 条。 */
function pageSlice<T>(src: T[], page: number, size: number): T[] {
  const step = Math.max(1, size);
  const start = (Math.max(1, page) - 1) * step;
  return src.slice(start, start + step);
}

/** 总页数：向上取整，且恒 >= 1（空列表也算 1 页，避免分页器出现 0）。 */
function pageCount(total: number, size: number): number {
  return Math.max(1, Math.ceil(total / Math.max(1, size)));
}

/** 页码钳制到 [1, total]；非法值回落 1。 */
function clampPage(page: number, total: number): number {
  if (!Number.isFinite(page)) return 1;
  return Math.max(1, Math.min(Math.floor(page), total));
}

export function useMarketList(
  fetchAll: () => Promise<{ installed: ResourceItem[]; candidates: ResourceItem[] }>,
  opts: MarketListOptions = { showFeatured: false }
): MarketListState {
  const layout = useMarketLayout();

  // ═══════════ 原始数据（唯一数据源，仅 load() 写）═══════════
  const _installedRaw: Ref<ResourceItem[]> = ref([]);
  const _candidatesRaw: Ref<ResourceItem[]> = ref([]);

  // ═══════════ 可写状态 ═══════════
  const state = ref({ loading: false, error: '' });
  const selectedCategory: Ref<string> = ref('');
  const searchQuery: Ref<string> = ref('');
  const sortOrder: Ref<SortOrder> = ref('default');
  // 页码原始值；对外暴露的是下方按 totalPages 钳制过的可写 computed
  const _featuredPage: Ref<number> = ref(1);
  const _installedPage: Ref<number> = ref(1);
  const _currentPage: Ref<number> = ref(1);

  // ═══════════ 派生：分类 ═══════════
  const categories: ComputedRef<string[]> = computed(() => {
    const set = new Set<string>();
    for (const item of _candidatesRaw.value) {
      for (const tag of item.tags) {
        const t = tag.trim();
        if (t) set.add(t);
      }
    }
    return Array.from(set).sort();
  });

  /** 按当前 sortOrder 排序（不修改入参）。 */
  function sortItems(items: ResourceItem[]): ResourceItem[] {
    const copy = [...items];
    switch (sortOrder.value) {
      case 'hot':
        return copy.sort((a, b) => (b.installed ? 1 : 0) - (a.installed ? 1 : 0));
      case 'newest':
        return copy.reverse();
      default:
        return copy;
    }
  }

  // ═══════════ 派生：精选生效条件（同时控制 dedup）═══════════
  const featuredActive: ComputedRef<boolean> = computed(
    () =>
      opts.showFeatured &&
      searchQuery.value.trim() === '' &&
      selectedCategory.value === ''
  );

  /** 精选池：candidates 的前 N 项，不受搜索/分类影响（保持推荐位稳定语义）。 */
  const featuredPool: ComputedRef<ResourceItem[]> = computed(() =>
    featuredActive.value
      ? _candidatesRaw.value.slice(0, layout.featuredPoolSize.value)
      : []
  );

  // ═══════════ 派生：资源市场过滤链 ═══════════
  // 顺序不可换：dedup → 分类 → 搜索 → 排序，且全部先于分页切片。
  const filteredCandidates: ComputedRef<ResourceItem[]> = computed(() => {
    const exclude = new Set(featuredPool.value.map((i) => i.id));
    let list =
      exclude.size > 0
        ? _candidatesRaw.value.filter((i) => !exclude.has(i.id))
        : _candidatesRaw.value.slice();

    if (selectedCategory.value) {
      list = list.filter((item) => item.tags.includes(selectedCategory.value));
    }

    const q = searchQuery.value.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (item) =>
          item.name.toLowerCase().includes(q) ||
          item.description.toLowerCase().includes(q)
      );
    }

    return sortItems(list);
  });

  // ═══════════ 派生：三模块总页数 ═══════════
  const featuredTotalPages: ComputedRef<number> = computed(() =>
    pageCount(featuredPool.value.length, layout.featuredPageSize.value)
  );
  const installedTotalPages: ComputedRef<number> = computed(() =>
    pageCount(_installedRaw.value.length, layout.installedPageSize.value)
  );
  const totalPages: ComputedRef<number> = computed(() =>
    pageCount(filteredCandidates.value.length, layout.marketPageSize.value)
  );

  // ═══════════ 页码：读写双向钳制（防 pageSize / 数据量变化后越界白屏）═══════════
  const featuredPage: WritableComputedRef<number> = computed({
    get: () => clampPage(_featuredPage.value, featuredTotalPages.value),
    set: (p: number) => {
      _featuredPage.value = clampPage(p, featuredTotalPages.value);
    },
  });
  const installedPage: WritableComputedRef<number> = computed({
    get: () => clampPage(_installedPage.value, installedTotalPages.value),
    set: (p: number) => {
      _installedPage.value = clampPage(p, installedTotalPages.value);
    },
  });
  const currentPage: WritableComputedRef<number> = computed({
    get: () => clampPage(_currentPage.value, totalPages.value),
    set: (p: number) => {
      _currentPage.value = clampPage(p, totalPages.value);
    },
  });

  // ═══════════ 派生：三模块当前页切片 ═══════════
  const featuredItems: ComputedRef<ResourceItem[]> = computed(() =>
    pageSlice(featuredPool.value, featuredPage.value, layout.featuredPageSize.value)
  );
  const installedItems: ComputedRef<ResourceItem[]> = computed(() =>
    pageSlice(_installedRaw.value, installedPage.value, layout.installedPageSize.value)
  );
  const candidateItems: ComputedRef<ResourceItem[]> = computed(() =>
    pageSlice(filteredCandidates.value, currentPage.value, layout.marketPageSize.value)
  );

  /** 已安装总数（徽标用，非当前页长度）。 */
  const installedCount: ComputedRef<number> = computed(() => _installedRaw.value.length);

  // ═══════════ 加载数据 ═══════════
  async function load(): Promise<void> {
    state.value = { loading: true, error: '' };
    try {
      const { installed, candidates } = await fetchAll();
      _installedRaw.value = installed;
      _candidatesRaw.value = candidates;
      _featuredPage.value = 1;
      _installedPage.value = 1;
      _currentPage.value = 1;
      state.value = { loading: false, error: '' };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e ?? '');
      state.value = { loading: false, error: msg || '加载失败' };
      // 派生链会自动把三模块清空，无需逐个赋 []
      _installedRaw.value = [];
      _candidatesRaw.value = [];
    }
  }

  // ═══════════ 操作方法 ═══════════
  // 过滤 / 搜索 / 排序只重置资源市场页码，精选与已安装不受影响。

  function filterByCategory(cat: string): void {
    selectedCategory.value = cat;
    _currentPage.value = 1;
  }

  function search(q: string): void {
    searchQuery.value = q;
    _currentPage.value = 1;
  }

  function setSort(s: SortOrder): void {
    sortOrder.value = s;
    _currentPage.value = 1;
  }

  // 三个 goTo 都走可写 computed 的 setter，钳制逻辑集中一处

  function goToFeaturedPage(p: number): void {
    featuredPage.value = p;
  }

  function goToInstalledPage(p: number): void {
    installedPage.value = p;
  }

  function goToPage(p: number): void {
    currentPage.value = p;
  }

  /** 在全量原始数据中按 id 查找（已安装优先），避免只在分页切片里查导致跨页误判。 */
  function findById(id: string): ResourceItem | undefined {
    return (
      _installedRaw.value.find((i) => i.id === id) ??
      _candidatesRaw.value.find((i) => i.id === id)
    );
  }

  // ═══════════ 构造即加载 ═══════════
  void load();

  return {
    state,
    installedItems,
    candidateItems,
    featuredItems,
    categories,
    selectedCategory,
    searchQuery,
    sortOrder,
    installedCount,
    featuredPage,
    featuredTotalPages,
    installedPage,
    installedTotalPages,
    currentPage,
    totalPages,
    filterByCategory,
    search,
    setSort,
    goToFeaturedPage,
    goToInstalledPage,
    goToPage,
    findById,
  };
}
