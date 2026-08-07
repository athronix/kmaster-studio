<script setup lang="ts">
// F16 子代理卡片：一个子代理一张卡（目标 / 状态 / 进度 / 流式产出折叠区）。
// 数据来自 chat store 的 subagentsBySession[sid][subagent_id]（subagent.* 事件 reducer 产物）。
import { computed, ref } from 'vue';
import { NTag, NProgress } from 'naive-ui';
import KIcon from '../common/KIcon.vue';
import type { SubagentState, SubagentStatus } from '../../types/chat';

const props = defineProps<{ subagent: SubagentState }>();

const expanded = ref(false);
const s = computed(() => props.subagent);

const STATUS_LABEL: Record<SubagentStatus, string> = {
  running: '运行中',
  ok: '已完成',
  failed: '失败',
  error: '错误',
  timeout: '超时',
};

const statusType = computed<'info' | 'success' | 'error' | 'warning'>(() => {
  switch (s.value.status) {
    case 'ok': return 'success';
    case 'failed':
    case 'error': return 'error';
    case 'timeout': return 'warning';
    default: return 'info';
  }
});

/** 进度：优先按批次序号（task_index/task_count），否则按运行态给出不确定进度。 */
const percent = computed(() => {
  if (s.value.status !== 'running') return 100;
  const count = s.value.task_count ?? 0;
  const idx = s.value.task_index ?? 0;
  if (count > 0) return Math.min(95, Math.round(((idx + 0.5) / count) * 100));
  return 40;
});

const toolCount = computed(() => s.value.tool_count ?? s.value.tools.length);
const hasOutput = computed(() => !!(s.value.text || s.value.thinking || s.value.tools.length));
const duration = computed(() =>
  s.value.duration_seconds !== undefined ? `${s.value.duration_seconds.toFixed(1)}s` : ''
);
</script>

<template>
  <article class="km-sub" :class="`km-sub-${statusType}`">
    <header class="km-sub-head">
      <span class="km-sub-title" :title="s.goal || s.title">{{ s.title }}</span>
      <n-tag size="tiny" :type="statusType" :bordered="false">{{ STATUS_LABEL[s.status] }}</n-tag>
    </header>

    <div class="km-sub-meta">
      <span v-if="s.task_count">子任务 {{ (s.task_index ?? 0) + 1 }}/{{ s.task_count }}</span>
      <span>工具 {{ toolCount }}</span>
      <span v-if="s.model">{{ s.model }}</span>
      <span v-if="duration">耗时 {{ duration }}</span>
    </div>

    <n-progress
      class="km-sub-progress"
      type="line"
      :percentage="percent"
      :height="4"
      :show-indicator="false"
      :status="statusType === 'error' ? 'error' : statusType === 'success' ? 'success' : 'default'"
      :processing="s.status === 'running'"
    />

    <p v-if="s.progress" class="km-sub-progress-text">{{ s.progress }}</p>
    <p v-if="s.summary" class="km-sub-summary">{{ s.summary }}</p>

    <button v-if="hasOutput" class="km-sub-toggle" @click="expanded = !expanded">
      {{ expanded ? '收起产出' : '展开产出' }} <KIcon :name="expanded ? 'ChevronUp' : 'ChevronDown'" :size="14" />
    </button>

    <div v-if="expanded" class="km-sub-body">
      <template v-if="s.thinking">
        <h5 class="km-sub-sec">思考</h5>
        <pre class="km-sub-pre km-sub-dim">{{ s.thinking }}</pre>
      </template>
      <template v-if="s.tools.length">
        <h5 class="km-sub-sec">工具调用</h5>
        <ul class="km-sub-tools">
          <li v-for="(t, i) in s.tools" :key="`${t.tool}-${i}`">
            <code>{{ t.tool }}</code><span v-if="t.preview"> · {{ t.preview }}</span>
          </li>
        </ul>
      </template>
      <template v-if="s.text">
        <h5 class="km-sub-sec">正文</h5>
        <pre class="km-sub-pre">{{ s.text }}</pre>
      </template>
    </div>
  </article>
</template>

<style scoped>
.km-sub {
  border: 1px solid var(--km-border);
  border-left: 3px solid var(--km-accent);
  border-radius: 8px;
  padding: 10px 12px;
  background: var(--km-panel);
  min-width: 240px;
  flex: 1 1 260px;
}
.km-sub-success { border-left-color: var(--km-success); }
.km-sub-error { border-left-color: var(--km-danger); }
.km-sub-warning { border-left-color: var(--km-warning); }
.km-sub-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.km-sub-title {
  font-size: 13px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.km-sub-meta { display: flex; gap: 10px; flex-wrap: wrap; font-size: 11px; opacity: 0.5; margin: 4px 0 6px; }
.km-sub-progress { margin-bottom: 6px; }
.km-sub-progress-text { margin: 0 0 4px; font-size: 11px; opacity: 0.65; }
.km-sub-summary { margin: 0 0 6px; font-size: 12px; line-height: 1.6; }
.km-sub-toggle {
  background: none;
  border: none;
  color: var(--km-accent);
  font-size: 11px;
  cursor: pointer;
  padding: 0;
}
.km-sub-body { margin-top: 6px; border-top: 1px dashed var(--km-border); padding-top: 6px; }
.km-sub-sec { margin: 6px 0 3px; font-size: 11px; opacity: 0.6; font-weight: 600; }
.km-sub-pre {
  margin: 0;
  max-height: 180px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 11px;
  line-height: 1.6;
}
.km-sub-dim { opacity: 0.6; font-style: italic; }
.km-sub-tools { margin: 0; padding-left: 16px; font-size: 11px; line-height: 1.7; opacity: 0.8; }
</style>
