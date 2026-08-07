/**
 * asset.ts — 统一资产类型定义（T06：COS 资产缓存层底座）
 *
 * 三种资产（专家 / 技能 / MCP）的统一接口层。同时供 server 端（COS 缓存、hermes 读取）
 * 和 client 端（设置页 / 卡片页 UI）消费。
 *
 * 依赖方向：单向，无环。本文件为纯类型文件，不导入任何业务模块。
 *
 * @module types/asset
 */

// ═══════════════════════ 基础枚举 ═══════════════════════

/** 资产来源标识 */
export type AssetSource = 'hermes' | 'cos' | 'skillhub' | 'user';

/** MCP 传输协议 */
export type McpTransport = 'stdio' | 'http' | 'sse';

/** MCP 认证模式 */
export type McpAuthMode = 'none' | 'token' | 'oauth';

// ═══════════════════════ 统一基类 ═══════════════════════

/**
 * 三种资产（专家 / 技能 / MCP）的统一基类接口。
 * 设置页 / 卡片页所有面板均以 AssetItem[] 消费，通过 source + category 区分来源。
 */
export interface AssetItem {
  /** 全局唯一 ID（格式：`{source}:{kind}:{name}` 如 `cos:expert:academic-journal-selector`） */
  id: string;
  /** 展示名称 */
  name: string;
  /** 描述文本 */
  description: string;
  /** 资产来源 */
  source: AssetSource;
  /** 分类标签（专家：category_name；技能：从 SKILL.md 推断；MCP：connector-meta.type） */
  category?: string;
  /** 图标 URL 或 emoji（无图标时回落到默认占位） */
  icon?: string;
  /** 是否已安装（hermes 本地已有 / user 已添加） */
  installed: boolean;
  /** 版本号 */
  version?: string;
}

// ═══════════════════════ 专家资产 ═══════════════════════

/**
 * 专家资产（从 COS expert_center.json 或本地 agents/*.md front-matter 解析）。
 *
 * 扩展字段对应 front-matter metadata 及 expert_center.json 的结构。
 */
export interface ExpertAsset extends AssetItem {
  /** 专家领域（对应 metadata.expert_type，如 "team" / "single"） */
  profession: string;
  /** 标签列表（metadata.tags） */
  tags: string[];
  /** 实际 prompt 文件路径（本地缓存落盘路径，server 侧消费） */
  promptFile?: string;
  /** COS 分类 ID（metadata.category_id） */
  categoryId?: string;
  /** 是否禁止再分发（metadata.do_not_redistribute） */
  doNotRedistribute: boolean;
  /** COS prompt 引用 URL（metadata.prompt_ref），用于后续在线下载 */
  promptRef?: string;
}

// ═══════════════════════ 技能资产 ═══════════════════════

/**
 * 技能资产（从 COS skill-marketplace 或本地 skills/ 目录解析）。
 */
export interface SkillAsset extends AssetItem {
  /** 作者 / 来源仓库 */
  author?: string;
  /** 标签列表 */
  tags: string[];
  /** 技能目录名（本地缓存中 skills/<skillPath>/SKILL.md 的相对路径） */
  skillPath: string;
}

// ═══════════════════════ MCP 资产 ═══════════════════════

/**
 * MCP 连接器资产（从 COS connectors-config 或本地 mcp/ 目录解析）。
 */
export interface McpAsset extends AssetItem {
  /** 传输协议 */
  transport: McpTransport;
  /** stdio 命令（transport === 'stdio' 时必填） */
  command?: string;
  /** stdio 参数 */
  args?: string[];
  /** stdio 环境变量 */
  env?: Record<string, string>;
  /** HTTP/SSE URL（transport === 'http' | 'sse' 时必填） */
  url?: string;
  /** 认证模式 */
  authMode: McpAuthMode;
  /** 超时（毫秒，默认 30000） */
  timeout?: number;
}

// ═══════════════════════ 联合类型 & 类型守卫 ═══════════════════════

/** 任意资产类型的联合 */
export type AnyAsset = ExpertAsset | SkillAsset | McpAsset;

/** 资产种类标识 */
export type AssetKind = 'expert' | 'skill' | 'mcp';

/**
 * 从 AssetItem 推断是否为专家资产。
 * 运行时安全：检查 profession 字段是否存在。
 */
export function isExpertAsset(item: AssetItem): item is ExpertAsset {
  return 'profession' in item && Array.isArray((item as ExpertAsset).tags);
}

/**
 * 从 AssetItem 推断是否为技能资产。
 */
export function isSkillAsset(item: AssetItem): item is SkillAsset {
  return 'skillPath' in item && typeof (item as SkillAsset).skillPath === 'string';
}

/**
 * 从 AssetItem 推断是否为 MCP 资产。
 */
export function isMcpAsset(item: AssetItem): item is McpAsset {
  return 'transport' in item && typeof (item as McpAsset).transport === 'string';
}
