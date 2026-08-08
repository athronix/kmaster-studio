<script setup lang="ts">
// F15 自动化任务整页：任务表格（名称/表达式/prompt 摘要/启停/下次运行/操作）
// + 新建·编辑 NModal + 手动触发（202 语义提示）+ 运行历史时间线。
// V3 T5 / S5.5：接 PageHeader（独立路由走自带头部、设置内嵌时复用壳层头部）、
// 按 name 排序、首次进入默认选中首项并高亮、历史区只显示选中任务（标题带任务名）、
// `run.file` 渲染为可点元素 → 右栏切「任务产物」标签并加载（R-34 联动）。
import { computed, onMounted, ref, watch } from 'vue';
import {
  NButton, NInput, NModal, NSwitch, NTag, NEmpty, NSpin, NPopconfirm, NAlert, useMessage,
} from 'naive-ui';
import KIcon from '../components/common/KIcon.vue';
import { useJobsStore } from '../stores/jobs';
import { useChatStore } from '../stores/chat';
import PageHeader from '../components/layout/PageHeader.vue';
import type { CronJob, CronRun } from '../types/chat';

const props = withDefaults(
  defineProps<{
    /** 内嵌于设置页时关闭自身 PageHeader（外壳已提供），并改用 `search` 驱动过滤 */
    embedded?: boolean;
    /** 来自外壳 PageHeader 的搜索关键字（embedded 模式生效） */
    search?: string;
  }>(),
  { embedded: false, search: '' }
);

const store = useJobsStore();
const chat = useChatStore();
const message = useMessage();

const showForm = ref(false);
const saving = ref(false);
const editingId = ref<string>('');
const formName = ref('');
const formSchedule = ref('');
const formPrompt = ref('');
const formDeliver = ref('');
const formWorkdir = ref('');
/** 历史过滤：空 = 全部任务 */
const historyJobId = ref<string>('');
/** 列表搜索（独立路由模式下由 PageHeader 驱动） */
const localSearch = ref('');

/** 生效的搜索关键字：内嵌模式用外壳下发，独立模式用本地输入。 */
const searchQuery = computed<string>(() => (props.embedded ? props.search : localSearch.value));

/** 按名称排序 + 搜索过滤后的任务列表（S5.5：按 name 排序）。 */
const sortedJobs = computed<CronJob[]>(() => {
  const q = searchQuery.value.trim().toLowerCase();
  const list = q === ''
    ? store.jobs
    : store.jobs.filter((j) => (j.name ?? '').toLowerCase().includes(q));
  return [...list].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
});

/** 当前选中的任务 id（高亮 + 历史联动）。 */
const selectedJobId = ref<string>('');

/** 首次进入 / 数据回来后默认选中首项（S5.5①）。 */
function ensureSelection(): void {
  if (selectedJobId.value !== '' && sortedJobs.value.some((j) => j.id === selectedJobId.value)) return;
  const first = sortedJobs.value[0];
  selectedJobId.value = first ? first.id : '';
  if (first) loadHistory(first.id);
}

watch(sortedJobs, () => ensureSelection(), { immediate: true });

onMounted(async () => {
  await Promise.allSettled([
    store.load(),
    store.loadHistory(),
    store.loadSchedulerStatus(),
  ]);
  ensureSelection();
});

/** 历史区只展示选中任务；未选中则展示全部（S5.5：标题带任务名）。 */
const shownHistory = computed<CronRun[]>(() =>
  selectedJobId.value === ''
    ? store.history
    : store.history.filter((h) => h.job_id === selectedJobId.value)
);

const selectedJobName = computed<string>(() => {
  if (selectedJobId.value === '') return '';
  return sortedJobs.value.find((j) => j.id === selectedJobId.value)?.name ?? '';
});

function openCreate() {
  editingId.value = '';
  formName.value = '';
  formSchedule.value = '';
  formPrompt.value = '';
  formDeliver.value = '';
  formWorkdir.value = '';
  showForm.value = true;
}
function openEdit(job: CronJob) {
  editingId.value = job.id;
  formName.value = job.name ?? '';
  formSchedule.value = job.schedule_expr ?? '';
  formPrompt.value = job.prompt ?? '';
  formDeliver.value = job.deliver ?? '';
  formWorkdir.value = job.workdir ?? '';
  showForm.value = true;
}

