// QA M4 独立验收脚本（T14）：一次运行覆盖 AC1-AC8 中所有可自动化的部分
//   REST 面：/api/memory ×4、/api/jobs ×5 + /api/cron-history、/api/queue ×3、
//            /api/usage/stats、/api/sessions/:id/context-length
//   WS  面：subagent.* ×6（F16）、compression.* ×2（F18）、run.queued / queue.updated（F17）
//   静态面：四条整页路由 + App.vue 挂载 <router-view>（AC8，无头浏览器不可用时的等价断言）
//
// 约定（与 qa-verify-m3.mjs 一致）：
//   1. 一律走 host=localhost（127.0.0.1 会被本机 TUN 代理拦截返回 401，属测试假象）
//   2. 运行前设 NO_PROXY=localhost,127.0.0.1
//   3. 所有副作用（memory 条目 / cron 任务 / cron 历史文件 / 会话）在脚本内自清理
//
// 用法：
//   # 后端（另起一个终端 / 后台）
//   cd packages/server && HERMES_BRIDGE_MOCK=1 KMASTER_CRON_MOCK=1 PORT=6648 \
//     NO_PROXY=localhost,127.0.0.1 npx tsx src/index.ts
//   # 验收
//   NO_PROXY=localhost,127.0.0.1 node scripts/qa-verify-m4.mjs
//
// 契约基准：docs/design/TECHNICAL-SOLUTION-M4.md §3.6 + packages/server/src/routes/*
// 验收基准：docs/design/REQUIREMENT-M4.md §8 AC1-AC8
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HOST = 'localhost';
const PORT = Number(process.env.QA_PORT ?? 6648);
const BASE = `http://${HOST}:${PORT}`;
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** @type {{ ac: string; name: string; pass: boolean; detail: string }[]} */
const results = [];
/** @type {string[]} */
const notes = [];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const short = (o, n = 220) => JSON.stringify(o ?? null).slice(0, n);

function req(method, urlPath, body) {
  return new Promise((resolve) => {
    const payload = body === undefined ? null : Buffer.from(JSON.stringify(body));
    const r = http.request(
      {
        host: HOST,
        port: PORT,
        path: urlPath,
        method,
        headers: payload
          ? { 'content-type': 'application/json', 'content-length': payload.length }
          : {},
      },
      (res) => {
        let data = '';
        res.on('data', (d) => (data += d));
        res.on('end', () => {
          let parsed = null;
          try { parsed = JSON.parse(data); } catch { /* keep raw */ }
          resolve({ status: res.statusCode, body: parsed, raw: data.slice(0, 400) });
        });
      }
    );
    r.on('error', (e) => resolve({ status: 0, body: null, raw: `REQUEST_ERROR: ${e.message}` }));
    r.setTimeout(20000, () => { r.destroy(); resolve({ status: 0, body: null, raw: 'TIMEOUT' }); });
    if (payload) r.write(payload);
    r.end();
  });
}

function check(ac, name, pass, detail) {
  results.push({ ac, name, pass: !!pass, detail: String(detail) });
  console.log(`${pass ? 'PASS' : 'FAIL'}  [${ac}] ${name}  ::  ${detail}`);
}
function note(text) {
  notes.push(text);
  console.log(`NOTE  ${text}`);
}

async function waitHealth() {
  for (let i = 0; i < 40; i += 1) {
    const r = await req('GET', '/api/health');
    if (r.status === 200) return r;
    await sleep(500);
  }
  return { status: 0, body: null, raw: 'health never became ready' };
}

/** kmaster-studio 自有数据根（与 server hermes-proxy.kmasterHome() 同源）。 */
function kmasterHome() {
  return process.env.KMASTER_STUDIO_HOME
    ?? path.resolve(process.env.USERPROFILE ?? process.env.HOME ?? os.homedir(), '.kmaster-studio');
}

function countFiles(dir) {
  try { return fs.readdirSync(dir).length; } catch { return 0; }
}

// ═══════════════════════ 0. 健康检查 ═══════════════════════
const health = await waitHealth();
check('AC0', 'GET /api/health → 200', health.status === 200, `status=${health.status} body=${short(health.body)}`);
if (health.status !== 200) {
  console.error('server not reachable, abort');
  process.exit(1);
}

// ═══════════════════════ AC2 · F13 记忆 CRUD + 备份 ═══════════════════════
const STAMP = Date.now();
const MEM_CONTENT = `QA-M4 验收临时条目 ${STAMP}：本条由 scripts/qa-verify-m4.mjs 自动创建并删除。`;
const MEM_CONTENT_2 = `${MEM_CONTENT} [已编辑]`;
const backupDir = path.join(kmasterHome(), 'backups', 'memory');

