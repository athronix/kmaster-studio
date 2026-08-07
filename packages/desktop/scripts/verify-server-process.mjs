/**
 * ServerProcessManager 端到端验证脚本（脱 GUI 可跑）
 *
 * 覆盖 AC6 / FR-D3 / FR-D6 / FR-D7 / NFR-M5-7 中**不依赖窗口**的全部判据：
 *   1. 端口复用：外部 server 已在监听 → ensureServer() 返回 spawnedByMe=false，
 *      stopServer() 之后外部 server 仍然 200（绝不误杀）。
 *   2. 自拉起 + 进程树清理：端口无人占用 → spawnedByMe=true → stopServer() 后
 *      pid 消失、端口释放、进程树无残留。
 *   3. 入口缺失：立即抛可读错误（而非 30s 空等）。
 *   4. 30s 超时兜底：入口存在但永不监听 → 抛 ServerStartTimeoutError，且卡死的子进程被回收。
 *   5. 重入不产生孤儿：ensureServer() 连调两次，ownership 不被探活翻转。
 *
 * 双端口设计（为了能与队友的 dev server 并行跑，不抢占也不误杀）：
 *   - REUSE_PORT（默认 6648）：若已有外部 server 在跑就**直接拿它当被测对象**（这正是 AC6 场景），
 *     没有则本脚本自己起一个临时的，跑完自己收。
 *   - SPAWN_PORT（默认 6748）：自拉起类用例专用，必须空闲。
 *   自拉起的 server 一律带 `KMASTER_DB=memory` + 临时 `KMASTER_STUDIO_HOME`，绝不碰真实数据。
 *
 * 用法（仓库根）：
 *   node packages/desktop/scripts/verify-server-process.mjs          # 跑 1/2/3/5（约 20s）
 *   node packages/desktop/scripts/verify-server-process.mjs --full   # 追加 4（多 30s）
 *
 * 🚫 主机名一律 localhost（本机 TUN 代理会拦 127.0.0.1 裸 TCP，方案 §7）。
 */
import { createRequire } from 'node:module';
import { spawn, execFile } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(here, '..');
const repoRoot = path.resolve(pkgRoot, '../..');

const DIST_ENTRY = path.join(pkgRoot, 'dist/main/server-process.js');
if (!fs.existsSync(DIST_ENTRY)) {
  console.error(`[verify] 缺少构建产物：${DIST_ENTRY}\n         请先执行 npm run build:desktop`);
  process.exit(2);
}
const { ServerProcessManager, ServerStartTimeoutError, DEFAULT_PORT, SERVER_HOST } = require(DIST_ENTRY);

const REUSE_PORT = Number(process.env.KMASTER_VERIFY_REUSE_PORT ?? DEFAULT_PORT);
const SPAWN_PORT = Number(process.env.KMASTER_VERIFY_SPAWN_PORT ?? 6748);
const SERVER_ENTRY = path.join(repoRoot, 'packages/server/dist/index.js');
const IS_WIN = process.platform === 'win32';
const FULL = process.argv.includes('--full');

/** 自拉起的测试 server 一律隔离到临时 HOME + 内存库，绝不污染 ~/.kmaster-studio。 */
const SANDBOX_ENV = {
  KMASTER_DB: 'memory',
  KMASTER_STUDIO_HOME: path.join(os.tmpdir(), `kmaster-verify-${process.pid}`),
  HERMES_BRIDGE_MOCK: '1',
  NO_PROXY: 'localhost,127.0.0.1',
};

let passed = 0;
let failed = 0;
const failures = [];

function ok(name, detail = '') {
  passed += 1;
  console.log(`  \u2713 ${name}${detail ? ` — ${detail}` : ''}`);
}

function bad(name, detail = '') {
  failed += 1;
  failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
  console.log(`  \u2717 ${name}${detail ? ` — ${detail}` : ''}`);
}

