// M4/T14 单测：jobs store（F15 / AC3）
// 覆盖：任务列表加载与启用计数、新建、编辑、启停（映射 pause/resume）、
//       手动触发（202 语义 + 调度器状态同步 + 历史刷新）、删除、历史加载、调度器状态异常兜底。
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useJobsStore, isSuccessStatus } from './jobs';

const backend = vi.hoisted(() => {
  interface Job {
    id: string; name: string; prompt: string;
    schedule_expr: string; schedule_display: string;
    enabled: boolean; state: string;
    next_run_at?: string | null; last_status?: 'ok' | 'error' | null;
  }
  interface Run {
    job_id: string; job_name: string; run_time: string;
    status: string; mode: string; excerpt: string; file: string;
  }
  const state = {
    jobs: [] as Job[],
    runs: [] as Run[],
    schedulerRunning: false,
    schedulerFails: false,
    seq: 0,
    /** 记录最近一次 updateJob 的补丁，断言启停映射 */
    lastPatch: null as unknown,
    /** 记录最近一次 getCronHistory 的入参 */
    lastHistoryQuery: null as unknown,
    listCalls: 0,
  };
  return { state };
});

vi.mock('../api/client', () => {
  const { state } = backend;
  return {
    listJobs: vi.fn(async () => {
      state.listCalls += 1;
      return state.jobs.map((j) => ({ ...j }));
    }),
    createJob: vi.fn(async (req: { schedule: string; prompt?: string; name?: string }) => {
      state.seq += 1;
      state.jobs.push({
        id: `job-${state.seq}`,
        name: req.name ?? `job-${state.seq}`,
        prompt: req.prompt ?? '',
        schedule_expr: req.schedule,
        schedule_display: req.schedule,
        enabled: true,
        state: 'scheduled',
        next_run_at: null,
        last_status: null,
      });
      return state.jobs.map((j) => ({ ...j }));
    }),
    updateJob: vi.fn(async (id: string, patch: Record<string, unknown>) => {
      state.lastPatch = { id, patch };
      const target = state.jobs.find((j) => j.id === id);
      if (target) {
        if (patch.name !== undefined) target.name = String(patch.name);
        if (patch.prompt !== undefined) target.prompt = String(patch.prompt);
        if (patch.schedule !== undefined) {
          target.schedule_expr = String(patch.schedule);
          target.schedule_display = String(patch.schedule);
        }
        if (patch.enabled !== undefined) {
          target.enabled = Boolean(patch.enabled);
          target.state = patch.enabled ? 'scheduled' : 'paused';
        }
      }
      return state.jobs.map((j) => ({ ...j }));
    }),
    deleteJob: vi.fn(async (id: string) => {
      state.jobs = state.jobs.filter((j) => j.id !== id);
    }),
    runJob: vi.fn(async (id: string) => {
      state.runs.unshift({
        job_id: id,
        job_name: state.jobs.find((j) => j.id === id)?.name ?? '',
        run_time: '2026-01-01 09:00:00',
        status: 'ok',
        mode: 'agent',
        excerpt: '触发产出',
        file: `/output/${id}/2026-01-01_09-00-00.md`,
      });
      return {
        ok: true,
        note: '沙箱模式：任务已标记为下个 tick 执行（无真实调度器）',
        scheduler_running: state.schedulerRunning,
      };
    }),
    getCronHistory: vi.fn(async (params: { job_id?: string; limit?: number } = {}) => {
      state.lastHistoryQuery = params;
      return state.runs
        .filter((r) => (params.job_id ? r.job_id === params.job_id : true))
        .slice(0, params.limit ?? 50)
        .map((r) => ({ ...r }));
    }),
    getCronStatus: vi.fn(async () => {
      if (state.schedulerFails) throw new Error('hermes CLI timeout');
      return { running: state.schedulerRunning, raw: state.schedulerRunning ? 'scheduler running' : 'mock sandbox (hermes CLI unavailable)' };
    }),
  };
});

beforeEach(() => {
  setActivePinia(createPinia());
  backend.state.jobs = [
    {
      id: 'job-seed-1', name: 'daily-report', prompt: '生成日报',
      schedule_expr: '0 9 * * *', schedule_display: '0 9 * * *',
      enabled: true, state: 'scheduled', next_run_at: null, last_status: 'ok',
    },
    {
      id: 'job-seed-2', name: 'weekly-clean', prompt: '清理临时文件',
      schedule_expr: 'every 7d', schedule_display: 'every 7d',
      enabled: false, state: 'paused', next_run_at: null, last_status: null,
    },
  ];
  backend.state.runs = [];
  backend.state.schedulerRunning = false;
  backend.state.schedulerFails = false;
  backend.state.seq = 0;
  backend.state.lastPatch = null;
  backend.state.lastHistoryQuery = null;
  backend.state.listCalls = 0;
});