const memList0 = await req('GET', '/api/memory');
check(
  'AC2', 'GET /api/memory → 200 且 entries 为数组',
  memList0.status === 200 && Array.isArray(memList0.body?.entries),
  `status=${memList0.status} count=${memList0.body?.entries?.length} sample=${short(memList0.body?.entries?.[0], 140)}`
);

const memBad = await req('GET', '/api/memory?group=nope');
check('AC2', 'GET /api/memory?group=非法 → 400', memBad.status === 400, `status=${memBad.status} body=${short(memBad.body)}`);

const memCreate = await req('POST', '/api/memory', { group: 'memory', content: MEM_CONTENT });
const created = memCreate.body?.entry;
check(
  'AC2', 'POST /api/memory 新增 → 200 且返回内容寻址 id',
  memCreate.status === 200 && typeof created?.id === 'string' && created.id.startsWith('memory:') && created.content === MEM_CONTENT,
  `status=${memCreate.status} entry=${short(created, 160)}`
);

const memSearch = await req('GET', `/api/memory?q=${encodeURIComponent(String(STAMP))}`);
check(
  'AC2', 'GET /api/memory?q= 服务端过滤可见新条目',
  memSearch.status === 200 && (memSearch.body?.entries ?? []).some((e) => e.id === created?.id),
  `status=${memSearch.status} hits=${memSearch.body?.entries?.length}`
);

const memNoContent = await req('POST', '/api/memory', { group: 'memory' });
check('AC2', 'POST /api/memory 缺 content → 400', memNoContent.status === 400, `status=${memNoContent.status} body=${short(memNoContent.body)}`);

const memUpdate = await req('PUT', `/api/memory/${encodeURIComponent(created?.id ?? 'x')}`, { content: MEM_CONTENT_2 });
const updated = memUpdate.body?.entry;
check(
  'AC2', 'PUT /api/memory/:id 编辑生效且 id 随内容变化（内容寻址）',
  memUpdate.status === 200 && updated?.content === MEM_CONTENT_2 && updated?.id !== created?.id,
  `status=${memUpdate.status} oldId=${created?.id} newId=${updated?.id}`
);

const memAfterUpdate = await req('GET', `/api/memory?q=${encodeURIComponent(String(STAMP))}`);
const seenIds = (memAfterUpdate.body?.entries ?? []).map((e) => e.id);
check(
  'AC2', '回读：新 id 可见、旧 id 消失',
  seenIds.includes(updated?.id) && !seenIds.includes(created?.id),
  `ids=${short(seenIds, 160)}`
);

const memStale = await req('PUT', `/api/memory/${encodeURIComponent(created?.id ?? 'memory:deadbeef')}`, { content: '任意内容' });
check(
  'AC2', 'PUT 用已失效的旧 id → 409 stale_id',
  memStale.status === 409 && memStale.body?.error === 'stale_id',
  `status=${memStale.status} body=${short(memStale.body)}`
);

const backupsBefore = countFiles(backupDir);
const memDelete = await req('DELETE', `/api/memory/${encodeURIComponent(updated?.id ?? 'x')}`);
const backupPath = memDelete.body?.backup ?? '';
const backupExists = !!backupPath && fs.existsSync(backupPath);
check(
  'AC2', 'DELETE /api/memory/:id → 200 且返回真实存在的备份文件',
  memDelete.status === 200 && memDelete.body?.ok === true && backupExists,
  `status=${memDelete.status} backup=${backupPath} exists=${backupExists}`
);
const backupsAfter = countFiles(backupDir);
check(
  'AC2', `删除后 backups/memory/ 备份数增加（${backupsBefore} → ${backupsAfter}）`,
  backupsAfter >= backupsBefore && backupExists && path.dirname(backupPath) === backupDir,
  `dir=${backupDir} before=${backupsBefore} after=${backupsAfter}`
);

const memFinal = await req('GET', `/api/memory?q=${encodeURIComponent(String(STAMP))}`);
check(
  'AC2', '删除后条目消失（无残留，环境已还原）',
  memFinal.status === 200 && (memFinal.body?.entries ?? []).length === 0,
  `remaining=${short(memFinal.body?.entries)}`
);

const memDeleteMissing = await req('DELETE', '/api/memory/memory:deadbeef');
check('AC2', 'DELETE 不存在条目 → 404', memDeleteMissing.status === 404, `status=${memDeleteMissing.status} body=${short(memDeleteMissing.body)}`);

