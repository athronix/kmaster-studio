<script setup lang="ts">
import { computed } from 'vue';
import { useChatStore } from '../../stores/chat';

const store = useChatStore();
const sid = computed(() => store.activeSessionId);
const usage = computed(() => (sid.value ? store.usageBySession[sid.value] : undefined));
</script>

<template>
  <div v-if="usage" class="km-usage">
    tokens: {{ usage.input_tokens + usage.output_tokens }}
    <span class="dim">(in {{ usage.input_tokens }} / out {{ usage.output_tokens }})</span>
    <span v-if="usage.cost"> · ${{ usage.cost.toFixed(4) }}</span>
  </div>
</template>

<style scoped>
.km-usage {
  font-size: var(--km-font-sm);
  opacity: 0.55;
  padding: 0 var(--km-space-2xs) var(--km-space-xs);
}
.dim { opacity: 0.7; }
</style>
