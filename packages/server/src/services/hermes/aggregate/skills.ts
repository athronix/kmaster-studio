/**
 * aggregate/skills.ts — 技能聚合（T07）
 *
 * 合并 hermes 已装技能 + COS 295 候选技能。
 *
 * 去重规则：COS 候选与 hermes 已装同名 → 标记 installed: true。
 * 排序：已装在前 → 候选在后。
 *
 * @module services/hermes/aggregate/skills
 */

import { getRealSkills } from '../read/skills.js';
import { loadManifest } from '../cos-cache.js';
import type { SkillAsset } from '../../../types/asset.js';
import type { Skill } from '../../../protocol.js';

// ── 类型 ────────────────────────────────────────────────────────────────

/** 聚合后的技能列表响应 */
export interface SkillAggregate {
  /** hermes 已装技能 */
  installed: Skill[];
  /** COS 候选技能（未安装的） */
  candidates: SkillAsset[];
  /** 分类标签 */
  categories: string[];
}

/** COS marketplace.json 原始条目 */
interface CosSkillEntry {
  name: string;
  description: string;
  tags: string[];
  author?: string;
  skillPath: string;
}

interface CosSkillManifest {
  generated_at: string;
  count: number;
  entries: CosSkillEntry[];
}

// ── 转换 ────────────────────────────────────────────────────────────────

/**
 * 将 COS skill 条目转为 SkillAsset。
 */
function toSkillAsset(e: CosSkillEntry, installed: boolean): SkillAsset {
  return {
    id: `cos:skill:${e.skillPath}`,
    name: e.name,
    description: e.description,
    source: 'cos',
    category: undefined,
    icon: undefined,
    installed,
    version: undefined,
    author: e.author,
    tags: e.tags,
    skillPath: e.skillPath,
  };
}

// ── 聚合 ────────────────────────────────────────────────────────────────

/**
 * 合并 hermes 已装技能 + COS 候选技能。
 */
export function mergeSkillLists(): SkillAggregate {
  // 1. hermes 已装
  const hermesSkills = getRealSkills();
  const installedNames = new Set(hermesSkills.map(s => s.name.toLowerCase()));
  // 也检查 skill 目录名（有些 skill name 和目录名不同）
  const installedPaths = new Set<string>();
  for (const s of hermesSkills) {
    installedPaths.add(s.name.toLowerCase());
  }

  // 2. COS 候选
  const cosManifest = loadManifest<CosSkillManifest>('skills');
  const cosEntries = cosManifest?.entries ?? [];

  // 3. 分类
  const categorySet = new Set<string>();
  const candidates: SkillAsset[] = [];

  for (const e of cosEntries) {
    const isInstalled = installedNames.has(e.name.toLowerCase())
      || installedPaths.has(e.skillPath.toLowerCase());
    const asset = toSkillAsset(e, isInstalled);
    // 收集分类标签
    for (const t of e.tags) {
      if (t) categorySet.add(t);
    }
    candidates.push(asset);
  }

  // 4. 排序
  candidates.sort((a, b) => {
    if (a.installed !== b.installed) return a.installed ? 1 : -1;
    return a.name.localeCompare(b.name);
  });

  return {
    installed: hermesSkills,
    candidates,
    categories: Array.from(categorySet).sort(),
  };
}
