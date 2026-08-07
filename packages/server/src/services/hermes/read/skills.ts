/**
 * read/skills.ts — 真实技能读取（U-05）
 *
 * 从三个来源扫描技能目录（每个必须含 SKILL.md）：
 *   1. $HERMES_HOME/skills/      （47 包，161 个单体可用技能）
 *   2. hermes-agent/skills/       （18）
 *   3. hermes-agent/optional-skills/  （20）
 *
 * 合并去重：同一 name 保留第一次出现者。
 * 🚫 不调用 get_available_skills()（MSYS 路径陷阱）。
 *
 * @module services/hermes/read/skills
 */

import path from 'node:path';
import fs from 'node:fs';
import { resolveActiveHermesHome } from '../env.js';
import type { Skill } from '../../../protocol.js';

/** 技能来源 */
interface SkillSource {
  name: string;
  dir: string;       // 绝对路径
  category: string;
  description: string;
}

/**
 * 扫描一个目录，返回含 SKILL.md 的子目录列表。
 */
function scanSkillDirs(root: string): string[] {
  try {
    if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) return [];
    return fs.readdirSync(root, { withFileTypes: true })
      .filter(d => d.isDirectory() && !d.name.startsWith('.') && !d.name.startsWith('_'))
      .map(d => d.name);
  } catch {
    return [];
  }
}

/**
 * 从 SKILL.md 或目录名推断 category 和 description。
 * 优先读 SKILL.md 文件名（hermes 技能以 SKILL.md 为标记）。
 */
function readSkillMeta(skillDir: string, name: string): { category: string; description: string } {
  const mdPath = path.join(skillDir, 'SKILL.md');
  // 尝试从 SKILL.md 提取 title/description
  try {
    if (fs.existsSync(mdPath)) {
      const raw = fs.readFileSync(mdPath, 'utf8').slice(0, 2048);
      // 提取 # Title 行
      const titleMatch = raw.match(/^#\s+(.+)$/m);
      // 提取 ## Description 或首段文本
      const descMatch = raw.match(/^##\s+Description\s*\n\s*(.+)$/m)
        || raw.match(/^> (.+)$/m);
      if (titleMatch || descMatch) {
        return {
          category: 'general',
          description: (titleMatch?.[1] ?? descMatch?.[1] ?? name).trim(),
        };
      }
    }
  } catch { /* 读失败退回落 */ }

  // 回落：从目录名推断 category
  const cat = (() => {
    const l = name.toLowerCase();
    if (l.includes('research') || l.includes('search')) return 'research';
    if (l.includes('code') || l.includes('commit') || l.includes('debug') || l.includes('test')) return 'engineering';
    if (l.includes('write') || l.includes('doc') || l.includes('translate')) return 'writing';
    if (l.includes('data') || l.includes('analysis')) return 'data';
    if (l.includes('deploy') || l.includes('ci') || l.includes('devops')) return 'devops';
    return 'general';
  })();
  return { category: cat, description: name };
}

/**
 * 读取所有真实 hermes 技能。
 * 扫描三个来源 + 合并去重。
 */
export function getRealSkills(): Skill[] {
  const hermesHome = resolveActiveHermesHome();
  const agentRoot = process.env.HERMES_AGENT_ROOT
    || path.resolve(hermesHome, '..', 'hermes-agent');

  const sources: { root: string; names: string[] }[] = [];

  // 来源 1: $HERMES_HOME/skills/
  const homeSkills = path.join(hermesHome, 'skills');
  sources.push({ root: homeSkills, names: scanSkillDirs(homeSkills) });

  // 来源 2: hermes-agent/skills/
  const agentSkills = path.join(agentRoot, 'skills');
  sources.push({ root: agentSkills, names: scanSkillDirs(agentSkills) });

  // 来源 3: hermes-agent/optional-skills/
  const optSkills = path.join(agentRoot, 'optional-skills');
  sources.push({ root: optSkills, names: scanSkillDirs(optSkills) });

  // 合并去重
  const seen = new Set<string>();
  const result: Skill[] = [];

  for (const src of sources) {
    for (const name of src.names) {
      if (seen.has(name)) continue;
      seen.add(name);
      const dir = path.join(src.root, name);
      const { category, description } = readSkillMeta(dir, name);
      result.push({ name, category, description, enabled: true });
    }
  }

  return result;
}
