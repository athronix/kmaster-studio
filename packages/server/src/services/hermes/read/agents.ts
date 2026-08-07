/**
 * read/agents.ts — Agent 角色读取（U-12）
 *
 * 从 config.yaml `agent.personalities{}` 解析 Agent 角色列表。
 * 若 $HERMES_HOME/agents/*.md 存在，则以 front-matter 扩展（补充 agentMd / skills / mcp 等字段）。
 *
 * @module services/hermes/read/agents
 */

import path from 'node:path';
import fs from 'node:fs';
import yaml from 'js-yaml';
import { resolveActiveHermesHome } from '../env.js';

export interface AgentEntry {
  id: string;
  name: string;
  prompt: string;
  /** 从 agents/*.md 扩展的元数据 */
  agentMd?: string;
  skills?: string[];
  mcp?: string[];
  specialties?: string[];
}

/**
 * 自实现 front-matter 解析（O-7 裁定：不引入 gray-matter）。
 *
 * 格式：```yaml ... ``` 或 --- ... --- 夹在 Markdown 顶部。
 * 仅约 30 行，复用已有 js-yaml 依赖。
 */
function parseFrontMatter(raw: string): { data: Record<string, unknown>; content: string } {
  // 去掉 BOM
  const text = raw.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');

  // 匹配 --- ... --- 形式的 front-matter
  const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (m) {
    try {
      const data = yaml.load(m[1]) as Record<string, unknown> || {};
      return { data, content: m[2] };
    } catch {
      return { data: {}, content: text };
    }
  }

  // 匹配 ```yaml ... ``` 形式的 front-matter��部分工具使用）
  const m2 = text.match(/^```ya?ml\n([\s\S]*?)\n```\n?([\s\S]*)$/);
  if (m2) {
    try {
      const data = yaml.load(m2[1]) as Record<string, unknown> || {};
      return { data, content: m2[2] };
    } catch {
      return { data: {}, content: text };
    }
  }

  return { data: {}, content: text };
}

/**
 * 从 config.yaml agent.personalities 读取 Agent 列表。
 * 若存在 agents/ 目录下的 *.md，以 front-matter 扩展。
 */
export function getRealAgents(): AgentEntry[] {
  const hermesHome = resolveActiveHermesHome();
  const configPath = path.join(hermesHome, 'config.yaml');

  const agents: AgentEntry[] = [];

  // ── 从 config.yaml 读 personalities ──
  try {
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf8');
      const config = yaml.load(raw) as Record<string, unknown>;
      const personalities = (config.agent as Record<string, unknown>)?.personalities as Record<string, string> ?? {};

      for (const [name, prompt] of Object.entries(personalities)) {
        agents.push({
          id: name,
          name,
          prompt: String(prompt).trim(),
        });
      }
    }
  } catch { /* config 读失败返回空 */ }

  // ── 从 agents/*.md 扩展 ──
  const agentsDir = path.join(hermesHome, 'agents');
  try {
    if (fs.existsSync(agentsDir)) {
      const files = fs.readdirSync(agentsDir).filter(f => f.endsWith('.md'));
      const agentMap = new Map(agents.map(a => [a.id, a]));

      for (const file of files) {
        const id = file.replace(/\.md$/i, '');
        const raw = fs.readFileSync(path.join(agentsDir, file), 'utf8');
        const { data, content } = parseFrontMatter(raw);

        const existing = agentMap.get(id);
        if (existing) {
          existing.agentMd = content.trim();
          if (Array.isArray(data.skills)) existing.skills = data.skills as string[];
          if (Array.isArray(data.mcp)) existing.mcp = data.mcp as string[];
          if (Array.isArray(data.specialties)) existing.specialties = data.specialties as string[];
        } else {
          agents.push({
            id,
            name: (data.name as string) ?? id,
            prompt: (data.prompt as string) ?? content.trim(),
            agentMd: content.trim(),
            skills: Array.isArray(data.skills) ? (data.skills as string[]) : undefined,
            mcp: Array.isArray(data.mcp) ? (data.mcp as string[]) : undefined,
            specialties: Array.isArray(data.specialties) ? (data.specialties as string[]) : undefined,
          });
        }
      }
    }
  } catch { /* agents/ 目录不存在或读失败 */ }

  return agents;
}
