#!/usr/bin/env node
/**
 * verify-bridge-e2e.mjs
 *
 * End-to-end verification of the kmaster-bridge ⇄ hermes-agent chat chain.
 *
 *   node scripts/verify-bridge-e2e.mjs
 *
 * What it does:
 *  1. Auto-detect HERMES_HOME / HERMES_AGENT_ROOT / venv python.
 *  2. Source $HERMES_HOME/.env for API keys.
 *  3. Start the kmaster-bridge (broker) as a child process.
 *  4. Wait for the bridge to listen on 127.0.0.1:16765.
 *  5. Send a non-trivial chat prompt and validate a correct, real answer
 *     (NOT an HTTP error, NOT empty).
 *  6. Clean up the bridge process.
 *
 * Exit codes:
 *   0 — bridge chat produced a semantically correct completed response.
 *   1 — bridge could not start or the chat was not completed / was wrong.
 *   2 — pre-flight check failed (missing HERMES_HOME, .env, venv, etc.).
 */

import { spawn, execSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';

// ──────────────────────────────────────────────────────────────────────
// Configuration
// ──────────────────────────────────────────────────────────────────────

const BRIDGE_PORT = 16765;
const BRIDGE_HOST = '127.0.0.1';
const BRIDGE_LISTEN_TIMEOUT_MS = 30_000;
const CHAT_TIMEOUT_MS = 120_000;
const CLEANUP_TIMEOUT_MS = 5_000;

/** Non-trivial prompt with a verifiable factual answer. */
const PROMPT = '计算 123+456，只输出最终数字，不要任何解释';
const EXPECTED = '579';

// ──────────────────────────────────────────────────────────────────────
// Environment auto-detection
// ──────────────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

function resolveHermesHome() {
  const fromEnv = process.env.HERMES_HOME;
  if (fromEnv) return fromEnv;

  // Platform-specific default
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
  const fromEnv = process.env.HERMES_AGENT_ROOT;
  if (fromEnv) return fromEnv;

  // Try a few likely locations relative to the repo
  const candidates = [
    // Most common: hermes-agent alongside hermes home dir (Windows AppData)
    join(process.env.HERMES_HOME || join(process.env.USERPROFILE || '', 'AppData', 'Local', 'hermes'), 'hermes-agent'),
    // If HERMES_HOME not set, try common AppData paths
    join(process.env.USERPROFILE || '', 'AppData', 'Local', 'hermes', 'hermes-agent'),
    join(process.env.HOME || '', '.hermes', 'hermes-agent'),
    // Repo-relative (developer layout)
    join(REPO_ROOT, '..', 'hermes-agent'),
    join(REPO_ROOT, '..', '..', 'hermes-agent'),
    // Home directories
    join(process.env.HOME || '', 'Documents', 'Projects', 'hermes-agent'),
    join(process.env.USERPROFILE || '', 'Documents', 'Projects', 'hermes-agent'),
  ];
  for (const c of candidates) {
    if (existsSync(join(c, 'run_agent.py'))) return c;
  }
  return null;
}

function resolveVenvPython(agentRoot) {
  if (!agentRoot) return null;
  const candidates = [
    join(agentRoot, 'venv', 'Scripts', 'python.exe'),      // Windows (uv sync default)
    join(agentRoot, '.venv', 'Scripts', 'python.exe'),      // Windows (legacy uv)
    join(agentRoot, 'venv', 'bin', 'python3'),               // Unix
    join(agentRoot, '.venv', 'bin', 'python3'),
    join(agentRoot, 'venv', 'bin', 'python'),
    join(agentRoot, '.venv', 'bin', 'python'),
  ];
  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

/**
 * Parse a KEY=VALUE .env file and return a plain object.
 * Ignores blank lines, comments, and lines without '='.
 */
function loadDotEnv(path) {
  if (!existsSync(path)) {
    console.error('[verify] .env not found: ' + path);
    console.error('[verify] API keys will NOT be available. Run: source ' + path);
    return {};
  }
  const vars = {};
  const content = readFileSync(path, 'utf-8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (key) vars[key] = val;
  }
  return vars;
}

// ──────────────────────────────────────────────────────────────────────
// Utility helpers
// ──────────────────────────────────────────────────────────────────────

function waitForPort(host, port, timeoutMs) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      const s = net.connect({ host, port });
      s.on('connect', () => {
        s.destroy();
        resolve();
      });
      s.on('error', () => {
        s.destroy();
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`port ${host}:${port} not listening after ${timeoutMs}ms`));
        } else {
          setTimeout(check, 300);
        }
      });
    };
    check();
  });
}

