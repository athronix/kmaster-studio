<script setup lang="ts">
/**
 * SkeletonCard — 卡片骨架屏（Phase C3）。
 *
 * 用于 MarketLayout 等卡片网格的加载占位，包含图标/标题/描述/标签四行骨架。
 */
</script>

<template>
  <div class="km-skel-card">
    <div class="km-skel-line km-skel-icon"></div>
    <div class="km-skel-line km-skel-title"></div>
    <div class="km-skel-line km-skel-desc"></div>
    <div class="km-skel-line km-skel-tag"></div>
  </div>
</template>

<style scoped>
.km-skel-card {
  background: var(--km-card-bg);
  border: 1px solid var(--km-card-border);
  border-radius: var(--km-radius-md);
  padding: 12px;
}

.km-skel-line {
  background: var(--km-hover-bg);
  border-radius: 4px;
  margin-bottom: 8px;
  animation: km-pulse 1.5s infinite;
}

.km-skel-icon {
  width: 32px;
  height: 32px;
}

.km-skel-title {
  width: 60%;
  height: 14px;
}

.km-skel-desc {
  width: 100%;
  height: 10px;
}

.km-skel-tag {
  width: 40%;
  height: 10px;
}

@keyframes km-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.4;
  }
}
</style>
