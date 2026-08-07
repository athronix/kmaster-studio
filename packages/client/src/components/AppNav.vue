<script setup lang="ts">
/**
 * @deprecated 导航迁入 LeftSidebar（UI 重设计 T01）。
 * 本组件保留不删，但不再被引用。
 *
 * 顶部导航条（M4/q-2，M5/F21 追加「设置」）：聊天 / 记忆 / 自动化 / 用量 / 队列 …… 设置
 * 当前页高亮由 route.path 判定（hash 路由，刷新后保持）。队列徽标取 chat store 全局排队数。
 */
// V3 #24：无障碍补全 — 当前页标记 aria-current，主题按钮 aria-label。
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useChatStore } from '../stores/chat';
import { useTheme } from '../styles/theme';
import { useI18n } from '../composables/useI18n';

interface NavItem {
  path: string;
  labelKey: string;
  icon: string;
}

const { t } = useI18n();

const NAV_ITEMS: NavItem[] = [
  { path: '/', labelKey: 'nav.chat', icon: '💬' },
  { path: '/memory', labelKey: 'nav.memory', icon: '🧠' },
  { path: '/jobs', labelKey: 'nav.jobs', icon: '⏰' },
  { path: '/usage', labelKey: 'nav.usage', icon: '📊' },
  { path: '/queue', labelKey: 'nav.queue', icon: '📥' },
];

/**
 * M5/F21：设置入口靠右（与主题按钮同侧），与左侧五个业务页在视觉上分区，
 * 因此单独声明而不并入 NAV_ITEMS；高亮判定复用同一个 isActive()。
 */
const SETTINGS_ITEM: NavItem = { path: '/settings', labelKey: 'nav.settings', icon: '⚙️' };

const route = useRoute();
const store = useChatStore();
const theme = useTheme();

const queued = computed(() => store.queuedTotal);

function isActive(path: string): boolean {
  return path === '/' ? route.path === '/' : route.path.startsWith(path);
}
</script>

<template>
  <nav class="km-nav">
    <span class="km-nav-brand">kmaster<b>studio</b></span>
    <router-link
      v-for="item in NAV_ITEMS"
      :key="item.path"
      class="km-nav-item"
      :class="{ 'km-nav-active': isActive(item.path) }"
      :to="item.path"
      :aria-current="isActive(item.path) ? 'page' : undefined"
    >
      <span class="km-nav-icon">{{ item.icon }}</span>{{ t(item.labelKey) }}
      <span v-if="item.path === '/queue' && queued > 0" class="km-nav-badge">{{ queued }}</span>
    </router-link>
    <span class="km-nav-spacer" />
    <router-link
      class="km-nav-item"
      :class="{ 'km-nav-active': isActive(SETTINGS_ITEM.path) }"
      :to="SETTINGS_ITEM.path"
      title="设置（通用 / Provider / Profile / 技能 / MCP / 诊断）"
      :aria-current="isActive(SETTINGS_ITEM.path) ? 'page' : undefined"
    >
      <span class="km-nav-icon">{{ SETTINGS_ITEM.icon }}</span>{{ t(SETTINGS_ITEM.labelKey) }}
    </router-link>
    <button
      class="km-nav-theme"
      :title="theme.isDark.value ? '切换到亮色' : '切换到暗色'"
      :aria-label="theme.isDark.value ? '切换到亮色主题' : '切换到暗色主题'"
      @click="theme.toggle()"
    >{{ theme.isDark.value ? '🌙' : '☀️' }}</button>
  </nav>
</template>

<style scoped>
.km-nav {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 44px;
  padding: 0 14px;
  border-bottom: 1px solid var(--km-border);
  background: var(--km-panel);
  flex: 0 0 auto;
}
.km-nav-brand {
  font-size: 14px;
  letter-spacing: 0.3px;
  margin-right: 14px;
  opacity: 0.85;
}
.km-nav-brand b { color: var(--km-accent); font-weight: 700; }
.km-nav-item {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 12px;
  border-radius: 7px;
  font-size: 13px;
  color: var(--km-text);
  text-decoration: none;
  opacity: 0.7;
  transition: background 0.15s ease, opacity 0.15s ease;
}
.km-nav-item:hover { opacity: 1; background: rgba(127, 127, 127, 0.12); }
.km-nav-active {
  opacity: 1;
  background: rgba(59, 130, 246, 0.16);
  color: var(--km-accent);
  font-weight: 600;
}
.km-nav-icon { font-size: 13px; }
.km-nav-badge {
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 999px;
  background: #dc2626;
  color: #fff;
  font-size: 10px;
  line-height: 16px;
  text-align: center;
}
.km-nav-spacer { flex: 1; }
.km-nav-theme {
  background: none;
  border: 1px solid var(--km-border);
  color: var(--km-text);
  border-radius: 6px;
  padding: 3px 8px;
  cursor: pointer;
}
</style>
