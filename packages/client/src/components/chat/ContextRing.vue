<script setup lang="ts">
/**
 * ContextRing — SVG 上下文用量环图（UI 重设计 T05）。
 *
 * 显示当前会话的上下文 token 用量百分比。
 * 颜色：<70% 绿色，70-90% 黄色，>90% 红色。
 */
import { computed } from 'vue';

const props = withDefaults(defineProps<{
  percentage: number;
  used?: number;
  max?: number;
}>(), {
  percentage: 0,
  used: 0,
  max: 0,
});

const radius = 9;
const circumference = 2 * Math.PI * radius;
const strokeWidth = 2.5;

const dashOffset = computed(() => {
  return circumference - (Math.min(props.percentage, 100) / 100) * circumference;
});

const color = computed(() => {
  const p = props.percentage;
  if (p > 90) return 'var(--km-danger)'; // 红色
  if (p > 70) return 'var(--km-warning)'; // 黄色
  return 'var(--km-success)'; // 绿色
});

/** 将 tokens 转为 KB（1 token ≈ 4 bytes → /256 = KB） */
function toKB(v: number): string {
  return (v / 256).toFixed(1);
}

const tooltip = computed(() => {
  if (!props.used && !props.max) return `${props.percentage}%`;
  return `${props.percentage}%: ${toKB(props.used)}kb/${toKB(props.max)}kb 上下文已使用`;
});
</script>

<template>
  <svg
    class="km-context-ring"
    :title="tooltip"
    width="22"
    height="22"
    viewBox="0 0 22 22"
  >
    <!-- 背景环 -->
    <circle
      cx="11"
      cy="11"
      :r="radius"
      fill="none"
      stroke="var(--km-border)"
      :stroke-width="strokeWidth"
    />
    <!-- 前景环 -->
    <circle
      cx="11"
      cy="11"
      :r="radius"
      fill="none"
      :style="{ stroke: color }"
      :stroke-width="strokeWidth"
      stroke-linecap="round"
      :stroke-dasharray="circumference"
      :stroke-dashoffset="dashOffset"
      transform="rotate(-90 11 11)"
      style="transition: stroke-dashoffset 0.3s ease, stroke 0.3s ease;"
    />
    <!-- 百分比文字 -->
    <text
      x="11"
      y="13.5"
      text-anchor="middle"
      font-size="7"
      fill="var(--km-text)"
      font-weight="600"
    >{{ Math.round(percentage) }}</text>
  </svg>
</template>

<style scoped>
.km-context-ring {
  display: inline-block;
  vertical-align: middle;
  flex-shrink: 0;
}
</style>
