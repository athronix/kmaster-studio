/**
 * cos-cache.ts — COS 资产缓存管理器（T06）
 *
 * 管理本地 COS 资产缓存：从本地 asset-bundle 目录复制元数据到
 * $KMASTER_STUDIO_HOME/cos-cache/，供后续设置页 / 卡片页消费。
 *
 * 三种 manifest：
 *   - 'experts' → cos-cache/expert_center.json
 *   - 'skills'  → cos-cache/skill-marketplace/marketplace.json
 *   - 'connectors' → cos-cache/connectors-config/manifest.json
 *
 * 初始版本（P0）：从本地 asset-bundle 复制，不做 COS 在线下载。
 * P2 再做 COS 在线下载 + 自动更新。
 *
 * @module services/hermes/cos-cache
 */

import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';

// ── 常量 ────────────────────────────────────────────────────────────────

/** 缓存目录名 */
const CACHE_DIR = 'cos-cache';

/** 缓存有效期：7 天（毫秒） */
const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** manifest 种类 */
export type CacheKind = 'experts' | 'skills' | 'connectors';

/** 各 manifest 在缓存目录中的相对路径 */
const MANIFEST_PATHS: Record<CacheKind, string> = {
  experts: 'expert_center.json',
  skills: path.join('skill-marketplace', 'marketplace.json'),
  connectors: path.join('connectors-config', 'manifest.json'),
};

// ── 路径解析 ────────────────────────────────────────────────────────────

/**
 * 解析 $KMASTER_STUDIO_HOME 主目录。
 *
 * 优先级：
 *   1. 环境变量 KMASTER_STUDIO_HOME
 *   2. 平台默认：Windows → %LOCALAPPDATA%/kmaster-studio
 *              其他 → ~/.kmaster-studio
 */
export function resolveKmasterStudioHome(): string {
  const env = process.env.KMASTER_STUDIO_HOME?.trim();
  if (env) return path.normalize(env);

  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA;
    if (localAppData) return path.join(localAppData, 'kmaster-studio');
  }
  return path.join(os.homedir(), '.kmaster-studio');
}

/** 获取缓存根目录绝对路径 */
export function cacheRoot(): string {
  return path.join(resolveKmasterStudioHome(), CACHE_DIR);
}

/** 获取指定 kind 的 manifest 绝对路径 */
export function manifestPath(kind: CacheKind): string {
  return path.join(cacheRoot(), MANIFEST_PATHS[kind]);
}

// ── 资产包路径 ──────────────────────────────────────────────────────────

/**
 * 解析本地 asset-bundle 目录。
 *
 * 优先级：
 *   1. 环境变量 KMASTER_ASSET_BUNDLE
 *   2. 硬编码默认路径（开发环境）
 */
export function assetBundleDir(): string {
  const env = process.env.KMASTER_ASSET_BUNDLE?.trim();
  if (env) return path.normalize(env);
  // 默认路径（Windows 开发机）
  return path.normalize('D:/workbuddy-workspace/kmaster-studio-design/asset-bundle');
}

// ── 缓存操作 ────────────────────────────────────────────────────────────

/**
 * 确保缓存目录存在。
 * 幂等操作：已存在则跳过。
 */
export function ensureCacheDir(): void {
  const root = cacheRoot();
  try {
    if (!fs.existsSync(root)) {
      fs.mkdirSync(root, { recursive: true });
    }
  } catch { /* 权限不足等场景不阻塞 */ }
}

/**
 * 读取指定 kind 的缓存 manifest JSON。
 *
 * @returns 解析后的 JSON 对象，缓存不存在时返回 null
 */
