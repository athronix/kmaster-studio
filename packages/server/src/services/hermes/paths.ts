/**
 * paths.ts — Hermes 路径归一化工具
 *
 * 处理 MSYS / WSL / UNC / 正常 Windows 四类路径形态，
 * 检测幽灵（ghost）路径，避免对话数据写入错误的 state.db。
 *
 * @module services/hermes/paths
 */

import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

// ── 类型 ────────────────────────────────────────────────────────────────

/** 路径归一化结果 */
export interface NormalizedPath {
  /** 最终可用的原生 Windows 路径 */
  normalized: string;
  /** 是否检测到幽灵路径 */
  ghostDetected: boolean;
  /** 原始幽灵路径（如有） */
  ghostPath?: string;
  /** 幽灵目录下 state.db 的绝对路径（如存在） */
  ghostDbPath?: string;
}

/** 路径异常记录 */
export interface PathAnomaly {
  type: 'posix_on_windows' | 'wsl_interop' | 'unc_prefix';
  raw: string;
  normalized: string;
  detectedAt: number; // Date.now()
}

// ── 全局异常记录 ────────────────────────────────────────────────────────

/** 进程生命周期内检测到的所有路径异常（用于 /api/hermes/probe 回报） */
export const pathAnomalies: PathAnomaly[] = [];

// ── 核心函数 ────────────────────────────────────────────────────────────

/**
 * 归一化 hermes 主目录路径，识别并修正幽灵形态。
 *
 * 幽灵判定标准（来自 §1.8）：
 *   - POSIX-on-Windows：以 `/c/` 或 `/d/` 等开头的路径（MSYS 未改写）
 *   - WSL 互操作：包含 `\\wsl$\` 的路径
 *
 * 幽灵目录下若存在 `state.db`，说明已经有对话数据写入了错误位置，
 * 需要在 UI 中提示用户处置（迁移或放弃）。
 *
 * @param raw - process.env.HERMES_HOME 或其他来源的原始路径字符串
 * @returns 归一化结果（含 ghostDetected / ghostPath / ghostDbPath）
 */
export function normalizeHostPath(raw: string): NormalizedPath {
  const trimmed = raw.trim();
  const result: NormalizedPath = { normalized: trimmed, ghostDetected: false };

  if (!trimmed) return result;

  // ── POSIX-on-Windows ghost: /c/Users/... ──
  // MSYS/MinGW 环境下的 POSIX 路径未被改写成 Windows 形态，
  // 直接拼接到 node:path 会变成当前盘符下的相对路径（如 C:\c\Users\...）
  if (process.platform === 'win32' && /^\/[a-zA-Z]\//.test(trimmed)) {
    const drive = trimmed[1].toUpperCase();
    const rest = trimmed.slice(2);
    const winPath = path.normalize(`${drive}:${rest}`);

    result.ghostDetected = true;
    result.ghostPath = trimmed;
    result.normalized = winPath;

    // 检查幽灵目录下是否存在 state.db（说明已有数据写入了错误位置）
    try {
      const ghostDb = path.join(trimmed, 'state.db');
      if (fs.existsSync(ghostDb)) {
        result.ghostDbPath = ghostDb;
      }
    } catch { /* 探测失败不阻塞 */ }

    // 记录异常
    pathAnomalies.push({
      type: 'posix_on_windows',
      raw: trimmed,
      normalized: winPath,
      detectedAt: Date.now(),
    });

    return result;
  }

  // ── WSL 互操作 ghost: \\wsl$\Ubuntu\... ──
  // WSL 文件系统路径，node 在 Windows 上可读写但语义上不应作为 hermes home
  if (/^\\\\wsl\$/i.test(trimmed)) {
    result.ghostDetected = true;
    result.ghostPath = trimmed;
    // WSL 路径无法自动转换为 Windows 路径，保留原始值
    // 调用方应据此提示用户手动设置 HERMES_HOME

    pathAnomalies.push({
      type: 'wsl_interop',
      raw: trimmed,
      normalized: trimmed, // 无法自动修正
      detectedAt: Date.now(),
    });

    return result;
  }

  // ── UNC 前缀: \\?\C:\Users\... → C:\Users\... ──
  if (/^\\\\\?\\/.test(trimmed)) {
    const stripped = trimmed.slice(4);
    result.normalized = path.normalize(stripped);

    pathAnomalies.push({
      type: 'unc_prefix',
      raw: trimmed,
      normalized: result.normalized,
      detectedAt: Date.now(),
    });

    return result;
  }

  // ── 正常路径：直接 normalize ──
  result.normalized = path.normalize(trimmed);
  return result;
}

/**
 * 解析 hermes 主目录的默认值（不涉及 HERMES_HOME 环境变量）。
 * 用于 resolveActiveHermesHome 的内部回落。
 */
export function defaultHermesHome(): string {
  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA;
    if (localAppData) {
      const candidate = path.join(localAppData, 'hermes');
      try {
        if (fs.existsSync(candidate)) return candidate;
      } catch { /* 探测失败则继续回退 */ }
    }
  }
  return path.join(os.homedir(), '.hermes');
}
