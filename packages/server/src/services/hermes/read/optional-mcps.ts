/**
 * read/optional-mcps.ts — Optional MCPs 扫描器（T06）
 *
 * 扫描 $HERMES_HOME/optional-mcps/&lt;dir&gt;/manifest.yaml，
 * 返回候选 MCP 连接器列表。
 *
 * 已知候选（共 3 条）：
 *   - linear/http+oauth
 *   - n8n/stdio
 *   - unreal-engine/http
 *
 * 如果 optional-mcps/ 目录不存在（本机可能没有），返回空数组，不要报错。
 *
 * @module services/hermes/read/optional-mcps
 */

import path from 'node:path';
import fs from 'node:fs';
import { resolveActiveHermesHome } from '../env.js';

// ── 类型 ────────────────────────────────────────────────────────────────

/** MCP 候选条目 */
export interface McpCandidate {
  /** 连接器名称（即 optional-mcps/ 下的目录名） */
  name: string;
  /** 传输协议 */
  transport: 'stdio' | 'http' | 'sse';
  /** stdio 命令（transport === 'stdio' 时） */
  command?: string;
  /** stdio 参数 */
  args?: string[];
  /** stdio 环境变量 */
  env?: Record<string, string>;
  /** HTTP URL（transport === 'http' | 'sse' 时） */
  url?: string;
  /** 认证模式 */
  authMode: 'none' | 'token' | 'oauth';
  /** 描述（来自 manifest.yaml） */
  description?: string;
  /** manifest.yaml 源文件绝对路径 */
  manifestPath: string;
}

// ── 简单 YAML 解析 ──────────────────────────────────────────────────────

/**
 * 自实现最小 YAML 解析（仅支持 k: v 顶层键值对）。
 * manifest.yaml 结构简单（~10 行），无需引入 js-yaml 完整解析。
 */
function parseSimpleYaml(raw: string): Record<string, string> {
  const result: Record<string, string> = {};
  const lines = raw.replace(/\r\n/g, '\n').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const m = trimmed.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(.*)$/);
    if (m) {
      result[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  }
  return result;
}

// ── 主扫描函数 ──────────────────────────────────────────────────────────

/**
 * 扫描 $HERMES_HOME/optional-mcps/&lt;dir&gt;/manifest.yaml。
 *
 * 如果 optional-mcps/ 目录不存在，返回空数组（不报错）。
 *
 * @returns McpCandidate[] — 候选项列表，可能为空
 */
export function scanOptionalMcps(): McpCandidate[] {
  const hermesHome = resolveActiveHermesHome();
  const optionalDir = path.join(hermesHome, 'optional-mcps');

  // 目录不存在 → 空数组，不报错
  try {
    if (!fs.existsSync(optionalDir) || !fs.statSync(optionalDir).isDirectory()) {
      return [];
    }
  } catch {
    return [];
  }

  const candidates: McpCandidate[] = [];

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(optionalDir, { withFileTypes: true });
  } catch {
    return [];
  }

  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;

    const dirName = entry.name;
    const manifestFile = path.join(optionalDir, dirName, 'manifest.yaml');

    try {
      if (!fs.existsSync(manifestFile)) continue;
      const raw = fs.readFileSync(manifestFile, 'utf8');
      const m = parseSimpleYaml(raw);

      // 推断 transport
      let transport: McpCandidate['transport'] = 'stdio';
      if (m.url) {
        transport = 'http';
      }
      if (m.transport === 'sse') {
        transport = 'sse';
      }

      // 推断 authMode
      let authMode: McpCandidate['authMode'] = 'none';
      if (m.auth === 'oauth' || m.auth_mode === 'oauth') {
        authMode = 'oauth';
      } else if (m.auth === 'token' || m.auth_mode === 'token' || m.token_env) {
        authMode = 'token';
      }

      candidates.push({
        name: dirName,
        transport,
        command: m.command,
        args: m.args ? m.args.split(/\s+/) : undefined,
        env: undefined, // manifest.yaml 中 env 通常没有或很难解析
        url: m.url,
        authMode,
        description: m.description,
        manifestPath: manifestFile,
      });
    } catch {
      // 单个 manifest 解析失败不影响其他候选项
      continue;
    }
  }

  return candidates;
}
