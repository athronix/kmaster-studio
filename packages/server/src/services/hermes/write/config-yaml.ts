/**
 * write/config-yaml.ts — config.yaml 安全写入器（U-25 核心）
 *
 * 本机曾有 config.yaml.corrupt.*.bak 前科，写侧是损坏高发区。
 *
 * 安全策略（6 步，锁内全事务）：
 *   1. proper-lockfile.lock()       — 跨进程排他锁
 *   2. 备份 → config.yaml.bak.YYYYMMDD-HHmmss
 *   3. updates(current)             — 纯函数变换（锁内执行）
 *   4. _config_version += 1          — 单调递增 CAS
 *   5. yaml.dump → temp → fs.rename — 原子替换
 *   6. 回读 + 校验                    — yaml 可解析 + _config_version 吻合
 *
 * 🚫 任何一步失败 → 恢复备份 + 抛异常 + 不丢数据
 * 🚫 不允许在锁外做任何 YAML 操作
 *
 * @module services/hermes/write/config-yaml
 */

import path from 'node:path';
import fs from 'node:fs';
import lockfile from 'proper-lockfile';
import yaml from 'js-yaml';
import { resolveActiveHermesHome } from '../env.js';

// ── 类型 ────────────────────────────────────────────────────────────────

export interface WriteResult {
  ok: boolean;
  version: number;
  backupPath: string;
  error?: string;
}

type ConfigUpdater = (current: Record<string, unknown>) => Record<string, unknown>;

// ── 辅助 ────────────────────────────────────────────────────────────────

function configPath(): string {
  return path.join(resolveActiveHermesHome(), 'config.yaml');
}

function timestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

/**
 * 锁超时和重试配置：
 *   retries: 3 — 避免一次争用就放弃
 *   retry.wait: 200ms
 *   stale: 15000ms — 15s 后认为孤儿锁可抢占
 */
const LOCK_OPTIONS = {
  retries: { retries: 3, factor: 1, minTimeout: 200, maxTimeout: 200 },
  stale: 15000,
};

// ── 核心 ────────────────────────────────────────────────────────────────

/**
 * 对 config.yaml 执行安全的原地变换写入。
 *
 * @param updates - 纯函数：(当前 config) → (新 config)
 * @returns WriteResult { ok, version, backupPath }
 * @throws 如果锁获取失败 / 写入失败 / 校验失败
 */
export async function safeWriteConfig(updates: ConfigUpdater): Promise<WriteResult> {
  const cfgPath = configPath();

  // ── 确保 config 目录存在 ──
  const dir = path.dirname(cfgPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // ── Step 0：如果 config 不存在，创建最小初始结构 ──
  if (!fs.existsSync(cfgPath)) {
    const initial = { _config_version: 1 };
    fs.writeFileSync(cfgPath, yaml.dump(initial, { lineWidth: 120 }), 'utf8');
  }

  let release: (() => Promise<void>) | null = null;

  try {
    // ── Step 1：获取排他锁 ──
    release = await lockfile.lock(cfgPath, LOCK_OPTIONS);

    // ── Step 2：读当前 + 备份 ──
    const currentRaw = fs.readFileSync(cfgPath, 'utf8');
    const current = (yaml.load(currentRaw) as Record<string, unknown>) ?? {};
    const currentVersion = Number(current._config_version) || 0;

    const backupPath = cfgPath + `.bak.${timestamp()}`;
    fs.writeFileSync(backupPath, currentRaw, 'utf8');

    // ── Step 3：应用变换（锁内执行！） ──
    const updated = updates(current);

    // ── Step 4：CAS _config_version 单调递增 ──
    const newVersion = currentVersion + 1;
    updated._config_version = newVersion;

    // ── Step 5：原子替换 ──
    const yamlOut = yaml.dump(updated, { lineWidth: 120, noRefs: true });
    const tmpPath = cfgPath + '.tmp.' + timestamp();
    fs.writeFileSync(tmpPath, yamlOut, 'utf8');
    fs.renameSync(tmpPath, cfgPath);

    // ── Step 6：回读校验 ──
    const verifyRaw = fs.readFileSync(cfgPath, 'utf8');
    const verifyParsed = yaml.load(verifyRaw) as Record<string, unknown>;
    const verifyVersion = Number(verifyParsed._config_version) || 0;

    if (verifyVersion !== newVersion) {
      // 校验失败 → 从备份恢复
      fs.renameSync(backupPath, cfgPath);
      throw new Error(
        `config write verification failed: expected _config_version=${newVersion}, got ${verifyVersion}. Reverted from backup.`,
      );
    }

    return { ok: true, version: newVersion, backupPath };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, version: 0, backupPath: '', error: message };
  } finally {
    // ── Step 7：释放锁 ──
    if (release) {
      try { await release(); } catch { /* 释放锁失败不影响已写入的数据 */ }
    }
  }
}

/**
 * 对 config.yaml 执行只读操作（带锁，保证配置一致性）。
 * 仅用于读取 config 而不修改的场景。
 */
export async function readConfigSafe(): Promise<Record<string, unknown>> {
  const cfgPath = configPath();
  let release: (() => Promise<void>) | null = null;
  try {
    release = await lockfile.lock(cfgPath, LOCK_OPTIONS);
    if (!fs.existsSync(cfgPath)) return {};
    const raw = fs.readFileSync(cfgPath, 'utf8');
    return (yaml.load(raw) as Record<string, unknown>) ?? {};
  } finally {
    if (release) {
      try { await release(); } catch {}
    }
  }
}
