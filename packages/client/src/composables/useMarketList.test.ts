/**
 * useMarketList 单测。
 *
 * 验收项：
 *   ① 初始加载：fetchAll 成功后 installed / candidates / featured 正确填充
 *   ② 分页：每页数量 = gridCols × 对应模块行数（三模块独立）
 *   ③ 分类过滤：filterByCategory 按 item.tags 包含过滤
 *   ④ 搜索：search 按 name / description 模糊匹配（大小写不敏感）
 *   ⑤ 排序：'hot' installed 优先，'newest' 逆序，'default' 原序
 *   ⑥ 加载态 + 错误态
 *   ⑦ categories 聚合
 *   ⑧ 筛选后仅重置资源市场页码
 *   ⑨ 三模块页码互不干扰
 *   ⑩ showFeatured:false 时不 dedup（资源市场不丢卡）
 *   ⑪ 搜索时精选让位且结果不漏项
 *   ⑫ pageSize 变化后页码被钳制
 *
 * ⚠️ 布局单例在 import 时即完成初始化，写完 localStorage 必须调用
 *    `refreshMarketLayout()` 才能读到新值 —— 见 setLayout()。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useMarketList } from './useMarketList';
import { refreshMarketLayout, GRID_COLS_LS_KEY } from './useMarketLayout';
import { LS_KEYS } from '../constants/layout';
import type { ResourceItem } from '../types/market';

/** node 环境没有 localStorage，这里装一个内存实现。 */
function installMemoryStorage(): void {
  const map = new Map<string, string>();
  const stub: Storage = {
    get length(): number {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    removeItem: (k: string) => {
      map.delete(k);
    },
    setItem: (k: string, v: string) => {
      map.set(k, String(v));
    },
  };
  (globalThis as { localStorage?: Storage }).localStorage = stub;
}

/** 写入布局配置并刷新单例。默认 5 列 / 精选 1 行 / 已安装 1 行 / 市场 4 行。 */
function setLayout(
  cfg: {
    gridCols?: number;
    featuredRows?: number;
    installedRows?: number;
    marketRows?: number;
  } = {}
): void {
  const gridCols = cfg.gridCols ?? 5;
  localStorage.setItem(GRID_COLS_LS_KEY, String(gridCols));
  localStorage.setItem(
    LS_KEYS.marketLayout,
    JSON.stringify({
      featuredRows: cfg.featuredRows ?? 1,
      installedRows: cfg.installedRows ?? 1,
      marketRows: cfg.marketRows ?? 4,
    })
  );
  refreshMarketLayout();
}

/** 造 n 个候选资源项 */
function makeItems(n: number, prefix = 'item'): ResourceItem[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `c-${i}`,
    name: `${prefix}-${i}`,
    icon: '',
    description: `Description for ${prefix}-${i}`,
    tags: i % 2 === 0 ? ['dev'] : ['ops'],
    category: i % 2 === 0 ? 'dev' : 'ops',
    installed: i % 3 === 0,
    source: 'marketplace',
  }));
}

/** 造已装资源项 */
function makeInstalled(n: number): ResourceItem[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `i-${i}`,
    name: `installed-${i}`,
    icon: '',
    description: `Installed item ${i}`,
    tags: ['dev'],
    category: 'dev',
    installed: true,
    source: 'local',
  }));
}