function assert(condition, name, detail = '') {
  if (condition) ok(name, detail);
  else bad(name, detail);
  return Boolean(condition);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** GET /api/health，返回 status code；不可达返回 0。 */
function health(port, timeoutMs = 1500) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (v) => {
      if (!settled) {
        settled = true;
        resolve(v);
      }
    };
    const req = http.request(
      { host: SERVER_HOST, port, path: '/api/health', method: 'GET', timeout: timeoutMs },
      (res) => {
        const code = res.statusCode ?? 0;
        res.resume();
        res.on('end', () => done(code));
        res.on('error', () => done(0));
      },
    );
    req.on('timeout', () => {
      req.destroy();
      done(0);
    });
    req.on('error', () => done(0));
    req.end();
  });
}

async function waitHealthy(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await health(port)) === 200) return true;
    await delay(300);
  }
  return false;
}

async function waitDown(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if ((await health(port, 800)) === 0) return true;
    await delay(300);
  }
  return false;
}

/** 进程是否还活着（不发信号，仅探测）。 */
function isAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return Boolean(err && err.code === 'EPERM');
  }
}

/**
 * 用系统进程表复核 pid 是否存在。
 * ⚠️ 不用 `wmic`：Windows 11 24H2 起已移除该组件，调用只会静默返回空，
 *    据此断言「进程树已清空」会得到**假阳性**。这里改用始终可用的 `tasklist`。
 */
function tasklistHas(pid) {
  if (!IS_WIN || !pid) return Promise.resolve(false);
  return new Promise((resolve) => {
    execFile('tasklist', ['/FI', `PID eq ${pid}`, '/NH'], { windowsHide: true }, (err, stdout) => {
      if (err) return resolve(false);
      resolve(new RegExp(`\\s${pid}\\s`).test(String(stdout)));
    });
  });
}

/** 综合判定进程是否还在：signal 0 探测 + 系统进程表双重确认。 */
async function stillRunning(pid) {
  if (!pid) return false;
  if (isAlive(pid)) return true;
  return tasklistHas(pid);
}

/** 以纯 node 起一个外部 server（模拟用户自己 npm run dev:server）。 */
function startExternalServer(port) {
  return spawn(process.execPath, [SERVER_ENTRY], {
    env: { ...process.env, ...SANDBOX_ENV, PORT: String(port) },
    cwd: path.dirname(SERVER_ENTRY),
    stdio: 'ignore',
    windowsHide: true,
    detached: !IS_WIN,
  });
}

