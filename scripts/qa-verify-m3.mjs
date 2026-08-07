// QA M3 独立验收脚本：一次运行覆盖全部 REST 端点 + 落盘/回读/还原副作用检查
// 约定：一律走 host=localhost（127.0.0.1 会被本机 TUN 代理拦截返回 401，属测试假象）
// 契约基准：docs/design/TECHNICAL-SOLUTION-M3.md 第 147-154 行 API 表
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import yaml from 'js-yaml';

const HOST = 'localhost';
const PORT = Number(process.env.QA_PORT ?? 6648);
const results = [];
const notes = [];

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
    r.setTimeout(15000, () => { r.destroy(); resolve({ status: 0, body: null, raw: 'TIMEOUT' }); });
    if (payload) r.write(payload);
    r.end();
  });
}

function check(name, pass, detail) {
  results.push({ name, pass: !!pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}  ::  ${detail}`);
}

async function waitHealth() {
  for (let i = 0; i < 30; i++) {
    const r = await req('GET', '/api/health');
    if (r.status === 200) return r;
    await new Promise((s) => setTimeout(s, 500));
  }
  return { status: 0, body: null, raw: 'health never became ready' };
}

const short = (o) => JSON.stringify(o ?? null).slice(0, 220);

// ───────────────────────── main ─────────────────────────
const health = await waitHealth();
check('GET /api/health → 200', health.status === 200, `status=${health.status} body=${short(health.body)}`);
if (health.status !== 200) {
  console.error('server not reachable, abort');
  process.exit(1);
}

// F9 模型枚举
const models = await req('GET', '/api/models');
const providerArr = models.body?.providers;
const modelCount = Array.isArray(providerArr)
  ? providerArr.reduce((n, p) => n + (p.models?.length ?? 0), 0)
  : 0;
check(
  'GET /api/models → 200 且 providers 为非空数组',
  models.status === 200 && Array.isArray(providerArr) && providerArr.length > 0,
  `status=${models.status} providers=${Array.isArray(providerArr) ? providerArr.length : 'NOT_ARRAY'} models=${modelCount} sample=${short(providerArr?.[0])}`
);

// F11 技能枚举
const skills = await req('GET', '/api/skills');
const skillArr = skills.body?.skills;
check(
  'GET /api/skills → 200 且 skills 为非空数组',
  skills.status === 200 && Array.isArray(skillArr) && skillArr.length > 0,
  `status=${skills.status} count=${Array.isArray(skillArr) ? skillArr.length : 'NOT_ARRAY'} sample=${short(skillArr?.[0])}`
);

// F12 MCP 列表
const mcpList = await req('GET', '/api/mcp');
check(
  'GET /api/mcp → 200 且 servers 为数组',
  mcpList.status === 200 && Array.isArray(mcpList.body?.servers),
  `status=${mcpList.status} count=${mcpList.body?.servers?.length} body=${short(mcpList.body)}`
);

// 设置读取
const set0 = await req('GET', '/api/settings');
check(
  'GET /api/settings → 200',
  set0.status === 200 && !!set0.body?.settings,
  `status=${set0.status} body=${short(set0.body)}`
);
const original = set0.body?.settings ?? {};

// 设置 roundtrip（契约动词 PUT；同时探测 POST 以澄清 brief 与设计文档的差异）
const postProbe = await req('POST', '/api/settings', { default_mode: 'plan', default_model: 'gpt-4o-mini' });
notes.push(`POST /api/settings 探测（设计文档未定义此动词）→ status=${postProbe.status} body=${short(postProbe.body)}`);

const put = await req('PUT', '/api/settings', { default_mode: 'plan', default_model: 'gpt-4o-mini' });
check(
  'PUT /api/settings {plan, gpt-4o-mini} → 200',
  put.status === 200 && put.body?.settings?.default_mode === 'plan',
  `status=${put.status} body=${short(put.body)}`
);
const set1 = await req('GET', '/api/settings');
check(
  'settings roundtrip：回读与写入一致',
  set1.body?.settings?.default_mode === 'plan' && set1.body?.settings?.default_model === 'gpt-4o-mini',
  `readback=${short(set1.body?.settings)}`
);
// 还原原设置
await req('PUT', '/api/settings', {
  default_mode: original.default_mode || 'default',
  default_model: original.default_model ?? '',
});
const setRestore = await req('GET', '/api/settings');
notes.push(`settings 还原后=${short(setRestore.body?.settings)}（原始=${short(original)}）`);

// F19 上传（契约字段 session_id/content_base64）
const SID = 'qa-verify';
const CONTENT = 'hello qa';
const up = await req('POST', '/api/upload', {
  session_id: SID,
  filename: 'qa.txt',
  content_base64: Buffer.from(CONTENT).toString('base64'),
});
check(
  'POST /api/upload → 200 且返回 upload 元信息',
  up.status === 200 && !!up.body?.upload?.path,
  `status=${up.status} body=${short(up.body)}`
);
const kroot = process.env.KMASTER_STUDIO_HOME ?? path.resolve(os.homedir(), '.kmaster-studio');
const upPath = up.body?.upload?.path ?? path.join(kroot, 'uploads', SID, 'qa.txt');
let diskOk = false, diskContent = '';
try { diskContent = fs.readFileSync(upPath, 'utf8'); diskOk = diskContent === CONTENT; } catch (e) { diskContent = `READ_ERROR ${e.message}`; }
check('上传文件真实落盘且内容正确', diskOk, `path=${upPath} content="${diskContent}"`);

// 上传参数校验（brief 中的 sessionId/content 变体应被拒绝为 400）
const upBad = await req('POST', '/api/upload', { sessionId: SID, filename: 'x.txt', content: 'aGk=' });
check(
  'POST /api/upload 缺失契约字段 → 400（入参校验生效）',
  upBad.status === 400,
  `status=${upBad.status} body=${short(upBad.body)}（说明：sessionId/content 非契约字段，契约为 session_id/content_base64）`
);

// 目录穿越防护
const upTrav = await req('POST', '/api/upload', {
  session_id: SID,
  filename: '../../evil.txt',
  content_base64: Buffer.from('evil').toString('base64'),
});
const travPath = upTrav.body?.upload?.path ?? '';
const travContained = travPath.includes(path.join('uploads', SID)) && !fs.existsSync(path.join(kroot, 'evil.txt'));
check('上传防目录穿越（basename 归一）', upTrav.status === 200 && travContained, `path=${travPath}`);

// F12 MCP 增删 + config.yaml 副作用与还原
const hermesHome = process.env.HERMES_HOME ?? path.join(os.homedir(), '.hermes');
const cfgPath = path.join(hermesHome, 'config.yaml');
const hadCfg = fs.existsSync(cfgPath);
const backup = hadCfg ? fs.readFileSync(cfgPath, 'utf8') : null;
notes.push(`~/.hermes/config.yaml 存在=${hadCfg} 备份字节=${backup?.length ?? 0}`);

try {
  const add = await req('POST', '/api/mcp', {
    name: 'qa-test-srv',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-everything'],
  });
  check(
    'POST /api/mcp 新增 qa-test-srv → 200',
    add.status === 200 && add.body?.ok === true,
    `status=${add.status} body=${short(add.body)}`
  );
  const cfgAfterAdd = fs.existsSync(cfgPath) ? yaml.load(fs.readFileSync(cfgPath, 'utf8')) : {};
  const entry = cfgAfterAdd?.mcp_servers?.['qa-test-srv'];
  check(
    'config.yaml 已写入 mcp_servers.qa-test-srv',
    !!entry && entry.command === 'npx',
    `entry=${short(entry)}`
  );
  const listAfterAdd = await req('GET', '/api/mcp');
  check(
    'GET /api/mcp 可见新增项',
    (listAfterAdd.body?.servers ?? []).some((s) => s.name === 'qa-test-srv'),
    `names=${short((listAfterAdd.body?.servers ?? []).map((s) => s.name))}`
  );

  const del = await req('DELETE', '/api/mcp/qa-test-srv');
  check('DELETE /api/mcp/qa-test-srv → 200', del.status === 200 && del.body?.ok === true, `status=${del.status} body=${short(del.body)}`);
  const cfgAfterDel = fs.existsSync(cfgPath) ? yaml.load(fs.readFileSync(cfgPath, 'utf8')) : {};
  check(
    'config.yaml 已移除 qa-test-srv',
    !cfgAfterDel?.mcp_servers?.['qa-test-srv'],
    `remaining=${short(Object.keys(cfgAfterDel?.mcp_servers ?? {}))}`
  );
  const listAfterDel = await req('GET', '/api/mcp');
  check(
    'GET /api/mcp 不再包含被删项',
    !(listAfterDel.body?.servers ?? []).some((s) => s.name === 'qa-test-srv'),
    `names=${short((listAfterDel.body?.servers ?? []).map((s) => s.name))}`
  );

  // MCP 入参校验
  const badMcp = await req('POST', '/api/mcp', { name: 'no-command' });
  check('POST /api/mcp 缺 command → 400', badMcp.status === 400, `status=${badMcp.status} body=${short(badMcp.body)}`);
} finally {
  // 无论成败一律还原原始 config.yaml
  if (backup !== null) fs.writeFileSync(cfgPath, backup, 'utf8');
  else if (fs.existsSync(cfgPath)) fs.rmSync(cfgPath);
  const finalRaw = fs.existsSync(cfgPath) ? fs.readFileSync(cfgPath, 'utf8') : null;
  const restored = backup === null ? finalRaw === null : finalRaw === backup;
  check('~/.hermes/config.yaml 已还原为初始状态', restored, `restored=${restored} bytes=${finalRaw?.length ?? 0}`);
}

// 会话 mode/model 回写（M3 F8/F9 落库）
const sc = await req('POST', '/api/sessions', {});
const sid2 = sc.body?.session?.id;
const patch = await req('PATCH', `/api/sessions/${sid2}`, { mode: 'plan', model: 'gpt-4o-mini' });
const sget = await req('GET', `/api/sessions/${sid2}`);
check(
  'PATCH /api/sessions/:id 回写 mode/model 并可回读',
  patch.status === 200 && sget.body?.session?.mode === 'plan' && sget.body?.session?.model === 'gpt-4o-mini',
  `session=${short(sget.body?.session)}`
);
await req('DELETE', `/api/sessions/${sid2}`);

// ───────────────────────── 报告 ─────────────────────────
const passed = results.filter((r) => r.pass).length;
const failed = results.length - passed;
console.log(`\n=== TOTAL ${results.length} | PASSED ${passed} | FAILED ${failed} ===`);

const lines = [
  '# QA M3 独立验收报告（REST 实测部分）',
  '',
  `- 生成时间：${new Date().toISOString()}`,
  `- 目标：http://${HOST}:${PORT}（HERMES_BRIDGE_MOCK=1）`,
  `- 契约基准：docs/design/TECHNICAL-SOLUTION-M3.md API 表（147-154 行）`,
  `- 合计 ${results.length} 项 | 通过 ${passed} | 失败 ${failed}`,
  '',
  '## 逐项结果',
  '',
  '| # | 检查项 | 结果 | 实测详情 |',
  '|---|--------|------|----------|',
  ...results.map((r, i) => `| ${i + 1} | ${r.name} | ${r.pass ? 'PASS' : 'FAIL'} | \`${String(r.detail).replace(/\|/g, '\\|')}\` |`),
  '',
  '## 附注',
  '',
  ...notes.map((n) => `- ${n}`),
  '',
];
fs.mkdirSync('.dev', { recursive: true });
fs.writeFileSync('.dev/QA-M3-REPORT.md', lines.join('\n'), 'utf8');
console.log('report written: .dev/QA-M3-REPORT.md');
process.exit(failed > 0 ? 2 : 0);