async function save() {
  const schedule = formSchedule.value.trim();
  if (!schedule) {
    message.warning('请填写调度表达式，如 30m / every 2h / 0 9 * * *');
    return;
  }
  saving.value = true;
  try {
    if (editingId.value) {
      await store.edit(editingId.value, {
        name: formName.value.trim() || undefined,
        schedule,
        prompt: formPrompt.value.trim() || undefined,
        deliver: formDeliver.value.trim() || undefined,
        workdir: formWorkdir.value.trim() || undefined,
      });
      message.success('任务已更新');
    } else {
      await store.create({
        schedule,
        name: formName.value.trim() || undefined,
        prompt: formPrompt.value.trim() || undefined,
        deliver: formDeliver.value.trim() || undefined,
        workdir: formWorkdir.value.trim() || undefined,
      });
      message.success('任务已创建');
    }
    showForm.value = false;
  } catch (e: any) {
    message.error(String(e?.message ?? e));
  } finally {
    saving.value = false;
  }
}

async function toggle(job: CronJob, enabled: boolean) {
  try {
    await store.toggle(job.id, enabled);
    message.success(enabled ? '任务已恢复' : '任务已暂停');
  } catch (e: any) {
    message.error(String(e?.message ?? e));
  }
}

async function trigger(job: CronJob) {
  try {
    const ack = await store.trigger(job.id);
    if (ack.scheduler_running) message.success(ack.note);
    else message.warning(ack.note);
  } catch (e: any) {
    message.error(String(e?.message ?? e));
  }
}

async function remove(job: CronJob) {
  try {
    await store.remove(job.id);
    message.success('任务已删除');
  } catch (e: any) {
    message.error(String(e?.message ?? e));
  }
}

/** 选中某任务：高亮 + 历史即时切换（S5.5②）。 */
function selectJob(job: CronJob): void {
  selectedJobId.value = job.id;
  loadHistory(job.id);
}

/** 历史过滤按钮（顶部按任务筛选）。 */
function filterHistory(jobId: string) {
  if (jobId === '') {
    selectedJobId.value = '';
    loadHistory();
    return;
  }
  const target = sortedJobs.value.find((j) => j.id === jobId);
  if (target) selectJob(target);
}

/** 产物文件点击 → 右栏切「任务产物」并加载（R-34 联动，S5.6）。 */
function openArtifact(run: CronRun): void {
  chat.openJobArtifact(run);
}

function loadHistory(jobId?: string): void {
  historyJobId.value = jobId ?? '';
  store.loadHistory(jobId).catch((e) => message.error(String(e.message ?? e)));
}

function excerpt(text: string, max = 60): string {
  const one = (text ?? '').replace(/\s+/g, ' ').trim();
  return one.length > max ? `${one.slice(0, max)}…` : one || '—';
}
function fmt(v?: string | null): string {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleString();
}
function statusType(status?: string | null): 'success' | 'error' | 'default' {
  if (status === 'ok' || status === 'success') return 'success';
  if (status === 'error' || status === 'failed') return 'error';
  return 'default';
}
</script>

