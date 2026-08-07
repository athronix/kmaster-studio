/**
 * write/skills-install.ts — 技能装卸写回（U-21）
 *
 * PRD Q-3 定案：junction 优先（与 hermes 既有 sync-skills-links.sh 惯例一致）。
 *
 * 三级降级：
 *   1. fs.symlink(target, dest, 'junction')  — 优先（免管理员）
 *   2. fs.symlink(target, dest, 'dir')       — 降级（junction 不可用时）
 *   3. copyRecursive(target, dest)           — 最终兜底（跨盘 junction 不可用时）
 *
 * 元数据：维护 `.kmaster-managed-skills.json` 记录 kmaster 装过哪些条目。
 * 卸载时据元数据删除 junction/symlink（不穿透删源文件），clean 元数据条目。
 *
 * @module services/hermes/write/skills-install
 */

import path from 'node:path';
import fs from 'node:fs';
import { resolveActiveHermesHome } from '../env.js';

// ── 类型 ────────────────────────────────────────────────────────────────

export type InstallKind = 'junction' | 'symlink' | 'copy';

export interface InstallResult {
  ok: boolean;
  skillName: string;
  installKind?: InstallKind;
  error?: string;
}

interface ManagedEntry {
  skillName: string;
  sourceDir: string;   // 源目录绝对路径
  destDir: string;      // 目标 junction/symlink 路径
  kind: InstallKind;
  installedAt: string;
}

// ── 元数据路径 ──────────────────────────────────────────────────────────

function metaPath(): string {
  return path.join(resolveActiveHermesHome(), '.kmaster-managed-skills.json');
}

function readMeta(): Record<string, ManagedEntry> {
  try {
    if (fs.existsSync(metaPath())) {
      return JSON.parse(fs.readFileSync(metaPath(), 'utf8'));
    }
  } catch { /* 文件损坏/不存在 → 空 */ }
  return {};
}

function writeMeta(meta: Record<string, ManagedEntry>): void {
  fs.mkdirSync(path.dirname(metaPath()), { recursive: true });
  fs.writeFileSync(metaPath(), JSON.stringify(meta, null, 2), 'utf8');
}

// ── 技能发现 ────────────────────────────────────────────────────────────

/**
 * 在已知的 3 个技能来源中查找技能名对应的源目录。
 */
function findSkillSource(skillName: string): string | null {
  const hermesHome = resolveActiveHermesHome();
  const agentRoot = process.env.HERMES_AGENT_ROOT
    || path.resolve(hermesHome, '..', 'hermes-agent');

  const candidates = [
    path.join(hermesHome, 'skills', skillName),
    path.join(agentRoot, 'skills', skillName),
    path.join(agentRoot, 'optional-skills', skillName),
  ];

  for (const c of candidates) {
    try {
      if (fs.existsSync(c) && fs.statSync(c).isDirectory()) {
        const mdPath = path.join(c, 'SKILL.md');
        if (fs.existsSync(mdPath)) return c;
      }
    } catch {}
  }

  return null;
}

// ─��� 复制工具 ────────────────────────────────────────────────────────────

/**
 * 递归复制目录（最终兜底）。
 */
function copyRecursive(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyRecursive(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}

// ── 卸载辅助 ────────────────────────────────────────────────────────────

/**
 * 安全删除 junction/symlink/目录。
 * 注意：Windows 下 junction 用 rmdirSync 而非 unlinkSync。
 */
function removeLink(p: string, kind: InstallKind): void {
  if (kind === 'copy') {
    // 只删 copy 出来的目标（不穿透删源）
    try { fs.rmSync(p, { recursive: true, force: true }); } catch {}
  } else {
    // junction / symlink — 用 rmdir 删除链接本身
    try {
      const stat = fs.lstatSync(p);
      if (stat.isSymbolicLink() || stat.isDirectory()) {
        // On Windows, junctions report as directories to stat,
        // but lstat... actually junctions show as junctions via lstat.
        // Use rmdir for directories/junctions, unlink for symlinks.
        try { fs.rmdirSync(p); } catch { try { fs.unlinkSync(p); } catch {} }
      }
    } catch {
      // lstat failed — brute force
      try { fs.rmSync(p, { recursive: true, force: true }); } catch {}
    }
  }
}

// ── 公开 API ────────────────────────────────────────────────────────────

/**
 * 安装技能：在 hermes skills 目录创建 junction/symlink/copy。
 *
 * @param skillName - 技能名
 * @returns InstallResult
 */
export function installSkill(skillName: string): InstallResult {
  const sourceDir = findSkillSource(skillName);
  if (!sourceDir) {
    return { ok: false, skillName, error: `Skill "${skillName}" not found in any source directory` };
  }

  const hermesHome = resolveActiveHermesHome();
  const destDir = path.join(hermesHome, 'skills', skillName);

  // 已存在 → 跳过
  try {
    if (fs.existsSync(destDir)) {
      return { ok: true, skillName, installKind: 'junction', error: 'already installed' };
    }
  } catch {}

  // 确保父目录存在
  fs.mkdirSync(path.dirname(destDir), { recursive: true });

  let kind: InstallKind = 'junction';

  // Tier 1: junction
  try {
    fs.symlinkSync(sourceDir, destDir, 'junction');
    kind = 'junction';
  } catch {
    // Tier 2: dir symlink
    try {
      fs.symlinkSync(sourceDir, destDir, 'dir');
      kind = 'symlink';
    } catch {
      // Tier 3: copy
      try {
        copyRecursive(sourceDir, destDir);
        kind = 'copy';
      } catch (e) {
        return { ok: false, skillName, error: `All three install methods failed: ${e instanceof Error ? e.message : String(e)}` };
      }
    }
  }

  // 记录元数据
  const meta = readMeta();
  meta[skillName] = {
    skillName,
    sourceDir,
    destDir,
    kind,
    installedAt: new Date().toISOString(),
  };
  writeMeta(meta);

  return { ok: true, skillName, installKind: kind };
}

/**
 * 卸载技能：删除 junction/symlink/copy，不穿透删源文件。
 */
export function uninstallSkill(skillName: string): InstallResult {
  const hermesHome = resolveActiveHermesHome();
  const destDir = path.join(hermesHome, 'skills', skillName);

  const meta = readMeta();
  const entry = meta[skillName];

  if (!entry) {
    // 无元数据 → 尝试直接删除
    try {
      if (fs.existsSync(destDir)) {
        removeLink(destDir, 'junction');
      }
    } catch {}
    return { ok: true, skillName };
  }

  // 从元数据知道链接类型，精准删除
  removeLink(destDir, entry.kind);
  delete meta[skillName];
  writeMeta(meta);

  return { ok: true, skillName, installKind: entry.kind };
}

/**
 * 列出 kmaster 管理的技能（从元数据读取）。
 */
export function listManagedSkills(): ManagedEntry[] {
  return Object.values(readMeta());
}
