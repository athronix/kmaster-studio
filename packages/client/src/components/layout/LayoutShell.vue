<script setup lang="ts">
/**
 * LayoutShell — 应用根布局（V3：flex → CSS Grid 5 轨道，设计 §1.2）。
 *
 * ```
 * grid-template-columns:
 *   var(--km-left-w)   ← 左栏（折叠 0px）
 *   var(--km-lh-w)     ← 左拖拽柄（折叠 0px）
 *   minmax(0, 1fr)     ← 主体（永不溢出）
 *   var(--km-rh-w)     ← 右拖拽柄（隐藏 0px）
 *   var(--km-right-w)  ← 右栏（隐藏 0px）
 * grid-template-rows: 100vh   ← 单行，三栏顶/底严格对齐
 * ```
 *
 * V3 改造要点：
 * - **右栏上提到 shell 层**：`RightPanel` 全局可用，不再嵌在 `ChatView` 内部；
 * - 宽度/折叠/全屏统一由 `stores/layout` 持有，本组件只下发 `cssVars`；
 * - **删除旧版「设置覆盖层」provide**（设置改为左栏导航态 + 子路由，见 §1.4）；
 * - `ResizeObserver` 监听 shell 宽度 → 主体不足 480px 自动收起右栏，放大后自动恢复；
 * - 折叠 ≠ 卸载：轨道宽度置 0，DOM 保留 → R-36 滚动位置/标签状态免费保住。
 */
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import LeftSidebar from './LeftSidebar.vue';
import ResizeHandle from './ResizeHandle.vue';
import RightPanel from './RightPanel.vue';
import { LAYOUT_LIMITS } from '../../constants/layout';
import { useLayoutStore } from '../../stores/layout';
import { useChatStore } from '../../stores/chat';

const route = useRoute();
const layout = useLayoutStore();
const chat = useChatStore();

/** 模板里直接读常量，避免写魔数。 */
const LIMITS = LAYOUT_LIMITS;

// ── 路由 → 左栏导航态（唯一真源是 URL，见 §1.4）──
watch(
  () => route.path,
  (path) => layout.syncRoute(path),
  { immediate: true }
);

// ── 右栏内容态 → 轨道占位（下发布尔量，避免 layout store 反向 import chat store）──
watch(
  () => chat.rightPanelMode,
  (mode) => layout.setRightPanelVisible(mode !== 'hidden'),
  { immediate: true }
);

// ═══════════════════════ 拖拽 ═══════════════════════
// 拖拽过程只改 ref（不落盘），resize-end 时才 clamp + 写 localStorage（§1.3）。

function onResizeStart(): void {
  layout.setResizing(true);
}

function onLeftDrag(width: number): void {
  layout.leftWidth = width;
}

function onLeftDragEnd(): void {
  layout.setResizing(false);
  layout.setLeftWidth(layout.leftWidth);
}

function onRightDrag(width: number): void {
  layout.rightWidth = width;
}

function onRightDragEnd(): void {
  layout.setResizing(false);
  layout.setRightWidth(layout.rightWidth);
}

// ═══════════════════════ 响应式底线（PRD §8.4）═══════════════════════

const shellRef = ref<HTMLElement | null>(null);
/** 右栏是「被窗口变窄自动收起」的，窗口放大后才允许自动恢复。 */
const autoCollapsed = ref<boolean>(false);
let observer: ResizeObserver | null = null;

/** 计算展开右栏时主体轨道的宽度。 */
function mainWidthWithRight(shellWidth: number): number {
  const leftSpace = layout.leftCollapsed ? 0 : layout.leftWidth + LIMITS.handle;
  const rightSpace = layout.rightWidth + LIMITS.handle;
  return shellWidth - leftSpace - rightSpace;
}

function evaluateWidth(shellWidth: number): void {
  if (shellWidth <= 0) return;
  const projected = mainWidthWithRight(shellWidth);

  if (layout.rightVisible) {
    // 右栏正展开：挤到底线以下就自动收起
    if (projected < LIMITS.mainMinWidth) {
      autoCollapsed.value = true;
      layout.autoCollapseRight(projected);
    }
    return;
  }

  // 右栏已收起：仅当此前是「自动收起」且空间恢复时才自动展开
  if (autoCollapsed.value && layout.rightCollapsed && layout.rightPanelVisible) {
    if (projected >= LIMITS.mainMinWidth) {
      autoCollapsed.value = false;
      layout.toggleRight();
    }
  }
}

// 用户手动展开右栏后，清除「自动收起」标记，避免后续误判
watch(
  () => layout.rightCollapsed,
  (collapsed) => {
    if (!collapsed) autoCollapsed.value = false;
  }
);

onMounted(() => {
  if (typeof ResizeObserver === 'undefined' || !shellRef.value) return;
  observer = new ResizeObserver((entries) => {
    evaluateWidth(entries[0]?.contentRect.width ?? 0);
  });
  observer.observe(shellRef.value);
});

onBeforeUnmount(() => {
  observer?.disconnect();
  observer = null;
});
</script>

<template>
  <div ref="shellRef" class="km-shell" :style="layout.cssVars">
    <!-- 轨道 1：左栏 -->
    <LeftSidebar />

    <!-- 轨道 2：左拖拽柄 -->
    <ResizeHandle
      side="left"
      :min="LIMITS.left.min"
      :max="LIMITS.left.max"
      :value="layout.leftWidth"
      @update:value="onLeftDrag"
      @resize-start="onResizeStart"
      @resize-end="onLeftDragEnd"
    />

    <!-- 轨道 3：主体 -->
    <main class="km-shell-main">
      <router-view />
    </main>

    <!-- 轨道 4：右拖拽柄 -->
    <ResizeHandle
      side="right"
      :min="LIMITS.right.min"
      :max="LIMITS.right.max"
      :value="layout.rightWidth"
      @update:value="onRightDrag"
      @resize-start="onResizeStart"
      @resize-end="onRightDragEnd"
    />

    <!-- 轨道 5：右栏 -->
    <RightPanel />
  </div>
</template>

<style scoped>
/* `.km-shell` 与 `.km-shell > *` 的 Grid 约定写在全局 styles/variables.scss（§7.4），
   此处只补主体轨道自身的排布。 */
.km-shell-main {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}
</style>
