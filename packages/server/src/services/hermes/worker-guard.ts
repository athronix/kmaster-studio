/**
 * worker-guard.ts — 孤儿 worker 治理（U-30）
 *
 * 追踪 bridge 启动/停止时的 worker PID，在 gateway 退出后清理残留 worker。
 *
 * 核心策略：
 *   1. bridge 启动时记录 broker PID + worker PID
 *   2. server 退出时遍历 registered pids，kill 仍存活的进程
 *   3. 定期（每 30s）检查 worker 是否仍在，若 broker 已死但 worker 存活 → 清理
 *
 * @module services/hermes/worker-guard
 */

import { execSync } from 'node:child_process';
import { EventEmitter } from 'node:events';

// ── 类型 ────────────────────────────────────────────────────────────────

export interface GuardedProcess {
  pid: number;
  role: 'broker' | 'worker';
  startedAt: number;
  endpoint?: string;
}

// ── 状态 ────────────────────────────────────────────────────────────────

const guarded: GuardedProcess[] = [];
const emitter = new EventEmitter();

// ── 注册 / 注销 ────────────────────────────────────────────────────────

/** 注册 bridge/worker 进程 */
export function registerProcess(p: GuardedProcess): void {
  // 去重（同 PID 不重复记）
  if (guarded.some((g) => g.pid === p.pid)) return;
  guarded.push(p);
}

/** 注销已停止的进程 */
export function unregisterProcess(pid: number): void {
  const idx = guarded.findIndex((g) => g.pid === pid);
  if (idx >= 0) guarded.splice(idx, 1);
}

/** 获取当前追踪的进程列表 */
export function guardedProcesses(): ReadonlyArray<GuardedProcess> {
  return guarded;
}

// ── 进程存活检测 ────────────────────────────────────────────────────────

/** 检查 PID 是否仍在运行 */
function isAlive(pid: number): boolean {
  try {
    if (process.platform === 'win32') {
      const out = execSync(`tasklist /fi "PID eq ${pid}" /fo csv`, {
        encoding: 'utf8', timeout: 2000,
      });
      return out.includes(`"${pid}"`);
    }
    // Unix: kill(pid, 0)
    try { process.kill(pid, 0); return true; } catch { return false; }
  } catch {
    return false;
  }
}

/** 杀死进程（尽力） */
function killPid(pid: number): boolean {
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill //F //PID ${pid}`, { stdio: 'ignore', timeout: 3000 });
    } else {
      process.kill(pid, 'SIGKILL');
    }
    return true;
  } catch {
    return false;
  }
}

// ── 清理逻辑 ────────────────────────────────────────────────────────────

/**
 * 清理所有孤儿 worker：
 *   1. 遍历 guarded，kill 所有仍在运行的 worker
 *   2. 如果有 broker 存活，worker 可能被 broker 管理 → 先 kill broker，再清 worker
 *
 * 返回被清理的 PID 数量。
 */
export function cleanupOrphans(): number {
  let cleaned = 0;
  const snapshot = [...guarded];

  // 先 kill brokers（这会触发 broker 自身清理 worker）
  for (const g of snapshot.filter((g) => g.role === 'broker')) {
    if (isAlive(g.pid)) {
      if (killPid(g.pid)) {
        unregisterProcess(g.pid);
        cleaned++;
      }
    } else {
      unregisterProcess(g.pid);
    }
  }

  // 再清残留 worker
  for (const g of snapshot.filter((g) => g.role === 'worker')) {
    if (isAlive(g.pid)) {
      if (killPid(g.pid)) {
        unregisterProcess(g.pid);
        cleaned++;
      }
    } else {
      unregisterProcess(g.pid);
    }
  }

  if (cleaned > 0) {
    emitter.emit('cleanup', { cleaned });
  }
  return cleaned;
}

/** 订阅清理事件 */
export function onCleanup(fn: (info: { cleaned: number }) => void): void {
  emitter.on('cleanup', fn);
}

// ── 守护（定时巡检） ────────────────────────────────────────────────────

let _guardInterval: ReturnType<typeof setInterval> | null = null;

/**
 * 启动定时巡检（每 30s 检查一次孤儿）。
 * 如果 broker 已死但 worker 还在 → 自动清理。
 */
export function startGuard(): void {
  if (_guardInterval) return;
  _guardInterval = setInterval(() => {
    const snapshot = [...guarded];
    const brokers = snapshot.filter((g) => g.role === 'broker');
    const workers = snapshot.filter((g) => g.role === 'worker');

    // broker 全死但 worker 还活着 → 孤儿
    const allBrokersDead = brokers.every((b) => !isAlive(b.pid));
    if (allBrokersDead && workers.length > 0) {
      for (const w of workers) {
        if (isAlive(w.pid)) {
          killPid(w.pid);
          unregisterProcess(w.pid);
        }
      }
    }
  }, 30_000);

  // 进程退出时兜底清理
  if (!_exitHookInstalled) {
    _exitHookInstalled = true;
    process.on('exit', () => cleanupOrphans());
  }
}

/** 停止巡检 */
export function stopGuard(): void {
  if (_guardInterval) {
    clearInterval(_guardInterval);
    _guardInterval = null;
  }
}

let _exitHookInstalled = false;
