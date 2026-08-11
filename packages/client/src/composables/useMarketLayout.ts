/**
 * useMarketLayout — 市场布局配置的**唯一真源**（T1 共享基座）。
 *
 * 职责：
 *   ① 读取并钳制 `localStorage['km_grid_cols']`（列数，3-8，回落 5）；
 *   ② 读取并钳制 `localStorage[LS_KEYS.marketLayout]`（行数 JSON，1-10，
 *      回落 featured=1 / installed=1 / market=4）；
 *   ③ 派生「精选 / 已安装 / 资源市场」三模块各自的每页卡片数与精选池上限；
 *   ④ 监听 window CustomEvent `market-layout-changed`（由 GeneralSection 派发）
 *      与跨标签页 `storage` 事件，重读 localStorage 并驱动全部下游 computed 重算。
 *
 * 设计约定（跨文件铁律）：
 *   - 本文件是列数/行数解析、钳制、回落逻辑的**唯一实现**。
 *     其他文件一律通过 `useMarketLayout()` 消费，禁止再写
 *     `localStorage.getItem('km_grid_cols')` 或硬编码 `'km.v3.marketLayout'`。
 *   - 行数配置类型复用 `types/settings.ts` 的 `MarketLayoutConfig`（禁止重复定义）。
 *   - localStorage 键名复用 `constants/layout.ts` 的 `LS_KEYS.marketLayout`。
 *
 * 实现要点：
 *   - **模块级单例**：全应用共享一份响应式状态，listener 仅绑定一次，
 *     与组件生命周期解耦（`useMarketList` 可能在非组件上下文/单测中调用，
 *     `onMounted/onUnmounted` 不可靠）。全应用仅 1 个 listener，无泄漏。
 *   - **环境安全**：`localStorage` / `window` 不存在（Node 单测、SSR）时
 *     全部走默认值且不抛错。
 */
import { computed, ref, type ComputedRef, type Ref } from 'vue';
import { LS_KEYS, lsGet } from '../constants/layout';
import type { MarketLayoutConfig } from '../types/settings';

// ═══════════════════ 常量（调参只需改这里）═══════════════════

/** 市场卡片列数 localStorage 键（历史键名，非 LS_KEYS 体系）。 */
export const GRID_COLS_LS_KEY = 'km_grid_cols';

/** 布局变更事件名；写方 GeneralSection.vue，读方本模块（唯一监听者）。 */
export const MARKET_LAYOUT_CHANGED_EVENT = 'market-layout-changed';

/** 列数下限 */
export const GRID_COLS_MIN = 3;
/** 列数上限 */
export const GRID_COLS_MAX = 8;
/** 列数缺失 / 非法时的回落值 */
export const DEFAULT_GRID_COLS = 5;

/** 行数下限 */
export const ROWS_MIN = 1;
/** 行数上限 */
export const ROWS_MAX = 10;

/** 精选推荐行数默认值 */
export const DEFAULT_FEATURED_ROWS = 1;
/** 已安装行数默认值 */
export const DEFAULT_INSTALLED_ROWS = 1;
/** 资源市场行数默认值 */
export const DEFAULT_MARKET_ROWS = 4;

/** 精选池绝对上限：防止精选池随列数无限膨胀 */
export const FEATURED_POOL_MAX = 24;
/** 精选模块最多页数：保留「推荐位」语义，同时保留分页能力 */
export const FEATURED_MAX_PAGES = 3;

// ═══════════════════ 内部工具 ═══════════════════

/** 取 localStorage 实例；Node（单测）/ 隐私模式下返回 undefined。 */
function storage(): Storage | undefined {
  try {
    const ls = (globalThis as { localStorage?: Storage }).localStorage;
    return ls ?? undefined;
  } catch {
    // Safari 隐私模式访问 localStorage 会直接抛 SecurityError
    return undefined;
  }
}