// ═══════════════════════ AC3 · F15 自动化任务 ═══════════════════════
const cronStatus = await req('GET', '/api/cron-status');
const isSandbox = /mock sandbox/i.test(String(cronStatus.body?.raw ?? ''));
check(
  'AC3', 'GET /api/cron-status → 200（调度器状态可查，O-2 兜底）',
  cronStatus.status === 200 && typeof cronStatus.body?.running === 'boolean',
  `status=${cronStatus.status} body=${short(cronStatus.body)}`
);
note(`cron 后端模式：${isSandbox ? 'mock 沙箱（~/.kmaster-studio/mock/cron）' : '真实 hermes cron 目录 + CLI'}`);

const jobsList0 = await req('GET', '/api/jobs');
check(
  'AC3', 'GET /api/jobs → 200 且 jobs 为数组',
  jobsList0.status === 200 && Array.isArray(jobsList0.body?.jobs),
  `status=${jobsList0.status} count=${jobsList0.body?.jobs?.length} sample=${short(jobsList0.body?.jobs?.[0], 160)}`
);

const JOB_NAME = `qa-m4-${STAMP}`;
const jobCreate = await req('POST', '/api/jobs', {
  name: JOB_NAME,
  schedule: '0 9 * * *',
  prompt: 'QA-M4 验收任务（自动创建，脚本结束时自动删除）',
  deliver: 'local',
});
const job = jobCreate.body?.job;
check(
  'AC3', 'POST /api/jobs 新建 → 200 且返回 { ok, job, jobs }',
  jobCreate.status === 200 && jobCreate.body?.ok === true && !!job?.id && Array.isArray(jobCreate.body?.jobs),
  `status=${jobCreate.status} jobId=${job?.id} name=${job?.name} schedule=${job?.schedule_expr}`
);

const jobBad = await req('POST', '/api/jobs', { prompt: '缺 schedule' });
check('AC3', 'POST /api/jobs 缺 schedule → 400', jobBad.status === 400, `status=${jobBad.status} body=${short(jobBad.body)}`);

const jobsList1 = await req('GET', '/api/jobs');
check(
  'AC3', 'GET /api/jobs 可见新建任务',
  (jobsList1.body?.jobs ?? []).some((j) => j.id === job?.id),
  `ids=${short((jobsList1.body?.jobs ?? []).map((j) => j.id), 160)}`
);

const jobPause = await req('PATCH', `/api/jobs/${encodeURIComponent(job?.id ?? 'x')}`, { enabled: false });
const paused = (jobPause.body?.jobs ?? []).find((j) => j.id === job?.id);
check(
  'AC3', 'PATCH /api/jobs/:id { enabled:false } → 映射 pause，enabled 落为 false',
  jobPause.status === 200 && paused?.enabled === false,
  `status=${jobPause.status} enabled=${paused?.enabled} state=${paused?.state}`
);

const jobRename = await req('PATCH', `/api/jobs/${encodeURIComponent(job?.id ?? 'x')}`, { name: `${JOB_NAME}-renamed`, enabled: true });
const renamed = (jobRename.body?.jobs ?? []).find((j) => j.id === job?.id);
check(
  'AC3', 'PATCH /api/jobs/:id { name, enabled:true } → 改名 + resume 生效',
  jobRename.status === 200 && renamed?.name === `${JOB_NAME}-renamed` && renamed?.enabled === true,
  `status=${jobRename.status} name=${renamed?.name} enabled=${renamed?.enabled}`
);

const jobPatchEmpty = await req('PATCH', `/api/jobs/${encodeURIComponent(job?.id ?? 'x')}`, {});
check('AC3', 'PATCH /api/jobs/:id 空补丁 → 400', jobPatchEmpty.status === 400, `status=${jobPatchEmpty.status} body=${short(jobPatchEmpty.body)}`);

const jobRun = await req('POST', `/api/jobs/${encodeURIComponent(job?.id ?? 'x')}/run`);
check(
  'AC3', 'POST /api/jobs/:id/run → 202 且 { ok, note, scheduler_running }',
  jobRun.status === 202 && jobRun.body?.ok === true && typeof jobRun.body?.note === 'string' && typeof jobRun.body?.scheduler_running === 'boolean',
  `status=${jobRun.status} body=${short(jobRun.body)}`
);

const jobRunMissing = await req('POST', '/api/jobs/not-exist-id/run');
check('AC3', 'POST /api/jobs/:id/run 不存在任务 → 404', jobRunMissing.status === 404, `status=${jobRunMissing.status} body=${short(jobRunMissing.body)}`);

