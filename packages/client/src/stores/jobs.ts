// F15 自动化任务 store：读 = GET /api/jobs + /api/cron-history；写 = 后端经 hermes cron CLI。
// 手动触发为 202 语义（下个调度器 tick 执行），响应 note 携带调度器状态提示（O-2）。
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import {
  listJobs,
  createJob,
  updateJob,
  deleteJob,
  runJob,
  getCronHistory,
  getCronStatus,
  type CronJobCreate,
  type CronJobPatch,
  type CronRunAck,
} from '../api/client';
import { SUCCESS_RATE_THRESHOLD } from '../constants/sidebar';
import type { CronJob, CronRun } from '../types/chat';

/**
 * 运行状态是否算「成功」。
 *
 * 大小写不敏感，且 `ok` 与 `success` 同义（后端两种写法都出现过，见 JOB_RUN_STATUS_MAP）。
 * 导出供单测直接驱动。
 */
export function isSuccessStatus(status: string | null | undefined): boolean {
  const s = String(status ?? '').trim().toLowerCase();
  return s === 'ok' || s === 'success';
}

export const useJobsStore = defineStore('jobs', () => {
  const jobs = ref<CronJob[]>([]);
  const history = ref<CronRun[]>([]);
  const loading = ref(false);
  const historyLoading = ref(false);
  const error = ref<string>('');
  /** 调度器状态（Mock 沙箱下 running=false，UI 提示需启动 hermes 调度器） */
  const schedulerRunning = ref<boolean>(false);
  const schedulerRaw = ref<string>('');

  const enabledCount = computed(() => jobs.value.filter((j) => j.enabled).length);

  async function load(): Promise<CronJob[]> {
    loading.value = true;
    error.value = '';
    try {
      jobs.value = await listJobs();
      return jobs.value;
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  async function loadHistory(jobId?: string, limit = 50): Promise<CronRun[]> {
    historyLoading.value = true;
    try {
      history.value = await getCronHistory({ job_id: jobId, limit });
      return history.value;
    } finally {
      historyLoading.value = false;
    }
  }

  async function loadSchedulerStatus(): Promise<boolean> {
    try {
      const s = await getCronStatus();
      schedulerRunning.value = s.running;
      schedulerRaw.value = s.raw;
    } catch (e) {
      schedulerRunning.value = false;
      schedulerRaw.value = e instanceof Error ? e.message : String(e);
    }
    return schedulerRunning.value;
  }

  async function create(req: CronJobCreate): Promise<CronJob[]> {
    jobs.value = await createJob(req);
    return jobs.value;
  }

  async function edit(id: string, patch: CronJobPatch): Promise<CronJob[]> {
    jobs.value = await updateJob(id, patch);
    return jobs.value;
  }

  /** 启停：映射到后端 cron pause / resume。 */
  function toggle(id: string, enabled: boolean): Promise<CronJob[]> {
    return edit(id, { enabled });
  }

  async function trigger(id: string): Promise<CronRunAck> {
    const ack = await runJob(id);
    schedulerRunning.value = !!ack.scheduler_running;
    // 触发后刷新一次历史（Mock 沙箱会立即产出记录）
    await loadHistory().catch(() => {});
    return ack;
  }

  async function remove(id: string): Promise<void> {
    await deleteJob(id);
    jobs.value = jobs.value.filter((j) => j.id !== id);
    // 连带清掉该 job 的运行缓存，避免删了任务但左栏仍能展开旧运行记录
    const nextRuns = { ...runsByJob.value };
    delete nextRuns[id];
    runsByJob.value = nextRuns;
  }

  // ═══════════════ B13：左栏两级折叠所需的按 job 运行数据（F-09）═══════════════

  /** jobId → 该任务的运行记录（懒加载，展开二级折叠时才拉）。 */
  const runsByJob = ref<Record<string, CronRun[]>>({});
  /** jobId → 是否正在加载（驱动 F3 骨架屏）。 */
  const runsLoading = ref<Record<string, boolean>>({});
  /** jobId → 加载错误信息（驱动 F5 行内错误条）。 */
  const runsError = ref<Record<string, string>>({});
  /** 进行中的请求，避免同一 job 反复展开收起时打重复请求。 */
  const runsInflight = new Map<string, Promise<CronRun[]>>();

  /**
   * 懒加载某个 job 的运行记录（B13）。
   *
   * 去重策略两层：① 已有缓存且未强制刷新 → 直接返回；② 同一 job 并发请求共享 promise。
   *
   * @param jobId 任务 id
   * @param force 忽略缓存强制重拉（「重试」按钮用）
   */
  async function loadRunsFor(jobId: string, force = false): Promise<CronRun[]> {
    if (!force && runsByJob.value[jobId]) return runsByJob.value[jobId];
    const pending = runsInflight.get(jobId);
    if (pending) return pending;

    runsLoading.value = { ...runsLoading.value, [jobId]: true };
    runsError.value = { ...runsError.value, [jobId]: '' };

    const task = getCronHistory({ job_id: jobId, limit: 50 })
      .then((list) => {
        runsByJob.value = { ...runsByJob.value, [jobId]: list };
        return list;
      })
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e);
        runsError.value = { ...runsError.value, [jobId]: msg };
        // 失败不写缓存：下次展开会重试，而不是永久空列表
        return [] as CronRun[];
      })
      .finally(() => {
        runsLoading.value = { ...runsLoading.value, [jobId]: false };
        runsInflight.delete(jobId);
      });

    runsInflight.set(jobId, task);
    return task;
  }

  /**
   * 计算某个 job 的成功率（B13）。
   *
   * @returns `0-100` 的整数；**无运行记录时返回 `-1`**（哨兵值，前端据此不渲染徽标，
   *   避免「0%」被误读为「全部失败」）
   */
  function successRate(jobId: string): number {
    const runs = runsByJob.value[jobId];
    if (!runs || runs.length === 0) return SUCCESS_RATE_THRESHOLD.none;
    const okCount = runs.filter((r) => isSuccessStatus(r.status)).length;
    return Math.round((okCount / runs.length) * 100);
  }

  /** 某 job 是否已拉过运行记录（用于判断是否显示「暂无运行记录」空态）。 */
  function hasLoadedRuns(jobId: string): boolean {
    return Array.isArray(runsByJob.value[jobId]);
  }

  return {
    jobs, history, loading, historyLoading, error, schedulerRunning, schedulerRaw,
    enabledCount,
    load, loadHistory, loadSchedulerStatus, create, edit, toggle, trigger, remove,
    // B13
    runsByJob, runsLoading, runsError,
    loadRunsFor, successRate, hasLoadedRuns,
  };
});
