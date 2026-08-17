// 真实 bridge 端到端验证：启动 kmaster server（REAL 模式，连已运行的 Python bridge @16765），
// 用 socket.io-client 连 /chat-run，发一条带真实 provider:model 的 'run'，收集下行事件。
// 期望：run.started → message.delta（或 reasoning.delta / tool.*）→ run.completed
// 或 run.failed（带可读原因，而非静默无响应）。
import { spawn } from 'node:child_process';
import { io } from 'socket.io-client';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '..');
const SERVER_DIR = resolve(REPO, 'packages/server');
const NODE = process.env.KMASTER_NODE || 'node';
const TSX = resolve(REPO, 'node_modules/tsx/dist/cli.mjs');

const PORT = process.env.QA_PORT || 6648;
const BASE = `http://localhost:${PORT}`;
const HERMES_HOME = process.env.QA_HERMES_HOME || 'C:/Users/towyq/AppData/Local/hermes';
const MODEL = process.env.QA_MODEL || 'ark-agent-plan:deepseek-v4-flash';
const MESSAGE = process.env.QA_MSG || '你好，请用一句话回答：1加1等于几？';

function startServer(env) {
  const proc = spawn(NODE, [TSX, 'src/index.ts'], {
    cwd: SERVER_DIR,
    env: {
      ...process.env,
      PORT: String(PORT),
      KMASTER_DB: 'memory',
      NO_PROXY: 'localhost,127.0.0.1',
      HERMES_BRIDGE_MOCK: '0',
      HERMES_HOME,
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return proc;
}

function waitForListening(proc, timeoutMs = 40000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('server start timeout')), timeoutMs);
    let buf = '';
    const onData = (d) => {
      buf += d.toString();
      if (/listening on/.test(buf)) { clearTimeout(t); resolve(buf); }
    };
    proc.stdout.on('data', onData);
    proc.stderr.on('data', (d) => { process.stderr.write('[server.err] ' + d); });
  });
}

(async () => {
  console.log(`\n================= 真实 bridge E2E =================`);
  console.log(`PORT=${PORT} HERMES_HOME=${HERMES_HOME} MODEL=${MODEL}`);
  console.log(`（Python bridge 应已在 127.0.0.1:16765 监听）\n`);
  const proc = startServer({});
  let listened = false;
  try {
    await waitForListening(proc);
    listened = true;
  } catch (e) {
    console.log('✗ 服务器未能启动：', e.message);
    proc.kill('SIGKILL');
    process.exit(1);
  }

  const socket = io(`${BASE}/chat-run`, { transports: ['websocket'], reconnection: false, forceNew: true });
  const events = [];
  const want = ['run.started', 'message.delta', 'reasoning.delta', 'run.completed', 'run.failed', 'tool.started', 'tool.progress', 'plan.requested', 'agent.event'];
  let completed = false, failed = false, failedErr = null, firstDelta = null;
  want.forEach((ev) => socket.on(ev, (p) => {
    if (ev === 'message.delta' && firstDelta === null) firstDelta = (p?.delta || '');
    if (ev === 'run.completed') completed = true;
    if (ev === 'run.failed') { failed = true; failedErr = p?.error; }
    const snap = ev === 'message.delta' ? `(delta:"${(p?.delta || '').slice(0, 40)}")` : JSON.stringify(p)?.slice(0, 160);
    events.push({ ev, snap });
    process.stdout.write(`   ← ${ev} ${snap}\n`);
  }));

  await new Promise((r) => socket.on('connect', r));
  console.log('✓ 已连接 /chat-run 命名空间');
  console.log(`→ 发送 run: model="${MODEL}" msg="${MESSAGE}"`);

  socket.emit('run', { session_id: 'real-' + Date.now(), message: MESSAGE, model: MODEL, mode: 'default' });

  // 最多等 120s（真实推理可能较慢）
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline && !completed && !failed) {
    await new Promise((r) => setTimeout(r, 500));
  }

  const types = events.map((e) => e.ev);
  const hasDelta = types.includes('message.delta');
  console.log(`\n   收到事件数=${events.length}`);
  console.log(`   run.started=${types.includes('run.started')}  message.delta=${hasDelta}  run.completed=${completed}  run.failed=${failed}`);
  if (failed) console.log(`   run.failed 原因: ${failedErr}`);
  if (completed && hasDelta) {
    console.log(`   ✅ 真实 bridge 打通：收到流式回复，首段="${firstDelta}"`);
  } else if (failed) {
    console.log(`   ⚠️ 真实 bridge 连接成功但运行失败（非静默无响应）：见上方原因`);
  } else {
    console.log(`   ❌ 未收到 completed/failed（可能 hang 或 worker 未就绪）`);
  }

  socket.close();
  proc.kill('SIGKILL');
  await new Promise((r) => setTimeout(r, 300));
  process.exit(0);
})().catch((e) => { console.error('fatal', e); process.exit(1); });