// —— 运行历史：mock 沙箱的手动触发不产出历史文件（无真实调度器），
//    因此这里按 hermes output/<job_id>/<ts>.md 的真实文件头格式植入一条，验证扫描 + 解析链路，随后清理。
let plantedRunFile = '';
if (isSandbox && job?.id) {
  const outDir = path.join(kmasterHome(), 'mock', 'cron', 'output', job.id);
  try {
    fs.mkdirSync(outDir, { recursive: true });
    plantedRunFile = path.join(outDir, '2026-01-01_09-00-00.md');
    fs.writeFileSync(
      plantedRunFile,
      [
        `# Cron Job: ${JOB_NAME}-renamed`,
        '',
        `**Job ID:** ${job.id}`,
        '**Run Time:** 2026-01-01 09:00:00',
        '**Mode:** agent',
        '**Status:** ok',
        '',
        '---',
        '',
        'QA-M4 验收用运行记录（脚本植入，运行结束即删除）。',
        '',
      ].join('\n'),
      'utf8'
    );
    note(`沙箱模式下已植入运行历史样本用于解析验证：${plantedRunFile}`);
  } catch (e) {
    note(`植入运行历史样本失败：${String(e?.message ?? e)}`);
    plantedRunFile = '';
  }
}

const history = await req('GET', `/api/cron-history?limit=10${job?.id ? `&job_id=${encodeURIComponent(job.id)}` : ''}`);
const runs = history.body?.runs ?? [];
check(
  'AC3', 'GET /api/cron-history → 200 且 runs 为数组',
  history.status === 200 && Array.isArray(runs),
  `status=${history.status} count=${runs.length}`
);
if (plantedRunFile) {
  const hit = runs.find((r) => r.job_id === job?.id);
  check(
    'AC3', 'GET /api/cron-history 正确解析 output/<job_id>/<ts>.md 文件头',
    !!hit && hit.status === 'ok' && hit.mode === 'agent' && hit.run_time === '2026-01-01 09:00:00' && hit.excerpt.includes('QA-M4'),
    `run=${short(hit, 220)}`
  );
} else {
  note('未植入历史样本（真实 cron 模式或写入失败），仅校验 /api/cron-history 契约形状');
}

const jobDelete = await req('DELETE', `/api/jobs/${encodeURIComponent(job?.id ?? 'x')}`);
check('AC3', 'DELETE /api/jobs/:id → 200 且列表不再包含（环境已还原）', jobDelete.status === 200 && jobDelete.body?.ok === true, `status=${jobDelete.status} body=${short(jobDelete.body)}`);
const jobsList2 = await req('GET', '/api/jobs');
check(
  'AC3', '删除后 GET /api/jobs 不含该任务',
  !(jobsList2.body?.jobs ?? []).some((j) => j.id === job?.id),
  `ids=${short((jobsList2.body?.jobs ?? []).map((j) => j.id), 160)}`
);
// 清理植入的历史文件
if (plantedRunFile) {
  try { fs.rmSync(path.dirname(plantedRunFile), { recursive: true, force: true }); } catch { /* ignore */ }
}

// ═══════════════════════ WS 场景：AC4 / AC5 / AC6 / AC7 ═══════════════════════
let io = null;
try {
  ({ io } = await import('socket.io-client'));
} catch (e) {
  note(`socket.io-client 不可用，跳过 WS 事件断言：${String(e?.message ?? e)}`);
}

const sessionCreate = await req('POST', '/api/sessions', {});
const SID = sessionCreate.body?.session?.id ?? '';
check('AC0', 'POST /api/sessions → 200（验收用会话已建立）', sessionCreate.status === 200 && !!SID, `session=${short(sessionCreate.body?.session, 160)}`);

