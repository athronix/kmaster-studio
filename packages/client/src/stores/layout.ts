/**
 * stores/layout.ts —— 三栏布局状态（设计 §3.1 LayoutStore 逐字段落地）。
 *
 * 职责边界：
 *   - 只管「轨道宽度 / 折叠 / 全屏 / 当前路由派生态」，不碰业务数据；
 *   - `navMode` 与 `settingsCategory` **派生自 `currentPath`**，不是独立可写状态
 *     （设计 §1.4 铁律：左栏导航态唯一真源是路由）；
 *   - 宽度落 `localStorage['km.v3.layout']`，最后一次设置类别落 `km.v3.settings`。
 *
 * 依赖：仅 `constants/layout` + `types/settings`（纯常量与类型），无环。
 */
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import {
  DEFAULT_SETTINGS_CATEGORY,
  LAYOUT_LIMITS,
  LS_KEYS,
  SETTINGS_ROUTE_PREFIX,
  clamp,
  lsGet,
  lsSet,
  parseSettingsCategory,
  type NavMode,
  type SettingsCategory,
} from '../constants/layout';
import type { CssVars, LayoutSnapshot, SettingsSnapshot } from '../types/settings';

/** 默认首页路由（退出设置时的兜底目标）。 */
const DEFAULT_HOME_ROUTE = '/';

