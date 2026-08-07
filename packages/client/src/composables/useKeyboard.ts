/**
 * useKeyboard — 全局快捷键 composable。
 *
 * 注册在 App.vue 的 `@keydown`，提供统一快捷键处理。
 * 与具体页面解耦：页面/组件把自己的能力挂到 `keyboardActions` 上，
 * 卸载时置回 `null`（避免路由切换后打到已销毁组件）。
 *
 * 快捷键总表（R-37）：
 * | 组合键 | 行为 | 提供方 |
 * | --- | --- | --- |
 * | `Ctrl/Cmd + N` | 新建会话 | ChatView |
 * | `Ctrl/Cmd + K` | 聚焦左栏会话搜索 | LeftSidebar |
 * | `Ctrl/Cmd + Shift + F` | 聚焦左栏会话搜索（全局搜索同义键） | LeftSidebar |
 * | `Ctrl/Cmd + F` | 聚焦当前页 PageHeader 内容搜索 | PageHeader |
 * | `Ctrl/Cmd + B` | 折叠/展开左栏 | LayoutStore |
 * | `Ctrl/Cmd + \` | 折叠/展开右栏 | LayoutStore |
 * | `Ctrl/Cmd + Shift + Enter` | 右栏全屏切换 | LayoutStore |
 * | `Ctrl/Cmd + Shift + L` | 切换暗色/亮色主题 | theme |
 *
 * 所有快捷键在 input/textarea/select/contenteditable 聚焦时一律不触发。
 */
import { ref } from 'vue';
import { isDark } from '../styles/theme';
import { useLayoutStore } from '../stores/layout';

/**
 * 全局快捷键回调注册表。
 * 由具体组件在 `onMounted` 注入、`onBeforeUnmount` 置空，未注入时按键为 no-op。
 */
export const keyboardActions = {
  /** 新建会话（ChatView 注入） */
  createSession: ref<(() => void) | null>(null),
  /** 聚焦左栏会话搜索框（LeftSidebar 注入） */
  focusSearch: ref<(() => void) | null>(null),
  /** 聚焦当前主体页 PageHeader 的内容搜索框（PageHeader 注入） */
  focusPageSearch: ref<(() => void) | null>(null),
};

/** 判定焦点是否落在可输入元素上（落在则所有快捷键让位给输入）。 */
function isTypingTarget(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  const tag = (el.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
  return el.isContentEditable === true;
}

/**
 * 返回 onKeyDown 处理函数，挂载到根组件 `@keydown`。
 */
export function useKeyboard() {
  const layout = useLayoutStore();

  function onKeyDown(e: KeyboardEvent): void {
    if (isTypingTarget()) return;

    const mod = e.metaKey || e.ctrlKey;
    if (!mod) return;

    const key = e.key.toLowerCase();

    // ── Ctrl+Shift+* 组合优先判定，避免被单键分支吃掉 ──
    if (e.shiftKey) {
      // Ctrl+Shift+L：切换暗色/亮色主题
      if (key === 'l') {
        e.preventDefault();
        isDark.value = !isDark.value;
        return;
      }
      // Ctrl+Shift+F：聚焦左栏会话搜索（全局搜索）
      if (key === 'f') {
        e.preventDefault();
        keyboardActions.focusSearch.value?.();
        return;
      }
      // Ctrl+Shift+Enter：右栏全屏切换
      if (key === 'enter') {
        e.preventDefault();
        layout.toggleFullscreen();
        return;
      }
      return;
    }

    switch (key) {
      // Ctrl+N：新建会话
      case 'n':
        e.preventDefault();
        keyboardActions.createSession.value?.();
        return;
      // Ctrl+K：聚焦左栏会话搜索
      case 'k':
        e.preventDefault();
        keyboardActions.focusSearch.value?.();
        return;
      // Ctrl+F：聚焦当前页内容搜索
      case 'f':
        e.preventDefault();
        keyboardActions.focusPageSearch.value?.();
        return;
      // Ctrl+B：折叠/展开左栏
      case 'b':
        e.preventDefault();
        layout.toggleLeft();
        return;
      // Ctrl+\：折叠/展开右栏
      case '\\':
        e.preventDefault();
        layout.toggleRight();
        return;
      default:
        return;
    }
  }

  return { onKeyDown };
}
