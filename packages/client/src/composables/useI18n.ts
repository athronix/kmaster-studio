/**
 * V4：轻量 i18n 骨架
 *
 * 不引入 vue-i18n，通过 reactive + localStorage 持久化实现切换。
 * 仅覆盖导航、输入区、空状态等核心文案（zh-CN.ts / en.ts 的 key-value 映射）。
 *
 * 用法：
 *   const { t, locale, setLocale } = useI18n()
 *   t('nav.chat')              → '聊天' | 'Chat'
 *   setLocale('en')            → 切换并持久化到 localStorage
 */

import { reactive, readonly } from 'vue';
import zhCN from '../locales/zh-CN';
import en from '../locales/en';

type LocaleCode = 'zh-CN' | 'en';

const LOCALE_KEY = 'kmaster-locale';
const FALLBACK: LocaleCode = 'zh-CN';

const messages: Record<LocaleCode, Record<string, string>> = {
  'zh-CN': zhCN,
  en,
};

/** 从 localStorage 读取持久化的语言偏好 */
function loadSaved(): LocaleCode {
  try {
    const v = localStorage.getItem(LOCALE_KEY);
    if (v === 'zh-CN' || v === 'en') return v;
  } catch { /* localStorage 不可用时忽略 */ }
  return FALLBACK;
}

const state = reactive({
  locale: loadSaved() as LocaleCode,
});

let singleton: ReturnType<typeof createI18n> | null = null;

function createI18n() {
  /** 翻译函数：传入 key，返回对应语言文案；缺失时返回 key 自身 */
  function t(key: string): string {
    const map = messages[state.locale];
    if (map && key in map) return map[key];
    // 回退到中文或 key 自身
    return messages[FALLBACK]?.[key] ?? key;
  }

  /** 切换语言并持久化到 localStorage */
  function setLocale(code: LocaleCode): void {
    state.locale = code;
    try {
      localStorage.setItem(LOCALE_KEY, code);
    } catch { /* ignore */ }
    // 同步更新 html lang 属性
    document.documentElement.lang = code === 'en' ? 'en' : 'zh-CN';
  }

  return {
    locale: readonly(state) as { locale: LocaleCode },
    t,
    setLocale,
  };
}

/** 全局单例 composable */
export function useI18n() {
  if (!singleton) singleton = createI18n();
  // 每次调用同步 html lang
  document.documentElement.lang = state.locale === 'en' ? 'en' : 'zh-CN';
  return singleton;
}

export type { LocaleCode };
