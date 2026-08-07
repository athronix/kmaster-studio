<script setup lang="ts">
/**
 * ResizeHandle — 三栏轨道拖拽句柄（设计 §1.3「强约定，两侧一致」逐条落地）。
 *
 * | 项 | 约定 |
 * | --- | --- |
 * | 事件绑定 | `mousedown` 在句柄上；`mousemove`/`mouseup` 挂 `window`，`resize-end` 时移除 |
 * | 增量方向 | 左栏 `delta = e.clientX - startX`；右栏 `delta = startX - e.clientX` |
 * | 夹取 | `clamp(startWidth + delta, min, max)` |
 * | 防选中 | 拖拽期给 `document.body` 加 `.km-resizing`（R-01④） |
 * | 命中区 | 视觉 4px，`::before` 扩到 10px（`left/right: -3px`），不占布局 |
 * | 落盘 | 本组件**只** emit，落盘由父级在 `resize-end` 时做（拖拽过程不写 localStorage） |
 *
 * 组件自身不持有宽度：`value` 由父级下发，`update:value` 回吐，单向数据流。
 */
import { onBeforeUnmount, ref } from 'vue';
import { clamp } from '../../constants/layout';

/** 句柄所处侧别，决定鼠标增量的符号。 */
type Side = 'left' | 'right';

const props = withDefaults(
  defineProps<{
    /** 'left' = 左栏右侧句柄；'right' = 右栏左侧句柄 */
    side: Side;
    /** 允许的最小宽度（px） */
    min: number;
    /** 允许的最大宽度（px） */
    max: number;
    /** 当前宽度（px），由父级下发 */
    value: number;
    /** 自定义 title，留空则按 side 取默认文案 */
    title?: string;
  }>(),
  { title: '' }
);

const emit = defineEmits<{
  (e: 'update:value', width: number): void;
  (e: 'resize-start'): void;
  (e: 'resize-end'): void;
}>();

/** 拖拽期加在 `document.body` 上的全局 class（样式见 styles/variables.scss）。 */
const RESIZING_CLASS = 'km-resizing';

/** 是否正在拖拽（驱动 `.km-active` 高亮）。 */
const active = ref<boolean>(false);

/** 按下瞬间的鼠标 X 与基准宽度；全程以此为基准计算，避免累积误差。 */
let startX = 0;
let startWidth = 0;

function onMouseDown(e: MouseEvent): void {
  // 只响应鼠标左键，右键/中键不进入拖拽
  if (e.button !== 0) return;
  e.preventDefault();
  startX = e.clientX;
  startWidth = props.value;
  active.value = true;
  document.body.classList.add(RESIZING_CLASS);
  window.addEventListener('mousemove', onMouseMove);
  window.addEventListener('mouseup', onMouseUp);
  emit('resize-start');
}

function onMouseMove(e: MouseEvent): void {
  if (!active.value) return;
  const delta = props.side === 'left' ? e.clientX - startX : startX - e.clientX;
  emit('update:value', clamp(Math.round(startWidth + delta), props.min, props.max));
}

function onMouseUp(): void {
  if (!active.value) return;
  detach();
  // 落盘时机：父级监听本事件后再写 localStorage
  emit('resize-end');
}

/** 清理全局监听与 body class；卸载与松手共用，保证不残留。 */
function detach(): void {
  active.value = false;
  document.body.classList.remove(RESIZING_CLASS);
  window.removeEventListener('mousemove', onMouseMove);
  window.removeEventListener('mouseup', onMouseUp);
}

onBeforeUnmount(detach);
</script>

<template>
  <div
    class="km-resize-handle"
    :class="{ 'km-active': active }"
    role="separator"
    aria-orientation="vertical"
    :aria-valuenow="value"
    :aria-valuemin="min"
    :aria-valuemax="max"
    :title="title || (side === 'left' ? '拖拽调整左栏宽度' : '拖拽调整右栏宽度')"
    @mousedown="onMouseDown"
  ></div>
</template>

<style scoped>
.km-resize-handle {
  width: 100%;
  height: 100%;
  cursor: col-resize;
  background: transparent;
  position: relative;
  transition: background 0.15s ease;
}

/* 扩大命中区到 10px，但不占布局（轨道仍是 4px） */
.km-resize-handle::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: -3px;
  right: -3px;
}

.km-resize-handle:hover,
.km-resize-handle.km-active {
  background: var(--km-accent);
}
</style>
