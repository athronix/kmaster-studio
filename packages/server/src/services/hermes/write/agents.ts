/**
 * write/agents.ts — Agent CRUD 写回（U-22）+ 安装/卸载（T02）
 *
 * 写入 $HERMES_HOME/agents/*.md，使用 front-matter 格式。
 * 新建 → front-matter 自动生成；删除 → 归档不销毁 (.md.archived-YYYYMMDD)。
 *
 * T02 新增 installAgent / uninstallAgent：从 COS 候选池安装 Agent 到本地。
 *
 * @module services/hermes/write/agents
 */

import path from 'node:path';
import fs from 'node:fs';
import yaml from 'js-yaml';
import { resolveActiveHermesHome } from '../env.js';
import { safeWriteConfig } from './config-yaml.js';
import { loadManifest, cacheRoot, assetBundleDir } from '../cos-cache.js';
import type { AgentEntry } from '../read/agents.js';

// ── 类型 ────────────────────────────────────────────────────────────────

export interface AgentWriteResult {
  ok: boolean;
  agentId: string;
  action: 'create' | 'update' | 'delete';
  error?: string;
}

export interface AgentInput {
  name: string;
  displayName?: string;
  icon?: string;
  prompt: string;
  skills?: string[];
  mcp?: string[];
  specialties?: string[];
}

/** T02：安装/卸载操作结果 */
export interface InstallResult {
  ok: boolean;
  agentId: string;
  message: string;
  error?: string;
}

// ── 路径 ────────────────────────────────────────────────────────────────

function agentsDir(): string {
  const d = path.join(resolveActiveHermesHome(), 'agents');
  fs.mkdirSync(d, { recursive: true });
  return d;
}

function agentPath(name: string): string {
  return path.join(agentsDir(), `${name}.md`);
}

function archivePath(name: string): string {
  const ts = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return path.join(agentsDir(), `${name}.md.archived-${ts}`);
}

// ── Front-matter 解析 ───────────────────────────────────────────────────

/**
 * 自实现 front-matter 解析（与 read/agents.ts 同款实现，不引入 gray-matter）。
 *
 * 格式：--- ... --- 夹在 Markdown 顶部。
 */