describe('jobs store — F15 自动化任务（AC3）', () => {
  it('load 填充 jobs 并统计启用数量', async () => {
    const s = useJobsStore();
    await s.load();
    expect(s.jobs).toHaveLength(2);
    expect(s.enabledCount).toBe(1);
    expect(s.loading).toBe(false);
    expect(s.error).toBe('');
  });

  it('create 新建任务后列表可见（POST /api/jobs → 返回全量 jobs）', async () => {
    const s = useJobsStore();
    await s.load();
    const jobs = await s.create({ schedule: '30m', prompt: '每 30 分钟检查', name: 'qa-job' });
    expect(jobs).toHaveLength(3);
    expect(s.jobs.some((j) => j.name === 'qa-job' && j.schedule_expr === '30m')).toBe(true);
  });

  it('edit 修改名称与表达式并同步到 store', async () => {
    const s = useJobsStore();
    await s.load();
    await s.edit('job-seed-1', { name: 'daily-report-v2', schedule: '0 10 * * *' });
    const target = s.jobs.find((j) => j.id === 'job-seed-1')!;
    expect(target.name).toBe('daily-report-v2');
    expect(target.schedule_display).toBe('0 10 * * *');
  });

  it('toggle 启停映射到 enabled 补丁（后端转 pause/resume）', async () => {
    const s = useJobsStore();
    await s.load();
    await s.toggle('job-seed-1', false);
    expect(backend.state.lastPatch).toEqual({ id: 'job-seed-1', patch: { enabled: false } });
    expect(s.jobs.find((j) => j.id === 'job-seed-1')!.state).toBe('paused');
    expect(s.enabledCount).toBe(0);

    await s.toggle('job-seed-2', true);
    expect(s.jobs.find((j) => j.id === 'job-seed-2')!.enabled).toBe(true);
  });

  it('trigger 返回 202 语义 ack，同步调度器状态并刷新历史', async () => {
    const s = useJobsStore();
    await s.load();
    const ack = await s.trigger('job-seed-1');
    expect(ack.ok).toBe(true);
    expect(ack.note).toContain('tick');
    expect(s.schedulerRunning).toBe(false);
    // 触发后自动刷新历史（沙箱立即产出记录）
    expect(s.history).toHaveLength(1);
    expect(s.history[0].job_id).toBe('job-seed-1');
    expect(s.history[0].status).toBe('ok');
  });

  it('trigger 在调度器运行时同步 scheduler_running=true', async () => {
    const s = useJobsStore();
    backend.state.schedulerRunning = true;
    await s.load();
    const ack = await s.trigger('job-seed-1');
    expect(ack.scheduler_running).toBe(true);
    expect(s.schedulerRunning).toBe(true);
  });

  it('loadHistory 支持按 job_id / limit 过滤并复位 loading', async () => {
    const s = useJobsStore();
    await s.load();
    await s.trigger('job-seed-1');
    await s.trigger('job-seed-2');
    await s.loadHistory('job-seed-2', 10);
    expect(backend.state.lastHistoryQuery).toEqual({ job_id: 'job-seed-2', limit: 10 });
    expect(s.history).toHaveLength(1);
    expect(s.history[0].job_id).toBe('job-seed-2');
    expect(s.historyLoading).toBe(false);
  });

  it('remove 删除任务后本地列表同步移除', async () => {
    const s = useJobsStore();
    await s.load();
    await s.remove('job-seed-2');
    expect(s.jobs).toHaveLength(1);
    expect(s.jobs.some((j) => j.id === 'job-seed-2')).toBe(false);
  });

  it('loadSchedulerStatus 失败时兜底为未运行并记录原因（O-2）', async () => {
    const s = useJobsStore();
    backend.state.schedulerFails = true;
    const running = await s.loadSchedulerStatus();
    expect(running).toBe(false);
    expect(s.schedulerRunning).toBe(false);
    expect(s.schedulerRaw).toContain('timeout');
  });

  it('load 失败时记录 error 并复位 loading', async () => {
    const s = useJobsStore();
    const { listJobs } = await import('../api/client');
    (listJobs as unknown as { mockRejectedValueOnce: (e: Error) => void }).mockRejectedValueOnce(new Error('502 cli_failed'));
    await expect(s.load()).rejects.toThrow('502 cli_failed');
    expect(s.error).toBe('502 cli_failed');
    expect(s.loading).toBe(false);
  });
});

// ═══════════════ B14：左栏两级折叠所需的运行数据（F-09）═══════════════

/** 往 mock 后端塞一条运行记录。 */
function seedRun(jobId: string, status: string, runTime = '2026-01-01 09:00:00'): void {
  backend.state.runs.push({
    job_id: jobId,
    job_name: jobId,
    run_time: runTime,
    status,
    mode: 'agent',
    excerpt: '',
    file: `/output/${jobId}/${runTime}.md`,
  });
}

