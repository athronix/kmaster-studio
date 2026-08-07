<script setup lang="ts">
/**
 * LogSection — 日志查看分组（V3 T4 / R-26 / R-28）。
 *
 * 数据源 stores/logs：桌面端读本地日志目录，无桥环境自动回落演示数据（isMock）。
 * 过滤维度：时间区间 / 会话 / 种类 / 级别 / 关键字（关键字 300ms 防抖）。
 * 点击行 → emit('open-detail', entry) 由外层弹出 LogDetailDialog。
 *
 * 既可作为「通用」分组的内嵌子块（embedded），也可独立成页。
 */
import { computed, onMounted, ref } from 'vue';
import {
  NButton,
  NEmpty,
  NInput,
  NSelect,
  NSpin,
  NTag,
  useMessage,
} from 'naive-ui';
import { useLogsStore } from '../../stores/logs';
import {
  INTERACTION,
  LOG_KIND_OPTIONS,
  LOG_LEVEL_OPTIONS,
  TIME_RANGE_OPTIONS,
  type LogKind,
  type LogLevel,
  type TimeRange,
} from '../../constants/layout';
import { hasFileSystemBridge, pickFolder } from '../../utils/desktop-bridge';
import type { LogEntry } from '../../types/settings';

const props = withDefaults(
  defineProps<{
    /** 内嵌模式：去掉外边距与标题，供「通用」分组复用 */
    embedded?: boolean;
    /** 列表最大高度（px）；内嵌时限制高度避免撑爆父容器 */
    maxHeight?: number;
  }>(),
  { embedded: false, maxHeight: 420 }
);

const emit = defineEmits<{
  (e: 'open-detail', entry: LogEntry): void;
}>();

const logs = useLogsStore();
const toast = useMessage();

/** 关键字输入框本地值（防抖后才写入 store.filter.q） */
const keyword = ref<string>('');
let timer: ReturnType<typeof setTimeout> | null = null;

/** 目录输入框（Web 端无 pickFolder 时的文本兜底） */
const dirInput = ref<string>('');

const kindOptions = computed(() => [
  { label: '全部种类', value: 'all' as const },
  ...LOG_KIND_OPTIONS.map((o) => ({ label: o.label, value: o.value })),
]);

const levelOptions = computed(() => [
  { label: '全部级别', value: 'all' as const },
  ...LOG_LEVEL_OPTIONS.map((o) => ({ label: o.label, value: o.value })),
]);

const timeOptions = computed(() => TIME_RANGE_OPTIONS.map((o) => ({ label: o.label, value: o.value })));

const listStyle = computed(() => ({ maxHeight: `${props.maxHeight}px` }));

onMounted(() => {
  logs.hydrate();
  keyword.value = logs.filter.q;
  dirInput.value = logs.logDir;
  void logs.load();
});

function onKeyword(value: string): void {
  keyword.value = value;
  if (timer !== null) clearTimeout(timer);
  timer = setTimeout(() => {
    logs.setFilter({ q: value });
  }, INTERACTION.searchDebounceMs);
}

function onTime(value: TimeRange): void {
  logs.setFilter({ time: value });
}

function onSession(value: string): void {
  logs.setFilter({ sessionId: value });
}

function onKind(value: LogKind | 'all'): void {
  logs.setFilter({ kind: value });
}

function onLevel(value: LogLevel | 'all'): void {
  logs.setFilter({ level: value });
}

function onReset(): void {
  logs.resetFilter();
  keyword.value = '';
}

async function onRefresh(): Promise<void> {
  await logs.load();
  toast.success(logs.isMock ? '当前为演示数据（本环境不支持读取本地日志）' : `已刷新，共 ${logs.entries.length} 条`);
}

/** 选择日志目录：桌面端弹原生选择器，Web 端提示用输入框 */
async function onPickDir(): Promise<void> {
  const picked = await pickFolder();
  if (picked === null) {
    toast.warning('当前环境不支持目录选择，请在输入框中直接填写路径');
    return;
  }
  dirInput.value = picked;
  await logs.setLogDir(picked);
  toast.success('日志目录已更新');
}

async function onApplyDir(): Promise<void> {
  const next = dirInput.value.trim();
  if (next === '') {
    toast.warning('请先填写日志目录');
    return;
  }
  await logs.setLogDir(next);
  toast.success('日志目录已更新');
}

async function onOpenDir(): Promise<void> {
  const ok = await logs.openLogDir();
  if (!ok) toast.warning('当前环境无法打开目录，请手动前往：' + logs.logDir);
}

function onRowClick(entry: LogEntry): void {
  emit('open-detail', entry);
}

function levelTagType(level: LogLevel): 'error' | 'warning' | 'default' {
  if (level === 'error') return 'error';
  if (level === 'warning') return 'warning';
  return 'default';
}