<template>
  <section class="km-page">
    <!-- 独立路由模式：自带 PageHeader（内嵌设置页时由外壳提供） -->
    <PageHeader
      v-if="!embedded"
      title="自动化任务"
      search-placeholder="搜索任务名称…"
      @search="(q: string) => (localSearch = q)"
    >
      <template #actions>
        <n-button type="primary" @click="openCreate"><template #icon><KIcon name="Plus" :size="16" /></template>新建任务</n-button>
      </template>
    </PageHeader>

    <div class="km-page-body">
      <!-- 内嵌「设置 → 自动化任务」：标题由外壳 PageHeader 提供，此处只补说明 + 主操作，避免双标题 -->
      <header v-if="embedded" class="km-page-head">
        <div>
          <p class="km-page-sub">
            读取 hermes <code>cron/jobs.json</code>，写操作一律经 <code>hermes cron</code> CLI；
            手动触发为「下个调度器 tick 执行」语义。
          </p>
        </div>
        <n-button type="primary" @click="openCreate"><template #icon><KIcon name="Plus" :size="16" /></template>新建任务</n-button>
      </header>

      <n-alert v-if="!store.schedulerRunning" type="warning" :bordered="false" class="km-alert">
        hermes 调度器当前未运行（{{ excerpt(store.schedulerRaw, 90) }}），任务不会自动执行；手动触发也需调度器启动后才生效。
      </n-alert>

      <n-spin :show="store.loading">
        <div class="km-table-wrap">
          <table class="km-table">
            <thead>
              <tr>
                <th style="width: 18%">名称</th>
                <th style="width: 14%">调度</th>
                <th>Prompt 摘要</th>
                <th style="width: 8%">启用</th>
                <th style="width: 15%">下次运行</th>
                <th style="width: 10%">上次状态</th>
                <th style="width: 16%">操作</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="job in sortedJobs"
                :key="job.id"
                class="km-job-row"
                :class="{ selected: job.id === selectedJobId }"
                @click="selectJob(job)"
              >
                <td>
                  <div class="km-job-name">{{ job.name || '(未命名)' }}</div>
                  <div class="km-job-id">{{ job.id }}</div>
                </td>
                <td>
                  <code>{{ job.schedule_expr || '—' }}</code>
                  <div class="km-job-id">{{ job.schedule_display }}</div>
                </td>
                <td class="km-job-prompt" :title="job.prompt">{{ excerpt(job.prompt, 90) }}</td>
                <td>
                  <n-switch size="small" :value="job.enabled" @click.stop @update:value="(v: boolean) => toggle(job, v)" />
                </td>
                <td class="km-dim">{{ fmt(job.next_run_at) }}</td>
                <td>
                  <n-tag size="small" :type="statusType(job.last_status)" :bordered="false">
                    {{ job.last_status || job.state || '—' }}
                  </n-tag>
                </td>
                <td>
                  <div class="km-row-actions" @click.stop>
                    <n-button size="tiny" tertiary @click="trigger(job)">触发</n-button>
                    <n-button size="tiny" tertiary @click="openEdit(job)">编辑</n-button>
                    <n-popconfirm @positive-click="remove(job)">
                      <template #trigger>
                        <n-button size="tiny" tertiary type="error">删除</n-button>
                      </template>
                      确认删除任务「{{ job.name || job.id }}」？
                    </n-popconfirm>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
          <n-empty v-if="!sortedJobs.length" description="暂无自动化任务，点击右上角新建" class="km-empty-block" />
        </div>
      </n-spin>

      <h3 class="km-section-title">
        运行历史
        <span v-if="selectedJobName" class="km-history-for">（{{ selectedJobName }}）</span>
        <n-button size="tiny" tertiary :type="historyJobId ? 'default' : 'primary'" @click="filterHistory('')">全部</n-button>
        <n-button
          v-for="job in sortedJobs"
          :key="`h-${job.id}`"
          size="tiny"
          tertiary
          :type="historyJobId === job.id ? 'primary' : 'default'"
          @click="filterHistory(job.id)"
        >{{ job.name || job.id }}</n-button>
      </h3>

      <n-spin :show="store.historyLoading">
        <ol class="km-timeline">
          <li v-for="run in shownHistory" :key="run.file" class="km-tl-item">
            <span class="km-tl-dot" :class="`km-tl-${statusType(run.status)}`" />
            <div class="km-tl-body">
              <div class="km-tl-head">
                <b>{{ run.job_name || run.job_id }}</b>
                <n-tag size="tiny" :type="statusType(run.status)" :bordered="false">{{ run.status || 'unknown' }}</n-tag>
                <span class="km-dim">{{ run.run_time }}</span>
                <span class="km-dim">模式 {{ run.mode || '—' }}</span>
              </div>
              <p class="km-tl-excerpt">{{ excerpt(run.excerpt, 180) }}</p>
              <span
                class="km-tl-file km-tl-clickable"
                :title="run.file"
                @click="openArtifact(run)"
              >产物：{{ run.file }}</span>
            </div>
          </li>
        </ol>
        <n-empty v-if="!shownHistory.length" size="small" :description="selectedJobName ? '该任务暂无运行记录' : '暂无运行记录'" />
      </n-spin>
    </div>

    <n-modal
      v-model:show="showForm"
      preset="card"
      class="km-modal"
      :title="editingId ? '编辑任务' : '新建任务'"
    >
      <div class="km-form">
        <label class="km-label">名称</label>
        <n-input v-model:value="formName" placeholder="每日晨报" />
        <label class="km-label">调度表达式 *</label>
        <n-input v-model:value="formSchedule" placeholder="30m / every 2h / 0 9 * * *" />
        <label class="km-label">Prompt</label>
        <n-input
          v-model:value="formPrompt"
          type="textarea"
          :autosize="{ minRows: 3, maxRows: 10 }"
          placeholder="任务触发时发给 agent 的指令"
        />
        <label class="km-label">投递方式（可选）</label>
        <n-input v-model:value="formDeliver" placeholder="如 file / notify（留空用 hermes 默认）" />
        <label class="km-label">工作目录（可选）</label>
        <n-input v-model:value="formWorkdir" placeholder="任务执行的 cwd" />
      </div>
      <template #footer>
        <div class="km-form-foot">
          <n-button @click="showForm = false">取消</n-button>
          <n-button type="primary" :loading="saving" @click="save">保存</n-button>
        </div>
      </template>
    </n-modal>
  </section>
