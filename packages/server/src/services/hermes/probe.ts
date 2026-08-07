/**
 * probe.ts — /api/hermes/probe 探测逻辑
 *
 * 构建 checks[] 数组并收集 HermesProbe 所有字段。
 * U-01：接入 E2E 连通性门禁（从 verify-bridge-e2e.mjs 移植）
 * U-04：新增 ghostHomeDetected / bridgeMode / bridgeReachable / bridgeIdentity
 *
 * @module services/hermes/probe
 */

import path from 'node:path';
import fs from 'node:fs';
import net from 'node:net';
import { execSync } from 'node:child_process';
import { resolveActiveHermesHome, ghostDetected, ghostInfo } from './env.js';
import { pathAnomalies } from './paths.js';
import { captureBridgeIdentity } from './bridge-identity.js';
import type {
  HermesProbe,
  HermesCheck,
  DegradedSource,
  BridgeIdentity,
} from '../../protocol.js';

// ── 常量 ────────────────────────────────────────────────────────────────

/** kmaster-bridge 默认端口 */
const BRIDGE_PORT = 16765;
const BRIDGE_HOST = '127.0.0.1';

/** E2E 探测超时 */
const PROBE_TIMEOUT_MS = 30_000;

/** E2E 非平凡 prompt */
const E2E_PROMPT = '计算 123+456，只输出最终数字，不要任何解释';
const E2E_EXPECTED = '579';

// ── 辅助 ────────────────────────────────────────────────────────────────

/**
 * 探测 TCP 端口是否可达。
 * 返回 { reachable: boolean, elapsedMs: number }
 */
async function tcpProbe(host: string, port: number, timeoutMs = 3000): Promise<{ reachable: boolean; elapsedMs: number }> {
  const t0 = Date.now();
  return new Promise((resolve) => {
    const s = net.connect({ host, port });
    const done = (reachable: boolean) => {
      try { s.destroy(); } catch {}
      resolve({ reachable, elapsedMs: Date.now() - t0 });
    };
    s.setTimeout(timeoutMs);
    s.on('connect', () => done(true));
    s.on('timeout', () => done(false));
    s.on('error', () => done(false));
  });
}

/**
 * 执行 E2E chat 探测（适配自 verify-bridge-e2e.mjs）。
 * 连接到 bridge 端口，发送非平凡 prompt，验证 completed text 语义正确。
 */
function e2eChatProbe(host: string, port: number, timeoutMs: number): Promise<HermesCheck> {
  const t0 = Date.now();
  return new Promise((resolve) => {
    const s = net.connect({ host, port });
    let buf = '';

    const done = (status: HermesCheck['status'], message: string, detail?: Record<string, unknown>) => {
      try { s.destroy(); } catch {}
      resolve({
        name: 'bridge-e2e-chat',
        status,
        message,
        elapsedMs: Date.now() - t0,
        detail,
      });
    };

    s.setTimeout(timeoutMs);
    s.on('timeout', () => done('fail', `No completed within ${timeoutMs}ms`));
    s.on('error', (e: NodeJS.ErrnoException) => done('fail', `Socket error: ${e.code || e.message}`));

    s.on('connect', () => {
      s.write(JSON.stringify({
        action: 'chat',
        sessionId: 'probe-e2e-' + Date.now(),
        message: E2E_PROMPT,
      }) + '\n');
    });

    s.on('data', (d) => {
      buf += d.toString();
      let i: number;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line) continue;
        let ev: Record<string, unknown>;
        try { ev = JSON.parse(line); } catch { continue; }
        if (ev.type === 'error') {
          done('fail', `Bridge error: ${ev.message || ev.code}`);
          return;
        }
        if (ev.type === 'completed') {
          const text = String(ev.text ?? '').trim();
          if (/^HTTP\s+\d{3}/i.test(text)) {
            done('fail', `Provider HTTP error: ${text}`);
            return;
          }
          if (text.includes(E2E_EXPECTED)) {
            done('pass', `Correct answer "${E2E_EXPECTED}"`, {
              model: ev.model as string,
              outputTokens: (ev as Record<string, unknown>).usage
                ? (ev as Record<string, unknown>).usage as Record<string, unknown>
                : undefined,
            });
          } else {
            done('fail', `Wrong answer (expected "${E2E_EXPECTED}"): ${text}`);
          }
          return;
        }
      }
    });
  });
}

// ── 主入口 ──────────────────────────────────────────────────────────────

/**
 * 构建完整的 HermesProbe 结果。
 *
 * checks[] 顺序（§U-01）：
 *   1. hermes-home-configured — 目录是否存在
 *   2. hermes-config-valid — config.yaml 是否可读
 *   3. hermes-cli-available — hermes CLI 是否可用
 *   4. bridge-port-reachable  — TCP 16765 是否可达
 *   5. bridge-e2e-chat       — 真实对话链路是否可走通（含语义验证）
 */
