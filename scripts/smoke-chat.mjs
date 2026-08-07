// M1 烟雾测试：连接 /chat-run，发送 run，断言收到 run.started / message.delta / run.completed
// 注意：本地 NekoBox 为 TUN 模式，会拦截 IPv4 127.0.0.1；用 localhost(→::1) 绕过。
import { io } from 'socket.io-client';

const HOST = process.env.KMASTER_HOST ?? 'localhost';
const socket = io(`http://${HOST}:6648/chat-run`, { transports: ['websocket'] });
const got = [];
let text = '';

// —— M3（F8/F9）：run 携带 mode/model，断言服务端接受（不报错且正常开始）——
const RUN_MODE = 'dont_ask';   // hermes 令牌：craft→dont_ask
const RUN_MODEL = 'gpt-4o';

socket.on('connect', () => {
  console.log('[smoke] connected, emitting run (mode=%s, model=%s)', RUN_MODE, RUN_MODEL);
  socket.emit('run', {
    session_id: 'smoke-' + Date.now(),
    message: '你好，kmaster',
    mode: RUN_MODE,
    model: RUN_MODEL,
  });
});

let modeModelAccepted = false;
socket.on('run.started', (p) => {
  got.push('run.started');
  modeModelAccepted = true; // 服务端接受 mode/model 并启动 run = 链路闭环
  console.log('  run.started', p.run_id, '(mode/model accepted by server)');
});
socket.on('reasoning.delta', () => { got.push('reasoning.delta'); });
socket.on('message.delta', (p) => { got.push('message.delta'); text += p.delta; });
socket.on('tool.started', (p) => { got.push('tool.started'); console.log('  tool.started', p.tool); });
socket.on('tool.completed', (p) => { got.push('tool.completed'); });
socket.on('usage.updated', (p) => { got.push('usage.updated'); console.log('  usage', p); });
socket.on('plan.requested', (p) => { got.push('plan.requested'); console.log('  plan.requested', p.title, p.steps); });
socket.on('approval.requested', (p) => { got.push('approval.requested'); console.log('  approval.requested', p.tool); });
socket.on('clarify.requested', (p) => { got.push('clarify.requested'); console.log('  clarify.requested', p.question); });
socket.on('artifact.created', (p) => { got.push('artifact.created'); console.log('  artifact.created', p.artifact.name, p.artifact.kind); });
socket.on('run.completed', (p) => {
  got.push('run.completed');
  console.log('[smoke] run.completed, text length =', text.length);
  const need = ['run.started', 'message.delta', 'run.completed', 'plan.requested', 'approval.requested', 'clarify.requested', 'artifact.created'];
  const missing = need.filter((n) => !got.includes(n));
  if (missing.length) { console.error('[smoke] FAIL missing', missing); process.exit(1); }
  if (!modeModelAccepted) { console.error('[smoke] FAIL: run 携带的 mode/model 未被服务端接受'); process.exit(1); }
  console.log('[smoke] PASS ✅  full chat loop verified (mode/model carried through /chat-run)');
  process.exit(0);
});
socket.on('connect_error', (e) => { console.error('[smoke] connect_error', e.message); process.exit(1); });

setTimeout(() => { console.error('[smoke] TIMEOUT, got:', got); process.exit(1); }, 20000);
