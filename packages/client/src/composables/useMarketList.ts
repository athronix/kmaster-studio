/**
 * useMarketList — 统一市场数据 composable（T01）。
 *
 * 接受一个 fetchAll 工厂函数（适配 agent/skill/mcp 三种数据源），
 * 返回 MarketListState —— 含 installed / candidates / featured / 分页 /
 * 分类过滤 / 搜索 / 排序的完整状态。
 *
 * 核心约定：
 *   - 分页为前端分页，每页 10 个（2 行 × 5 列）
 *   - featuredItems 从 candidateItems 取 top-5
 *   - filterByCategory 按 item.tags 包含过滤
 *   - search 按 item.name / item.description 模糊匹配
 *   - sortOrder: 'hot' = installed 优先, 'newest' = 数组逆序, 'default' = 原序
 */
import { computed, ref, type Ref } from 'vue';
import type { ResourceItem, SortOrder, MarketListState } from '../types/market';

/** 从 localStorage 读取市场卡片列数，默认 5 */
function getGridCols(): number {
  if (typeof localStorage === 'undefined') return 5;
  const v = Number(localStorage.getItem('km_grid_cols'));
  return v >= 3 && v <= 8 ? v : 5;
}

/** 每页条数 = 列数 × 2 */
const PAGE_SIZE = computed(() => getGridCols() * 2);

export function useMarketList(
  fetchAll: () => Promise<{ installed: ResourceItem[]; candidates: ResourceItem[] }>
): MarketListState {
  // —— 原始数据 ——
  const _installedItems: Ref<ResourceItem[]> = ref([]);
  const _candidateItemsRaw: Ref<ResourceItem[]> = ref([]);

  // —— 对外暴露的状态 ——
  const state = ref({ loading: false, error: '' });
  const installedItems: Ref<ResourceItem[]> = ref([]);
  const candidateItems: Ref<ResourceItem[]> = ref([]);
  const featuredItems: Ref<ResourceItem[]> = ref([]);
  const categories: Ref<string[]> = ref([]);
  const selectedCategory: Ref<string> = ref('');
  const searchQuery: Ref<string> = ref('');
  const sortOrder: Ref<SortOrder> = ref('default');
  const currentPage: Ref<number> = ref(1);
  const totalPages: Ref<number> = ref(1);

  // —— 内部辅助 ——

  function recomputeCategories(): void {
    const set = new Set<string>();
    for (const item of _candidateItemsRaw.value) {
      for (const tag of item.tags) {
        const t = tag.trim();
        if (t) set.add(t);
      }
    }
    categories.value = Array.from(set).sort();
  }

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

  function getFiltered(): ResourceItem[] {
    let list = _candidateItemsRaw.value.slice();

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
  }

  function syncDerived(): void {
    const filtered = getFiltered();
    const ps = PAGE_SIZE.value;
    totalPages.value = Math.max(1, Math.ceil(filtered.length / ps));
    const start = (currentPage.value - 1) * ps;
    candidateItems.value = filtered.slice(start, start + ps);
    featuredItems.value = _candidateItemsRaw.value.slice(0, 5);
  }

  // —— 加载数据 ——
  async function load(): Promise<void> {
    state.value = { loading: true, error: '' };
    try {
      const { installed, candidates } = await fetchAll();
      _installedItems.value = installed;
      _candidateItemsRaw.value = candidates;
      installedItems.value = installed;
      currentPage.value = 1;
      recomputeCategories();
      syncDerived();
      state.value = { loading: false, error: '' };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e ?? '');
      state.value = { loading: false, error: msg || '加载失败' };
      _installedItems.value = [];
      _candidateItemsRaw.value = [];
      installedItems.value = [];
      candidateItems.value = [];
      featuredItems.value = [];
      categories.value = [];
      totalPages.value = 1;
    }
  }

  // —— 操作方法 ——
  function filterByCategory(cat: string): void {
    selectedCategory.value = cat;
    currentPage.value = 1;
    syncDerived();
  }

  function search(q: string): void {
    searchQuery.value = q;
    currentPage.value = 1;
    syncDerived();
  }

  function setSort(s: SortOrder): void {
    sortOrder.value = s;
    currentPage.value = 1;
    syncDerived();
  }

  function goToPage(p: number): void {
    currentPage.value = Math.max(1, Math.min(p, totalPages.value));
    syncDerived();
  }

  // —— 构造即加载 ——
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
    currentPage,
    totalPages,
    filterByCategory,
    search,
    setSort,
    goToPage,
  };
}
