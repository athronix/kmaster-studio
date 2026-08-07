// WorkBuddy 风主题：暗色为默认，亮色可切换；注入 Naive themeOverrides
import { ref, watchEffect } from 'vue';
import type { GlobalThemeOverrides } from 'naive-ui';

/**
 * 获取初始主题：优先读 localStorage，其次系统偏好，默认暗色。
 */
function getInitialTheme(): boolean {
  const stored = localStorage.getItem('km-theme');
  if (stored === 'light') return false;
  if (stored === 'dark') return true;
  return !window.matchMedia('(prefers-color-scheme: light)').matches;
}

export const isDark = ref(getInitialTheme());

watchEffect(() => {
  document.documentElement.dataset.theme = isDark.value ? 'dark' : 'light';
});

export function useTheme() {
  return {
    isDark,
    toggle: () => {
      isDark.value = !isDark.value;
      localStorage.setItem('km-theme', isDark.value ? 'dark' : 'light');
    },
    setTheme: (mode: 'dark' | 'light') => {
      isDark.value = mode === 'dark';
      localStorage.setItem('km-theme', mode);
    },
  };
}

export function buildOverrides(dark: boolean): GlobalThemeOverrides {
  const accent = '#3b82f6';
  const accentHover = '#60a5fa';
  const accentPressed = '#2563eb';
  const primarySuppl = '#60a5fa';

  return {
    common: {
      primaryColor: accent,
      primaryColorHover: accentHover,
      primaryColorPressed: accentPressed,
      primaryColorSuppl: primarySuppl,
      bodyColor: dark ? '#1e1e1e' : '#ffffff',
      cardColor: dark ? '#252526' : '#f5f5f5',
      modalColor: dark ? '#252526' : '#ffffff',
      borderColor: dark ? '#333333' : '#e5e5e5',
      textColorBase: dark ? '#d4d4d4' : '#1f1f1f',
      borderRadius: '6px',
      fontSize: '14px',
      inputColor: dark ? '#2d2d30' : '#ffffff',
      hoverColor: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
    },
    Button: {
      borderRadiusSmall: '4px',
      borderRadiusMedium: '6px',
      borderRadiusLarge: '8px',
    },
    Tag: {
      borderRadius: '4px',
    },
    Input: {
      borderRadius: '6px',
      color: dark ? '#2d2d30' : '#ffffff',
      colorFocus: dark ? '#2d2d30' : '#ffffff',
    },
    Modal: {
      borderRadius: '8px',
    },
  };
}