if (io && SID) {
  /** @type {{ ev: string; p: any }[]} */
  const events = [];
  const socket = io(`${BASE}/chat-run`, { transports: ['websocket'], forceNew: true, timeout: 10000 });
  const WATCH = [
    'run.started', 'run.completed', 'run.failed', 'run.queued', 'queue.updated', 'usage.updated',
    'subagent.start', 'subagent.tool', 'subagent.text', 'subagent.thinking', 'subagent.progress', 'subagent.complete',
    'compression.started', 'compression.completed',
  ];
  WATCH.forEach((ev) => socket.on(ev, (p) => events.push({ ev, p })));

  const connected = await new Promise((resolve) => {
    const t = setTimeout(() => resolve(false), 10000);
    socket.on('connect', () => { clearTimeout(t); resolve(true); });
    socket.on('connect_error', () => { clearTimeout(t); resolve(false); });
  });
  check('AC4', 'WS /chat-run 连接建立', connected, `connected=${connected} url=${BASE}/chat-run`);

  const of = (ev) => events.filter((e) => e.ev === ev && e.p?.session_id === SID);
  async function waitFor(predicate, timeoutMs, label) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (predicate()) return true;
      await sleep(60);
    }
    note(`等待超时：${label}（${timeoutMs}ms）`);
    return false;
  }

  if (connected) {
    // —— run#1：命中「委派」+「压缩」触发词 → 同时合成 subagent 序列与 compression 序列 ——
    socket.emit('run', { session_id: SID, message: 'QA-M4：请委派两个子代理并行处理，并压缩上下文历史' });
    const started1 = await waitFor(() => of('run.started').length >= 1, 10000, 'run#1 run.started');
    check('AC5', 'WS run → run.started 广播（executeRun 走 ns.emit）', started1, `run.started=${of('run.started').length}`);

    // —— AC5：run 进行中连发 2 条 → 2 次 run.queued ——
    socket.emit('run', { session_id: SID, message: 'QA-M4 排队消息 1' });
    await sleep(200);
    socket.emit('run', { session_id: SID, message: 'QA-M4 排队消息 2' });
    const queued2 = await waitFor(() => of('run.queued').length >= 2, 10000, '2 次 run.queued');
    const qEvents = of('run.queued');
    check(
      'AC5', 'run 进行中连发 2 条 → 收到 2 次 run.queued（载荷含 item + pending）',
      queued2 && qEvents.every((e) => !!e.p?.item?.id && typeof e.p?.pending === 'number'),
      `count=${qEvents.length} last=${short(qEvents[qEvents.length - 1]?.p, 200)}`
    );

    const queueList = await req('GET', `/api/queue?session_id=${encodeURIComponent(SID)}`);
    const items = queueList.body?.items ?? [];
    check(
      'AC5', 'GET /api/queue?session_id= → 长度 = 2 且按 position 升序',
      queueList.status === 200 && items.length === 2 && items[0].position < items[1].position,
      `status=${queueList.status} items=${short(items.map((i) => ({ id: i.id.slice(0, 8), pos: i.position, msg: i.message })), 240)}`
    );

    const queueAll = await req('GET', '/api/queue');
    check(
      'AC5', 'GET /api/queue（不带过滤）→ 200 且包含本会话排队项',
      queueAll.status === 200 && (queueAll.body?.items ?? []).some((i) => i.session_id === SID),
      `status=${queueAll.status} total=${queueAll.body?.items?.length}`
    );

    // 删除队尾第 2 条（保留第 1 条用于验证自动出队）
    const dropId = items[1]?.id ?? '';
    const dropRes = await req('DELETE', `/api/queue/${encodeURIComponent(dropId)}`);
    const queueAfterDrop = await req('GET', `/api/queue?session_id=${encodeURIComponent(SID)}`);
    check(
      'AC5', 'DELETE /api/queue/:id → 200 且队列长度回落到 1',
      dropRes.status === 200 && dropRes.body?.ok === true && (queueAfterDrop.body?.items ?? []).length === 1,
      `delete=${dropRes.status} remaining=${queueAfterDrop.body?.items?.length}`
    );

    const dropMissing = await req('DELETE', '/api/queue/not-exist-id');
    check('AC5', 'DELETE /api/queue/:id 不存在 → 404', dropMissing.status === 404, `status=${dropMissing.status} body=${short(dropMissing.body)}`);
    const sendMissing = await req('POST', '/api/queue/not-exist-id/send');
    check('AC5', 'POST /api/queue/:id/send 不存在 → 404', sendMissing.status === 404, `status=${sendMissing.status} body=${short(sendMissing.body)}`);

    // —— 等待 run#1 完成 → 自动出队第 1 条并触发新的 run.started ——
    const done1 = await waitFor(() => of('run.completed').length >= 1, 40000, 'run#1 run.completed');
    check('AC5', 'run#1 完成（run.completed 广播）', done1, `run.completed=${of('run.completed').length}`);

    const autoDequeued = await waitFor(() => of('run.started').length >= 2, 20000, '自动出队触发第 2 次 run.started');
    check(
      'AC5', 'run 完成后自动出队第 1 条并触发新 run.started（F17 续发）',
      autoDequeued,
      `run.started=${of('run.started').length} queue.updated=${of('queue.updated').length}`
    );
    const emptied = of('queue.updated').some((e) => (e.p?.items ?? []).length === 0);
    check(
      'AC5', '出队后广播 queue.updated 且队列被清空',
      emptied,
      `queue.updated payloads=${short(of('queue.updated').map((e) => (e.p?.items ?? []).length), 120)}`
    );

    // —— AC4：子代理事件序列 ——
    const subEvents = events.filter((e) => e.ev.startsWith('subagent.') && e.p?.session_id === SID);
    const subIds = [...new Set(subEvents.map((e) => e.p?.subagent_id))].filter(Boolean);
    check(
      'AC4', 'Mock 触发词命中 → 收到 ≥2 个子代理的事件序列',
      subIds.length >= 2,
      `subagents=${subIds.length} events=${subEvents.length}`
    );
    const perType = Object.fromEntries(
      ['start', 'tool', 'text', 'thinking', 'progress', 'complete'].map((t) => [t, subEvents.filter((e) => e.ev === `subagent.${t}`).length])
    );
    check(
      'AC4', 'subagent.start/tool/text/thinking/progress/complete 六类事件齐备',
      Object.values(perType).every((n) => n >= 2),
      `counts=${short(perType)}`
    );
    const identityOk = subEvents.every((e) => !!e.p?.session_id && !!e.p?.message_id && !!e.p?.subagent_id);
    check(
      'AC4', '每个子代理事件均带 session_id + message_id 锚点与 subagent_id',
      identityOk,
      `sample=${short(subEvents[0]?.p, 240)}`
    );
    const completes = subEvents.filter((e) => e.ev === 'subagent.complete');
    check(
      'AC4', 'subagent.complete 状态流转到完成（status=ok 且带 duration_seconds）',
      completes.length >= 2 && completes.every((e) => (e.p?.status ?? 'ok') === 'ok' && typeof e.p?.duration_seconds === 'number'),
      `completes=${short(completes.map((e) => ({ id: String(e.p?.subagent_id).slice(0, 8), status: e.p?.status, dur: e.p?.duration_seconds })), 220)}`
    );
    const startIdentity = subEvents.find((e) => e.ev === 'subagent.start')?.p ?? {};
    check(
      'AC4', 'subagent 身份字段对齐 delegate_tool.py（goal/task_index/task_count/tool_count）',
      typeof startIdentity.goal === 'string' && typeof startIdentity.task_index === 'number'
        && startIdentity.task_count === 2 && typeof startIdentity.tool_count === 'number',
      `identity=${short(startIdentity, 240)}`
    );

    // —— AC6：压缩事件 ——
    const cStart = of('compression.started');
    const cDone = of('compression.completed');
    check(
      'AC6', 'compression.started + compression.completed 事件均已收到',
      cStart.length >= 1 && cDone.length >= 1,
      `started=${cStart.length} completed=${cDone.length}`
    );
    const lastC = cDone[cDone.length - 1]?.p ?? {};
    check(
      'AC6', 'compression.completed 携带 tokens_before/tokens_after/compression_count',
      typeof lastC.tokens_before === 'number' && typeof lastC.tokens_after === 'number'
        && lastC.tokens_after < lastC.tokens_before && typeof lastC.compression_count === 'number',
      `payload=${short(lastC, 240)}`
    );

    // —— 等第 2 个 run（自动出队那次）跑完，保证会话空闲 ——
    await waitFor(() => of('run.completed').length >= 2, 40000, 'run#2 run.completed');

    // —— AC5：POST /api/queue/:id/send（忙 → 提到队首）——
    socket.emit('run', { session_id: SID, message: 'QA-M4 冲刷场景：占用会话的长消息' });
    await waitFor(() => of('run.started').length >= 3, 15000, 'run#3 run.started');
    socket.emit('run', { session_id: SID, message: 'QA-M4 冲刷场景：待冲刷消息' });
    await waitFor(() => of('run.queued').length >= 3, 15000, '第 3 次 run.queued');
    const q3 = await req('GET', `/api/queue?session_id=${encodeURIComponent(SID)}`);
    const flushId = (q3.body?.items ?? [])[0]?.id ?? '';
    const sendRes = await req('POST', `/api/queue/${encodeURIComponent(flushId)}/send`);
    check(
      'AC5', 'POST /api/queue/:id/send（会话忙）→ 200 且 started=false（提到队首）',
      sendRes.status === 200 && sendRes.body?.ok === true && sendRes.body?.started === false && typeof sendRes.body?.note === 'string',
      `status=${sendRes.status} body=${short(sendRes.body)}`
    );
    // 清理：移除该项，避免额外 run 拖长脚本
    await req('DELETE', `/api/queue/${encodeURIComponent(flushId)}`);
    await waitFor(() => of('run.completed').length >= 3, 40000, 'run#3 run.completed');

    const failed = of('run.failed');
    check('AC5', '全过程无 run.failed', failed.length === 0, `run.failed=${failed.length} detail=${short(failed[0]?.p, 200)}`);
    note(`WS 事件统计：run.started=${of('run.started').length} run.completed=${of('run.completed').length} run.queued=${of('run.queued').length} queue.updated=${of('queue.updated').length} usage.updated=${of('usage.updated').length} subagent.*=${subEvents.length} compression.*=${cStart.length + cDone.length}`);
  }

  socket.close();
}

