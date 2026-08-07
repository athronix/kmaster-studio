/**
 * env.ts — Hermes 环境解析统一入口（U-20 + U-03）
 *
 * 所有 hermes 路径解析必须经由此模块，🚫 禁止各处自行读 `process.env.HERMES_HOME`。
 *
 * 提供：
 *   - normalizeHostPath() — 路径幽灵检测与修正（委托给 paths.ts）
 *   - resolveActiveHermesHome() — 唯一 hermes 主目录解析入口（含幽灵检测 + profile）
 *   - readActiveProfileName() — 当前激活的 profile 名
 *   - hermesChildEnv() — 子进程环境（显式注入 HERMES_HOME）
 *
 * @module services/hermes/env
 */

import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { normalizeHostPath, defaultHermesHome, pathAnomalies } from './paths.js';
import type { NormalizedPath, PathAnomaly } from './paths.js';

// ── 常量 ────────────────────────────────────────────────────────────────

export const DEFAULT_PROFILE = 'default';
const ACTIVE_PROFILE_FILE = 'active_profile';
const PROFILES_DIR = 'profiles';

// ── 缓存 ────────────────────────────────────────────────────────────────

/** 进程内记忆缓存：避免每次解析都读盘 */
let activeHomeMemo: { root: string; active: string; home: string } | null = null;

// ── 幽灵检测结果缓存 ────────────────────────────────────────────────────

let _ghostDetected = false;
let _ghostPath: string | undefined;
let _ghostDbPath: string | undefined;

// ── 导出 ────────────────────────────────────────────────────────────────

export { pathAnomalies };
export type { NormalizedPath, PathAnomaly };

// ── 核心：resolveHermesRoot ─────────────────────────────────────────────

/**
 * hermes 根目录（profile 枚举锚点）。
 * 优先级：HERMES_HOME 环境变量 → LOCALAPPDATA/hermes（Windows）→ ~/.hermes
 *
 * ⚠️ 这是 U-20 切入的第一点：在读取环境变量后立即做幽灵检测。
 */
function resolveHermesRoot(): string {
  const env = process.env.HERMES_HOME;
  if (env && env.trim()) {
    const result = normalizeHostPath(env.trim());
    _ghostDetected = result.ghostDetected;
    _ghostPath = result.ghostPath;
    _ghostDbPath = result.ghostDbPath;
    return result.normalized;
  }
  return defaultHermesHome();
}

/**
 * 查询当前是否检测到幽灵路径。
 * 在 resolveHermesRoot() 被调用后有效。
 */
export function ghostDetected(): boolean {
  return _ghostDetected;
}

/**
 * 获取幽灵路径详情。
 */
export function ghostInfo(): { ghostPath?: string; ghostDbPath?: string } {
  return { ghostPath: _ghostPath, ghostDbPath: _ghostDbPath };
}

// ── Profile 支持 ────────────────────────────────────────────────────────

/**
 * 读取当前激活的 profile 名。
 * `<root>/active_profile` 文件不存在 / 为空 / 读失败 → 回落 'default'。
 */
export function readActiveProfileName(root?: string): string {
  const r = root ?? resolveHermesRoot();
  const file = path.join(r, ACTIVE_PROFILE_FILE);
  try {
    if (!fs.existsSync(file)) return DEFAULT_PROFILE;
    const raw = fs.readFileSync(file, 'utf8').trim();
    return raw || DEFAULT_PROFILE;
  } catch {
    return DEFAULT_PROFILE;
  }
}

/**
 * 子进程真正该用的 hermes 主目录（唯一解析入口）。
 *
 * 逻辑：
 *   1. 解析根目录（含幽灵检测）
 *   2. 读取 active_profile
 *   3. active === 'default' → root
 *      active !== 'default' → root/profiles/<active>（若目录存在）
 *   4. 缓存结果
 *
 * @returns 归一化后的原生 Windows 路径
 */
