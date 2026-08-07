<script setup lang="ts">
/**
 * App.vue — 应用根组件（UI 重设计 T01 改造）。
 *
 * 改造内容：
 * - 移除 AppNav 导入和渲染（导航迁入 LeftSidebar）
 * - 移除 `<div class="km-app">` 布局壳样式
 * - 保留：NConfigProvider + NMessageProvider + NDialogProvider 包裹
 * - 保留：Socket.IO 初始化逻辑 + 全局键盘事件
 * - `<router-view>` 直接���染（LayoutShell 由路由注入）
 */
import { computed, onMounted, onUnmounted } from 'vue';
import { NConfigProvider, NMessageProvider, NDialogProvider, darkTheme } from 'naive-ui';
import { isDark, buildOverrides } from './styles/theme';
import { useChatStore } from './stores/chat';
import { useLayoutStore } from './stores/layout';
import { useStatusStore } from './stores/status';
import { useAgentRolesStore } from './stores/agentRoles';
import { useModelConfigStore } from './stores/modelConfig';
import { useLogsStore } from './stores/logs';
import { useKeyboard } from './composables/useKeyboard';

const themeOverrides = computed(() => buildOverrides(isDark.value));
const store = useChatStore();

// V3：本地持久化 store（全部只读 localStorage，失败静默）
const layout = useLayoutStore();
const status = useStatusStore();
const agentRoles = useAgentRolesStore();
const modelConfig = useModelConfigStore();
const logs = useLogsStore();

// 全局快捷键
const { onKeyDown } = useKeyboard();

onMounted(() => {
  // V3：先恢复本地状态，再建连接——保证首帧布局宽度就是用户上次的选择，避免抖动
  layout.hydrate();
  status.hydrate();
  void agentRoles.loadRoles();
  modelConfig.hydrate();
  logs.hydrate();

  store.registerSocket();
  // 全局队列徽标需要跨页数据，进入应用即拉取一次（失败静默，不阻塞渲染）
  store.loadQueue().catch(() => {});
  // Q7：状态条健康轮询（内部已 try/catch，失败只置灰不抛错）
  status.startPolling();
});

onUnmounted(() => {
  status.stopPolling();
});
</script>

<template>
  <n-config-provider :theme="isDark ? darkTheme : null" :theme-overrides="themeOverrides">
    <n-message-provider>
      <n-dialog-provider>
        <div class="km-app-root" @keydown="onKeyDown">
          <router-view />
        </div>
      </n-dialog-provider>
    </n-message-provider>
  </n-config-provider>
</template>

<style>
/* 全局：确保 html/body/#app 全高 */
html, body, #app {
  height: 100%;
  margin: 0;
  padding: 0;
  overflow: hidden;
}

.km-app-root {
  height: 100%;
  width: 100%;
  overflow: hidden;
}
</style>