export async function buildProbe(): Promise<HermesProbe> {
  const checks: HermesCheck[] = [];
  const degradedSources: DegradedSource[] = [];

  const hermesHome = resolveActiveHermesHome();
  const agentDir = process.env.HERMES_AGENT_ROOT || path.resolve(hermesHome, '..', 'hermes-agent');
  const configPath = path.join(hermesHome, 'config.yaml');

  // ── Check 1: hermes-home-configured ──
  const homeExists = (() => {
    try { return fs.existsSync(hermesHome) && fs.statSync(hermesHome).isDirectory(); } catch { return false; }
  })();
  checks.push({
    name: 'hermes-home-configured',
    status: homeExists ? 'pass' : 'fail',
    message: homeExists ? `Found: ${hermesHome}` : `Directory not found: ${hermesHome}`,
    elapsedMs: 0,
  });

  // ── Check 2: hermes-config-valid ──
  const configOk = (() => {
    try { return fs.existsSync(configPath) && fs.statSync(configPath).isFile(); } catch { return false; }
  })();
  checks.push({
    name: 'hermes-config-valid',
    status: configOk ? 'pass' : 'fail',
    message: configOk ? `Readable: ${configPath}` : `Not found: ${configPath}`,
    elapsedMs: 0,
  });

  // ── Check 3: hermes-cli-available ──
  let cliVersion = '';
  let cliOk = false;
  try {
    cliVersion = execSync('hermes --version', { encoding: 'utf8', timeout: 5000 }).trim();
    cliOk = !!cliVersion;
  } catch {
    cliVersion = '';
  }
  checks.push({
    name: 'hermes-cli-available',
    status: cliOk ? 'pass' : 'warn',
    message: cliOk ? cliVersion : 'hermes CLI not found on PATH',
    elapsedMs: 0,
    detail: cliOk ? { version: cliVersion } : undefined,
  });

  // ── Gateway state ──
  let gatewayState: HermesProbe['gatewayState'] = 'unknown';
  let gatewayPid: number | null = null;
  let activeAgents = 0;
  try {
    const gatewayStatePath = path.join(hermesHome, 'gateway_state.json');
    if (fs.existsSync(gatewayStatePath)) {
      const raw = JSON.parse(fs.readFileSync(gatewayStatePath, 'utf8'));
      if (raw.pid) gatewayPid = Number(raw.pid);
      if (raw.active_agents !== undefined) activeAgents = Number(raw.active_agents);
      gatewayState = 'running';
    } else {
      gatewayState = 'stopped';
    }
  } catch {
    gatewayState = 'unknown';
  }

  // ── Bridge mode ──
  const bridgeMockEnv = process.env.HERMES_BRIDGE_MOCK;
  const bridgeMode: HermesProbe['bridgeMode'] =
    bridgeMockEnv === '1' ? 'mock' :
    bridgeMockEnv === '0' ? 'real' :
    'unknown';

  // ── Check 4: bridge-port-reachable ──
  const tcpResult = await tcpProbe(BRIDGE_HOST, BRIDGE_PORT, 3000);
  checks.push({
    name: 'bridge-port-reachable',
    status: tcpResult.reachable ? 'pass' : 'fail',
    message: tcpResult.reachable
      ? `Port ${BRIDGE_PORT} reachable`
      : `Port ${BRIDGE_PORT} not reachable`,
    elapsedMs: tcpResult.elapsedMs,
  });

  // ── Check 5: bridge-e2e-chat ──
  if (tcpResult.reachable) {
    const e2eResult = await e2eChatProbe(BRIDGE_HOST, BRIDGE_PORT, PROBE_TIMEOUT_MS);
    checks.push(e2eResult);
  } else {
    checks.push({
      name: 'bridge-e2e-chat',
      status: 'skipped',
      message: 'Skipped: bridge port not reachable',
      elapsedMs: 0,
    });
  }

  // ── Check 6: mcp-npx-on-windows (U-37) ──
  const hasNpxOnWindows = (() => {
    if (process.platform !== 'win32') return false;
    try {
      const cfgPath = path.join(hermesHome, 'config.yaml');
      if (!fs.existsSync(cfgPath)) return false;
      const yaml = require('js-yaml');
      const raw = fs.readFileSync(cfgPath, 'utf8');
      const config = yaml.load(raw) as Record<string, unknown>;
      const mcpBlock = config.mcp_servers as Record<string, Record<string, unknown>> ?? {};
      return Object.values(mcpBlock).some(
        (s) => s?.command === 'npx' || s?.command === 'npx.cmd'
      );
    } catch { return false; }
  })();
  checks.push({
    name: 'mcp-npx-on-windows',
    status: hasNpxOnWindows ? 'warn' : 'pass',
    message: hasNpxOnWindows
      ? 'MCP uses npx.cmd on Windows — CMD banner may pollute stdio JSONRPC'
      : 'No npx-based MCP detected',
    elapsedMs: 0,
  });

  // ── Bridge identity ──
  const bridgeIdentity: BridgeIdentity | undefined = tcpResult.reachable
    ? captureBridgeIdentity()
    : undefined;

  const bridgeReachable = tcpResult.reachable;

  // ── Ghost home ──
  const ghost = ghostDetected();
  const gInfo = ghostInfo();

  // ── Degraded sources: 若 hermes home 不可用，标记回退 ──
  if (!homeExists || !configOk) {
    degradedSources.push({
      source: 'hermes',
      reason: homeExists ? 'config.yaml not found' : 'hermes home not found',
      fallback: 'static snapshots',
    });
  }

  return {
    configured: homeExists && configOk,
    hermesHome,
    agentDir,
    configPath,
    gatewayState,
    gatewayPid,
    activeAgents,
    hermesVersion: cliVersion,
    ghostHomeDetected: ghost,
    bridgeMode,
    bridgeReachable,
    bridgeIdentity,
    checks,
    degradedSources,
    pathAnomalies: pathAnomalies.map((a) => ({
      type: a.type,
      raw: a.raw,
      normalized: a.normalized,
      detectedAt: a.detectedAt,
    })),
  };
}
