/**
 * bridge-identity.ts — Bridge 身份信息抓取（进程级 PID / endpoint / python 路径）
 *
 * 用于 /api/hermes/probe 的 bridgeIdentity 字段。
 *
 * @module services/hermes/bridge-identity
 */

import { execSync } from 'node:child_process';
import type { BridgeIdentity } from '../../protocol.js';

// ── 端口常量 ────────────────────────────────────────────────────────────

const BRIDGE_PORT = 16765;
const WORKER_PORT_RANGE_START = 17567;

/**
 * 通过 netstat 抓取指定端口的监听 PID。
 * 仅用于诊断报告，容错：任何步骤失败都返回 null。
 */
function pidOnPort(port: number): number | null {
  try {
    if (process.platform === 'win32') {
      const out = execSync(
        `netstat -ano | findstr ":${port} " | findstr "LISTENING"`,
        { encoding: 'utf8', timeout: 3000 },
      );
      const m = out.match(/(\d+)\s*$/m);
      if (m) return parseInt(m[1], 10);
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * 抓取当前 bridge 的身份信息。
 *
 * 在 broker 启动后将 worker PID / endpoint 写入已知端口监听表，
 * 此函数读取该表构建 BridgeIdentity。
 */
export function captureBridgeIdentity(): BridgeIdentity {
  const brokerPid = pidOnPort(BRIDGE_PORT);
  const workerPid = pidOnPort(WORKER_PORT_RANGE_START);

  return {
    brokerPid,
    workerPid,
    workerEndpoint: workerPid ? `tcp://127.0.0.1:${WORKER_PORT_RANGE_START}` : null,
    pythonExe: process.env.HERMES_PYTHON ?? null,
  };
}
