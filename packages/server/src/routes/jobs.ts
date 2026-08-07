// F15 自动化任务 REST：读 = 解析 jobs.json / 扫描 output 目录；写 = 一律经 `hermes cron` CLI
// 无真实 CLI 时自动落到本地沙箱（NFR3），契约一致。
import Router from '@koa/router';
import {
  listCronJobs,
  getCronJob,
  createCronJob,
  editCronJob,
  removeCronJob,
  runCronJob,
  getCronHistory,
  getCronStatus,
} from '../hermes-proxy.js';
import { failWith, badRequest, notFound } from './error.js';

export const jobsRouter = new Router();

// GET /api/jobs
jobsRouter.get('/api/jobs', async (ctx) => {
  try {
    ctx.body = { jobs: listCronJobs() };
  } catch (e) {
    failWith(ctx, e);
  }
});

// GET /api/cron-history?job_id=&limit=
// ⚠️ 必须注册在 /api/jobs/:id 之前不受影响（路径前缀不同），此处顺序仅为可读性
jobsRouter.get('/api/cron-history', async (ctx) => {
  try {
    const jobId = ctx.query.job_id === undefined ? undefined : String(ctx.query.job_id);
    const rawLimit = ctx.query.limit === undefined ? undefined : Number(ctx.query.limit);
    const limit = Number.isFinite(rawLimit) && (rawLimit as number) > 0 ? Math.floor(rawLimit as number) : 50;
    ctx.body = { runs: getCronHistory(jobId, limit) };
  } catch (e) {
    failWith(ctx, e);
  }
});

// GET /api/cron-status —— 调度器是否在跑（O-2 兜底提示）
jobsRouter.get('/api/cron-status', async (ctx) => {
  try {
    ctx.body = await getCronStatus();
  } catch (e) {
    failWith(ctx, e);
  }
});

// GET /api/jobs/:id
jobsRouter.get('/api/jobs/:id', async (ctx) => {
  try {
    const job = getCronJob(ctx.params.id);
    if (!job) {
      notFound(ctx, `job ${ctx.params.id} not found`);
      return;
    }
    ctx.body = { job };
  } catch (e) {
    failWith(ctx, e);
  }
});

// POST /api/jobs  { name?, schedule, prompt?, deliver?, repeat?, script?, no_agent?, workdir? }
jobsRouter.post('/api/jobs', async (ctx) => {
  try {
    const b = (ctx.request.body ?? {}) as Record<string, unknown>;
    const schedule = String(b.schedule ?? '').trim();
    if (!schedule) {
      badRequest(ctx, 'schedule required (e.g. "30m", "every 2h", "0 9 * * *")');
      return;
    }
    const { job, jobs } = await createCronJob({
      schedule,
      prompt: b.prompt === undefined ? undefined : String(b.prompt),
      name: b.name === undefined ? undefined : String(b.name),
      deliver: b.deliver === undefined ? undefined : String(b.deliver),
      repeat: b.repeat === undefined ? undefined : Number(b.repeat),
      script: b.script === undefined ? undefined : String(b.script),
      no_agent: b.no_agent === undefined ? undefined : Boolean(b.no_agent),
      workdir: b.workdir === undefined ? undefined : String(b.workdir),
    });
    // 契约为 { ok, jobs }；额外附带 job 便于前端拿到新建 id（附加字段，不破坏契约）
    ctx.body = { ok: true, job, jobs };
  } catch (e) {
    failWith(ctx, e);
  }
});

// PATCH /api/jobs/:id  { name?, schedule?, prompt?, deliver?, repeat?, workdir?, enabled? }
// enabled 变更映射到 cron pause / resume
jobsRouter.patch('/api/jobs/:id', async (ctx) => {
  try {
    const b = (ctx.request.body ?? {}) as Record<string, unknown>;
    const patch = {
      name: b.name === undefined ? undefined : String(b.name),
      schedule: b.schedule === undefined ? undefined : String(b.schedule),
      prompt: b.prompt === undefined ? undefined : String(b.prompt),
      deliver: b.deliver === undefined ? undefined : String(b.deliver),
      repeat: b.repeat === undefined ? undefined : Number(b.repeat),
      workdir: b.workdir === undefined ? undefined : String(b.workdir),
      enabled: b.enabled === undefined ? undefined : Boolean(b.enabled),
    };
    if (Object.values(patch).every((v) => v === undefined)) {
      badRequest(ctx, 'at least one field required');
      return;
    }
    ctx.body = { ok: true, jobs: await editCronJob(ctx.params.id, patch) };
  } catch (e) {
    failWith(ctx, e);
  }
});

// DELETE /api/jobs/:id
jobsRouter.delete('/api/jobs/:id', async (ctx) => {
  try {
    ctx.body = await removeCronJob(ctx.params.id);
  } catch (e) {
    failWith(ctx, e);
  }
});

// POST /api/jobs/:id/run —— 202 语义：标记为「下个调度器 tick 执行」
jobsRouter.post('/api/jobs/:id/run', async (ctx) => {
  try {
    const result = await runCronJob(ctx.params.id);
    ctx.status = 202;
    ctx.body = result;
  } catch (e) {
    failWith(ctx, e);
  }
});
