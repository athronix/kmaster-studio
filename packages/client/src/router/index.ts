/**
 * 路由配置：LayoutShell 父路由 + 子路由（hash 模式）。
 *
 * 变更说明：
 * - UI 重设计 T01：插入 LayoutShell 作为父路由组件，所有页面统一包裹 LeftSidebar
 * - V3 T3（S3.1）：
 *     · `/settings` → `redirect: '/settings/monitor'`（默认类别单一真源来自 constants/layout）
 *     · 新增 `/settings/:category`（`props: true`），支持 URL 直达与浏览器前进/后退（R-38）
 *     · `afterEach` 把当前 path 同步进 `stores/layout`，`navMode` 与 `settingsCategory`
 *       均由该 path 派生 —— URL 是唯一真源，不再有「设置覆盖层」这类独立可写状态
 */
import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router';
import ChatView from '../views/ChatView.vue';
import {
  DEFAULT_SETTINGS_CATEGORY,
  SETTINGS_ROUTE_PREFIX,
  settingsCategoryDef,
} from '../constants/layout';
import { useLayoutStore } from '../stores/layout';

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: () => import('../components/layout/LayoutShell.vue'),
    children: [
      { path: '', name: 'chat', component: ChatView, meta: { title: '聊天' } },
      {
        path: 'experts',
        name: 'experts',
        component: () => import('../views/ExpertsView.vue'),
        meta: { title: '专家市场' },
      },
      {
        path: 'skills',
        name: 'skills',
        component: () => import('../views/SkillsView.vue'),
        meta: { title: '技能市场' },
      },
      {
        path: 'mcp',
        name: 'mcp',
        component: () => import('../views/McpView.vue'),
        meta: { title: 'MCP 管理' },
      },
      {
        path: 'memory',
        name: 'memory',
        component: () => import('../views/MemoryView.vue'),
        meta: { title: '记忆' },
      },
      {
        path: 'jobs',
        name: 'jobs',
        component: () => import('../views/JobsView.vue'),
        meta: { title: '定时任务' },
      },
      {
        path: 'usage',
        name: 'usage',
        component: () => import('../views/UsageView.vue'),
        meta: { title: '用量' },
      },
      {
        path: 'queue',
        name: 'queue',
        component: () => import('../views/QueueView.vue'),
        meta: { title: '队列' },
      },
      // V3 S3.1：设置一类一页，`/settings` 重定向到默认类别
      {
        path: 'settings',
        redirect: `${SETTINGS_ROUTE_PREFIX}/${DEFAULT_SETTINGS_CATEGORY}`,
      },
      {
        path: 'settings/:category',
        name: 'settings',
        component: () => import('../views/SettingsView.vue'),
        props: true,
        meta: { title: '设置' },
      },
      // 未知路径回落聊天页
      { path: ':pathMatch(.*)*', redirect: '/' },
    ],
  },
];

const router = createRouter({
  history: createWebHashHistory(),
  routes,
});

/**
 * 路由后置钩子：
 * ① 同步 path 到 layout store（`navMode` / `settingsCategory` / `lastHomeRoute` 全部由此派生）；
 * ② 更新 document.title，设置页带上类别名。
 *
 * ⚠️ 必须在 pinia 安装之后才会被调用（首次导航发生在 app.mount 时），
 *    因此这里可以安全地使用 `useLayoutStore()`。
 */
router.afterEach((to) => {
  try {
    const layout = useLayoutStore();
    layout.syncRoute(to.path);
  } catch {
    // pinia 尚未就绪时静默跳过（不影响导航本身）
  }
  const base = 'kmaster studio';
  if (to.path.startsWith(SETTINGS_ROUTE_PREFIX)) {
    const key = typeof to.params.category === 'string' ? to.params.category : DEFAULT_SETTINGS_CATEGORY;
    document.title = `${settingsCategoryDef(key).label} · 设置 · ${base}`;
    return;
  }
  const title = typeof to.meta.title === 'string' ? to.meta.title : '';
  document.title = title === '' ? base : `${title} · ${base}`;
});

export default router;
