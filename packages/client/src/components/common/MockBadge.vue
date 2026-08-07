<script setup lang="ts">
/**
 * MockBadge.vue — 模拟模式常驻徽标（U-02 对应的 UI）
 *
 * 仅在 HERMES_BRIDGE_MOCK=1 时显示。
 */
import { useHermesStatusStore } from '../../stores/hermesStatus';

const hermes = useHermesStatusStore();
</script>

<template>
  <n-tag v-if="hermes.isMock" type="warning" size="small" round>
    <template #icon>⚠️</template>
    模拟模式
  </n-tag>
</template>
