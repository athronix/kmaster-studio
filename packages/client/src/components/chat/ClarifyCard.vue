<script setup lang="ts">
import { ref } from 'vue';
const props = defineProps<{ req: any }>();
const emit = defineEmits<{ (e: 'respond', response: string): void }>();
const free = ref('');

function pick(opt: string) {
  emit('respond', opt);
}
function submit() {
  const t = free.value.trim();
  if (t) emit('respond', t);
}
</script>

<template>
  <div class="km-clarify">
    <div class="km-clarify-q">❓ {{ req.question }}</div>
    <div v-if="req.options?.length" class="km-clarify-opts">
      <button v-for="o in req.options" :key="o" @click="pick(o)">{{ o }}</button>
    </div>
    <div class="km-clarify-free">
      <input v-model="free" placeholder="或输入自定义回答…" @keyup.enter="submit" />
      <button @click="submit">发送</button>
    </div>
  </div>
</template>

<style scoped>
.km-clarify {
  border: 1px solid var(--km-clarify-border);
  background: var(--km-clarify-bg);
  border-radius: 8px;
  padding: 10px 12px;
  margin: 8px 0;
}
.km-clarify-q { font-weight: 600; margin-bottom: 6px; }
.km-clarify-opts { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 6px; }
.km-clarify-opts button {
  background: var(--km-accent);
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 5px 12px;
  cursor: pointer;
  font-size: 13px;
}
.km-clarify-free { display: flex; gap: 6px; }
.km-clarify-free input {
  flex: 1;
  background: var(--km-panel);
  color: var(--km-text);
  border: 1px solid var(--km-border);
  border-radius: 6px;
  padding: 6px 10px;
  outline: none;
}
.km-clarify-free button {
  background: var(--km-accent);
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 0 14px;
  cursor: pointer;
}
</style>