</template>

<style scoped>
/* 页面壳：PageHeader 常驻顶部（与 §7.1 其余整页一致），只有内容区滚动 */
.km-page { display: flex; flex-direction: column; height: 100%; min-width: 0; flex: 1; }
.km-page-body { flex: 1; min-height: 0; overflow: auto; padding: var(--km-space-20) var(--km-space-xl) var(--km-space-40); }
.km-page-head { display: flex; justify-content: space-between; align-items: flex-start; gap: var(--km-space-lg); margin-bottom: 14px; }
.km-page-sub { margin: 0; font-size: var(--km-font-sm); opacity: 0.6; line-height: 1.7; max-width: 720px; }
.km-page-sub code { background: rgba(127, 127, 127, 0.16); padding: 1px var(--km-space-xs); border-radius: var(--km-radius-sm); }
.km-alert { margin-bottom: 14px; }
.km-table-wrap { border: 1px solid var(--km-border); border-radius: var(--km-radius-lg); overflow: hidden; }
.km-table { width: 100%; border-collapse: collapse; font-size: var(--km-font-sm); }
.km-table th {
  text-align: left;
  padding: 9px var(--km-space-md);
  background: var(--km-panel);
  font-weight: 600;
  font-size: var(--km-font-sm);
  opacity: 0.8;
  border-bottom: 1px solid var(--km-border);
}
.km-table td { padding: 9px var(--km-space-md); border-bottom: 1px solid var(--km-border); vertical-align: top; }
.km-table tr:last-child td { border-bottom: none; }
.km-job-row { cursor: pointer; transition: background 0.12s ease; }
.km-job-row:hover { background: var(--km-user-bubble); }
.km-job-row.selected { background: var(--km-user-bubble); box-shadow: inset 3px 0 0 var(--km-accent); }
.km-job-name { font-weight: 600; }
.km-job-id { font-size: var(--km-font-xs); opacity: 0.42; margin-top: 2px; }
.km-job-prompt { opacity: 0.85; }
.km-dim { font-size: var(--km-font-sm); opacity: 0.6; }
.km-row-actions { display: flex; gap: var(--km-space-6); flex-wrap: wrap; }
.km-empty-block { padding: var(--km-space-xl) 0; }
.km-section-title { display: flex; align-items: center; gap: var(--km-space-6); flex-wrap: wrap; font-size: var(--km-font-base); margin: 26px 0 12px; }
.km-history-for { font-size: var(--km-font-sm); font-weight: 400; opacity: 0.55; }
.km-timeline { list-style: none; margin: 0; padding: 0 0 0 var(--km-space-6); }
.km-tl-item { display: flex; gap: 10px; padding: 0 0 var(--km-space-14) var(--km-space-sm); border-left: 1px solid var(--km-border); position: relative; }
.km-tl-dot {
  position: absolute;
  left: -5px;
  top: 5px;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--km-muted);
}
.km-tl-success { background: var(--km-success); }
.km-tl-error { background: var(--km-danger); }
.km-tl-body { flex: 1; min-width: 0; padding-left: 10px; }
.km-tl-head { display: flex; align-items: center; gap: var(--km-space-sm); flex-wrap: wrap; font-size: var(--km-font-sm); }
.km-tl-excerpt { margin: 4px 0 2px; font-size: var(--km-font-sm); opacity: 0.8; line-height: 1.6; }
.km-tl-file { font-size: var(--km-font-xs); opacity: 0.4; }
.km-tl-clickable {
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
  transition: opacity 0.12s ease;
}
.km-tl-clickable:hover { opacity: 0.85; }
.km-modal { width: 620px; max-width: 92vw; }
.km-form { display: flex; flex-direction: column; gap: var(--km-space-6); }
.km-label { font-size: var(--km-font-sm); opacity: 0.65; margin-top: 6px; }
.km-form-foot { display: flex; justify-content: flex-end; gap: var(--km-space-sm); }
</style>