export function resolveActiveHermesHome(): string {
  const root = resolveHermesRoot();
  const active = readActiveProfileName(root);
  if (activeHomeMemo && activeHomeMemo.root === root && activeHomeMemo.active === active) {
    return activeHomeMemo.home;
  }
  let home = root;
  if (active !== DEFAULT_PROFILE) {
    const candidate = path.join(root, PROFILES_DIR, active);
    try {
      if (fs.existsSync(candidate)) home = candidate;
    } catch { /* 探测失败保守回落 root */ }
  }
  // 确保 home 也经过 normalize（profile 子目录本身不会被幽灵污染，但保留归一化）
  home = path.normalize(home);
  activeHomeMemo = { root, active, home };
  return home;
}

/**
 * 使缓存失效（profile 切换后调用）。
 */
export function invalidateHermesCaches(): void {
  activeHomeMemo = null;
  _ghostDetected = false;
  _ghostPath = undefined;
  _ghostDbPath = undefined;
}

// ── Q-10 三件套 ────────────────────────────────────────────────────────

/**
 * Q-10.1：显式传递 bridge 启动参数
 *
 * 构建 bridge Python 子进程所需的环境变量和 CLI 参数，
 * 禁止依赖两侧各自 `_find_agent_root()` 自动发现。
 *
 * @param agentRoot - hermes-agent 源码根目录路径
 * @param hermesHome - 可选覆盖 HERMES_HOME（默认用 resolveActiveHermesHome()）
 */
export function bridgeSpawnEnv(agentRoot: string, hermesHome?: string): NodeJS.ProcessEnv {
  const home = hermesHome ?? resolveActiveHermesHome();
  return {
    ...process.env,
    HERMES_HOME: home,
    HERMES_AGENT_ROOT: agentRoot,
    PYTHONPATH: agentRoot,
  };
}

/**
 * Q-10.2：两侧 hermes 路径一致性断言
 *
 * 对比 bridge（Python 侧）与 kmaster（Node 侧）对 hermes 路径的三元组：
 *   { hermesHome, agentDir, activeProfile }
 *
 * - profile 为 null 时仅比较 hermesHome + agentDir
 * - 不一致时返回 warning 消息（不 crash，不阻塞启动）
 *
 * @param python - Python bridge 侧返回的路径信息
 * @param node - Node 侧的路径信息
 */
export interface BridgeConsistency {
  hermesHome: string;
  agentDir: string;
  activeProfile?: string | null;
}

export function assertBridgeConsistency(
  python: BridgeConsistency,
  node: BridgeConsistency,
): string | null {
  const mismatches: string[] = [];

  if (python.hermesHome !== node.hermesHome) {
    mismatches.push(`hermesHome: node="${node.hermesHome}" vs python="${python.hermesHome}"`);
  }
  if (python.agentDir !== node.agentDir) {
    mismatches.push(`agentDir: node="${node.agentDir}" vs python="${python.agentDir}"`);
  }
  // profile 为 null 时跳过对比
  if (
    python.activeProfile !== null && python.activeProfile !== undefined &&
    node.activeProfile !== null && node.activeProfile !== undefined &&
    python.activeProfile !== node.activeProfile
  ) {
    mismatches.push(`activeProfile: node="${node.activeProfile}" vs python="${python.activeProfile}"`);
  }

  if (mismatches.length === 0) return null;
  return `[WARNING] hermes path mismatch: ${mismatches.join('; ')}`;
}

// ── 子进程环境 ──────────────────────────────────────────────────────────

/**
 * 所有 hermes 子进程（python / hermes CLI）的环境：
 * 继承 process.env 并显式覆盖 HERMES_HOME。
 *
 * 🚫 任何新增 spawn 都不得再直接用 process.env。
 */
export function hermesChildEnv(): NodeJS.ProcessEnv {
  return { ...process.env, HERMES_HOME: resolveActiveHermesHome() };
}

// ── U-24：Profile 切换 → Bridge 重建标记 ───────────────────────────────

let _bridgeRestartRequested = false;

/** 标记需要重启 bridge（profile 切换后调用） */
export function requestBridgeRestart(): void {
  _bridgeRestartRequested = true;
}

/** 检查并清除重启标记 */
export function consumeBridgeRestartFlag(): boolean {
  const v = _bridgeRestartRequested;
  _bridgeRestartRequested = false;
  return v;
}
