/**
 * useMarketLayout 单测（T1）。
 *
 * 验收项：
 *   ① 无 localStorage / window（Node 环境）时全部走默认值且不抛错
 *   ② 合法值读取：列数 3-8、行数 1-10
 *   ③ 非法 / 越界 / 缺失回落：列数 → 5，行数 → 1 / 1 / 4
 *   ④ 两种历史写法兼容：纯数字字符串 "5" 与 JSON 数字 5
 *   ⑤ 每页数量公式：<模块>PageSize = gridCols × <模块>Rows
 *   ⑥ 精选池公式：min(FEATURED_POOL_MAX, featuredPageSize × FEATURED_MAX_PAGES)
 *   ⑦ refreshMarketLayout() 后单例值同步更新
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  useMarketLayout,
  refreshMarketLayout,
  GRID_COLS_LS_KEY,
  GRID_COLS_MIN,
  GRID_COLS_MAX,
  DEFAULT_GRID_COLS,
  ROWS_MIN,
  ROWS_MAX,
  FEATURED_POOL_MAX,
  FEATURED_MAX_PAGES,
} from './useMarketLayout';
import { LS_KEYS } from '../constants/layout';

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

function removeStorage(): void {
  delete (globalThis as { localStorage?: Storage }).localStorage;
}

describe('useMarketLayout', () => {
  beforeEach(() => {
    installMemoryStorage();
    refreshMarketLayout();
  });

  afterEach(() => {
    removeStorage();
    refreshMarketLayout();
  });

  it('① 无 localStorage 时走默认值且不抛错', () => {
    removeStorage();
    expect(() => refreshMarketLayout()).not.toThrow();

    const L = useMarketLayout();
    expect(L.gridCols.value).toBe(DEFAULT_GRID_COLS);
    expect(L.featuredRows.value).toBe(1);
    expect(L.installedRows.value).toBe(1);
    expect(L.marketRows.value).toBe(4);
  });

  it('① 无 window 时 useMarketLayout() 不抛错（Node 单测即无 window）', () => {
    expect(() => useMarketLayout()).not.toThrow();
  });

  it('② 合法值读取：列数 + 三模块行数', () => {
    localStorage.setItem(GRID_COLS_LS_KEY, '7');
    localStorage.setItem(
      LS_KEYS.marketLayout,
      JSON.stringify({ featuredRows: 2, installedRows: 3, marketRows: 5 })
    );
    refreshMarketLayout();

    const L = useMarketLayout();
    expect(L.gridCols.value).toBe(7);
    expect(L.featuredRows.value).toBe(2);
    expect(L.installedRows.value).toBe(3);
    expect(L.marketRows.value).toBe(5);
  });

  it('③ 列数非法 / 越界一律回落 5', () => {
    const L = useMarketLayout();
    for (const bad of ['abc', '', '0', '2', '9', '99', '-3', 'null']) {
      localStorage.setItem(GRID_COLS_LS_KEY, bad);
      refreshMarketLayout();
      expect(L.gridCols.value).toBe(DEFAULT_GRID_COLS);
    }
  });

  it('③ 列数边界值 3 / 8 均有效', () => {
    const L = useMarketLayout();

    localStorage.setItem(GRID_COLS_LS_KEY, String(GRID_COLS_MIN));
    refreshMarketLayout();
    expect(L.gridCols.value).toBe(GRID_COLS_MIN);

    localStorage.setItem(GRID_COLS_LS_KEY, String(GRID_COLS_MAX));
    refreshMarketLayout();
    expect(L.gridCols.value).toBe(GRID_COLS_MAX);
  });

  it('③ 行数越界被钳制到 1-10，缺失键回落 1 / 1 / 4', () => {
    const L = useMarketLayout();

    localStorage.setItem(
      LS_KEYS.marketLayout,
      JSON.stringify({ featuredRows: 0, installedRows: 999, marketRows: -5 })
    );
    refreshMarketLayout();
    expect(L.featuredRows.value).toBe(ROWS_MIN);
    expect(L.installedRows.value).toBe(ROWS_MAX);
    expect(L.marketRows.value).toBe(ROWS_MIN);

    // 键缺失 → 各自默认值
    localStorage.setItem(LS_KEYS.marketLayout, JSON.stringify({ featuredRows: 2 }));
    refreshMarketLayout();
    expect(L.featuredRows.value).toBe(2);
    expect(L.installedRows.value).toBe(1);
    expect(L.marketRows.value).toBe(4);
  });

  it('③ marketLayout JSON 损坏时静默回落默认值', () => {
    localStorage.setItem(LS_KEYS.marketLayout, '{not-json');
    refreshMarketLayout();

    const L = useMarketLayout();
    expect(L.featuredRows.value).toBe(1);
    expect(L.installedRows.value).toBe(1);
    expect(L.marketRows.value).toBe(4);
  });

  it('④ 兼容 JSON 数字与带引号的历史写法', () => {
    const L = useMarketLayout();

    localStorage.setItem(GRID_COLS_LS_KEY, JSON.stringify(6));
    refreshMarketLayout();
    expect(L.gridCols.value).toBe(6);

    localStorage.setItem(GRID_COLS_LS_KEY, '"4"');
    refreshMarketLayout();
    expect(L.gridCols.value).toBe(4);
  });

  it('⑤ 每页数量 = 列数 × 对应行数（三份独立）', () => {
    localStorage.setItem(GRID_COLS_LS_KEY, '5');
    localStorage.setItem(
      LS_KEYS.marketLayout,
      JSON.stringify({ featuredRows: 1, installedRows: 2, marketRows: 4 })
    );
    refreshMarketLayout();

    const L = useMarketLayout();
    expect(L.featuredPageSize.value).toBe(5);
    expect(L.installedPageSize.value).toBe(10);
    expect(L.marketPageSize.value).toBe(20);
  });

  it('⑥ 精选池 = min(24, featuredPageSize × 3)', () => {
    const L = useMarketLayout();
    expect(FEATURED_POOL_MAX).toBe(24);
    expect(FEATURED_MAX_PAGES).toBe(3);

    // 5 列 × 1 行 → 5 × 3 = 15 < 24
    localStorage.setItem(GRID_COLS_LS_KEY, '5');
    localStorage.setItem(LS_KEYS.marketLayout, JSON.stringify({ featuredRows: 1 }));
    refreshMarketLayout();
    expect(L.featuredPoolSize.value).toBe(15);

    // 8 列 × 2 行 → 16 × 3 = 48 → 封顶 24
    localStorage.setItem(GRID_COLS_LS_KEY, '8');
    localStorage.setItem(LS_KEYS.marketLayout, JSON.stringify({ featuredRows: 2 }));
    refreshMarketLayout();
    expect(L.featuredPoolSize.value).toBe(FEATURED_POOL_MAX);
  });

  it('⑦ refreshMarketLayout 驱动单例响应式更新（同一份引用）', () => {
    const a = useMarketLayout();
    const b = useMarketLayout();

    localStorage.setItem(GRID_COLS_LS_KEY, '3');
    refreshMarketLayout();
    expect(a.gridCols.value).toBe(3);
    expect(b.gridCols.value).toBe(3);

    localStorage.setItem(GRID_COLS_LS_KEY, '8');
    refreshMarketLayout();
    expect(a.gridCols.value).toBe(8);
    expect(b.gridCols.value).toBe(8);
  });
});
