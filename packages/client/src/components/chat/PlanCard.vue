<script setup lang="ts">
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
    <div class="km-plan-title">📋 执行计划：{{ req.title }}</div>
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
  border-radius: 8px;
  padding: 10px 12px;
  margin: 8px 0;
}
.km-plan-title { font-weight: 600; margin-bottom: 6px; }
.km-plan-steps { margin: 0 0 8px; padding-left: 20px; font-size: 13px; line-height: 1.7; }
.km-plan-btns { display: flex; gap: 8px; flex-wrap: wrap; }
.km-plan-btns button {
  background: var(--km-accent);
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 5px 12px;
  cursor: pointer;
  font-size: 13px;
}
.km-plan-btns button.reject { background: var(--km-muted); }
</style>
