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
  border-radius: 8px;
  padding: 10px 12px;
  margin: 8px 0;
}
.km-approval-title { font-weight: 600; margin-bottom: 6px; }
.km-approval-args {
  background: var(--km-code-bg);
  padding: 8px;
  border-radius: 6px;
  overflow: auto;
  font-size: 12px;
  white-space: pre-wrap;
  margin: 0 0 8px;
}
.km-approval-btns { display: flex; gap: 8px; flex-wrap: wrap; }
.km-approval-btns button {
  background: var(--km-accent);
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 5px 12px;
  cursor: pointer;
  font-size: 13px;
}
.km-approval-btns button.deny { background: var(--km-muted); }
</style>