/** 取 window 实例；Node（单测）/ SSR 下返回 undefined。 */
function safeWindow(): Window | undefined {
  try {
    const w = (globalThis as { window?: Window }).window;
    return w ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * 将任意值钳到 `[min, max]` 的整数区间；非有限数回落 `fallback`。
 * 注意与 `constants/layout.ts` 的 `clamp` 不同：本函数向下取整且有独立 fallback。
 */
function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  const i = Math.floor(n);
  if (i < min) return min;
  if (i > max) return max;
  return i;
}

/**
 * 读取列数。
 * `km_grid_cols` 历史上存在「纯数字字符串 `"5"`」与「JSON 数字 `5`」两种写法，
 * 均需兼容；越界 / 非法 / 缺失一律回落 `DEFAULT_GRID_COLS`。
 */
function readGridCols(): number {
  const ls = storage();
  if (!ls) return DEFAULT_GRID_COLS;
  let raw: string | null = null;
  try {
    raw = ls.getItem(GRID_COLS_LS_KEY);
  } catch {
    return DEFAULT_GRID_COLS;
  }
  const n = Number(String(raw ?? '').replace(/"/g, '').trim());
  if (!Number.isFinite(n)) return DEFAULT_GRID_COLS;
  const i = Math.floor(n);
  return i >= GRID_COLS_MIN && i <= GRID_COLS_MAX ? i : DEFAULT_GRID_COLS;
}

/** 读取三模块行数配置；缺失 / 解析失败 / 越界均按各自默认值回落。 */
function readRows(): MarketLayoutConfig {
  const parsed = lsGet<Partial<MarketLayoutConfig>>(LS_KEYS.marketLayout, {});
  const o: Partial<MarketLayoutConfig> =
    parsed && typeof parsed === 'object' ? parsed : {};
  return {
    featuredRows: clampInt(o.featuredRows, ROWS_MIN, ROWS_MAX, DEFAULT_FEATURED_ROWS),
    installedRows: clampInt(o.installedRows, ROWS_MIN, ROWS_MAX, DEFAULT_INSTALLED_ROWS),
    marketRows: clampInt(o.marketRows, ROWS_MIN, ROWS_MAX, DEFAULT_MARKET_ROWS),
  };
}

// ═══════════════════ 模块级单例状态 ═══════════════════

const _gridCols: Ref<number> = ref(readGridCols());
const _rows: Ref<MarketLayoutConfig> = ref(readRows());
let _bound = false;

/**
 * 强制重读 localStorage 并刷新全部派生值。
 *
 * - 事件回调内部使用（`market-layout-changed` / `storage`）。
 * - **单测必须显式调用**：单例在 import 时即完成初始化，
 *   之后再写 localStorage 不刷新则读不到新值。
 */
export function refreshMarketLayout(): void {
  _gridCols.value = readGridCols();
  _rows.value = readRows();
}

/** 一次性绑定 window 监听器；无 window（Node/SSR）时静默跳过，后续可再补绑。 */
function bindOnce(): void {
  if (_bound) return;
  const w = safeWindow();
  if (!w || typeof w.addEventListener !== 'function') return;
  _bound = true;
  w.addEventListener(MARKET_LAYOUT_CHANGED_EVENT, () => {
    refreshMarketLayout();
  });
  // 跨标签页同步（增益，非必须）
  w.addEventListener('storage', (e: Event) => {
    const key = (e as StorageEvent).key;
    if (key === GRID_COLS_LS_KEY || key === LS_KEYS.marketLayout) refreshMarketLayout();
  });
}

// ═══════════════════ 派生 computed（单例共享）═══════════════════

const gridCols: ComputedRef<number> = computed(() => _gridCols.value);
const featuredRows: ComputedRef<number> = computed(() => _rows.value.featuredRows);
const installedRows: ComputedRef<number> = computed(() => _rows.value.installedRows);
const marketRows: ComputedRef<number> = computed(() => _rows.value.marketRows);

/** 精选推荐每页卡片数 = 列数 × 精选行数 */
const featuredPageSize: ComputedRef<number> = computed(
  () => gridCols.value * featuredRows.value
);
/** 已安装每页卡片数 = 列数 × 已安装行数 */
const installedPageSize: ComputedRef<number> = computed(
  () => gridCols.value * installedRows.value
);
/** 资源市场每页卡片数 = 列数 × 市场行数 */
const marketPageSize: ComputedRef<number> = computed(
  () => gridCols.value * marketRows.value
);
/** 精选池容量 = min(FEATURED_POOL_MAX, featuredPageSize × FEATURED_MAX_PAGES) */
const featuredPoolSize: ComputedRef<number> = computed(() =>
  Math.min(FEATURED_POOL_MAX, featuredPageSize.value * FEATURED_MAX_PAGES)
);

// ═══════════════════ 对外接口 ═══════════════════

/** `useMarketLayout()` 的返回形状。 */
export interface MarketLayoutState {
  /** 列数，3-8，回落 5 */
  gridCols: ComputedRef<number>;
  /** 精选推荐行数，1-10，回落 1 */
  featuredRows: ComputedRef<number>;
  /** 已安装行数，1-10，回落 1 */
  installedRows: ComputedRef<number>;
  /** 资源市场行数，1-10，回落 4 */
  marketRows: ComputedRef<number>;
  /** 精选推荐每页卡片数 */
  featuredPageSize: ComputedRef<number>;
  /** 已安装每页卡片数 */
  installedPageSize: ComputedRef<number>;
  /** 资源市场每页卡片数 */
  marketPageSize: ComputedRef<number>;
  /** 精选池容量 */
  featuredPoolSize: ComputedRef<number>;
}

/**
 * 获取市场布局配置（单例）。
 *
 * 多次调用返回的是**同一批** computed 引用，任何一处 `refreshMarketLayout()`
 * 或 `market-layout-changed` 事件都会让全部消费者同步重算。
 */
export function useMarketLayout(): MarketLayoutState {
  bindOnce();
  return {
    gridCols,
    featuredRows,
    installedRows,
    marketRows,
    featuredPageSize,
    installedPageSize,
    marketPageSize,
    featuredPoolSize,
  };
}
