#!/usr/bin/env node
/**
 * bridge-dev.mjs —— 持久化启动 kmaster 真实 Python hermes-agent bridge（broker）。
 *
 *   npm run bridge:dev
 *
 * 与 scripts/verify-bridge-e2e.mjs 不同：本脚本启动后**常驻**（不自动清理），
 * 配合 `npm run dev`（启动 kmaster server，真实模式连本 bridge）即可在 UI 里跑真实对话。
 *
 * 自动探测：HERMES_HOME / HERMES_AGENT_ROOT / hermes-agent venv python，
 * 并 source $HERMES_HOME/.env 的 API key 注入 bridge 子进程环境。
 *
 * Ctrl+C 优雅退出（先 SIGTERM，4s 后 SIGKILL）。
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

function resolveHermesHome() {
  if (process.env.HERMES_HOME) return process.env.HERMES_HOME;
  const home = process.env.HOME || process.env.USERPROFILE || '';
  if (process.platform === 'win32') {
    const cand = join(home, 'AppData', 'Local', 'hermes');
    if (existsSync(cand)) return cand;
  }
  const alt = join(home, '.hermes');
  if (existsSync(alt)) return alt;
  return null;
}

function resolveAgentRoot() {
  if (process.env.HERMES_AGENT_ROOT) return process.env.HERMES_AGENT_ROOT;
  const base = process.env.HERMES_HOME || join(process.env.USERPROFILE || '', 'AppData', 'Local', 'hermes');
  const candidates = [
    join(base, 'hermes-agent'),
    join(process.env.HOME || '', '.hermes', 'hermes-agent'),
  ];
  for (const c of candidates) if (existsSync(join(c, 'run_agent.py'))) return c;
  return null;
}

function resolveVenv(agentRoot) {
  if (!agentRoot) return null;
  const cands = [
    join(agentRoot, 'venv', 'Scripts', 'python.exe'),
    join(agentRoot, '.venv', 'Scripts', 'python.exe'),
    join(agentRoot, 'venv', 'bin', 'python3'),
    join(agentRoot, 'venv', 'bin', 'python'),
  ];
  for (const c of cands) if (existsSync(c)) return c;
  return null;
}

function loadDotEnv(p) {
  if (!existsSync(p)) return {};
  const vars = {};
  for (const line of readFileSync(p, 'utf-8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#') || t.indexOf('=') < 0) continue;
    const i = t.indexOf('=');
    vars[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return vars;
}

const HERMES_HOME = resolveHermesHome();
if (!HERMES_HOME) {
  console.error('[bridge:dev] FATAL: HERMES_HOME 未设置且无法自动探测。请设置 HERMES_HOME 环境变量，或确保 ~/AppData/Local/hermes 存在。');
  process.exit(2);
}
const AGENT_ROOT = resolveAgentRoot();
if (!AGENT_ROOT) {
  console.error('[bridge:dev] FATAL: 未找到 hermes-agent（run_agent.py）。请设置 HERMES_AGENT_ROOT。');
  process.exit(2);
}
const venvPy = resolveVenv(AGENT_ROOT);
if (!venvPy) {
  console.error('[bridge:dev] FATAL: 未找到 hermes-agent venv python。请先在 hermes-agent 目录执行 uv sync。');
  process.exit(2);
}

const dotEnvVars = loadDotEnv(join(HERMES_HOME, '.env'));
const bridgePy = join(REPO_ROOT, 'packages', 'server', 'src', 'services', 'hermes', 'bridge', 'kmaster_bridge.py');
if (!existsSync(bridgePy)) {
  console.error('[bridge:dev] FATAL: 未找到 bridge 入口：' + bridgePy);
  process.exit(2);
}

const childEnv = {
  ...process.env,
  ...dotEnvVars,
  HERMES_HOME,
  HERMES_AGENT_ROOT: AGENT_ROOT,
  PYTHONPATH: AGENT_ROOT,
};

console.log('[bridge:dev] HERMES_HOME       = ' + HERMES_HOME);
console.log('[bridge:dev] HERMES_AGENT_ROOT = ' + AGENT_ROOT);
console.log('[bridge:dev] venv python       = ' + venvPy);
console.log('[bridge:dev] .env keys loaded = ' + Object.keys(dotEnvVars).length);
console.log('[bridge:dev] 启动真实 bridge（broker）@ 127.0.0.1:16765 ...  Ctrl+C 退出\n');

const bridgeProc = spawn(venvPy, [bridgePy, '--agent-root', AGENT_ROOT, '--hermes-home', HERMES_HOME], {
  cwd: dirname(bridgePy),
  env: childEnv,
  stdio: ['ignore', 'inherit', 'inherit'],
});

let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  console.log('\n[bridge:dev] 正在停止 bridge ...');
  try { bridgeProc.kill('SIGTERM'); } catch {}
  setTimeout(() => { try { bridgeProc.kill('SIGKILL'); } catch {} process.exit(0); }, 4000);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
bridgeProc.on('exit', (code) => {
  console.error(`[bridge:dev] bridge 进程退出 code=${code}`);
  process.exit(code ?? 0);
});