function chatE2E(host, port, prompt, timeoutMs) {
  return new Promise((resolve) => {
    const s = net.connect({ host, port });
    let buf = '';
    const events = [];
    const t0 = Date.now();

    const done = (verdict, detail) => {
      try { s.destroy(); } catch {}
      resolve({ verdict, detail, elapsed: Date.now() - t0, events });
    };

    s.setTimeout(timeoutMs);
    s.on('timeout', () => done('FAIL', 'TIMEOUT — no completed within ' + timeoutMs + 'ms'));
    s.on('error', (e) => done('FAIL', 'SOCKET ERROR ' + e.code));
    s.on('close', () => done('FAIL', 'CLOSED by peer before completed'));

    s.on('connect', () => {
      s.write(JSON.stringify({
        action: 'chat',
        sessionId: 'verify-' + Date.now(),
        message: prompt,
      }) + '\n');
    });

    s.on('data', (d) => {
      buf += d.toString();
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line) continue;
        let ev;
        try { ev = JSON.parse(line); } catch { continue; }
        events.push(ev.type);
        if (ev.type === 'error') {
          done('FAIL', 'BRIDGE ERROR: ' + (ev.message || ev.code));
          return;
        }
        if (ev.type === 'completed') {
          const text = (ev.text || '').trim();
          // Reject HTTP errors masquerading as completed
          if (/^HTTP\s+\d{3}/i.test(text)) {
            done('FAIL', 'Provider HTTP error: ' + text);
            return;
          }
          // Verify semantic correctness
          if (text.includes(EXPECTED)) {
            done('PASS', 'Correct answer "' + EXPECTED + '"');
          } else {
            done('FAIL', 'Wrong answer (expected "' + EXPECTED + '"): ' + text);
          }
          return;
        }
      }
    });
  });
}