function parseFrontMatter(raw: string): { data: Record<string, unknown>; content: string } {
  const text = raw.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (m) {
    try {
      const data = yaml.load(m[1]) as Record<string, unknown> || {};
      return { data, content: m[2] };
    } catch {
      return { data: {}, content: text };
    }
  }
  // 尝试 ```yaml 格式（部分工具使用）
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

// ── Front-matter 生成 ──────────────────────────────────────────────────

function buildAgentMarkdown(input: AgentInput): string {
  const fm: Record<string, unknown> = {
    name: input.name,
    displayName: input.displayName || input.name,
    icon: input.icon || '\u{1F916}',
  };
  if (input.skills?.length) fm.skills = input.skills;
  if (input.mcp?.length) fm.mcp = input.mcp;
  if (input.specialties?.length) fm.specialties = input.specialties;

  const yamlHeader = yaml.dump(fm, { lineWidth: 120 }).trim();
  return `---\n${yamlHeader}\n---\n\n${input.prompt.trim()}\n`;
}

// ── API ─────────────────────────────────────────────────────────────────

/** 创建或更新 Agent */
export function upsertAgent(name: string, input: AgentInput): AgentWriteResult {
  const p = agentPath(name);
  const isNew = !fs.existsSync(p);

  try {
    const md = buildAgentMarkdown(input);
    fs.writeFileSync(p, md, 'utf8');

    // 同步更新 config.yaml agent.personalities
    syncPersonalityToConfig(name, input.prompt);

    return { ok: true, agentId: name, action: isNew ? 'create' : 'update' };
  } catch (err: unknown) {
    return { ok: false, agentId: name, action: isNew ? 'create' : 'update',
      error: err instanceof Error ? err.message : String(err) };
  }
}

/** 删除 Agent（归档不销毁） */
export function deleteAgent(name: string): AgentWriteResult {
  const p = agentPath(name);
  if (!fs.existsSync(p)) {
    return { ok: false, agentId: name, action: 'delete', error: 'not found' };
  }

  try {
    fs.renameSync(p, archivePath(name));

    // 同步从 config.yaml 移除 personality
    removePersonalityFromConfig(name);

    return { ok: true, agentId: name, action: 'delete' };
  } catch (err: unknown) {
    return { ok: false, agentId: name, action: 'delete',
      error: err instanceof Error ? err.message : String(err) };
  }
}

// ═══════════════════ T02：Agent 安装 / 卸载 ═══════════════════

/** COS 专家 manifest 条目结构（installAgent 用） */
interface CosExpertCandidate {
  id: string;
  name: string;
  prompt_ref?: string;
  description?: string;
}

/**
 * 从 COS 候选池安装 Agent 到本地 HERMES_HOME/agents/。
 *
 * 流程：
 *   1. 检查是否已安装（agents/*.md 已存在）
 *   2. 从 COS expert manifest 查找候选 Agent
 *   3. 从 asset-bundle/agents/{name}.md 读取源文件
 *   4. 解析 front-matter，提取 prompt 与元数据
 *   5. 调用 upsertAgent 写入本地并注册
 *
 * @param name Agent 名称（与 COS manifest entry.name 精确匹配）
 * @returns InstallResult
 */
export function installAgent(name: string): InstallResult {
  // 1. 检查是否已安装
  const p = agentPath(name);
  if (fs.existsSync(p)) {
    return { ok: false, agentId: name, error: 'already_installed', message: `Agent ${name} 已安装` };
  }

  // 2. 从 COS manifest 查找候选
  const manifest = loadManifest<{ entries: CosExpertCandidate[] }>('experts');
  const candidate = manifest?.entries?.find(
    (e) => e.name.toLowerCase() === name.toLowerCase(),
  );
  if (!candidate) {
    return { ok: false, agentId: name, error: 'not_found', message: `Agent ${name} 不存在于候选列表中` };
  }

  // 3. 从 asset-bundle/agents/{name}.md 读取源文件
  const bundleDir = assetBundleDir();
  const srcPath = path.join(bundleDir, 'agents', `${name}.md`);
  if (!fs.existsSync(srcPath)) {
    return {
      ok: false, agentId: name, error: 'source_not_found',
      message: `Agent ${name} 源文件不存在（${srcPath}）`,
    };
  }

  let raw: string;
  try {
    raw = fs.readFileSync(srcPath, 'utf8');
  } catch (err: unknown) {
    return {
      ok: false, agentId: name, error: 'read_error',
      message: `读取 Agent ${name} 源文件失败: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // 4. 解析 front-matter
  const { data, content } = parseFrontMatter(raw);

  // 5. 调用 upsertAgent 写入并注册
  const result = upsertAgent(name, {
    name: (data.name as string) ?? candidate.name ?? name,
    displayName: (data.displayName as string) ?? (data.name as string) ?? candidate.name ?? name,
    icon: (data.icon as string) ?? '\u{1F916}',
    prompt: content.trim() || (candidate.description ?? ''),
    skills: Array.isArray(data.skills) ? (data.skills as string[]) : undefined,
    mcp: Array.isArray(data.mcp) ? (data.mcp as string[]) : undefined,
    specialties: Array.isArray(data.specialties) ? (data.specialties as string[]) : undefined,
  });

  if (!result.ok) {
    return {
      ok: false, agentId: name, error: result.error ?? 'write_error',
      message: `Agent ${name} 注册失败: ${result.error ?? '未知错误'}`,
    };
  }

  return { ok: true, agentId: name, message: `Agent ${name} 已安装` };
}

/**
 * 卸载本地 Agent：删除 agents/*.md 文件并注销注册。
 *
 * 流程：
 *   1. 检查 agents/{name}.md 是否存在
 *   2. 调用 deleteAgent 归档文件 + 从 config.yaml 移除
 *
 * @param name Agent 名称
 * @returns InstallResult
 */
export function uninstallAgent(name: string): InstallResult {
  // 1. 检查是否存在
  const p = agentPath(name);
  if (!fs.existsSync(p)) {
    return { ok: false, agentId: name, error: 'not_found', message: `Agent ${name} 不存在` };
  }

  // 2. 调用 deleteAgent 归档并注销
  const result = deleteAgent(name);
  if (!result.ok) {
    return {
      ok: false, agentId: name, error: result.error ?? 'delete_error',
      message: `Agent ${name} 卸载失败: ${result.error ?? '未知错误'}`,
    };
  }

  return { ok: true, agentId: name, message: `Agent ${name} 已卸载` };
}

// ── config.yaml 同步 ────────────────────────────────────────────────────

async function syncPersonalityToConfig(name: string, prompt: string): Promise<void> {
  try {
    await safeWriteConfig((current) => {
      const agent = (current.agent as Record<string, unknown>) ?? {};
      const personalities = (agent.personalities as Record<string, string>) ?? {};
      personalities[name] = prompt;
      agent.personalities = personalities;
      current.agent = agent;
      return current;
    });
  } catch { /* config sync is best-effort */ }
}

async function removePersonalityFromConfig(name: string): Promise<void> {
  try {
    await safeWriteConfig((current) => {
      const agent = (current.agent as Record<string, unknown>) ?? {};
      const personalities = (agent.personalities as Record<string, string>) ?? {};
      delete personalities[name];
      agent.personalities = personalities;
      current.agent = agent;
      return current;
    });
  } catch { /* config sync is best-effort */ }
}
