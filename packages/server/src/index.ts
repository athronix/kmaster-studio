// kmaster-server 入口：Koa BFF + Socket.IO(/chat-run) + 静态托管
import Koa from 'koa';
import cors from '@koa/cors';
import bodyParser from '@koa/bodyparser';
import koaStatic from 'koa-static';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sessionsRouter } from './routes/sessions.js';
import { memoryRouter } from './routes/memory.js';
import { jobsRouter } from './routes/jobs.js';
import { queueRouter } from './routes/queue.js';
import { usageRouter } from './routes/usage.js';
// M5/F21：设置页 REST（Provider 凭据 + hermes Profile）
import { configRouter } from './routes/config.js';
// T01：/api/hermes/probe 探测端点
import { hermesRouter } from './routes/hermes.js';
// T01/U-35：拆出的独立路由（从 sessions.ts 迁出）
import { modelsRouter } from './routes/models.js';
import { skillsRouter } from './routes/skills.js';
import { pluginsRouter } from './routes/plugins.js';
import { mcpRouter } from './routes/mcp.js';
// T02：新增路由
import { logsRouter } from './routes/logs.js';
import { agentsRouter } from './routes/agents.js';
import { fsRouter } from './routes/fs.js';
// T07：SkillHub 代理
import { skillhubRouter } from './routes/skillhub.js';
import { registerChatRun } from './run-chat.js';
// M5/F20：内置终端 —— 复用同一 socket.io 实例开 `/terminal` 命名空间（🚫 不引入 ws）
import { registerTerminal } from './terminal-ns.js';
import { terminalManager } from './services/terminal.js';
// T01/U-30：孤儿 worker 治理
import { cleanupOrphans, startGuard } from './services/hermes/worker-guard.js';
// T02/U-19：state.db 连接清理
import { closeStateDb } from './services/hermes/read/state-db.js';
import { db } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 6648);
// R1/F3：默认回环 `::1`（IPv6 loopback）—— 既避免零鉴权服务被动暴露到局域网，又契合仓库约定「一律用 localhost（解析到 ::1）、🚫 禁用 127.0.0.1」（NekoBox TUN 会拦截裸 IPv4 127.0.0.1）；
// 跨机 web 访问仍需显式 `HOST=0.0.0.0`（此时自加反代/鉴权）。
const HOST = process.env.HOST ?? '::1';

const app = new Koa();
app.use(cors());
app.use(bodyParser());
app.use(sessionsRouter.routes()).use(sessionsRouter.allowedMethods());
// U-35：拆出的独立路由
app.use(modelsRouter.routes()).use(modelsRouter.allowedMethods());
app.use(skillsRouter.routes()).use(skillsRouter.allowedMethods());
app.use(pluginsRouter.routes()).use(pluginsRouter.allowedMethods());
app.use(mcpRouter.routes()).use(mcpRouter.allowedMethods());
// M4 新增路由面：记忆库 / 定时任务 / 排队队列 / 用量统计
app.use(memoryRouter.routes()).use(memoryRouter.allowedMethods());
app.use(jobsRouter.routes()).use(jobsRouter.allowedMethods());
app.use(queueRouter.routes()).use(queueRouter.allowedMethods());
app.use(usageRouter.routes()).use(usageRouter.allowedMethods());
app.use(configRouter.routes()).use(configRouter.allowedMethods());
app.use(hermesRouter.routes()).use(hermesRouter.allowedMethods());
app.use(logsRouter.routes()).use(logsRouter.allowedMethods());
app.use(agentsRouter.routes()).use(agentsRouter.allowedMethods());
app.use(fsRouter.routes()).use(fsRouter.allowedMethods());
// T07：SkillHub 代理路由
app.use(skillhubRouter.routes()).use(skillhubRouter.allowedMethods());

// 生产期静态托管客户端构建产物
const dist = path.resolve(__dirname, '../../client/dist');
app.use(koaStatic(dist));

const httpServer = createServer(app.callback());
// R10：CORS 白名单可配（`CORS_ORIGIN=http://localhost:6649,http://localhost:6648`）。
// 缺省保留 `*`，兼容 dev 期 Vite(:6649) proxy 与 Electron file:// 壳。
const CORS_ORIGIN = process.env.CORS_ORIGIN;
const io = new Server(httpServer, {
  cors: CORS_ORIGIN
    ? { origin: CORS_ORIGIN.split(',').map((s) => s.trim()) }
    : { origin: '*' },
});
registerChatRun(io);
// M5/F20：`/terminal` 命名空间（内部已注册 SIGINT/SIGTERM/exit 的 killAll 兜底钩子）
registerTerminal(io);

await db(); // 预热持久层

// U-30：启动孤儿 worker 巡检（每 30s 检查，退出时兜底清理）
startGuard();

// M5/F20：pty 兜底清理 —— 与 registerTerminal 内部钩子幂等叠加，
// 保证即便命名空间注册顺序变化，进程退出时也绝不留孤儿 pty（NFR-M5-7）。
const killPtysOnExit = (reason: string): void => {
  const killed = terminalManager.killAll();
  if (killed > 0) console.log(`[kmaster-server] ${reason}: cleaned ${killed} pty session(s)`);
};
process.on('exit', () => killPtysOnExit('exit'));
// T02/U-19：关闭 state.db 只读连接
process.on('exit', () => closeStateDb());
process.on('SIGINT', () => {
  killPtysOnExit('SIGINT');
  process.exit(0);
});
process.on('SIGTERM', () => {
  killPtysOnExit('SIGTERM');
  process.exit(0);
});
httpServer.listen(PORT, HOST, () => {
  // 日志打印真实绑定地址（此前恒打 127.0.0.1 而实际绑 0.0.0.0，误导排障）
  console.log(`[kmaster-server] listening on http://${HOST}:${PORT}  (bridge mode=${process.env.HERMES_BRIDGE_MOCK === '1' ? 'mock' : 'real'})`);
});
