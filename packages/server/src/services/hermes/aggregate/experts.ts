/**
 * aggregate/experts.ts — 专家聚合（T07）
 *
 * 合并 hermes 内置角色 + agents/*.md 自定义角色 + COS 406 专家候选池。
 *
 * 去重规则：
 *   - COS 专家名与 hermes 内置 agent.name 重合 → 标记 installed: true
 *   - COS 专家名与 agents/*.md 自定义角色重合 → 标记 installed: true
 *
 * 排序：hermes 内置在前 → 自定义 → COS 候选按分类排列。
 *
 * @module services/hermes/aggregate/experts
 */

import { getRealAgents, type AgentEntry } from '../read/agents.js';
import { loadManifest } from '../cos-cache.js';
import type { ExpertAsset } from '../../../types/asset.js';

// ── 类型 ────────────────────────────────────────────────────────────────

/** 聚合后的专家列表响应 */
export interface ExpertAggregate {
  /** hermes 内置 + 自建 agent（已安装） */
  installed: AgentEntry[];
  /** COS 候选专家（未安装的） */
  candidates: ExpertAsset[];
  /** 分类列表 */
  categories: ExpertCategory[];
}

/** 专家分类 */
export interface ExpertCategory {
  id: string;
  name: string;
  count: number;
}

/** COS expert_center.json 原始条目 */
interface CosExpertEntry {
  id: string;
  name: string;
  description: string;
  category_id: string;
  category_name: string;
  tags: string[];
  expert_type: string;
  avatar: string;
  prompt_ref: string;
  do_not_redistribute: boolean;
  source: string;
  license: string;
}

interface CosExpertManifest {
  generated_at: string;
  count: number;
  entries: CosExpertEntry[];
}

// ── 转换 ────────────────────────────────────────────────────────────────

/**
 * 将 COS manifest 条目转为 ExpertAsset。
 */
function toExpertAsset(e: CosExpertEntry): ExpertAsset {
  return {
    id: `cos:expert:${e.id}`,
    name: e.name,
    description: e.description,
    source: 'cos',
    category: e.category_name,
    icon: e.avatar,
    installed: false,
    version: undefined,
    profession: e.expert_type,
    tags: e.tags,
    promptFile: undefined,
    categoryId: e.category_id,
    doNotRedistribute: e.do_not_redistribute,
    promptRef: e.prompt_ref,
  };
}

// ── 聚合 ────────────────────────────────────────────────────────────────

/**
 * 合并 hermes 内置角色 + COS 专家候选池。
 *
 * @param source 过滤来源：'installed' | 'candidates' | 'all'（默认 all）
 */
export function mergeExpertLists(source: 'installed' | 'candidates' | 'all' = 'all'): ExpertAggregate {
  // 1. hermes 内置 + 自建
  const hermesAgents = getRealAgents();
  const installedNames = new Set(hermesAgents.map(a => a.name.toLowerCase()));

  // 2. COS 候选
  const cosManifest = loadManifest<CosExpertManifest>('experts');
  const cosEntries = cosManifest?.entries ?? [];

  // 3. 分类聚合
  const categoryMap = new Map<string, ExpertCategory>();
  for (const e of cosEntries) {
    const cid = e.category_id || 'other';
    const cname = e.category_name || '其他';
    if (!categoryMap.has(cid)) {
      categoryMap.set(cid, { id: cid, name: cname, count: 0 });
    }
    categoryMap.get(cid)!.count++;
  }
  const categories = Array.from(categoryMap.values()).sort((a, b) => b.count - a.count);

  // 4. 标记已安装 & 去重
  const candidates: ExpertAsset[] = [];
  for (const e of cosEntries) {
    const asset = toExpertAsset(e);
    if (installedNames.has(e.name.toLowerCase())) {
      // COS 中有同名 hermes 内置 → 加入 installed 但不重复显示
      asset.installed = true;
      // 将已安装的 COS 条目加入 candidates 的 installed 分组
    }
    // 所有 COS 条目都进入 candidates（含 installed=true 的）
    candidates.push(asset);
  }

  // 5. 排序：未安装在前（按分类），已安装在后
  candidates.sort((a, b) => {
    // 未安装优先
    if (a.installed !== b.installed) return a.installed ? 1 : -1;
    // 同组内按分类名排序
    return (a.category ?? '').localeCompare(b.category ?? '');
  });

  return { installed: hermesAgents, candidates, categories };
}
