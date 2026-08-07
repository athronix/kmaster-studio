<script setup lang="ts">
/**
 * SchemaDialog — MCP tool / resource / prompt 的 inputSchema 详情弹窗（V3 T5 / S5.2 / N23 / R-13④）。
 *
 * 复用 AgentMarkdown 渲染 ```json 代码块（highlight.js 已内置，零新增依赖），
 * 提供「复制」按钮。schema 为空时给出空态提示，绝不白屏。
 *
 * 触发方：McpDetail 点击任一 schema 卡片 → v-model:show 控制显隐。
 */
import { computed, ref } from 'vue';
import { NButton, NEmpty, NSpace, useMessage } from 'naive-ui';
import AgentMarkdown from '../chat/AgentMarkdown.vue';

const props = withDefaults(
  defineProps<{
    /** 弹窗显隐 */
    show: boolean;
    /** 标题（通常形如 `Tool: query`） */
    title?: string;
    /** schema 对象；null 时展示空态 */
    schema: Record<string, unknown> | null;
  }>(),
  { title: 'Schema 详情', schema: null }
);

const emit = defineEmits<{
  (e: 'update:show', v: boolean): void;
}>();

const toast = useMessage();

/** 渲染用 Markdown：包成 ```json 围栏，交给 AgentMarkdown 高亮。 */
const mdSource = computed<string>(() =>
  props.schema === null
    ? ''
    : '```json\n' + JSON.stringify(props.schema, null, 2) + '\n```'
);

/** 原始 JSON 文本（复制用）。 */
const rawText = computed<string>(() =>
  props.schema === null ? '' : JSON.stringify(props.schema, null, 2)
);

const copying = ref<boolean>(false);

async function onCopy(): Promise<void> {
  if (props.schema === null) return;
  copying.value = true;
  try {
    await navigator.clipboard.writeText(rawText.value);
    toast.success('已复制 Schema JSON');
  } catch {
    toast.error('复制失败，请手动选择文本复制');
  } finally {
    copying.value = false;
  }
}

function onClose(): void {
  emit('update:show', false);
}
</script>

<template>
  <n-modal
    :show="show"
    preset="card"
    :title="title"
    :style="{ width: '560px', maxWidth: '92vw' }"
    :mask-closable="true"
    @update:show="(v: boolean) => emit('update:show', v)"
  >
    <div class="km-sd">
      <n-empty v-if="schema === null" description="没有可展示的 Schema" />

      <template v-else>
        <div class="km-sd-body">
          <AgentMarkdown :source="mdSource" />
        </div>
      </template>
    </div>

    <template #footer>
      <n-space justify="end">
        <n-button size="small" :disabled="schema === null" :loading="copying" @click="onCopy">
          复制 JSON
        </n-button>
        <n-button size="small" @click="onClose">关闭</n-button>
      </n-space>
    </template>
  </n-modal>
</template>

<style scoped>
.km-sd {
  min-height: 80px;
}

.km-sd-body {
  max-height: 60vh;
  overflow: auto;
  border: 1px solid var(--km-border);
  border-radius: 8px;
  padding: 10px 12px;
  background: var(--km-panel);
}

/* 让代码块在深色背景下也清晰 */
.km-sd-body :deep(pre) {
  margin: 0;
  background: transparent;
}
</style>
