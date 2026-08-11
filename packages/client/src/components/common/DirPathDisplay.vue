<script setup lang="ts">
/**
 * DirPathDisplay — 目录路径展示组件（Web 目录选择器 REQ 3）。
 *
 * 以目录名（basename）展示所选目录，悬停时通过 Naive UI `n-tooltip`
 * 展示完整路径。盘根（如 `C:\` / `/`）取不到末段时回退显示完整路径。
 *
 * 外部传入的 class 透传到内部 `<code>` 元素，消费方沿用原有间距样式
 * （`ntd-dir-text` / `sec-cwd` / `lgs-dir-text` / `km-dir-text`）；
 * 因该 `<code>` 位于子组件内部，消费方的 scoped 规则需用 `:deep()` 命中。
 */
import { computed, useAttrs } from 'vue';
import { NTooltip, NText } from 'naive-ui';

const props = withDefaults(defineProps<{
  /** 完整目录路径 */
  path: string;
  /** path 为空时的占位文案 */
  placeholder?: string;
}>(), {
  placeholder: '未选择目录',
});

// 关闭默认属性透传，手动把 class 落到内部 <code>，避免透传到 n-tooltip 根节点
defineOptions({ inheritAttrs: false });
const attrs = useAttrs();

/** 规范化后的完整路径（容忍 undefined / null 传入）。 */
const fullPath = computed<string>(() => String(props.path ?? ''));

/** 取路径末段目录名；盘根等取不到末段时返回空串。 */
function baseName(p: string): string {
  return p.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || '';
}

/** 展示文本：目录名优先 → 回退完整路径（盘根）→ 回退占位文案。 */
const displayText = computed<string>(() => {
  const full = fullPath.value;
  if (full.trim() === '') return props.placeholder;
  return baseName(full) || full;
});

/** 仅在有完整路径时启用 tooltip，避免空态悬停空白气泡。 */
const hasPath = computed<boolean>(() => fullPath.value.trim() !== '');

/** 透传到内部 <code> 的 class（消费方间距样式）。 */
const fallthroughClass = computed<string>(() => (attrs.class as string | undefined) ?? '');
</script>

<template>
  <n-tooltip :disabled="!hasPath" placement="top">
    <template #trigger>
      <code :class="fallthroughClass" class="km-dir-path-display">{{ displayText }}</code>
    </template>
    <n-text>{{ fullPath }}</n-text>
  </n-tooltip>
</template>

<style scoped>
.km-dir-path-display {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
