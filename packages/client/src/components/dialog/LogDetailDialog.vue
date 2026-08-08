<script setup lang="ts">
/**
 * LogDetailDialog — 日志条目详情弹窗（V3 T5 / S5.1，覆盖 R-27）。
 *
 * 展示单条日志的全文、时间、级别、来源文件，
 * 并提供「复制全文」与「在外部应用打开源文件」两个动作。
 * Web 端不具备外部打开能力时按钮仍可点，但会明确提示，不做静默失败。
 */
import { computed } from 'vue';
import { NButton, NModal, NSpace, NTag, useMessage } from 'naive-ui';
import { useLogsStore } from '../../stores/logs';
import { LOG_KIND_OPTIONS } from '../../constants/layout';
import type { LogEntry } from '../../types/settings';

const props = defineProps<{
  show: boolean;
  /** 当前查看的日志；null 时弹窗内容为空（一般配合 show=false） */
  entry: LogEntry | null;
}>();

const emit = defineEmits<{
  (e: 'update:show', v: boolean): void;
}>();

const logs = useLogsStore();
const toast = useMessage();

const levelType = computed<'error' | 'warning' | 'default'>(() => {
  const level = props.entry?.level ?? 'info';
  if (level === 'error') return 'error';
  if (level === 'warning') return 'warning';
  return 'default';
});

const kindLabel = computed<string>(() => {
  const kind = props.entry?.kind;
  if (kind === undefined) return '—';
  return LOG_KIND_OPTIONS.find((o) => o.value === kind)?.label ?? kind;
});

const timeText = computed<string>(() => {
  const ts = props.entry?.ts ?? 0;
  if (ts === 0) return '时间未知';
  return new Date(ts).toLocaleString();
});

const sessionText = computed<string>(() => {
  const sid = props.entry?.sessionId ?? '';
  return sid === '' ? '无关联会话' : sid;
});

function close(): void {
  emit('update:show', false);
}

/** 复制全文；剪贴板不可用时退回提示 */
async function onCopy(): Promise<void> {
  const text = props.entry?.content ?? '';
  if (text === '') {
    toast.warning('没有可复制的内容');
    return;
  }
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard !== undefined) {
      await navigator.clipboard.writeText(text);
      toast.success('已复制到剪贴板');
      return;
    }
    toast.warning('当前环境不支持剪贴板，请手动选中复制');
  } catch {
    toast.warning('复制失败，请手动选中复制');
  }
}

/** 在外部应用打开源文件 */
async function onOpenExternal(): Promise<void> {
  const file = props.entry?.file ?? '';
  if (file === '') {
    toast.warning('该日志没有关联的源文件');
    return;
  }
  const ok = await logs.openExternal(file);
  if (!ok) toast.warning(`当前环境无法打开文件，请手动前往：${file}`);
}
</script>

<template>
  <n-modal
    :show="show"
    preset="card"
    class="lgd"
    style="width: 760px; max-width: 94vw"
    :mask-closable="true"
    @update:show="(v: boolean) => emit('update:show', v)"
  >
    <template #header>
      <div class="lgd-head">
        <n-tag size="tiny" :type="levelType" :bordered="false">{{ entry?.level ?? 'info' }}</n-tag>
        <span class="lgd-title">{{ entry?.summary || '日志详情' }}</span>
      </div>
    </template>

    <div class="lgd-body">
      <div class="lgd-meta">
        <div class="lgd-meta-row"><span class="lgd-meta-k">时间</span><span>{{ timeText }}</span></div>
        <div class="lgd-meta-row"><span class="lgd-meta-k">种类</span><span>{{ kindLabel }}</span></div>
        <div class="lgd-meta-row"><span class="lgd-meta-k">会话</span><span>{{ sessionText }}</span></div>
        <div class="lgd-meta-row">
          <span class="lgd-meta-k">文件</span>
          <span class="lgd-file">{{ entry?.file || '—' }}</span>
        </div>
      </div>

      <pre class="lgd-content">{{ entry?.content || '（无正文）' }}</pre>
    </div>

    <template #footer>
      <n-space justify="end">
        <n-button size="small" @click="onCopy">复制全文</n-button>
        <n-button size="small" @click="onOpenExternal">在外部应用打开</n-button>
        <n-button size="small" type="primary" @click="close">关闭</n-button>
      </n-space>
    </template>
  </n-modal>
</template>

<style scoped>
.lgd-head {
  display: flex;
  align-items: center;
  gap: var(--km-space-sm);
  min-width: 0;
}

.lgd-title {
  font-size: var(--km-font-md);
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lgd-body {
  display: flex;
  flex-direction: column;
  gap: var(--km-space-md);
}

.lgd-meta {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--km-space-6) var(--km-space-lg);
  font-size: var(--km-font-sm);
}

.lgd-meta-row {
  display: flex;
  gap: var(--km-space-sm);
  min-width: 0;
}

.lgd-meta-k {
  flex-shrink: 0;
  width: 32px;
  opacity: 0.5;
}

.lgd-file {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--km-mono, ui-monospace, monospace);
  opacity: 0.75;
}

.lgd-content {
  margin: 0;
  padding: var(--km-space-md);
  max-height: 420px;
  overflow: auto;
  border: 1px solid var(--km-border);
  border-radius: 6px;
  background: var(--km-bg);
  font-family: var(--km-mono, ui-monospace, monospace);
  font-size: var(--km-font-sm);
  line-height: 1.8;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
