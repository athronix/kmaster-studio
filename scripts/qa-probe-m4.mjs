// QA M4 独立抽查探针（由独立验收 QA 编写，不复用 qa-verify-m4.mjs 的任何代码）
// 目的：证明 qa-verify-m4.mjs 的 61/61 不是自说自话——用最朴素的 node:http
// 直接打关键只读端点，打印真实 status + 原始 body 片段，供与 .dev/QA-M4-REPORT.md 逐条比对。
// 只做只读 + 参数校验类请求，零副作用。
//
// 用法：NO_PROXY=localhost,127.0.0.1 node scripts/qa-probe-m4.mjs
import http from 'node:http';

const HOST = 'localhost';
const PORT = Number(process.env.QA_PORT ?? 6648);

function get(urlPath) {
  return new Promise((resolve) => {
    const r = http.request({ host: HOST, port: PORT, path: urlPath, method: 'GET' }, (res) => {
      let data = '';
      res.on('data', (d) => (data += d));
      res.on('end', () => resolve({ status: res.statusCode, raw: data }));
    });
    r.on('error', (e) => resolve({ status: 0, raw: `ERROR ${e.message}` }));
    r.setTimeout(15000, () => { r.destroy(); resolve({ status: 0, raw: 'TIMEOUT' }); });
    r.end();
  });
}

// [路径, 期望 status, 说明]
const PROBES = [
  ['/api/health', 200, '健康检查'],
  ['/api/memory', 200, 'F13 记忆列表'],
  ['/api/memory?group=nope', 400, 'F13 非法 group 应 400'],
  ['/api/jobs', 200, 'F15 任务列表'],
  ['/api/cron-status', 200, 'F15 调度器状态'],
  ['/api/cron-history?limit=5', 200, 'F15 运行历史'],
  ['/api/queue', 200, 'F17 队列（全量）'],
  ['/api/usage/stats?group=day', 200, 'F22 按天聚合'],
  ['/api/usage/stats?group=model', 200, 'F22 按模型聚合'],
  ['/api/usage/stats?group=session', 200, 'F22 按会话聚合'],
  ['/api/usage/stats?group=nope', 400, 'F22 非法 group 应 400'],
  ['/api/usage/stats?group=day&from=2026/01/01', 400, 'F22 非法 from 应 400'],
  ['/api/sessions/not-exist-session/context-length', 404, 'F18 不存在会话应 404'],
];

let pass = 0;
let fail = 0;
for (const [p, want, desc] of PROBES) {
  const r = await get(p);
  const ok = r.status === want;
  if (ok) pass += 1; else fail += 1;
  console.log(`${ok ? 'OK  ' : 'BAD '} [${r.status} want ${want}] ${p}  (${desc})`);
  console.log(`      body: ${r.raw.replace(/\s+/g, ' ').slice(0, 260)}`);
}

// —— 额外结构断言：报告声称的形状是否真的成立 ——
const mem = await get('/api/memory');
const jobs = await get('/api/jobs');
const queue = await get('/api/queue');
const usage = await get('/api/usage/stats?group=day');
const j = (r) => { try { return JSON.parse(r.raw); } catch { return null; } };
const mb = j(mem); const jb = j(jobs); const qb = j(queue); const ub = j(usage);

const shape = [
  ['GET /api/memory → body.entries 是数组', Array.isArray(mb?.entries), `count=${mb?.entries?.length}`],
  ['GET /api/jobs → body.jobs 是数组', Array.isArray(jb?.jobs), `count=${jb?.jobs?.length} ids=${JSON.stringify((jb?.jobs ?? []).map((x) => x.id))}`],
  ['GET /api/queue → body.items 是数组', Array.isArray(qb?.items), `count=${qb?.items?.length}`],
  ['GET /api/usage/stats?group=day → group=day 且 rows/totals 齐备', ub?.group === 'day' && Array.isArray(ub?.rows) && !!ub?.totals, `rows=${ub?.rows?.length} totals=${JSON.stringify(ub?.totals)}`],
  ['usage totals 与逐行求和一致（独立复算）',
    Array.isArray(ub?.rows)
      && ub.rows.reduce((n, r) => n + (r.input_tokens ?? 0), 0) === ub?.totals?.input_tokens
      && ub.rows.reduce((n, r) => n + (r.output_tokens ?? 0), 0) === ub?.totals?.output_tokens,
    `sumIn=${(ub?.rows ?? []).reduce((n, r) => n + (r.input_tokens ?? 0), 0)} sumOut=${(ub?.rows ?? []).reduce((n, r) => n + (r.output_tokens ?? 0), 0)}`],
  ['环境已还原：/api/memory 无 QA-M4 残留条目', !(mb?.entries ?? []).some((e) => String(e.content ?? '').includes('QA-M4')), ''],
  ['环境已还原：/api/jobs 无 qa-m4- 残留任务', !(jb?.jobs ?? []).some((x) => String(x.name ?? '').startsWith('qa-m4-')), `names=${JSON.stringify((jb?.jobs ?? []).map((x) => x.name))}`],
  ['环境已还原：/api/queue 无残留排队项', (qb?.items ?? []).length === 0, `count=${qb?.items?.length}`],
];
console.log('\n--- 结构与还原性断言 ---');
for (const [name, ok, detail] of shape) {
  if (ok) pass += 1; else fail += 1;
  console.log(`${ok ? 'OK  ' : 'BAD '} ${name}  ${detail}`);
}

console.log(`\n=== PROBE TOTAL ${pass + fail} | PASS ${pass} | FAIL ${fail} ===`);
process.exit(fail > 0 ? 2 : 0);
