/**
 * asset.ts — 客户端资产类型（T06：COS 资产缓存层底座）
 *
 * 从 server 端 types/asset.ts 提取前端展示所需的类型。
 * 前端只需要展示字段 + 数据源状态包装，不需要 server 侧的文件路径等内部字段。
 *
 * 加 DataSourceState 包装，对齐 U-18 诚实降级基础设施。
 *
 * @module types/asset
 */

import { DataSourceState } from './dataSource';

// ═══════════════════════ 基础类型（与 server/types/asset.ts 保持一致）═══════════════════════

/** 资产来源标识 */
export type AssetSource = 'hermes' | 'cos' | 'skillhub' | 'user';

/** MCP 传输协议 */
export type McpTransport = 'stdio' | 'http' | 'sse';

/** MCP 认证模式 */
export type McpAuthMode = 'none' | 'token' | 'oauth';

/** 资产种类标识 */
export type AssetKind = 'expert' | 'skill' | 'mcp';

// ═══════════════════════ 统一基类 ═══════════════════════

/**
 * 三种资产（专家 / 技能 / MCP）的统一基类接口。
 * 设置页 / 卡片页所有面板均以 AssetItem[] 消费。
 */
export interface AssetItem {
  id: string;
  name: string;
  description: string;
  source: AssetSource;
  category?: string;
  icon?: string;
  installed: boolean;
  version?: string;
}

// ═══════════════════════ 专家资产 ═══════════════════════

/**
 * 专家资产（前端展示用，不含 server 侧文件路径字段）。
 */
export interface ExpertAsset extends AssetItem {
  profession: string;
  tags: string[];
  categoryId?: string;
  doNotRedistribute: boolean;
  promptRef?: string;
}

// ═══════════════════════ 技能资产 ═══════════════════════

/**
 * 技能资产（前端展示用）。
 */
export interface SkillAsset extends AssetItem {
  author?: string;
  tags: string[];
  skillPath: string;
}

// ═══════════════════════ MCP 资产 ═══════════════════════

/**
 * MCP 连接器资产（前端展示用，含传输配置用于 UI 展示和部署操作）。
 */
export interface McpAsset extends AssetItem {
  transport: McpTransport;
  command?: string;
  url?: string;
  authMode: McpAuthMode;
}

// ═══════════════════════ 联合类型 & 类型守卫 ═══════════════════════

/** 任意资产类型的联合 */
export type AnyAsset = ExpertAsset | SkillAsset | McpAsset;

/** 从 AssetItem 推断是否为专家资产 */
export function isExpertAsset(item: AssetItem): item is ExpertAsset {
  return 'profession' in item && Array.isArray((item as ExpertAsset).tags);
}

/** 从 AssetItem 推断是否为技能资产 */
export function isSkillAsset(item: AssetItem): item is SkillAsset {
  return 'skillPath' in item && typeof (item as SkillAsset).skillPath === 'string';
}

/** 从 AssetItem 推断是否为 MCP 资产 */
export function isMcpAsset(item: AssetItem): item is McpAsset {
  return 'transport' in item && typeof (item as McpAsset).transport === 'string';
}

// ═══════════════════════ 数据源状态包装 ═══════════════════════

/**
 * 带数据源状态的资产列表。
 *
 * 面板组件用此类型做诚实降级渲染：
 * - Live → 正常展示卡片列表
 * - Loading → Skeleton 占位
 * - Empty → 空状态插画
 * - Error → 错误提示 + 重试按钮
 * - Offline → 离线提示
 */
export interface AssetListState<T extends AssetItem = AssetItem> {
  state: DataSourceState;
  items: T[];
  error?: string;
}

/**
 * 创建初始 AssetListState（Loading 态，items 为空）。
 */
export function emptyAssetListState<T extends AssetItem = AssetItem>(): AssetListState<T> {
  return { state: DataSourceState.Loading, items: [] };
}
