<script setup lang="ts">
import { ref } from 'vue';
import KIcon from '../common/KIcon.vue';

const props = defineProps<{ text: string }>();
const open = ref(true);
</script>

<template>
  <div class="km-thought">
    <div class="km-thought-head" @click="open = !open">
      <span class="dot" /> 思考过程
      <span class="chev"><KIcon :name="open ? 'ChevronDown' : 'ChevronRight'" :size="14" /></span>
    </div>
    <div v-show="open" class="km-thought-body">{{ props.text }}</div>
  </div>
</template>

<style scoped>
.km-thought {
  border-left: 2px solid var(--km-thought-border);
  padding: var(--km-space-xs) var(--km-space-10);
  margin: 6px 0;
  opacity: 0.85;
  font-size: var(--km-font-sm);
}
.km-thought-head {
  cursor: pointer;
  color: var(--km-muted);
  display: flex;
  align-items: center;
  gap: var(--km-space-6);
}
.dot { width: 6px; height: 6px; border-radius: 50%; background: var(--km-muted); }
.km-thought-body { white-space: pre-wrap; margin-top: var(--km-space-xs); }
</style>
