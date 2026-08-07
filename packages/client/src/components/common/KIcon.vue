<script setup lang="ts">
import { computed } from 'vue';
import * as TablerIcons from '@tabler/icons-vue';

const props = withDefaults(
  defineProps<{
    name: string;
    size?: string | number;
  }>(),
  {
    size: 20,
  },
);

const icon = computed(() => {
  return (TablerIcons as Record<string, unknown>)['Icon' + props.name] || null;
});
</script>

<template>
  <component :is="icon" v-if="icon" :size="size" stroke-width="1.5" />
  <span v-else class="kicon-fallback">{{ name }}</span>
</template>

<style scoped>
.kicon-fallback {
  font-size: 12px;
  color: var(--km-muted);
  background: var(--km-hover-bg);
  border-radius: var(--km-radius-sm);
  padding: 2px 6px;
}
</style>
