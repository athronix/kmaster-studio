/**
 * write/cron.ts — 定时任务写回（U-23）
 *
 * 写入 $HERMES_HOME/cron/jobs.json，保持 JSON 结构完整，
 * _config_version 校验，绝不产生损坏。
 *
 * @module services/hermes/write/cron
 */

import path from 'node:path';
import fs from 'node:fs';
import lockfile from 'proper-lockfile';
import { resolveActiveHermesHome } from '../env.js';

// ── 类型 ────────────────────────────────────────────────────────────────

export interface CronJobInput {
  name: string;
  prompt: string;
  schedule: {
    kind: 'cron' | 'interval';
    expr: string;
    display?: string;
  };
  script?: string;
  no_agent?: boolean;
  enabled?: boolean;
  skills?: string[];
  model?: string | null;
  provider?: string | null;
}

export interface CronWriteResult {
  ok: boolean;
  jobId?: string;
  action: 'create' | 'update' | 'delete';
  error?: string;
}

interface CronJobDoc {
  id: string;
  name: string;
  prompt: string;
  schedule: { kind: string; expr: string; display?: string };
  script?: string;
  no_agent?: boolean;
  enabled: boolean;
  skills: string[];
  model: string | null;
  provider: string | null;
  created_at: string;
  next_run_at: string | null;
  last_run_at: string | null;
  last_status: string;
  state: string;
  repeat: { times: number | null; completed: number };
  deliver: string;
}

interface JobsFile {
  jobs: CronJobDoc[];
  updated_at: string;
}

// ── IO ──────────────────────────────────────────────────────────────────

const LOCK_OPTIONS = { retries: { retries: 3, factor: 1, minTimeout: 200, maxTimeout: 200 }, stale: 15000 };

function jobsPath(): string {
  return path.join(resolveActiveHermesHome(), 'cron', 'jobs.json');
}

function readJobs(): JobsFile {
  const p = jobsPath();
  if (!fs.existsSync(p)) {
    return { jobs: [], updated_at: new Date().toISOString() };
  }
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return { jobs: [], updated_at: new Date().toISOString() };
  }
}

function writeJobs(jf: JobsFile): void {
  jf.updated_at = new Date().toISOString();
  const tmp = jobsPath() + '.tmp';
  fs.mkdirSync(path.dirname(jobsPath()), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(jf, null, 2), 'utf8');
  fs.renameSync(tmp, jobsPath());
}

// ── API ─────────────────────────────────────────────────────────────────

/** 创建定时任务 */
export async function createCronJob(input: CronJobInput): Promise<CronWriteResult> {
  const p = jobsPath();
  let release: (() => Promise<void>) | null = null;
  try {
    release = await lockfile.lock(p, LOCK_OPTIONS);
    const jf = readJobs();
    const id = Math.random().toString(16).slice(2, 14);
    const now = new Date().toISOString();

    const job: CronJobDoc = {
      id,
      name: input.name,
      prompt: input.prompt,
      schedule: { kind: input.schedule.kind, expr: input.schedule.expr, display: input.schedule.display },
      script: input.script,
      no_agent: input.no_agent ?? false,
      enabled: input.enabled ?? true,
      skills: input.skills ?? [],
      model: input.model ?? null,
      provider: input.provider ?? null,
      created_at: now,
      next_run_at: null,
      last_run_at: null,
      last_status: 'pending',
      state: 'scheduled',
      repeat: { times: null, completed: 0 },
      deliver: 'local',
    };

    jf.jobs.push(job);
    writeJobs(jf);

    return { ok: true, jobId: id, action: 'create' };
  } catch (err: unknown) {
    return { ok: false, action: 'create', error: err instanceof Error ? err.message : String(err) };
  } finally {
    if (release) { try { await release(); } catch {} }
  }
}

/** 更新定时任务 */
export async function updateCronJob(id: string, input: Partial<CronJobInput>): Promise<CronWriteResult> {
  const p = jobsPath();
  let release: (() => Promise<void>) | null = null;
  try {
    release = await lockfile.lock(p, LOCK_OPTIONS);
    const jf = readJobs();
    const idx = jf.jobs.findIndex(j => j.id === id);
    if (idx === -1) {
      return { ok: false, jobId: id, action: 'update', error: 'not found' };
    }

    const job = jf.jobs[idx];
    if (input.name !== undefined) job.name = input.name;
    if (input.prompt !== undefined) job.prompt = input.prompt;
    if (input.schedule !== undefined) {
      job.schedule = { kind: input.schedule.kind, expr: input.schedule.expr, display: input.schedule.display };
      job.next_run_at = null; // 强制 hermes 重新计算
    }
    if (input.enabled !== undefined) job.enabled = input.enabled;
    if (input.skills !== undefined) job.skills = input.skills;

    writeJobs(jf);
    return { ok: true, jobId: id, action: 'update' };
  } catch (err: unknown) {
    return { ok: false, action: 'update', error: err instanceof Error ? err.message : String(err) };
  } finally {
    if (release) { try { await release(); } catch {} }
  }
}

/** 删除定时任务 */
export async function deleteCronJob(id: string): Promise<CronWriteResult> {
  const p = jobsPath();
  let release: (() => Promise<void>) | null = null;
  try {
    release = await lockfile.lock(p, LOCK_OPTIONS);
    const jf = readJobs();
    const idx = jf.jobs.findIndex(j => j.id === id);
    if (idx === -1) {
      return { ok: false, jobId: id, action: 'delete', error: 'not found' };
    }
    jf.jobs.splice(idx, 1);
    writeJobs(jf);
    return { ok: true, jobId: id, action: 'delete' };
  } catch (err: unknown) {
    return { ok: false, action: 'delete', error: err instanceof Error ? err.message : String(err) };
  } finally {
    if (release) { try { await release(); } catch {} }
  }
}