function killTree(pid) {
  if (!pid) return Promise.resolve();
  return new Promise((resolve) => {
    if (IS_WIN) execFile('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true }, () => resolve());
    else {
      try {
        process.kill(-pid, 'SIGKILL');
      } catch {
        try {
          process.kill(pid, 'SIGKILL');
        } catch {
          /* 已退出 */
        }
      }
      resolve();
    }
  });
}

function newManager(port) {
  return new ServerProcessManager({ port, entry: SERVER_ENTRY, extraEnv: SANDBOX_ENV });
}

async function requireFree(port, label) {
  if ((await health(port, 800)) === 0) return true;
  bad(`${label} 前置条件`, `端口 ${port} 已被占用（可用 KMASTER_VERIFY_SPAWN_PORT 换一个空闲端口）`);
  return false;
}

// ——————————————————————————————— 用例 ———————————————————————————————

/** 1. AC6 端口复用：命中外部 server → 不 spawn；stopServer() 不误杀。 */
async function testPortReuse() {
  console.log(`\n[1] AC6 · 端口复用不误杀（port=${REUSE_PORT}）`);
  const preexisting = (await health(REUSE_PORT)) === 200;
  let external = null;

  if (preexisting) {
    console.log('      检测到已在运行的外部 server（可能是队友的 dev server）→ 直接以它为被测对象，本脚本不会杀它');
  } else {
    external = startExternalServer(REUSE_PORT);
    if (!assert(await waitHealthy(REUSE_PORT, 30_000), '临时外部 server 已就绪', `pid=${external.pid}`)) {
      await killTree(external.pid);
      return;
    }
  }

  try {
    const mgr = newManager(REUSE_PORT);
    const handle = await mgr.ensureServer();
    assert(
      handle.spawnedByMe === false,
      'ensureServer() 返回 spawnedByMe=false（复用而非重复拉起）',
      `实际=${handle.spawnedByMe}`,
    );
    assert(mgr.isSpawnedByMe() === false, 'isSpawnedByMe() === false');
    assert(mgr.serverPid() === null, '壳未持有任何子进程', `serverPid=${mgr.serverPid()}`);
    assert(handle.url === `http://${SERVER_HOST}:${REUSE_PORT}`, 'url 使用 localhost（禁 127.0.0.1）', handle.url);

    await mgr.stopServer();
    await delay(600);
    const code = await health(REUSE_PORT);
    assert(code === 200, 'stopServer() 之后外部 server 仍然存活（AC6 核心判据）', `/api/health -> ${code}`);
    if (external) {
      assert(await stillRunning(external.pid), '外部 server 进程未被杀', `pid=${external.pid}`);
    }
  } finally {
    if (external) {
      await killTree(external.pid);
      await waitDown(REUSE_PORT, 10_000);
    }
  }
}

/** 2. 自拉起 + 进程树清理（NFR-M5-7）。 */
async function testSpawnAndCleanup() {
  console.log(`\n[2] 自拉起 + 退出清理整棵进程树（port=${SPAWN_PORT}）`);
  if (!(await requireFree(SPAWN_PORT, '用例2'))) return;

  const mgr = newManager(SPAWN_PORT);
  let pid = null;
  try {
    const handle = await mgr.ensureServer();
    pid = mgr.serverPid();
    assert(handle.spawnedByMe === true, 'ensureServer() 返回 spawnedByMe=true', `实际=${handle.spawnedByMe}`);
    assert(typeof pid === 'number' && pid > 0, '拿到子进程 pid', `pid=${pid}`);
    assert((await health(SPAWN_PORT)) === 200, '/api/health 返回 200');
    assert(await tasklistHas(pid), '系统进程表中可见该 server 进程', `pid=${pid}`);

    const logFile = mgr.logPath();
    assert(fs.existsSync(logFile), 'server 日志已落盘', logFile);
    assert(
      logFile === path.join(os.homedir(), '.kmaster-studio', 'logs', 'server.log'),
      '日志路径符合 §7 约定',
      logFile,
    );
    const logText = fs.readFileSync(logFile, 'utf8');
    assert(logText.includes(`pid=${pid}`), '日志含本次 spawn 头', `size=${logText.length}B`);
    assert(/listening on/.test(logText), 'server stdout 已被捕获进日志');

    await mgr.stopServer();
    assert(await waitDown(SPAWN_PORT, 10_000), 'stopServer() 后端口已释放（/api/health 不可达）');
    await delay(900);
    assert(!(await stillRunning(pid)), '主子进程已从系统进程表消失', `pid=${pid}`);
    assert(mgr.isSpawnedByMe() === false, 'ownership 已复位');
  } finally {
    if (await stillRunning(pid)) await killTree(pid);
  }
}

/** 3. 入口缺失 → 立即失败（不空等 30s）。 */
async function testMissingEntry() {
  console.log('\n[3] FR-D7 · server 入口缺失立即报错');
  if (!(await requireFree(SPAWN_PORT, '用例3'))) return;

  const mgr = new ServerProcessManager({ port: SPAWN_PORT, entry: path.join(repoRoot, 'no/such/server.js') });
  const started = Date.now();
  try {
    await mgr.ensureServer();
    bad('应当抛错但没有');
  } catch (err) {
    const cost = Date.now() - started;
    assert(cost < 6_000, '快速失败（未空等 30s）', `${cost}ms`);
    assert(/未找到 server 入口/.test(err.message), '错误信息可读', err.message);
  } finally {
    await mgr.stopServer();
  }
}

/** 4. 30s 超时兜底：入口存在但永不监听 → ServerStartTimeoutError，且卡死进程被回收。 */
async function testStartTimeout() {
  console.log(`\n[4] FR-D7 · 30s 未就绪走超时兜底（约 30s，port=${SPAWN_PORT}）`);
  if (!(await requireFree(SPAWN_PORT, '用例4'))) return;

  const stub = path.join(os.tmpdir(), `kmaster-never-listen-${process.pid}.cjs`);
  fs.writeFileSync(stub, 'setInterval(() => {}, 1000);\n', 'utf8');
  const mgr = new ServerProcessManager({ port: SPAWN_PORT, entry: stub, extraEnv: SANDBOX_ENV });
  let pid = null;
  const started = Date.now();
  try {
    await mgr.ensureServer();
    bad('应当超时但返回了成功');
  } catch (err) {
    pid = mgr.serverPid();
    const cost = Math.round((Date.now() - started) / 1000);
    assert(err instanceof ServerStartTimeoutError, '抛出 ServerStartTimeoutError（主进程据此渲染错误页）', err.name);
    assert(cost >= 28 && cost <= 45, '约 30s 后超时', `${cost}s`);
    assert(typeof err.logPath === 'string' && err.logPath.length > 0, '错误携带日志路径（错误页展示用）', err.logPath);
    await mgr.stopServer();
    await delay(700);
    assert(!(await stillRunning(pid)), '超时后卡死的子进程被回收，无孤儿', `pid=${pid}`);
  } finally {
    if (await stillRunning(pid)) await killTree(pid);
    fs.rmSync(stub, { force: true });
  }
}

/** 5. 重入不翻转 ownership（回归本次修复的孤儿进程缺陷）。 */
async function testReentrantOwnership() {
  console.log(`\n[5] 回归 · ensureServer() 重入不把自己的 server 误判成外部 server（port=${SPAWN_PORT}）`);
  if (!(await requireFree(SPAWN_PORT, '用例5'))) return;

  const mgr = newManager(SPAWN_PORT);
  let pid = null;
  try {
    const first = await mgr.ensureServer();
    pid = mgr.serverPid();
    assert(first.spawnedByMe === true, '首次 ensureServer() spawnedByMe=true');

    // 模拟错误页「重试」/ activate 重建窗口再次进入引导流程
    const second = await mgr.ensureServer();
    assert(
      second.spawnedByMe === true,
      '二次 ensureServer() 仍为 true（修复前会被探活翻成 false → 退出漏杀）',
      `实际=${second.spawnedByMe}`,
    );
    assert(mgr.serverPid() === pid, '未重复 spawn（pid 不变）', `pid=${pid} -> ${mgr.serverPid()}`);

    await mgr.stopServer();
    assert(await waitDown(SPAWN_PORT, 10_000), 'stopServer() 后端口释放');
    await delay(900);
    assert(!(await stillRunning(pid)), '重入后仍能被完整清理，无孤儿', `pid=${pid}`);
  } finally {
    if (await stillRunning(pid)) await killTree(pid);
  }
}

/**
 * 6. 真·进程树清理：被测 server 自己再 spawn 一个孙子进程（模拟 Bridge :16765），
 *    验证 `taskkill /T` / `kill(-pgid)` 确实**级联**带走整棵树，而不只是杀掉直接子进程。
 *    —— 用例 2 里 server 走 mock 不派生子进程，覆盖不到这条路径，这才是 NFR-M5-7 真正的坑。
 */
async function testProcessTreeCascade() {
  console.log(`\n[6] NFR-M5-7 · 级联清理孙子进程（模拟 Bridge，port=${SPAWN_PORT}）`);
  if (!(await requireFree(SPAWN_PORT, '用例6'))) return;

  const stub = path.join(os.tmpdir(), `kmaster-tree-stub-${process.pid}.cjs`);
  fs.writeFileSync(
    stub,
    [
      "const { spawn } = require('node:child_process');",
      "const http = require('node:http');",
      // 孙子进程：常驻不退出，等价于 Bridge 子进程
      "const grand = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });",
      "console.log('GRANDCHILD_PID=' + grand.pid);",
      "http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{\"ok\":true}'); })",
      '  .listen(Number(process.env.PORT), () => console.log("stub listening on " + process.env.PORT));',
    ].join('\n'),
    'utf8',
  );

  const mgr = new ServerProcessManager({ port: SPAWN_PORT, entry: stub, extraEnv: SANDBOX_ENV });
  let pid = null;
  let grandPid = null;
  try {
    // ⚠️ server.log 是**追加**写入：必须只解析本次 spawn 之后新增的内容，
    //    否则会读到上一轮跑测残留的旧 GRANDCHILD_PID（早已退出）而误判「清理前就没活着」。
    // ⚠️ statSync().size 返回的是**字节数**，而 readFileSync('utf8').slice() 按字符位切割。
    //    日志含中文（多字节 UTF-8），字节偏移 > 字符偏移，直接 slice 字节数会跳过新内容。
    //    解法：用 Buffer 做字节级切片再转 utf8。
    const offset = fs.existsSync(mgr.logPath()) ? fs.statSync(mgr.logPath()).size : 0;
    await mgr.ensureServer();
    pid = mgr.serverPid();
    // 孙子进程 pid 从 server.log 里读（stdout 已被壳接管）
    await delay(700);
    const fresh = Buffer.from(fs.readFileSync(mgr.logPath())).subarray(offset).toString('utf8');
    const match = /GRANDCHILD_PID=(\d+)/.exec(fresh);
    grandPid = match ? Number(match[1]) : null;

    assert(typeof pid === 'number' && pid > 0, '子进程已拉起', `pid=${pid}`);
    assert(grandPid !== null, '孙子进程 pid 已从日志解析出来', `grandPid=${grandPid}`);
    assert(await stillRunning(grandPid), '孙子进程存活（清理前）', `grandPid=${grandPid}`);
    console.log(`      进程树：server=${pid} → 孙子(模拟 Bridge)=${grandPid}`);

    await mgr.stopServer();
    await delay(1200);
    assert(!(await stillRunning(pid)), 'server 子进程已清理', `pid=${pid}`);
    // 关键判据：Windows 下子进程不会因父进程消失而自动退出，
    // 孙子进程能死掉只可能是 taskkill /T 整棵树带走的。
    assert(
      !(await stillRunning(grandPid)),
      '孙子进程被级联清理（taskkill /T 生效，无孤儿）',
      `grandPid=${grandPid}`,
    );
  } finally {
    if (await stillRunning(grandPid)) await killTree(grandPid);
    if (await stillRunning(pid)) await killTree(pid);
    fs.rmSync(stub, { force: true });
  }
}

async function main() {
  console.log('=== ServerProcessManager 验证 ===');
  console.log(`host=${SERVER_HOST} reusePort=${REUSE_PORT} spawnPort=${SPAWN_PORT} platform=${process.platform}`);
  console.log(`server entry=${SERVER_ENTRY} exists=${fs.existsSync(SERVER_ENTRY)}`);

  await testPortReuse();
  await testSpawnAndCleanup();
  await testMissingEntry();
  await testReentrantOwnership();
  await testProcessTreeCascade();
  if (FULL) await testStartTimeout();
  else console.log('\n[4] 已跳过 30s 超时用例（加 --full 开启）');

  fs.rmSync(SANDBOX_ENV.KMASTER_STUDIO_HOME, { recursive: true, force: true });

  console.log(`\n=== 结果：${passed} 通过 / ${failed} 失败 ===`);
  if (failed > 0) {
    for (const f of failures) console.log(`  FAILED: ${f}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('[verify] 未捕获异常：', err);
  process.exitCode = 1;
});