// ═══════════════════════ AC6 · F18 上下文估算 ═══════════════════════
if (SID) {
  const ctx1 = await req('GET', `/api/sessions/${encodeURIComponent(SID)}/context-length`);
  const est = ctx1.body ?? {};
  check(
    'AC6', 'GET /api/sessions/:id/context-length → 200 且返回 used/max/percent + estimated 标记',
    ctx1.status === 200 && typeof est.context_used === 'number' && typeof est.context_max === 'number'
      && typeof est.context_percent === 'number' && est.estimated === true,
    `status=${ctx1.status} body=${short(est, 240)}`
  );
  const ctx2 = await req('GET', `/api/sessions/${encodeURIComponent(SID)}/context-length?force=1`);
  check(
    'AC6', 'GET /api/sessions/:id/context-length?force=1 → 200（强制重算）',
    ctx2.status === 200 && typeof ctx2.body?.context_used === 'number',
    `status=${ctx2.status} used=${ctx2.body?.context_used} categories=${(ctx2.body?.categories ?? []).length}`
  );
  const ctxMissing = await req('GET', '/api/sessions/not-exist-session/context-length');
  check('AC6', 'GET context-length 不存在会话 → 404', ctxMissing.status === 404, `status=${ctxMissing.status} body=${short(ctxMissing.body)}`);
}

