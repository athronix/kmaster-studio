<script setup lang="ts">
import KIcon from '../common/KIcon.vue';

const props = defineProps<{ req: any }>();
const emit = defineEmits<{ (e: 'respond', choice: string): void }>();
const choices = ['once', 'session', 'always', 'deny'] as const;
const labels: Record<string, string> = {
  once: '允许一次',
  session: '本次会话允许',
  always: '总是允许',
  deny: '拒绝',
};
</script>

<template>
  <div class="km-approval">
    <div class="km-approval-title"><KIcon name="Lock" :size="16" /> 需要授权：{{ req.tool }}</div>
    <pre v-if="req.args" class="km-approval-args">{{ JSON.stringify(req.args, null, 2) }}</pre>
    <div class="km-approval-btns">
      <button v-for="c in choices" :key="c" :class="{ deny: c === 'deny' }" @click="emit('respond', c)">
        {{ labels[c] }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.km-approval {
  border: 1px solid var(--km-approval-border);
  background: var(--km-approval-bg);
  border-radius: var(--km-radius-lg);
  padding: var(--km-space-10) var(--km-space-md);
  margin: var(--km-space-sm) 0;
}
.km-approval-title { font-weight: 600; margin-bottom: var(--km-space-6); }
.km-approval-args {
  background: var(--km-code-bg);
  padding: var(--km-space-sm);
  border-radius: var(--km-radius-md);
  overflow: auto;
  font-size: var(--km-font-sm);
  white-space: pre-wrap;
  margin: 0 0 var(--km-space-sm);
}
.km-approval-btns { display: flex; gap: var(--km-space-sm); flex-wrap: wrap; }
.km-approval-btns button {
  background: var(--km-accent);
  color: var(--km-text-on-accent);
  border: none;
  border-radius: var(--km-radius-md);
  padding: 5px var(--km-space-md);
  cursor: pointer;
  font-size: var(--km-font-13);
}
.km-approval-btns button.deny { background: var(--km-muted); }
</style>