describe('useMarketList', () => {
  let fetchAll: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchAll = vi.fn();
    installMemoryStorage();
    // 基线布局：5 列 → featured/installed 每页 5，市场每页 20，精选池 15
    setLayout();
  });

  afterEach(() => {
    delete (globalThis as { localStorage?: Storage }).localStorage;
    refreshMarketLayout();
  });

  it('① 初始加载：fetchAll 成功后数据正确填充（showFeatured 默认关闭）', async () => {
    const installed = makeInstalled(2);
    const candidates = makeItems(15);
    fetchAll.mockResolvedValue({ installed, candidates });

    const list = useMarketList(fetchAll);
    await vi.waitFor(() => !list.state.value.loading);

    expect(list.state.value.loading).toBe(false);
    expect(list.state.value.error).toBe('');
    // installedPageSize = 5 × 1 = 5，2 条全部落在第 1 页
    expect(list.installedItems.value).toEqual(installed);
    expect(list.installedCount.value).toBe(2);
    expect(list.installedTotalPages.value).toBe(1);
    // marketPageSize = 5 × 4 = 20，15 条一页装下
    expect(list.candidateItems.value.length).toBe(15);
    expect(list.totalPages.value).toBe(1);
    // showFeatured 未开启 → 精选为空、不 dedup
    expect(list.featuredItems.value).toEqual([]);
    expect(list.featuredTotalPages.value).toBe(1);
  });

  it('① 精选开启：池取 candidates 前 15 项，市场 dedup 后剩余项', async () => {
    const candidates = makeItems(40);
    fetchAll.mockResolvedValue({ installed: [], candidates });

    const list = useMarketList(fetchAll, { showFeatured: true });
    await vi.waitFor(() => !list.state.value.loading);

    // featuredPoolSize = min(24, 5 × 3) = 15；featuredPageSize = 5 → 3 页
    expect(list.featuredItems.value.length).toBe(5);
    expect(list.featuredItems.value).toEqual(candidates.slice(0, 5));
    expect(list.featuredTotalPages.value).toBe(3);

    // 资源市场剔除已进精选的 15 项 → 25 项，每页 20 → 2 页
    expect(list.totalPages.value).toBe(2);
    expect(list.candidateItems.value.length).toBe(20);
    expect(list.candidateItems.value[0].id).toBe('c-15');
  });

  it('② 分页：每页数量随行数配置变化，goToPage 切换', async () => {
    // 5 列 × 2 行 = 每页 10
    setLayout({ marketRows: 2 });
    const candidates = makeItems(25);
    fetchAll.mockResolvedValue({ installed: [], candidates });

    const list = useMarketList(fetchAll);
    await vi.waitFor(() => !list.state.value.loading);

    expect(list.currentPage.value).toBe(1);
    expect(list.candidateItems.value.length).toBe(10);
    expect(list.totalPages.value).toBe(3);

    list.goToPage(2);
    expect(list.currentPage.value).toBe(2);
    expect(list.candidateItems.value.length).toBe(10);
    expect(list.candidateItems.value[0].id).toBe('c-10');

    list.goToPage(3);
    expect(list.currentPage.value).toBe(3);
    expect(list.candidateItems.value.length).toBe(5);
  });

  it('② 列数变化联动每页数量（8 列 × 4 行 = 32）', async () => {
    setLayout({ gridCols: 8, marketRows: 4 });
    fetchAll.mockResolvedValue({ installed: [], candidates: makeItems(40) });

    const list = useMarketList(fetchAll);
    await vi.waitFor(() => !list.state.value.loading);

    expect(list.candidateItems.value.length).toBe(32);
    expect(list.totalPages.value).toBe(2);
  });

  it('②b goToPage 越界 clamp', async () => {
    fetchAll.mockResolvedValue({ installed: [], candidates: makeItems(5) });
    const list = useMarketList(fetchAll);
    await vi.waitFor(() => !list.state.value.loading);

    list.goToPage(99);
    expect(list.currentPage.value).toBe(1);

    list.goToPage(0);
    expect(list.currentPage.value).toBe(1);
  });

  it('③ 分类过滤：filterByCategory 按 tags 过滤', async () => {
    const candidates: ResourceItem[] = [
      ...makeItems(5, 'dev').map((x, i) => ({ ...x, id: `d${i}`, tags: ['dev'], category: 'dev' })),
      ...makeItems(5, 'ops').map((x, i) => ({ ...x, id: `o${i}`, tags: ['ops'], category: 'ops' })),
    ];
    fetchAll.mockResolvedValue({ installed: [], candidates });

    const list = useMarketList(fetchAll);
    await vi.waitFor(() => !list.state.value.loading);

    expect(list.candidateItems.value.length).toBe(10);

    list.filterByCategory('dev');
    expect(list.candidateItems.value.length).toBe(5);
    expect(list.candidateItems.value.every((x: ResourceItem) => x.tags.includes('dev'))).toBe(true);
    expect(list.currentPage.value).toBe(1);
  });

  it('④ 搜索：按 name / description 模糊匹配（大小写不敏感）', async () => {
    const candidates: ResourceItem[] = [
      { id: '1', name: 'AlphaBot', icon: '', description: 'An AI assistant', tags: [], category: '', installed: false, source: '' },
      { id: '2', name: 'BetaTool', icon: '', description: 'A coding tool', tags: [], category: '', installed: false, source: '' },
      { id: '3', name: 'GammaHelper', icon: '', description: 'Alpha helper utility', tags: [], category: '', installed: false, source: '' },
    ];
    fetchAll.mockResolvedValue({ installed: [], candidates });

    const list = useMarketList(fetchAll);
    await vi.waitFor(() => !list.state.value.loading);

    list.search('alphabot');
    expect(list.candidateItems.value.length).toBe(1);
    expect(list.candidateItems.value[0].name).toBe('AlphaBot');

    list.search('utility');
    expect(list.candidateItems.value.length).toBe(1);
    expect(list.candidateItems.value[0].name).toBe('GammaHelper');

    list.search('alpha');
    expect(list.candidateItems.value.length).toBe(2);

    list.search('ALPHABOT');
    expect(list.candidateItems.value.length).toBe(1);

    list.search('');
    expect(list.candidateItems.value.length).toBe(3);
  });

  it('⑤ 排序：default 原序', async () => {
    fetchAll.mockResolvedValue({ installed: [], candidates: makeItems(5) });
    const list = useMarketList(fetchAll);
    await vi.waitFor(() => !list.state.value.loading);

    const names = list.candidateItems.value.map((x: ResourceItem) => x.id);
    expect(names).toEqual(['c-0', 'c-1', 'c-2', 'c-3', 'c-4']);
  });

  it('⑤ 排序：newest 逆序', async () => {
    fetchAll.mockResolvedValue({ installed: [], candidates: makeItems(5) });
    const list = useMarketList(fetchAll);
    await vi.waitFor(() => !list.state.value.loading);

    list.setSort('newest');
    const names = list.candidateItems.value.map((x: ResourceItem) => x.id);
    expect(names).toEqual(['c-4', 'c-3', 'c-2', 'c-1', 'c-0']);
  });

  it('⑤ 排序：hot installed 优先', async () => {
    const candidates: ResourceItem[] = [
      { id: 'a', name: 'A', icon: '', description: '', tags: [], category: '', installed: false, source: '' },
      { id: 'b', name: 'B', icon: '', description: '', tags: [], category: '', installed: true, source: '' },
      { id: 'c', name: 'C', icon: '', description: '', tags: [], category: '', installed: false, source: '' },
      { id: 'd', name: 'D', icon: '', description: '', tags: [], category: '', installed: true, source: '' },
    ];
    fetchAll.mockResolvedValue({ installed: [], candidates });

    const list = useMarketList(fetchAll);
    await vi.waitFor(() => !list.state.value.loading);

    list.setSort('hot');
    expect(list.candidateItems.value[0].installed).toBe(true);
    expect(list.candidateItems.value[1].installed).toBe(true);
    expect(list.candidateItems.value[2].installed).toBe(false);
    expect(list.candidateItems.value[3].installed).toBe(false);
  });

  it('⑥ 错误态：fetchAll reject 时 error 填充且三模块清空', async () => {
    fetchAll.mockRejectedValue(new Error('网络错误'));

    const list = useMarketList(fetchAll, { showFeatured: true });
    await vi.waitFor(() => !list.state.value.loading);

    expect(list.state.value.loading).toBe(false);
    expect(list.state.value.error).toBe('网络错误');
    expect(list.installedItems.value).toEqual([]);
    expect(list.candidateItems.value).toEqual([]);
    expect(list.featuredItems.value).toEqual([]);
    expect(list.categories.value).toEqual([]);
    expect(list.installedCount.value).toBe(0);
    expect(list.totalPages.value).toBe(1);
  });

  it('⑥ 加载态：初始 loading 为 true', () => {
    fetchAll.mockResolvedValue({ installed: [], candidates: [] });
    const list = useMarketList(fetchAll);
    expect(list.state.value.loading).toBe(true);
  });

  it('⑦ categories 从 candidateItems 的 tags 聚合去重', async () => {
    const candidates: ResourceItem[] = [
      { id: '1', name: 'A', icon: '', description: '', tags: ['dev', 'ai'], category: '', installed: false, source: '' },
      { id: '2', name: 'B', icon: '', description: '', tags: ['ai'], category: '', installed: false, source: '' },
      { id: '3', name: 'C', icon: '', description: '', tags: ['ops'], category: '', installed: false, source: '' },
    ];
    fetchAll.mockResolvedValue({ installed: [], candidates });

    const list = useMarketList(fetchAll);
    await vi.waitFor(() => !list.state.value.loading);

    expect(list.categories.value).toEqual(['ai', 'dev', 'ops']);
  });

  it('⑧ 筛选 / 搜索 / 排序仅重置资源市场页码', async () => {
    setLayout({ marketRows: 2 }); // 每页 10
    const candidates = makeItems(25);
    fetchAll.mockResolvedValue({ installed: [], candidates });

    const list = useMarketList(fetchAll);
    await vi.waitFor(() => !list.state.value.loading);

    list.goToPage(2);
    expect(list.currentPage.value).toBe(2);

    list.filterByCategory('dev');
    expect(list.currentPage.value).toBe(1);

    list.goToPage(2);
    expect(list.currentPage.value).toBe(2);
    list.search('item');
    expect(list.currentPage.value).toBe(1);

    list.goToPage(2);
    expect(list.currentPage.value).toBe(2);
    list.setSort('newest');
    expect(list.currentPage.value).toBe(1);
  });

  it('⑧ 精选 / 已安装页码不受资源市场筛选影响', async () => {
    setLayout({ installedRows: 1 }); // installedPageSize = 5
    fetchAll.mockResolvedValue({ installed: makeInstalled(12), candidates: makeItems(40) });

    const list = useMarketList(fetchAll, { showFeatured: true });
    await vi.waitFor(() => !list.state.value.loading);

    list.goToFeaturedPage(2);
    list.goToInstalledPage(3);
    expect(list.featuredPage.value).toBe(2);
    expect(list.installedPage.value).toBe(3);

    list.search('item-1');
    expect(list.currentPage.value).toBe(1);
    // 已安装页码不动；精选让位（池为空 → 1 页）后 featuredPage 自动钳回 1
    expect(list.installedPage.value).toBe(3);
    expect(list.featuredPage.value).toBe(1);
  });

  it('⑨ 三模块页码互不干扰', async () => {
    // installedPageSize = 5 → 12 条 = 3 页
    fetchAll.mockResolvedValue({ installed: makeInstalled(12), candidates: makeItems(40) });

    const list = useMarketList(fetchAll, { showFeatured: true });
    await vi.waitFor(() => !list.state.value.loading);

    expect(list.installedTotalPages.value).toBe(3);
    expect(list.featuredTotalPages.value).toBe(3);
    expect(list.totalPages.value).toBe(2);

    list.goToInstalledPage(2);
    expect(list.installedPage.value).toBe(2);
    expect(list.featuredPage.value).toBe(1);
    expect(list.currentPage.value).toBe(1);
    expect(list.installedItems.value.map((x) => x.id)).toEqual([
      'i-5', 'i-6', 'i-7', 'i-8', 'i-9',
    ]);
    // 另外两个模块纹丝不动
    expect(list.featuredItems.value[0].id).toBe('c-0');
    expect(list.candidateItems.value[0].id).toBe('c-15');

    list.goToFeaturedPage(3);
    expect(list.featuredPage.value).toBe(3);
    expect(list.featuredItems.value.map((x) => x.id)).toEqual([
      'c-10', 'c-11', 'c-12', 'c-13', 'c-14',
    ]);
    expect(list.installedPage.value).toBe(2);
    expect(list.currentPage.value).toBe(1);
  });

  it('⑩ showFeatured:false 时不 dedup —— 资源市场不丢卡（D6 回归点）', async () => {
    const candidates = makeItems(40);
    fetchAll.mockResolvedValue({ installed: [], candidates });

    const list = useMarketList(fetchAll, { showFeatured: false });
    await vi.waitFor(() => !list.state.value.loading);

    expect(list.featuredItems.value).toEqual([]);
    expect(list.totalPages.value).toBe(2);
    expect(list.candidateItems.value[0].id).toBe('c-0');

    const page1 = list.candidateItems.value.map((x) => x.id);
    list.goToPage(2);
    const page2 = list.candidateItems.value.map((x) => x.id);
    expect(new Set([...page1, ...page2]).size).toBe(40);
  });

  it('⑪ 搜索时精选让位且结果不漏项（含被精选吸走的项）', async () => {
    const candidates = makeItems(40);
    fetchAll.mockResolvedValue({ installed: [], candidates });

    const list = useMarketList(fetchAll, { showFeatured: true });
    await vi.waitFor(() => !list.state.value.loading);

    // 未搜索：精选生效 + dedup 生效
    expect(list.featuredItems.value.length).toBe(5);
    expect(list.candidateItems.value[0].id).toBe('c-15');

    // 搜索 'item-3' → item-3 / item-30..item-39 共 11 项；
    // 其中 item-3 在精选池内，若 dedup 未关闭则只会剩 10 项。
    list.search('item-3');
    expect(list.featuredItems.value).toEqual([]);
    expect(list.candidateItems.value.length).toBe(11);
    expect(list.candidateItems.value.some((x) => x.id === 'c-3')).toBe(true);

    // 选分类同样关闭精选与 dedup
    list.search('');
    expect(list.featuredItems.value.length).toBe(5);
    list.filterByCategory('dev');
    expect(list.featuredItems.value).toEqual([]);
    expect(list.candidateItems.value.some((x) => x.id === 'c-0')).toBe(true);
  });

  it('⑫ pageSize 变大后资源市场页码被钳制（防越界白屏）', async () => {
    setLayout({ marketRows: 1 }); // 每页 5 → 25 条 = 5 页
    fetchAll.mockResolvedValue({ installed: [], candidates: makeItems(25) });

    const list = useMarketList(fetchAll);
    await vi.waitFor(() => !list.state.value.loading);

    expect(list.totalPages.value).toBe(5);
    list.goToPage(5);
    expect(list.currentPage.value).toBe(5);

    // 系统设置调大行数 → 每页 20 → 只剩 2 页，页码即时钳制
    setLayout({ marketRows: 4 });

    expect(list.totalPages.value).toBe(2);
    expect(list.currentPage.value).toBe(2);
    expect(list.candidateItems.value.length).toBe(5);
    expect(list.candidateItems.value[0].id).toBe('c-20');
  });

  it('⑫ 已安装 pageSize 变化后页码被钳制', async () => {
    setLayout({ installedRows: 1 }); // 每页 5 → 12 条 = 3 页
    fetchAll.mockResolvedValue({ installed: makeInstalled(12), candidates: [] });

    const list = useMarketList(fetchAll);
    await vi.waitFor(() => !list.state.value.loading);

    list.goToInstalledPage(3);
    expect(list.installedPage.value).toBe(3);

    setLayout({ installedRows: 3 }); // 每页 15 → 1 页
    expect(list.installedTotalPages.value).toBe(1);
    expect(list.installedPage.value).toBe(1);
    expect(list.installedItems.value.length).toBe(12);
  });

  it('⑫ 精选 pageSize 变化后页码被钳制', async () => {
    fetchAll.mockResolvedValue({ installed: [], candidates: makeItems(40) });

    const list = useMarketList(fetchAll, { showFeatured: true });
    await vi.waitFor(() => !list.state.value.loading);

    // 5 列 × 1 行 → 池 15、每页 5 → 3 页
    expect(list.featuredTotalPages.value).toBe(3);
    list.goToFeaturedPage(3);
    expect(list.featuredPage.value).toBe(3);

    // 精选 3 行 → 每页 15、池 min(24, 45)=24 → 2 页
    setLayout({ featuredRows: 3 });
    expect(list.featuredTotalPages.value).toBe(2);
    expect(list.featuredPage.value).toBe(2);
    expect(list.featuredItems.value.length).toBe(9);
  });

  it('⑬ findById 在全量原始数据中查找（跨页可查）', async () => {
    const installed = makeInstalled(2);
    const candidates = makeItems(40);
    fetchAll.mockResolvedValue({ installed, candidates });

    const list = useMarketList(fetchAll, { showFeatured: true });
    await vi.waitFor(() => !list.state.value.loading);

    // c-39 不在任何模块的当前页里，findById 仍能命中
    expect(list.candidateItems.value.some((x) => x.id === 'c-39')).toBe(false);
    expect(list.findById('c-39')?.name).toBe('item-39');
    expect(list.findById('i-1')?.name).toBe('installed-1');
    expect(list.findById('nope')).toBeUndefined();
  });
});
