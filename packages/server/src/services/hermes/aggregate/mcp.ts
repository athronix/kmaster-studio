/**
 * aggregate/mcp.ts — MCP 聚合（T07）
 *
 * 合并 config.yaml mcp_servers（已部署） + optional-mcps（0-3） + COS 87 连接器候选。
 *
 * 去重规则：同名 → deployed/available 标记。
 * 排序：已部署在前 → optional 候选 → COS 候选。
 *
 * @module services/hermes/aggregate/mcp
 */

import { listMcp } from '../../../hermes-proxy.js';
import { scanOptionalMcps, type McpCandidate } from '../read/optional-mcps.js';
import { loadManifest } from '../cos-cache.js';
import type { McpAsset, McpTransport, McpAuthMode } from '../../../types/asset.js';
import type { McpServer } from '../../../protocol.js';

// ── 类型 ────────────────────────────────────────────────────────────────

/** 聚合后的 MCP 列表响应 */
export interface McpAggregate {
  /** config.yaml mcp_servers（已部署） */
  deployed: McpServer[];
  /** 候选 MCP（含 optional + COS 未部署的） */
  candidates: McpAsset[];
}

/** COS connectors manifest 原始条目 */
interface CosMcpEntry {
  id: string;
  name: string;
  description: string;
  transport: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  timeout?: number;
  version?: string;
  tags?: string[];
}

interface CosMcpManifest {
  generated_at: string;
  count: number;
  entries: CosMcpEntry[];
}

// ── 转换 ────────────────────────────────────────────────────────────────

function normalizeTransport(raw: string): McpTransport {
  if (raw === 'sse' || raw === 'streamableHttp') return 'sse';
  if (raw === 'http' || raw === 'streamable-http' || raw === 'httpStream') return 'http';
  return 'stdio';
}

function normalizeAuth(entry: CosMcpEntry, candidate?: McpCandidate): McpAuthMode {
  if (candidate?.authMode === 'oauth' || candidate?.authMode === 'token') {
    return candidate.authMode;
  }
  // 检查 URL 是否包含 oauth 提示
  if (entry.url?.includes('oauth')) return 'oauth';
  // 默认
  return 'none';
}

/**
 * 将 COS MCP 条目转为 McpAsset。
 */
function toMcpAsset(e: CosMcpEntry, deployed: boolean, candidate?: McpCandidate): McpAsset {
  const transport = normalizeTransport(e.transport);
  const authMode = normalizeAuth(e, candidate);
  return {
    id: `cos:mcp:${e.id}`,
    name: e.name,
    description: e.description,
    source: 'cos',
    category: undefined,
    icon: undefined,
    installed: deployed,
    version: e.version,
    transport,
    command: e.command ?? candidate?.command,
    args: e.args ?? candidate?.args,
    env: e.env ?? candidate?.env,
    url: e.url ?? candidate?.url,
    authMode,
    timeout: e.timeout,
  };
}

/**
 * 将 optional MCP 候选转为 McpAsset。
 */
function optionalToMcpAsset(c: McpCandidate, deployed: boolean): McpAsset {
  return {
    id: `hermes:mcp:${c.name}`,
    name: c.name,
    description: c.description ?? c.name,
    source: 'hermes',
    installed: deployed,
    transport: c.transport,
    command: c.command,
    args: c.args,
    env: c.env,
    url: c.url,
    authMode: c.authMode,
  };
}

// ── 聚合 ────────────────────────────────────────────────────────────────

/**
 * 合并已部署 MCP + optional-mcps + COS 连接器候选。
 */
export function mergeMcpLists(): McpAggregate {
  // 1. 已部署（config.yaml mcp_servers）
  const deployed = listMcp();
  const deployedNames = new Set(deployed.map(s => s.name.toLowerCase()));

  // 2. Optional MCPs
  const optional = scanOptionalMcps();

  // 3. COS 候选
  const cosManifest = loadManifest<CosMcpManifest>('connectors');
  const cosEntries = cosManifest?.entries ?? [];

  // 去重集
  const seen = new Set<string>(deployedNames);

  const candidates: McpAsset[] = [];

  // optional-mcps（仅未部署的加入 candidates）
  for (const c of optional) {
    const nameLower = c.name.toLowerCase();
    if (seen.has(nameLower)) continue;
    seen.add(nameLower);
    candidates.push(optionalToMcpAsset(c, false));
  }

  // COS 条目
  for (const e of cosEntries) {
    const nameLower = e.name.toLowerCase();
    const isDeployed = deployedNames.has(nameLower);
    const optMatch = optional.find(o => o.name.toLowerCase() === nameLower);
    if (seen.has(nameLower) && !isDeployed) continue;
    seen.add(nameLower);
    candidates.push(toMcpAsset(e, isDeployed, optMatch));
  }

  // 排序：未部署优先，按名称字母序
  candidates.sort((a, b) => {
    if (a.installed !== b.installed) return a.installed ? 1 : -1;
    return a.name.localeCompare(b.name);
  });

  return { deployed, candidates };
}