describe('jobs store — B13 运行数据与成功率', () => {
  it('isSuccessStatus：ok / success 同义，大小写不敏感', () => {
    expect(isSuccessStatus('ok')).toBe(true);
    expect(isSuccessStatus('success')).toBe(true);
    expect(isSuccessStatus('OK')).toBe(true);
    expect(isSuccessStatus('Success')).toBe(true);
    expect(isSuccessStatus('  ok  ')).toBe(true);
    expect(isSuccessStatus('failed')).toBe(false);
    expect(isSuccessStatus('error')).toBe(false);
    expect(isSuccessStatus('running')).toBe(false);
    expect(isSuccessStatus(undefined)).toBe(false);
    expect(isSuccessStatus(null)).toBe(false);
    expect(isSuccessStatus('')).toBe(false);
  });

  it('成功率算法：3 成功 / 1 失败 = 75', async () => {
    const s = useJobsStore();
    seedRun('job-seed-1', 'ok');
    seedRun('job-seed-1', 'success');
    seedRun('job-seed-1', 'OK');
    seedRun('job-seed-1', 'failed');
    await s.loadRunsFor('job-seed-1');
    expect(s.successRate('job-seed-1')).toBe(75);
  });

  it('成功率四舍五入到整数（2/3 → 67）', async () => {
    const s = useJobsStore();
    seedRun('job-seed-1', 'ok');
    seedRun('job-seed-1', 'ok');
    seedRun('job-seed-1', 'error');
    await s.loadRunsFor('job-seed-1');
    expect(s.successRate('job-seed-1')).toBe(67);
  });

  it('全成功 = 100，全失败 = 0', async () => {
    const s = useJobsStore();
    seedRun('job-seed-1', 'ok');
    seedRun('job-seed-2', 'failed');
    await s.loadRunsFor('job-seed-1');
    await s.loadRunsFor('job-seed-2');
    expect(s.successRate('job-seed-1')).toBe(100);
    expect(s.successRate('job-seed-2')).toBe(0);
  });

  it('空运行记录 → 返回 -1（哨兵值，前端不渲染徽标）', async () => {
    const s = useJobsStore();
    await s.loadRunsFor('job-seed-1');
    expect(s.runsByJob['job-seed-1']).toEqual([]);
    expect(s.successRate('job-seed-1')).toBe(-1);
  });

  it('从未加载过的 job → 同样返回 -1，不抛错', () => {
    const s = useJobsStore();
    expect(s.successRate('never-loaded')).toBe(-1);
    expect(s.hasLoadedRuns('never-loaded')).toBe(false);
  });

  it('loadRunsFor 按 job_id 拉取并写入 runsByJob，复位 loading', async () => {
    const s = useJobsStore();
    seedRun('job-seed-1', 'ok');
    seedRun('job-seed-2', 'ok');
    const runs = await s.loadRunsFor('job-seed-1');
    expect(runs).toHaveLength(1);
    expect(runs[0].job_id).toBe('job-seed-1');
    expect(s.runsByJob['job-seed-1']).toHaveLength(1);
    expect(s.runsLoading['job-seed-1']).toBe(false);
    expect(s.hasLoadedRuns('job-seed-1')).toBe(true);
  });

  it('loadRunsFor 命中缓存时不重复请求；force=true 强制重拉', async () => {
    const s = useJobsStore();
    const { getCronHistory } = await import('../api/client');
    const spy = getCronHistory as unknown as { mock: { calls: unknown[] } };
    seedRun('job-seed-1', 'ok');

    await s.loadRunsFor('job-seed-1');
    const afterFirst = spy.mock.calls.length;
    await s.loadRunsFor('job-seed-1');
    expect(spy.mock.calls.length).toBe(afterFirst);

    await s.loadRunsFor('job-seed-1', true);
    expect(spy.mock.calls.length).toBe(afterFirst + 1);
  });

  it('并发 loadRunsFor 共享同一 promise，只发一次请求', async () => {
    const s = useJobsStore();
    const { getCronHistory } = await import('../api/client');
    const spy = getCronHistory as unknown as { mock: { calls: unknown[] } };
    const before = spy.mock.calls.length;
    seedRun('job-seed-1', 'ok');

    await Promise.all([s.loadRunsFor('job-seed-1'), s.loadRunsFor('job-seed-1')]);
    expect(spy.mock.calls.length).toBe(before + 1);
  });

  it('loadRunsFor 失败时记录 runsError 且不写缓存（下次可重试）', async () => {
    const s = useJobsStore();
    const { getCronHistory } = await import('../api/client');
    (getCronHistory as unknown as { mockRejectedValueOnce: (e: Error) => void }).mockRejectedValueOnce(
      new Error('history 读取失败')
    );

    const runs = await s.loadRunsFor('job-seed-1');
    expect(runs).toEqual([]);
    expect(s.runsError['job-seed-1']).toBe('history 读取失败');
    expect(s.hasLoadedRuns('job-seed-1')).toBe(false);
    expect(s.runsLoading['job-seed-1']).toBe(false);
  });

  it('remove 删除任务时连带清理运行缓存', async () => {
    const s = useJobsStore();
    await s.load();
    seedRun('job-seed-2', 'ok');
    await s.loadRunsFor('job-seed-2');
    expect(s.hasLoadedRuns('job-seed-2')).toBe(true);

    await s.remove('job-seed-2');
    expect(s.hasLoadedRuns('job-seed-2')).toBe(false);
  });
});