export function loadManifest<T = unknown>(kind: CacheKind): T | null {
  const fp = manifestPath(kind);
  try {
    if (!fs.existsSync(fp)) return null;
    const raw = fs.readFileSync(fp, 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * 获取缓存最后更新时间（毫秒时间戳）。
 *
 * @returns 缓存文件的 mtimeMs，不存在则返回 null
 */
export function cacheAge(kind: CacheKind): number | null {
  const fp = manifestPath(kind);
  try {
    if (!fs.existsSync(fp)) return null;
    return fs.statSync(fp).mtimeMs;
  } catch {
    return null;
  }
}

/**
 * 检查缓存是否过期（超过 7 天）。
 */
export function isCacheStale(kind: CacheKind): boolean {
  const age = cacheAge(kind);
  if (age === null) return true;
  return Date.now() - age > CACHE_MAX_AGE_MS;
}

// ── Manifest 生成 ───────────────────────────────────────────────────────

/** 专家 manifest 条目（写入 expert_center.json） */
interface ExpertManifestEntry {
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

/** 技能 manifest 条目（写入 marketplace.json） */
interface SkillManifestEntry {
  name: string;
  description: string;
  tags: string[];
  author?: string;
  skillPath: string;
}

/** MCP manifest 条目（写入 connectors manifest.json） */
interface McpManifestEntry {
  id: string;
  name: string;
  name_en?: string;
  description: string;
  description_zh?: string;
  source: string;
  type: string;
  version?: string;
  transport: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  timeout?: number;
  icon?: string;
  tags?: string[];
  examples_zh?: string[];
  examples_en?: string[];
}

// ── Front-matter 解析 ────────────────────────────────────────────────────

/**
 * 自实现 front-matter 解析（复用 agents.ts 同款实现，不引入 gray-matter）。
 *
 * 格式：--- ... --- 夹在 Markdown 顶部。
 */
function parseFrontMatter(raw: string): { data: Record<string, unknown>; content: string } {
  const text = raw.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');
  const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (m) {
    try {
      // 简单 YAML 解析：逐行读 key: value
      const data: Record<string, unknown> = {};
      const lines = m[1].split('\n');
      let currentKey = '';
      let currentIndent = 0;
      for (const line of lines) {
        if (/^\s*#/.test(line) || /^\s*$/.test(line)) continue;
        const indent = line.search(/\S/);
        const trimmed = line.trim();
        const kv = trimmed.match(/^([^:]+):\s*(.*)$/);
        if (kv && indent === 0) {
          currentKey = kv[1].trim();
          const val = kv[2].trim();
          if (val === '') {
            data[currentKey] = {};
            currentIndent = indent;
          } else {
            data[currentKey] = val;
          }
        } else if (currentKey && indent > currentIndent) {
          // metadata 嵌套字段
          const subKv = trimmed.match(/^([^:]+):\s*(.*)$/);
          if (subKv) {
            const subKey = subKv[1].trim();
            let subVal: unknown = subKv[2].trim();
            // 简单数组： [a, b, c]
            if (typeof subVal === 'string' && subVal.startsWith('[') && subVal.endsWith(']')) {
              subVal = subVal.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, ''));
            }
            // boolean
            if (subVal === 'true') subVal = true;
            if (subVal === 'false') subVal = false;

            if (typeof data[currentKey] === 'object' && data[currentKey] !== null) {
              (data[currentKey] as Record<string, unknown>)[subKey] = subVal;
            }
          }
        }
      }
      return { data, content: m[2] };
    } catch {
      return { data: {}, content: text };
    }
  }
  return { data: {}, content: text };
}

// ── 扫描生成 ────────────────────────────────────────────────────────────

/**
 * 从 asset-bundle/agents/*.md 扫描 front-matter 生成专家清单。
 */
function generateExpertManifest(bundleDir: string): ExpertManifestEntry[] {
  const agentsDir = path.join(bundleDir, 'agents');
  const entries: ExpertManifestEntry[] = [];
  try {
    if (!fs.existsSync(agentsDir)) return entries;
    const files = fs.readdirSync(agentsDir).filter(f => f.endsWith('.md'));
    for (const file of files) {
      const id = file.replace(/\.md$/i, '');
      const raw = fs.readFileSync(path.join(agentsDir, file), 'utf8');
      const { data } = parseFrontMatter(raw);
      const meta = (data.metadata ?? {}) as Record<string, unknown>;

      entries.push({
        id,
        name: (data.name as string) ?? id,
        description: (data.description as string) ?? (meta.description as string) ?? '',
        category_id: (meta.category_id as string) ?? '',
        category_name: (meta.category_name as string) ?? '',
        tags: Array.isArray(meta.tags) ? (meta.tags as string[]) : [],
        expert_type: (meta.expert_type as string) ?? 'single',
        avatar: (meta.avatar as string) ?? '',
        prompt_ref: (meta.prompt_ref as string) ?? '',
        do_not_redistribute: (meta.do_not_redistribute as boolean) ?? false,
        source: (meta.source as string) ?? 'unknown',
        license: (meta.license as string) ?? 'MIT',
      });
    }
  } catch { /* 目录不存在或读失败 */ }
  return entries;
}

/**
 * 从 asset-bundle/skills/ 扫描生成技能清单。
 */
function generateSkillManifest(bundleDir: string): SkillManifestEntry[] {
  const skillsDir = path.join(bundleDir, 'skills');
  const entries: SkillManifestEntry[] = [];
  try {
    if (!fs.existsSync(skillsDir)) return entries;
    const dirs = fs.readdirSync(skillsDir, { withFileTypes: true })
      .filter(d => d.isDirectory() && !d.name.startsWith('.'));
    for (const d of dirs) {
      const name = d.name;
      const skillPath = name;
      const mdPath = path.join(skillsDir, name, 'SKILL.md');

      let description = name;
      let author: string | undefined;
      const tags: string[] = [];

      try {
        if (fs.existsSync(mdPath)) {
          const raw = fs.readFileSync(mdPath, 'utf8').slice(0, 4096);
          // 提取 # Title
          const titleMatch = raw.match(/^#\s+(.+)$/m);
          if (titleMatch) description = titleMatch[1].trim();
          // 提取 author
          const authorMatch = raw.match(/author[:\s]+(.+)$/im);
          if (authorMatch) author = authorMatch[1].trim();
          // 提取 tags
          const tagsMatch = raw.match(/tags?[:\s]*\[(.+)\]/i);
          if (tagsMatch) {
            tags.push(...tagsMatch[1].split(',').map(t => t.trim().replace(/^["']|["']$/g, '')));
          }
        }
      } catch { /* 单个技能读取失败不影响整体 */ }

      entries.push({ name, description, tags, author, skillPath });
    }
  } catch { /* 目录不存在 */ }
  return entries;
}

/**
 * 从 asset-bundle/mcp/ 扫描生成 MCP 清单。
 */
function generateMcpManifest(bundleDir: string): McpManifestEntry[] {
  const mcpDir = path.join(bundleDir, 'mcp');
  const entries: McpManifestEntry[] = [];
  try {
    if (!fs.existsSync(mcpDir)) return entries;
    const dirs = fs.readdirSync(mcpDir, { withFileTypes: true })
      .filter(d => d.isDirectory() && !d.name.startsWith('.'));
    for (const d of dirs) {
      const id = d.name;
      const metaPath = path.join(mcpDir, id, 'connector-meta.json');
      const mcpJsonPath = path.join(mcpDir, id, 'mcp.json');

      let meta: Record<string, unknown> = {};
      try {
        if (fs.existsSync(metaPath)) {
          meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
        }
      } catch { /* connector-meta.json 不存在或格式错误 */ }

      let mcpConfig: Record<string, unknown> = {};
      try {
        if (fs.existsSync(mcpJsonPath)) {
          mcpConfig = JSON.parse(fs.readFileSync(mcpJsonPath, 'utf8'));
        }
      } catch { /* mcp.json 不存在或格式错误 */ }

      // 从 mcp.json 读取 server 配置
      const servers = (mcpConfig.mcpServers ?? {}) as Record<string, Record<string, unknown>>;
      const serverEntry = servers[id] ?? {};
      const transport = (serverEntry.type as string)
        ?? (serverEntry.command ? 'stdio' : serverEntry.url ? 'http' : 'stdio');

      entries.push({
        id,
        name: (meta.name as string) ?? id,
        name_en: meta.name_en as string | undefined,
        description: (meta.description_zh as string) ?? (meta.description as string) ?? id,
        description_zh: meta.description_zh as string | undefined,
        source: (meta.source as string) ?? id,
        type: (meta.type as string) ?? 'mcp',
        version: meta.version as string | undefined,
        transport,
        command: serverEntry.command as string | undefined,
        args: serverEntry.args as string[] | undefined,
        env: serverEntry.env as Record<string, string> | undefined,
        url: serverEntry.url as string | undefined,
        timeout: serverEntry.timeout as number | undefined,
        tags: (meta.examples_zh as string[])?.slice(0, 5),
        examples_zh: meta.examples_zh as string[] | undefined,
        examples_en: meta.examples_en as string[] | undefined,
      });
    }
  } catch { /* 目录不存在 */ }
  return entries;
}

// ── 写入 manifest ───────────────────────────────────────────────────────

/**
 * 将 manifest JSON 写入缓存目录（含必要的子目录创建）。
 */
function writeManifestFile(kind: CacheKind, data: unknown): void {
  const fp = manifestPath(kind);
  const dir = path.dirname(fp);
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(fp, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    throw new Error(`Failed to write manifest ${kind}: ${(err as Error).message}`);
  }
}

// ── 主入口：refreshManifest ─────────────────────────────────────────────

/** refreshManifest 返回值 */
export interface RefreshResult {
  ok: boolean;
  kind: CacheKind;
  reason?: string;
  entryCount?: number;
}

/**
 * 刷新单个 kind 的缓存 manifest。
 *
 * 从 asset-bundle 目录读取源数据 → 生成 JSON → 写入 cos-cache/。
 *
 * @returns RefreshResult — ok=false 时 reason 说明原因
 */
export function refreshManifest(kind: CacheKind): RefreshResult {
  ensureCacheDir();

  const bundleDir = assetBundleDir();
  if (!fs.existsSync(bundleDir)) {
    return { ok: false, kind, reason: 'no_bundle' };
  }

  try {
    let data: unknown;
    switch (kind) {
      case 'experts': {
        const entries = generateExpertManifest(bundleDir);
        data = {
          generated_at: new Date().toISOString(),
          count: entries.length,
          entries,
        };
        writeManifestFile(kind, data);
        return { ok: true, kind, entryCount: entries.length };
      }
      case 'skills': {
        const entries = generateSkillManifest(bundleDir);
        data = {
          generated_at: new Date().toISOString(),
          count: entries.length,
          entries,
        };
        writeManifestFile(kind, data);
        return { ok: true, kind, entryCount: entries.length };
      }
      case 'connectors': {
        const entries = generateMcpManifest(bundleDir);
        data = {
          generated_at: new Date().toISOString(),
          count: entries.length,
          entries,
        };
        writeManifestFile(kind, data);
        return { ok: true, kind, entryCount: entries.length };
      }
      default: {
        const _exhaustive: never = kind;
        return { ok: false, kind: _exhaustive, reason: 'unknown_kind' };
      }
    }
  } catch (err) {
    return { ok: false, kind, reason: (err as Error).message };
  }
}

/**
 * 刷新所有三种 manifest。
 *
 * @returns 按 kind 索引的结果映射
 */
export function refreshAllManifests(): Record<CacheKind, RefreshResult> {
  const kinds: CacheKind[] = ['experts', 'skills', 'connectors'];
  const results = {} as Record<CacheKind, RefreshResult>;
  for (const k of kinds) {
    results[k] = refreshManifest(k);
  }
  return results;
}

/**
 * 按需刷新：仅当缓存不存在或过期时才从 asset-bundle 刷新。
 *
 * @returns 被刷新的 kind 列表（跳过的不在其中）
 */
export function refreshIfStale(): Record<CacheKind, RefreshResult> {
  const results = {} as Record<CacheKind, RefreshResult>;
  const kinds: CacheKind[] = ['experts', 'skills', 'connectors'];
  for (const k of kinds) {
    if (isCacheStale(k)) {
      results[k] = refreshManifest(k);
    } else {
      results[k] = { ok: true, kind: k, reason: 'cache_fresh' };
    }
  }
  return results;
}
