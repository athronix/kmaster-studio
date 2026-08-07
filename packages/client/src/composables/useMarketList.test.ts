/**
 * useMarketList 单测（T01）。
 *
 * 验收项：
 *   ① 初始加载：fetchAll 成功后 installed / candidates / featured 正确填充
 *   ② 分页：默认每页 10 个
 *   ③ 分类过滤：filterByCategory 按 item.tags 包含过滤
 *   ④ 搜索：search 按 name / description 模糊匹配（大小写不敏感）
 *   ⑤ 排序：'hot' installed 优先，'newest' 逆序，'default' 原序
 *   ⑥ 加载态 + 错误态
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useMarketList } from './useMarketList';
import type { ResourceItem } from '../types/market';

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
  });

  it('① 初始加载：fetchAll 成功后数据正确填充', async () => {
    const installed = makeInstalled(2);
    const candidates = makeItems(15);
    fetchAll.mockResolvedValue({ installed, candidates });

    const list = useMarketList(fetchAll);

    await vi.waitFor(() => !list.state.value.loading);

    expect(list.state.value.loading).toBe(false);
    expect(list.state.value.error).toBe('');
    expect(list.installedItems.value).toEqual(installed);
    expect(list.candidateItems.value.length).toBe(10);
    expect(list.totalPages.value).toBe(2);
    expect(list.featuredItems.value.length).toBe(5);
    expect(list.featuredItems.value).toEqual(candidates.slice(0, 5));
  });

  it('② 分页：每页 10 个，goToPage 切换', async () => {
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

  it('⑥ 错误态：fetchAll reject 时 error 填充', async () => {
    fetchAll.mockRejectedValue(new Error('网络错误'));

    const list = useMarketList(fetchAll);
    await vi.waitFor(() => !list.state.value.loading);

    expect(list.state.value.loading).toBe(false);
    expect(list.state.value.error).toBe('网络错误');
    expect(list.installedItems.value).toEqual([]);
    expect(list.candidateItems.value).toEqual([]);
    expect(list.featuredItems.value).toEqual([]);
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

  it('⑧ 筛选后分页重置', async () => {
    const candidates = makeItems(25);
    fetchAll.mockResolvedValue({ installed: [], candidates });

    const list = useMarketList(fetchAll);
    await vi.waitFor(() => !list.state.value.loading);

    list.goToPage(2);
    expect(list.currentPage.value).toBe(2);

    list.filterByCategory('dev');
    expect(list.currentPage.value).toBe(1);

    list.goToPage(2);
    list.search('item');
    expect(list.currentPage.value).toBe(1);

    list.goToPage(2);
    list.setSort('newest');
    expect(list.currentPage.value).toBe(1);
  });
});