// ──────────────────────────────────────────────────────────────────────
// Main pipeline
// ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('[verify] === kmaster-bridge end-to-end verification ===\n');

  // -- Pre-flight ------------------------------------------------------
  const HERMES_HOME = resolveHermesHome();
  if (!HERMES_HOME) {
    console.error('[verify] FATAL: HERMES_HOME not set and not auto-detectable.');
    console.error('[verify]   Set HERMES_HOME=C:\\Users\\...\\AppData\\Local\\hermes or ensure ~/.hermes exists.');
    process.exit(2);
  }
  console.log('[verify] HERMES_HOME = ' + HERMES_HOME);

  const AGENT_ROOT = resolveAgentRoot();
  if (!AGENT_ROOT) {
    console.error('[verify] FATAL: HERMES_AGENT_ROOT not set and hermes-agent not found near repo.');
    console.error('[verify]   Set HERMES_AGENT_ROOT or clone hermes-agent alongside kmaster-studio.');
    process.exit(2);
  }
  console.log('[verify] HERMES_AGENT_ROOT = ' + AGENT_ROOT);

  const venvPy = resolveVenvPython(AGENT_ROOT);
  if (!venvPy) {
    console.error('[verify] FATAL: hermes-agent venv python not found.');
    console.error('[verify]   Run: cd ' + AGENT_ROOT + ' && uv sync');
    process.exit(2);
  }
  console.log('[verify] venv python = ' + venvPy);

  const dotEnvPath = join(HERMES_HOME, '.env');
  console.log('[verify] .env path = ' + dotEnvPath + ' (exists=' + existsSync(dotEnvPath) + ')');

  const bridgePy = join(__dirname, '..', 'packages', 'server', 'src', 'services', 'hermes', 'bridge', 'kmaster_bridge.py');
  if (!existsSync(bridgePy)) {
    console.error('[verify] FATAL: bridge entry not found at ' + bridgePy);
    process.exit(2);
  }

  // -- Load .env -------------------------------------------------------
  const dotEnvVars = loadDotEnv(dotEnvPath);
  const apiKeyVars = Object.keys(dotEnvVars).filter(k => k.endsWith('_API_KEY') || k.endsWith('_KEY'));
  console.log('[verify] .env loaded: ' + Object.keys(dotEnvVars).length + ' variables, ' + apiKeyVars.length + ' API keys');
  if (apiKeyVars.length === 0) {
    console.error('[verify] WARNING: No API keys found in .env. Provider calls will fail.');
  }

  // Build child-process env
  const childEnv = {
    ...process.env,
    ...dotEnvVars,
    HERMES_HOME,
    HERMES_AGENT_ROOT: AGENT_ROOT,
    PYTHONPATH: AGENT_ROOT,
  };

  // -- Start bridge ----------------------------------------------------
  console.log('[verify] Starting bridge...');
  const bridgeProc = spawn(venvPy, [
    bridgePy,
    '--agent-root', AGENT_ROOT,
    '--hermes-home', HERMES_HOME,
  ], {
    cwd: dirname(bridgePy),
    env: childEnv,
    stdio: ['ignore', 'inherit', 'inherit'], // worker logs → script stderr
  });

  let bridgeCrashed = false;
  bridgeProc.on('exit', (code) => {
    if (!bridgeCrashed) {
      bridgeCrashed = true;
      console.error('[verify] Bridge exited unexpectedly with code ' + code);
    }
  });

  // -- Wait for listener -----------------------------------------------
  let portReady = false;
  try {
    await waitForPort(BRIDGE_HOST, BRIDGE_PORT, BRIDGE_LISTEN_TIMEOUT_MS);
    portReady = true;
    console.log('[verify] Bridge listening on ' + BRIDGE_HOST + ':' + BRIDGE_PORT);
  } catch (err) {
    console.error('[verify] ' + err.message);
    console.error('[verify] Hint: check that $HERMES_HOME/.env has API keys and that the venv is built (uv sync).');
    cleanup(bridgeProc, 1);
  }

  // -- Chat probe ------------------------------------------------------
  console.log('[verify] Sending probe prompt: ' + PROMPT);
  const result = await chatE2E(BRIDGE_HOST, BRIDGE_PORT, PROMPT, CHAT_TIMEOUT_MS);

  console.log('[verify]');
  console.log('[verify] Result: ' + result.verdict);
  console.log('[verify] Detail: ' + result.detail);
  console.log('[verify] Elapsed: ' + result.elapsed + 'ms, events: ' + result.events.length);

  // -- Cleanup ---------------------------------------------------------
  cleanup(bridgeProc, result.verdict === 'PASS' ? 0 : 1);
}

function cleanup(bridgeProc, exitCode) {
  console.log('[verify] Stopping bridge...');
  if (bridgeProc && !bridgeProc.killed) {
    bridgeProc.kill('SIGTERM');
    setTimeout(() => {
      try { bridgeProc.kill('SIGKILL'); } catch {}
    }, CLEANUP_TIMEOUT_MS);
  }
  // Also kill any orphaned worker on the same port group
  try {
    if (process.platform === 'win32') {
      execSync('taskkill //F //PID $(netstat -ano | findstr ":' + BRIDGE_PORT + '.*LISTENING" | awk "{print $5}")' + ' 2>nul', { stdio: 'ignore' });
    }
  } catch {}
  setTimeout(() => process.exit(exitCode), 500);
}

main().catch((err) => {
  console.error('[verify] Unhandled error:', err);
  process.exit(1);
});