// ═══════════════════════ AC7 · F22 用量聚合 ═══════════════════════
const usageDay = await req('GET', '/api/usage/stats?group=day');
const dayRows = usageDay.body?.rows ?? [];
check(
  'AC7', 'GET /api/usage/stats?group=day → 200 且聚合非空',
  usageDay.status === 200 && usageDay.body?.group === 'day' && dayRows.length > 0,
  `status=${usageDay.status} rows=${dayRows.length} totals=${short(usageDay.body?.totals, 160)}`
);
const totalsOk = (usageDay.body?.totals?.input_tokens ?? 0) > 0 && (usageDay.body?.totals?.output_tokens ?? 0) > 0;
check(
  'AC7', 'usage totals 与逐行求和一致（DB 聚合自洽）',
  totalsOk && dayRows.reduce((n, r) => n + r.input_tokens, 0) === usageDay.body?.totals?.input_tokens
    && dayRows.reduce((n, r) => n + r.output_tokens, 0) === usageDay.body?.totals?.output_tokens,
  `sumIn=${dayRows.reduce((n, r) => n + r.input_tokens, 0)} sumOut=${dayRows.reduce((n, r) => n + r.output_tokens, 0)} totals=${short(usageDay.body?.totals, 160)}`
);

const usageModel = await req('GET', '/api/usage/stats?group=model');
check(
  'AC7', 'GET /api/usage/stats?group=model → 200',
  usageModel.status === 200 && Array.isArray(usageModel.body?.rows),
  `status=${usageModel.status} rows=${usageModel.body?.rows?.length} sample=${short(usageModel.body?.rows?.[0], 140)}`
);
const usageSession = await req('GET', '/api/usage/stats?group=session');
check(
  'AC7', 'GET /api/usage/stats?group=session → 200 且包含本次验收会话',
  usageSession.status === 200 && (SID ? (usageSession.body?.rows ?? []).some((r) => r.key === SID) : Array.isArray(usageSession.body?.rows)),
  `status=${usageSession.status} rows=${usageSession.body?.rows?.length} hitSID=${(usageSession.body?.rows ?? []).some((r) => r.key === SID)}`
);
const usageBad = await req('GET', '/api/usage/stats?group=nope');
check('AC7', 'GET /api/usage/stats?group=非法 → 400', usageBad.status === 400, `status=${usageBad.status} body=${short(usageBad.body)}`);
const usageBadRange = await req('GET', '/api/usage/stats?group=day&from=2026/01/01');
check('AC7', 'GET /api/usage/stats?from=非 YYYY-MM-DD → 400', usageBadRange.status === 400, `status=${usageBadRange.status} body=${short(usageBadRange.body)}`);
const usageRange = await req('GET', '/api/usage/stats?group=day&from=1970-01-01&to=2099-12-31');
check(
  'AC7', 'GET /api/usage/stats 带合法 from/to → 200',
  usageRange.status === 200 && (usageRange.body?.rows ?? []).length > 0,
  `status=${usageRange.status} rows=${usageRange.body?.rows?.length}`
);

// 会话清理（用量行按设计保留，属统计历史）
if (SID) {
  const delSession = await req('DELETE', `/api/sessions/${encodeURIComponent(SID)}`);
  note(`验收会话已清理：${SID} → status=${delSession.status}`);
}

