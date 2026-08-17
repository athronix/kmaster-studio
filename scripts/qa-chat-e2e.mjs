// E2E 对话链路复现：启动真实 server（tsx 跑源码），用 socket.io-client 连 /chat-run，
// 发一条 'run'，收集下行事件。两组场景：
//   A) HERMES_BRIDGE_MOCK=1  → 期望收到 message.delta / run.completed（证明 server→client 管道 OK）
//   B) 不设（RealBridge，连 127.0.0.1:16765，本机大概率无 Python bridge）→ 期望 run.failed
// 用途：定位「对话框无响应」真因——是管道断了，还是真 bridge 失败被静默吞掉。
import { spawn } from 'node:child_process';
import { io } from 'socket.io-client';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '..');
const SERVER_DIR = resolve(REPO, 'packages/server');
const NODE = process.env.KMASTER_NODE || 'node';
const TSX = resolve(REPO, 'node_modules/tsx/dist/cli.mjs');

const PORT = process.env.QA_PORT || 6655;
const BASE = `http://localhost:${PORT}`;

function startServer(env) {
  const proc = spawn(NODE, [TSX, 'src/index.ts'], {
    cwd: SERVER_DIR,
    env: { ...process.env, PORT: String(PORT), KMASTER_DB: 'memory', NO_PROXY: 'localhost,127.0.0.1', ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return proc;
}

function waitForListening(proc, timeoutMs = 30000) {
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

async function runScenario(label, env) {
  console.log(`\n================= 场景 ${label} (env=${JSON.stringify(env)}) =================`);
  const proc = startServer(env);
  let listened = false;
  try {
    await waitForListening(proc);
    listened = true;
  } catch (e) {
    console.log('✗ 服务器未能启动：', e.message);
    proc.kill('SIGKILL');
    return;
  }

  const socket = io(`${BASE}/chat-run`, { transports: ['websocket'], reconnection: false, forceNew: true });
  const events = [];
  const want = ['run.started', 'message.delta', 'reasoning.delta', 'run.completed', 'run.failed', 'tool.started', 'plan.requested'];
  const timers = {};
  want.forEach((ev) => socket.on(ev, (p) => {
    const snap = ev === 'message.delta' ? `(delta:${p?.delta?.length ?? 0})` : JSON.stringify(p)?.slice(0, 120);
    events.push({ ev, snap, t: Date.now() });
    process.stdout.write(`   ← ${ev} ${snap}\n`);
  }));

  await new Promise((r) => socket.on('connect', r));
  console.log('✓ 已连接 /chat-run 命名空间');

  socket.emit('run', { session_id: 'e2e-' + Date.now(), message: '你好，请帮我总结一下', model: undefined, mode: 'default' });

  // 最多等 8s
  await new Promise((r) => setTimeout(r, 8000));

  const types = events.map((e) => e.ev);
  const hasDelta = types.includes('message.delta');
  const hasCompleted = types.includes('run.completed');
  const hasFailed = types.includes('run.failed');
  console.log(`\n   收到事件数=${events.length}  message.delta=${hasDelta}  run.completed=${hasCompleted}  run.failed=${hasFailed}`);
  if (env.HERMES_BRIDGE_MOCK === '1') {
    console.log(hasDelta && hasCompleted ? '   ✅ 场景A(管道) 通过：mock 下能收到流式回复' : '   ❌ 场景A(管道) 失败：mock 下也无响应');
  } else {
    console.log(hasFailed ? '   ✅ 场景B(真bridge) 复现：无 Python bridge → run.failed（被客户端静默吞掉即表现为「无响应」）' : '   ⚠ 场景B 未触发 run.failed（可能 bridge 可达，或 hang）');
  }

  socket.close();
  proc.kill('SIGKILL');
  await new Promise((r) => setTimeout(r, 300));
}

(async () => {
  await runScenario('A mock', { HERMES_BRIDGE_MOCK: '1' });
  await runScenario('B real(unset)', {});
  console.log('\n================= 复现结束 =================');
  process.exit(0);
})().catch((e) => { console.error('fatal', e); process.exit(1); });