function formatTime(ts: number): string {
  if (ts === 0) return '—';
  const d = new Date(ts);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function kindLabel(kind: LogKind): string {
  return LOG_KIND_OPTIONS.find((o) => o.value === kind)?.label ?? kind;
}
</script>

<template>
  <div class="lgs" :class="{ embedded: props.embedded }">
    <div v-if="!props.embedded" class="lgs-title">日志</div>

    <!-- 目录设置 -->
    <div class="lgs-dir">
      <n-input
        v-model:value="dirInput"
        size="small"
        placeholder="日志根目录，例如 ~/.kmaster/logs"
        clearable
      />
      <n-button size="small" @click="onApplyDir">应用</n-button>
      <n-button v-if="hasFileSystemBridge()" size="small" tertiary @click="onPickDir">选择目录…</n-button>
      <n-button size="small" tertiary @click="onOpenDir">打开目录</n-button>
    </div>

    <!-- 过滤工具栏 -->
    <div class="lgs-filters">
      <n-select
        :value="logs.filter.time"
        :options="timeOptions"
        size="small"
        style="width: 120px"
        @update:value="onTime"
      />
      <n-select
        :value="logs.filter.sessionId"
        :options="logs.sessionOptions"
        size="small"
        style="width: 150px"
        @update:value="onSession"
      />
      <n-select
        :value="logs.filter.kind"
        :options="kindOptions"
        size="small"
        style="width: 140px"
        @update:value="onKind"
      />
      <n-select
        :value="logs.filter.level"
        :options="levelOptions"
        size="small"
        style="width: 120px"
        @update:value="onLevel"
      />
      <n-input
        :value="keyword"
        size="small"
        placeholder="关键字…"
        clearable
        class="lgs-kw"
        @update:value="onKeyword"
      />
      <n-button v-if="logs.filterActive" size="small" tertiary @click="onReset">清除筛选</n-button>
      <n-button size="small" tertiary :loading="logs.loading" @click="onRefresh">刷新</n-button>
    </div>

    <!-- 统计条 -->
    <div class="lgs-meta">
      <span>命中 {{ logs.filteredCount }} / {{ logs.entries.length }} 条</span>
      <n-tag v-if="logs.isMock" size="tiny" type="warning" :bordered="false">演示数据</n-tag>
      <n-tag v-if="logs.error !== ''" size="tiny" type="error" :bordered="false">{{ logs.error }}</n-tag>
      <span class="lgs-meta-spacer"></span>
      <span
        v-for="opt in LOG_KIND_OPTIONS"
        :key="opt.value"
        class="lgs-meta-kind"
      >{{ opt.label }} {{ logs.countByKind[opt.value] }}</span>
    </div>

    <!-- 列表 -->
    <n-spin :show="logs.loading">
      <div class="lgs-list" :style="listStyle">
        <n-empty
          v-if="!logs.filtered.length"
          class="lgs-empty"
          :description="logs.filterActive ? '没有符合筛选条件的日志' : '暂无日志'"
        >
          <template #extra>
            <n-button v-if="logs.filterActive" size="small" @click="onReset">清除筛选</n-button>
            <n-button v-else size="small" @click="onRefresh">重新加载</n-button>
          </template>
        </n-empty>

        <div
          v-for="entry in logs.filtered"
          :key="entry.id"
          class="lgs-row"
          @click="onRowClick(entry)"
        >
          <span class="lgs-ts">{{ formatTime(entry.ts) }}</span>
          <n-tag size="tiny" :bordered="false" :type="levelTagType(entry.level)" class="lgs-level">
            {{ entry.level }}
          </n-tag>
          <span class="lgs-kind">{{ kindLabel(entry.kind) }}</span>
          <span class="lgs-summary">{{ entry.summary }}</span>
        </div>
      </div>
    </n-spin>
  </div>
</template>

<style scoped>
.lgs {
  display: flex;
  flex-direction: column;
  gap: var(--km-space-10);
}

.lgs-title {
  font-size: var(--km-font-sm);
  font-weight: 600;
}

.lgs-dir {
  display: flex;
  gap: var(--km-space-sm);
  align-items: center;
  max-width: 720px;
}

.lgs-filters {
  display: flex;
  flex-wrap: wrap;
  gap: var(--km-space-sm);
  align-items: center;
}

.lgs-kw {
  width: 200px;
}

.lgs-meta {
  display: flex;
  align-items: center;
  gap: var(--km-space-sm);
  font-size: var(--km-font-xs);
  opacity: 0.6;
  flex-wrap: wrap;
}

.lgs-meta-spacer {
  flex: 1;
}

.lgs-meta-kind {
  white-space: nowrap;
}

.lgs-list {
  overflow-y: auto;
  border: 1px solid var(--km-border);
  border-radius: var(--km-radius-lg);
  background: var(--km-panel);
}

.lgs-empty {
  padding: var(--km-space-3xl) 0;
}

.lgs-row {
  display: flex;
  align-items: center;
  gap: var(--km-space-sm);
  padding: var(--km-space-6) var(--km-space-10);
  border-bottom: 1px solid var(--km-border);
  cursor: pointer;
  font-size: var(--km-font-sm);
  transition: background 0.12s ease;
}

.lgs-row:last-child {
  border-bottom: none;
}

.lgs-row:hover {
  background: var(--km-bg);
}

.lgs-ts {
  flex-shrink: 0;
  width: 96px;
  font-family: var(--km-mono, ui-monospace, monospace);
  opacity: 0.6;
}

.lgs-level {
  flex-shrink: 0;
  width: 60px;
  justify-content: center;
}

.lgs-kind {
  flex-shrink: 0;
  width: 110px;
  opacity: 0.6;
}

.lgs-summary {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