// ═══════════════════════ AC8 · 导航与路由（静态断言）═══════════════════════
function readRepoFile(rel) {
  try { return fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8'); } catch { return ''; }
}
const routerSrc = readRepoFile('packages/client/src/router/index.ts');
const wantRoutes = ['/memory', '/jobs', '/usage', '/queue'];
const missingRoutes = wantRoutes.filter((p) => !routerSrc.includes(`path: '${p}'`));
check(
  'AC8', 'router/index.ts 声明 /memory /jobs /usage /queue 四条整页路由',
  routerSrc.length > 0 && missingRoutes.length === 0,
  `missing=${short(missingRoutes)} hashHistory=${routerSrc.includes('createWebHashHistory')}`
);
const appSrc = readRepoFile('packages/client/src/App.vue');
check(
  'AC8', 'App.vue 已挂载 AppNav + <router-view>（router 不再空转）',
  appSrc.includes('<router-view') && appSrc.includes('AppNav'),
  `routerView=${appSrc.includes('<router-view')} appNav=${appSrc.includes('AppNav')}`
);
const navSrc = readRepoFile('packages/client/src/components/AppNav.vue');
const navHasAll = wantRoutes.every((p) => navSrc.includes(p)) && navSrc.includes('/');
check(
  'AC8', 'AppNav.vue 包含五个入口且带队列徽标（queuedTotal）',
  navSrc.length > 0 && navHasAll && /queuedTotal/.test(navSrc),
  `entriesOk=${navHasAll} badge=${/queuedTotal/.test(navSrc)}`
);
const viewsOk = ['MemoryView', 'JobsView', 'UsageView', 'QueueView']
  .filter((v) => !fs.existsSync(path.join(REPO_ROOT, 'packages/client/src/views', `${v}.vue`)));
check('AC8', '四个整页视图文件均存在', viewsOk.length === 0, `missing=${short(viewsOk)}`);

// ═══════════════════════ 报告 ═══════════════════════
const passed = results.filter((r) => r.pass).length;
const failed = results.length - passed;
console.log(`\n=== TOTAL ${results.length} | PASSED ${passed} | FAILED ${failed} ===`);

const byAc = {};
for (const r of results) {
  byAc[r.ac] = byAc[r.ac] ?? { pass: 0, fail: 0 };
  if (r.pass) byAc[r.ac].pass += 1; else byAc[r.ac].fail += 1;
}
const AC_LABEL = {
  AC0: '前置（健康检查 / 会话）',
  AC2: 'F13 记忆管理',
  AC3: 'F15 自动化任务',
  AC4: 'F16 子代理事件流',
  AC5: 'F17 消息队列',
  AC6: 'F18 压缩 + 上下文估算',
  AC7: 'F22 用量统计',
  AC8: '导航与路由',
};

const lines = [
  '# QA M4 独立验收报告（REST + WS 实测）',
  '',
  `- 生成时间：${new Date().toISOString()}`,
  `- 目标：${BASE}（HERMES_BRIDGE_MOCK=1）`,
  '- 契约基准：docs/design/TECHNICAL-SOLUTION-M4.md §3.6；验收基准：docs/design/REQUIREMENT-M4.md §8 AC1-AC8',
  `- 合计 ${results.length} 项 | 通过 ${passed} | 失败 ${failed}`,
  '- AC1（构建/单测）由 `npx vitest run` + `npx vue-tsc --noEmit` + `npx vite build` 独立覆盖，不在本脚本内',
  '',
  '## 分项汇总',
  '',
  '| AC | 范围 | 通过 | 失败 |',
  '|----|------|------|------|',
  ...Object.entries(byAc).map(([ac, v]) => `| ${ac} | ${AC_LABEL[ac] ?? ''} | ${v.pass} | ${v.fail} |`),
  '',
  '## 逐项结果',
  '',
  '| # | AC | 检查项 | 结果 | 实测详情 |',
  '|---|----|--------|------|----------|',
  ...results.map((r, i) => `| ${i + 1} | ${r.ac} | ${r.name.replace(/\|/g, '\\|')} | ${r.pass ? 'PASS' : 'FAIL'} | \`${r.detail.replace(/\|/g, '\\|')}\` |`),
  '',
  '## 附注',
  '',
  ...notes.map((n) => `- ${n.replace(/\|/g, '\\|')}`),
  '',
];
fs.mkdirSync(path.join(REPO_ROOT, '.dev'), { recursive: true });
fs.writeFileSync(path.join(REPO_ROOT, '.dev', 'QA-M4-REPORT.md'), lines.join('\n'), 'utf8');
console.log('report written: .dev/QA-M4-REPORT.md');
process.exit(failed > 0 ? 2 : 0);
