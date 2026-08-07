<script setup lang="ts">
import { ref, computed } from 'vue';
import KIcon from '../common/KIcon.vue';
import type { ToolCall } from '../../types/chat';

const props = defineProps<{ tool: ToolCall }>();
const open = ref(false);
const statusClass = computed(() => props.tool.status);
const statusIcon = computed(() =>
  props.tool.status === 'running' ? 'Hourglass' : props.tool.status === 'error' ? 'X' : 'Check'
);
</script>

<template>
  <div class="km-tool" :class="statusClass">
    <div class="km-tool-head" @click="open = !open">
      <span class="ico"><KIcon :name="statusIcon" :size="14" /></span>
      <span class="name">{{ tool.tool }}</span>
      <span class="status">{{ tool.status }}</span>
      <span class="chev"><KIcon :name="open ? 'ChevronDown' : 'ChevronRight'" :size="14" /></span>
    </div>
    <div v-show="open" class="km-tool-body">
      <div class="lbl">参数</div>
      <pre>{{ JSON.stringify(tool.args, null, 2) }}</pre>
      <div class="lbl">结果</div>
      <pre>{{ tool.error || JSON.stringify(tool.result, null, 2) }}</pre>
    </div>
  </div>
</template>

<style scoped>
.km-tool {
  border: 1px solid var(--km-border);
  border-radius: 6px;
  margin: 6px 0;
  font-size: 12px;
  background: var(--km-tool-card-bg);
}
.km-tool-head {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 6px 10px;
  cursor: pointer;
}
.km-tool.done .ico { color: var(--km-success); }
.km-tool.error .ico { color: var(--km-danger); }
.name { font-weight: 600; }
.status { opacity: 0.5; margin-left: auto; text-transform: uppercase; }
.km-tool-body { padding: 0 10px 10px; }
.lbl { opacity: 0.5; margin: 6px 0 2px; }
pre {
  background: var(--km-code-bg);
  padding: 8px;
  border-radius: 6px;
  overflow: auto;
  margin: 0;
  white-space: pre-wrap;
}
</style>
