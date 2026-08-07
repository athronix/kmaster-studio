<script setup lang="ts">
/**
 * SkeletonList — 列表骨架屏（Phase C3）。
 *
 * 用于会话列表等纵向列表的加载占位，4 行头像+文本骨架。
 */
</script>

<template>
  <div class="km-skel-list">
    <div v-for="i in 4" :key="i" class="km-skel-row">
      <div class="km-skel-line km-skel-avatar"></div>
      <div class="km-skel-line km-skel-text1"></div>
      <div class="km-skel-line km-skel-text2"></div>
    </div>
  </div>
</template>

<style scoped>
.km-skel-list {
  padding: 16px;
}

.km-skel-row {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
}

.km-skel-line {
  background: var(--km-hover-bg);
  border-radius: 4px;
  animation: km-pulse 1.5s infinite;
}

.km-skel-avatar {
  width: 36px;
  height: 36px;
  border-radius: var(--km-radius-full);
  flex-shrink: 0;
}

.km-skel-text1 {
  width: 50%;
  height: 14px;
}

.km-skel-text2 {
  width: 70%;
  height: 14px;
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