export const useLayoutStore = defineStore('layout', () => {
  // ═══════════════════════ state ═══════════════════════

  /** 左栏宽度（px），受 LAYOUT_LIMITS.left 约束 */
  const leftWidth = ref<number>(LAYOUT_LIMITS.left.default);
  /** 右栏宽度（px），受 LAYOUT_LIMITS.right 约束 */
  const rightWidth = ref<number>(LAYOUT_LIMITS.right.default);
  /** 左栏是否折叠（折叠后轨道宽 0） */
  const leftCollapsed = ref<boolean>(false);
  /** 右栏是否折叠（折叠后轨道宽 0） */
  const rightCollapsed = ref<boolean>(false);
  /** 右栏是否全屏（占满主体 + 右栏轨道） */
  const rightFullscreen = ref<boolean>(false);
  /**
   * 右栏是否有内容可展示。由 LayoutShell 依据 `chat.rightPanelMode` 下发，
   * 避免 layout store 反向 import chat store 造成循环依赖。
   */
  const rightPanelVisible = ref<boolean>(false);
  /** 当前路由 path，由 router.afterEach 同步 */
  const currentPath = ref<string>(DEFAULT_HOME_ROUTE);
  /** 进设置前所处的首页侧路由，退出设置时回跳 */
  const lastHomeRoute = ref<string>(DEFAULT_HOME_ROUTE);
  /** 是否正在拖拽轨道（用于给 body 加 `.km-resizing`） */
  const resizing = ref<boolean>(false);

  // ═══════════════════════ derived ═══════════════════════

  /** 左栏导航态：路径以 `/settings` 打头即为设置导航。 */
  const navMode = computed<NavMode>(() =>
    currentPath.value.startsWith(SETTINGS_ROUTE_PREFIX) ? 'settings' : 'home'
  );

  /** 当前设置类别（非设置路由下回落默认类别）。 */
  const settingsCategory = computed<SettingsCategory>(() =>
    navMode.value === 'settings' ? parseSettingsCategory(currentPath.value) : DEFAULT_SETTINGS_CATEGORY
  );

  /** 右栏是否实际占位（有内容 + 未折叠）。 */
  const rightVisible = computed<boolean>(() => rightPanelVisible.value && !rightCollapsed.value);

  /**
   * Grid 5 轨道 CSS 变量。
   * 全屏时左栏 / 两个句柄轨道归零、右栏吃满 100%，主体 `minmax(0,1fr)` 自动塌缩到 0。
   */
  const cssVars = computed<CssVars>(() => {
    if (rightFullscreen.value && rightVisible.value) {
      return {
        '--km-left-w': '0px',
        '--km-lh-w': '0px',
        '--km-rh-w': '0px',
        '--km-right-w': '100%',
      };
    }
    const handle = `${LAYOUT_LIMITS.handle}px`;
    return {
      '--km-left-w': leftCollapsed.value ? '0px' : `${leftWidth.value}px`,
      '--km-lh-w': leftCollapsed.value ? '0px' : handle,
      '--km-rh-w': rightVisible.value ? handle : '0px',
      '--km-right-w': rightVisible.value ? `${rightWidth.value}px` : '0px',
    };
  });

  // ═══════════════════════ actions ═══════════════════════

  /** 设左栏宽度（自动夹取到 [180, 500]）。 */
  function setLeftWidth(px: number): void {
    leftWidth.value = clamp(Math.round(px), LAYOUT_LIMITS.left.min, LAYOUT_LIMITS.left.max);
    persist();
  }

  /** 设右栏宽度（自动夹取到 [320, 800]）。 */
  function setRightWidth(px: number): void {
    rightWidth.value = clamp(Math.round(px), LAYOUT_LIMITS.right.min, LAYOUT_LIMITS.right.max);
    persist();
  }

  /** 切换左栏折叠。 */
  function toggleLeft(): void {
    leftCollapsed.value = !leftCollapsed.value;
    persist();
  }

  /** 切换右栏折叠；折叠时一并退出全屏，避免出现「折叠但全屏」的矛盾态。 */
  function toggleRight(): void {
    rightCollapsed.value = !rightCollapsed.value;
    if (rightCollapsed.value) rightFullscreen.value = false;
    persist();
  }

  /** 切换右栏全屏；右栏不可见时为 no-op。 */
  function toggleFullscreen(): void {
    if (!rightPanelVisible.value) return;
    rightCollapsed.value = false;
    rightFullscreen.value = !rightFullscreen.value;
  }

  /** LayoutShell 下发右栏内容可见性（来自 chat.rightPanelMode !== 'hidden'）。 */
  function setRightPanelVisible(visible: boolean): void {
    rightPanelVisible.value = visible;
    if (!visible) rightFullscreen.value = false;
  }

  /** 拖拽状态开关（组件据此给 body 加 `.km-resizing` 抑制选中/闪烁）。 */
  function setResizing(active: boolean): void {
    resizing.value = active;
  }

  /** 同步当前路由 path；停留在首页侧时顺带记住 `lastHomeRoute`。 */
  function syncRoute(path: string): void {
    const next = path || DEFAULT_HOME_ROUTE;
    currentPath.value = next;
    if (!next.startsWith(SETTINGS_ROUTE_PREFIX)) {
      lastHomeRoute.value = next;
    } else {
      persistSettingsCategory(parseSettingsCategory(next));
    }
  }

  /**
   * 进入设置：返回应跳转的目标路由。
   * 记住当前首页路由，并优先回到上次停留的设置类别。
   */
  function enterSettings(): string {
    if (!currentPath.value.startsWith(SETTINGS_ROUTE_PREFIX)) {
      lastHomeRoute.value = currentPath.value || DEFAULT_HOME_ROUTE;
    }
    return `${SETTINGS_ROUTE_PREFIX}/${lastSettingsCategory()}`;
  }

  /** 退出设置：返回应跳转的首页侧路由。 */
  function exitSettings(): string {
    return lastHomeRoute.value || DEFAULT_HOME_ROUTE;
  }

  /** 主体轨道过窄时自动收起右栏（R-01 响应式底线）。 */
  function autoCollapseRight(mainWidth: number): void {
    if (mainWidth < LAYOUT_LIMITS.mainMinWidth && !rightCollapsed.value) {
      rightCollapsed.value = true;
      rightFullscreen.value = false;
      persist();
    }
  }

  /** 恢复默认宽度（设置页「重置布局」用）。 */
  function resetWidths(): void {
    leftWidth.value = LAYOUT_LIMITS.left.default;
    rightWidth.value = LAYOUT_LIMITS.right.default;
    leftCollapsed.value = false;
    rightCollapsed.value = false;
    rightFullscreen.value = false;
    persist();
  }

  // ═══════════════════════ persistence ═══════════════════════

  /** 读上次停留的设置类别。 */
  function lastSettingsCategory(): SettingsCategory {
    const snap = lsGet<SettingsSnapshot>(LS_KEYS.settings, {
      lastCategory: DEFAULT_SETTINGS_CATEGORY,
    });
    return snap.lastCategory ?? DEFAULT_SETTINGS_CATEGORY;
  }

  /** 记住本次设置类别。 */
  function persistSettingsCategory(category: SettingsCategory): void {
    lsSet(LS_KEYS.settings, { lastCategory: category } satisfies SettingsSnapshot);
  }

  /** 落盘布局快照（写失败静默，不抛错）。 */
  function persist(): void {
    lsSet(LS_KEYS.layout, {
      leftWidth: leftWidth.value,
      rightWidth: rightWidth.value,
      leftCollapsed: leftCollapsed.value,
      rightCollapsed: rightCollapsed.value,
    } satisfies LayoutSnapshot);
  }

  /** 从 localStorage 恢复；缺字段 / 越界值一律夹取回合法区间。 */
  function hydrate(): void {
    const snap = lsGet<Partial<LayoutSnapshot>>(LS_KEYS.layout, {});
    leftWidth.value = clamp(
      Number(snap.leftWidth ?? LAYOUT_LIMITS.left.default),
      LAYOUT_LIMITS.left.min,
      LAYOUT_LIMITS.left.max
    );
    rightWidth.value = clamp(
      Number(snap.rightWidth ?? LAYOUT_LIMITS.right.default),
      LAYOUT_LIMITS.right.min,
      LAYOUT_LIMITS.right.max
    );
    leftCollapsed.value = snap.leftCollapsed === true;
    rightCollapsed.value = snap.rightCollapsed === true;
    rightFullscreen.value = false;
  }

  return {
    // state
    leftWidth,
    rightWidth,
    leftCollapsed,
    rightCollapsed,
    rightFullscreen,
    rightPanelVisible,
    currentPath,
    lastHomeRoute,
    resizing,
    // derived
    navMode,
    settingsCategory,
    rightVisible,
    cssVars,
    // actions
    setLeftWidth,
    setRightWidth,
    toggleLeft,
    toggleRight,
    toggleFullscreen,
    setRightPanelVisible,
    setResizing,
    syncRoute,
    enterSettings,
    exitSettings,
    autoCollapseRight,
    resetWidths,
    persist,
    hydrate,
  };
});
