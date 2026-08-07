/**
 * useCollapseState —— 左栏多层折叠态持久化（B9，设计难点 D4）。
 *
 * 用途：会话三分组 / 各工作目录 / 定时任务两级折叠的展开收起状态。
 * 存储：单键 `LS_KEYS.sidebarCollapse` 存全量 `Record<string, boolean>`，
 *       key 用 `SIDEBAR_COLLAPSE_KEYS` 的命名空间前缀（`group:` / `ws:` / `job:`）。
 * 对应需求：F-05 / F-09，默认态契约见 §3.8。
 *
 * ## 值语义（务必统一）
 * `true` = **已折叠**（收起）；`false` 或 key 缺失 = 展开。
 * 之所以存「折叠」而非「展开」：新出现的工作目录组默认应当**收缩**（F-05），
 * 若存「展开」则新 key 缺失会被判成收起——语义恰好相反、易踩坑。
 * 但 Recent / 置顶两组默认**展开**，故它们的默认值由 `defaultCollapsed` 参数显式给出。
 */
import { ref, type Ref } from 'vue';
import { LS_KEYS, lsGet, lsSet } from '../constants/layout';

/** 折叠态快照：key → 是否折叠。 */
export type CollapseRecord = Record<string, boolean>;

/** 写盘防抖窗口（毫秒）。连续展开/收起多组时只落一次盘。 */
const PERSIST_DEBOUNCE_MS = 200;

/**
 * 从 localStorage 读取折叠态。
 * 解析失败 / 结构不是「字符串→布尔」的字典时静默回落 `{}`（不抛错、不清空用户其它数据）。
 */
function readSnapshot(): CollapseRecord {
  const raw = lsGet<unknown>(LS_KEYS.sidebarCollapse, {});
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: CollapseRecord = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v === 'boolean') out[k] = v;
  }
  return out;
}

export interface UseCollapseStateReturn {
  /** 全量折叠态快照（响应式） */
  state: Ref<CollapseRecord>;
  /** 是否折叠；无记录时返回 `defaultCollapsed` */
  isCollapsed: (key: string, defaultCollapsed?: boolean) => boolean;
  /** 是否展开（`isCollapsed` 的反面，模板里读起来更顺） */
  isExpanded: (key: string, defaultCollapsed?: boolean) => boolean;
  /** 切换单个 key */
  toggle: (key: string, defaultCollapsed?: boolean) => void;
  /** 显式设置单个 key */
  set: (key: string, collapsed: boolean) => void;
  /** 批量合并写入（如 n-collapse 的 update:expanded-names 回调） */
  setAll: (record: CollapseRecord) => void;
  /**
   * 由「当前展开的 name 列表」反推并写入折叠态。
   * @param allKeys 本次参与折叠的全部 key
   * @param expandedKeys 其中处于展开态的 key
   */
  syncFromExpanded: (allKeys: readonly string[], expandedKeys: readonly string[]) => void;
  /** 立即落盘（绕过防抖，供组件卸载时调用） */
  flush: () => void;
  /** 仅供单测：清空状态与定时器 */
  __reset: () => void;
}

// ── module-scope 单例：左栏与首页等多处消费同一份折叠态 ──
const state = ref<CollapseRecord>(readSnapshot());
let timer: ReturnType<typeof setTimeout> | null = null;

/** 防抖落盘。写失败（隐私模式/超限）由 `lsSet` 静默吞掉。 */
function schedulePersist(): void {
  if (timer !== null) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    lsSet(LS_KEYS.sidebarCollapse, state.value);
  }, PERSIST_DEBOUNCE_MS);
}

/**
 * 左栏折叠态（模块级单例）。
 *
 * @example
 * const collapse = useCollapseState();
 * collapse.isCollapsed(SIDEBAR_COLLAPSE_KEYS.recent, false);        // Recent 默认展开
 * collapse.isCollapsed(SIDEBAR_COLLAPSE_KEYS.workspace('api'), true); // 工作目录默认收缩
 */
export function useCollapseState(): UseCollapseStateReturn {
  function isCollapsed(key: string, defaultCollapsed = false): boolean {
    const hit = state.value[key];
    return typeof hit === 'boolean' ? hit : defaultCollapsed;
  }

  function isExpanded(key: string, defaultCollapsed = false): boolean {
    return !isCollapsed(key, defaultCollapsed);
  }

  function set(key: string, collapsed: boolean): void {
    if (state.value[key] === collapsed) return;
    state.value = { ...state.value, [key]: collapsed };
    schedulePersist();
  }

  function toggle(key: string, defaultCollapsed = false): void {
    set(key, !isCollapsed(key, defaultCollapsed));
  }

  function setAll(record: CollapseRecord): void {
    state.value = { ...state.value, ...record };
    schedulePersist();
  }

  function syncFromExpanded(allKeys: readonly string[], expandedKeys: readonly string[]): void {
    const expanded = new Set(expandedKeys);
    const patch: CollapseRecord = {};
    for (const key of allKeys) patch[key] = !expanded.has(key);
    setAll(patch);
  }

  function flush(): void {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    lsSet(LS_KEYS.sidebarCollapse, state.value);
  }

  function __reset(): void {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    state.value = {};
  }

  return { state, isCollapsed, isExpanded, toggle, set, setAll, syncFromExpanded, flush, __reset };
}
