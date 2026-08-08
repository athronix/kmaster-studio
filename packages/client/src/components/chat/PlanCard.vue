<script setup lang="ts">
import KIcon from '../common/KIcon.vue';

const props = defineProps<{ req: any }>();
const emit = defineEmits<{ (e: 'respond', choice: string): void }>();
const choices: { key: string; label: string }[] = [
  { key: 'approve', label: '批准' },
  { key: 'reject', label: '驳回' },
  { key: 'revise', label: '修订' },
];
</script>

<template>
  <div class="km-plan">
    <div class="km-plan-title"><KIcon name="Clipboard" :size="16" /> 执行计划：{{ req.title }}</div>
    <ol class="km-plan-steps">
      <li v-for="(s, i) in req.steps" :key="i">{{ s }}</li>
    </ol>
    <div class="km-plan-btns">
      <button v-for="c in choices" :key="c.key" :class="{ reject: c.key === 'reject' }" @click="emit('respond', c.key)">
        {{ c.label }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.km-plan {
  border: 1px solid var(--km-plan-border);
  background: var(--km-plan-bg);
  border-radius: var(--km-radius-lg);
  padding: var(--km-space-10) var(--km-space-md);
  margin: var(--km-space-sm) 0;
}
.km-plan-title { font-weight: 600; margin-bottom: var(--km-space-6); }
.km-plan-steps { margin: 0 0 var(--km-space-sm); padding-left: var(--km-space-20); font-size: var(--km-font-13); line-height: 1.7; }
.km-plan-btns { display: flex; gap: var(--km-space-sm); flex-wrap: wrap; }
.km-plan-btns button {
  background: var(--km-accent);
  color: var(--km-text-on-accent);
  border: none;
  border-radius: var(--km-radius-md);
  padding: 5px var(--km-space-md);
  cursor: pointer;
  font-size: var(--km-font-13);
}
.km-plan-btns button.reject { background: var(--km-muted); }
</style>
