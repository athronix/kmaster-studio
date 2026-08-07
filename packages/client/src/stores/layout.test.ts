/**
 * stores/layout.test.ts —— 三栏布局 store 单测。
 *
 * 覆盖：宽度夹取 / 折叠互斥 / 全屏守卫 / 路由派生态 / cssVars / 持久化往返 / 自动收起。
 */
import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useLayoutStore } from './layout';
import { LAYOUT_LIMITS, LS_KEYS } from '../constants/layout';

/** node 环境没有 localStorage，这里装一个内存实现供持久化用例使用。 */
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

describe('stores/layout', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    installMemoryStorage();
  });

  afterEach(() => {
    removeStorage();
  });

  it('初始值取自 LAYOUT_LIMITS 默认值', () => {
    const s = useLayoutStore();
    expect(s.leftWidth).toBe(LAYOUT_LIMITS.left.default);
    expect(s.rightWidth).toBe(LAYOUT_LIMITS.right.default);
    expect(s.leftCollapsed).toBe(false);
    expect(s.rightCollapsed).toBe(false);
    expect(s.rightFullscreen).toBe(false);
  });

  it('setLeftWidth / setRightWidth 越界时夹取到边界', () => {
    const s = useLayoutStore();
    s.setLeftWidth(10);
    expect(s.leftWidth).toBe(LAYOUT_LIMITS.left.min);
    s.setLeftWidth(9999);
    expect(s.leftWidth).toBe(LAYOUT_LIMITS.left.max);
    s.setLeftWidth(300);
    expect(s.leftWidth).toBe(300);

    s.setRightWidth(10);
    expect(s.rightWidth).toBe(LAYOUT_LIMITS.right.min);
    s.setRightWidth(9999);
    expect(s.rightWidth).toBe(LAYOUT_LIMITS.right.max);
    s.setRightWidth(500);
    expect(s.rightWidth).toBe(500);
  });

  it('setLeftWidth 传非法值回落到最小宽度', () => {
    const s = useLayoutStore();
    s.setLeftWidth(Number.NaN);
    expect(s.leftWidth).toBe(LAYOUT_LIMITS.left.min);
  });

  it('toggleRight 折叠时强制退出全屏', () => {
    const s = useLayoutStore();
    s.setRightPanelVisible(true);
    s.toggleFullscreen();
    expect(s.rightFullscreen).toBe(true);
    s.toggleRight();
    expect(s.rightCollapsed).toBe(true);
    expect(s.rightFullscreen).toBe(false);
  });

  it('右栏无内容时 toggleFullscreen 为 no-op', () => {
    const s = useLayoutStore();
    expect(s.rightPanelVisible).toBe(false);
    s.toggleFullscreen();
    expect(s.rightFullscreen).toBe(false);
  });

  it('setRightPanelVisible(false) 会重置全屏', () => {
    const s = useLayoutStore();
    s.setRightPanelVisible(true);
    s.toggleFullscreen();
    expect(s.rightFullscreen).toBe(true);
    s.setRightPanelVisible(false);
    expect(s.rightFullscreen).toBe(false);
  });

  it('navMode / settingsCategory 由 currentPath 派生', () => {
    const s = useLayoutStore();
    s.syncRoute('/experts');
    expect(s.navMode).toBe('home');
    expect(s.settingsCategory).toBe('monitor');

    s.syncRoute('/settings/model');
    expect(s.navMode).toBe('settings');
    expect(s.settingsCategory).toBe('model');

    s.syncRoute('/settings/不存在的类别');
    expect(s.settingsCategory).toBe('monitor');
  });

  it('enterSettings 记住首页路由，exitSettings 原路返回', () => {
    const s = useLayoutStore();
    s.syncRoute('/jobs');
    const target = s.enterSettings();
    expect(target.startsWith('/settings/')).toBe(true);
    s.syncRoute(target);
    expect(s.exitSettings()).toBe('/jobs');
  });

  it('enterSettings 优先回到上次停留的设置类别', () => {
    const s = useLayoutStore();
    s.syncRoute('/settings/jobs');
    s.syncRoute('/');
    expect(s.enterSettings()).toBe('/settings/jobs');
  });

  it('cssVars 折叠后轨道归零', () => {
    const s = useLayoutStore();
    s.setRightPanelVisible(true);
    s.setLeftWidth(300);
    s.setRightWidth(500);
    expect(s.cssVars['--km-left-w']).toBe('300px');
    expect(s.cssVars['--km-right-w']).toBe('500px');
    expect(s.cssVars['--km-lh-w']).toBe(`${LAYOUT_LIMITS.handle}px`);

    s.toggleLeft();
    expect(s.cssVars['--km-left-w']).toBe('0px');
    expect(s.cssVars['--km-lh-w']).toBe('0px');

    s.toggleRight();
    expect(s.cssVars['--km-right-w']).toBe('0px');
    expect(s.cssVars['--km-rh-w']).toBe('0px');
  });

  it('cssVars 全屏时右栏吃满 100%', () => {
    const s = useLayoutStore();
    s.setRightPanelVisible(true);
    s.toggleFullscreen();
    expect(s.cssVars['--km-right-w']).toBe('100%');
    expect(s.cssVars['--km-left-w']).toBe('0px');
  });

  it('autoCollapseRight 在主体过窄时收起右栏', () => {
    const s = useLayoutStore();
    s.setRightPanelVisible(true);
    s.autoCollapseRight(LAYOUT_LIMITS.mainMinWidth + 1);
    expect(s.rightCollapsed).toBe(false);
    s.autoCollapseRight(LAYOUT_LIMITS.mainMinWidth - 1);
    expect(s.rightCollapsed).toBe(true);
  });

  it('persist / hydrate 往返一致', () => {
    const s = useLayoutStore();
    s.setLeftWidth(321);
    s.setRightWidth(654);
    s.toggleLeft();
    expect(localStorage.getItem(LS_KEYS.layout)).toBeTruthy();

    setActivePinia(createPinia());
    const s2 = useLayoutStore();
    s2.hydrate();
    expect(s2.leftWidth).toBe(321);
    expect(s2.rightWidth).toBe(654);
    expect(s2.leftCollapsed).toBe(true);
    expect(s2.rightFullscreen).toBe(false);
  });

  it('hydrate 遇到脏数据时夹取回合法区间', () => {
    localStorage.setItem(
      LS_KEYS.layout,
      JSON.stringify({ leftWidth: -100, rightWidth: 99999, leftCollapsed: 'yes' })
    );
    const s = useLayoutStore();
    s.hydrate();
    expect(s.leftWidth).toBe(LAYOUT_LIMITS.left.min);
    expect(s.rightWidth).toBe(LAYOUT_LIMITS.right.max);
    expect(s.leftCollapsed).toBe(false);
  });

  it('无 localStorage 时 persist/hydrate 静默不抛错', () => {
    removeStorage();
    const s = useLayoutStore();
    expect(() => s.persist()).not.toThrow();
    expect(() => s.hydrate()).not.toThrow();
    expect(s.leftWidth).toBe(LAYOUT_LIMITS.left.default);
  });

  it('resetWidths 恢复默认', () => {
    const s = useLayoutStore();
    s.setLeftWidth(400);
    s.toggleLeft();
    s.resetWidths();
    expect(s.leftWidth).toBe(LAYOUT_LIMITS.left.default);
    expect(s.leftCollapsed).toBe(false);
  });

  it('setResizing 切换拖拽标记', () => {
    const s = useLayoutStore();
    s.setResizing(true);
    expect(s.resizing).toBe(true);
    s.setResizing(false);
    expect(s.resizing).toBe(false);
  });
});
