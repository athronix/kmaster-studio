/**
 * market.ts — 卡片市场类型定义。
 *
 * V2 增量：定义 Expert / ExpertTeam / Skill / McpServer
 * 及 CardItem 基类，EntityDef 联合类型。
 *
 * U-09：MOCK_EXPERTS / MOCK_TEAMS / MOCK_SKILLS / MOCK_MCPS 四个常量已删除。
 * 所有面板现从真实 /api/* 端点获取数据。
 */

import type { ComputedRef, Ref } from 'vue';

// ═══════════════════ 基础类型 ═══════════════════

/** 卡片基类 */
export interface CardItem {
  id: string;
  name: string;
  icon: string;
  description: string;
  tags: string[];
}

/** 实体类型判别 */
export type EntityType = 'expert' | 'expertTeam' | 'skill' | 'mcp';

/** 排序方式 */
export type SortOrder = 'default' | 'hot' | 'newest';

// ═══════════════════ 专家 ═══════════════════

export interface Expert extends CardItem {
  entityType: 'expert';
  expertise: string;
  scenarios: string[];
  samplePrompts: string[];
  category: string;
  domain: string;
  featured: boolean;
}

// ═══════════════════ 专家团 ═══════════════════

export interface ExpertTeam extends CardItem {
  entityType: 'expertTeam';
  skillDesc: string;
  scenarios: string[];
  samplePrompts: string[];
  category: string;
  domain: string;
  featured: boolean;
  members: Expert[];
}

// ═══════════════════ 技能 ═══════════════════

export interface Skill extends CardItem {
  entityType: 'skill';
  englishName: string;
  source: 'marketplace' | 'local' | 'url';
  scenarios: string[];
  samplePrompts: string[];
  installed: boolean;
}

// ═══════════════════ Schema 桩类型 ═══════════════════

export interface ToolSchema {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ResourceSchema {
  uri: string;
  name: string;
  description: string;
  mimeType?: string;
}

export interface PromptSchema {
  name: string;
  description: string;
  arguments?: Array<{ name: string; description: string; required: boolean }>;
}

// ═══════════════════ MCP ═══════════════════

export interface McpServer extends CardItem {
  entityType: 'mcp';
  englishName: string;
  source: string;
  capabilities: {
    tools: string[];
    resources: string[];
    prompts: string[];
  };
  scenarios: string[];
  samplePrompts: string[];
  deployJson: string;
  deployed: boolean;
  toolSchemas?: ToolSchema[];
  resourceSchemas?: ResourceSchema[];
  promptSchemas?: PromptSchema[];
}

// ═══════════════════ 联合类型 ═══════════════════

export type EntityDef = Expert | ExpertTeam | Skill | McpServer;

// ═══════════════════ 类型守卫 ═══════════════════

export function isExpert(e: EntityDef): e is Expert {
  return e.entityType === 'expert';
}

export function isExpertTeam(e: EntityDef): e is ExpertTeam {
  return e.entityType === 'expertTeam';
}

export function isSkill(e: EntityDef): e is Skill {
  return e.entityType === 'skill';
}

export function isMcp(e: EntityDef): e is McpServer {
  return e.entityType === 'mcp';
}

// ═══════════════════ 实体工具函数 ═══════════════════

/**
 * 根据实体类型获取对应的 actionType 展示文案:
 * Expert/ExpertTeam → "召唤"
 * Skill → installed ? "卸载" : "安装"
 * McpServer → deployed ? "卸载" : "部署"
 */
export function getActionLabel(entity: EntityDef): string {
  switch (entity.entityType) {
    case 'expert':
    case 'expertTeam':
      return '召唤';
    case 'skill':
      return (entity as Skill).installed ? '卸载' : '安装';
    case 'mcp':
      return (entity as McpServer).deployed ? '卸载' : '部署';
    default:
      return '操作';
  }
}

/** 获取 entity 的 tags（所有实体都有 tags 字段） */
export function getAllTags(entities: EntityDef[]): string[] {
  const set = new Set<string>();
  for (const e of entities) {
    for (const t of e.tags) set.add(t);
  }
  return Array.from(set);
}

/** 获取 entity 的 categories（experts/teams 才有） */
export function getAllCategories(entities: EntityDef[]): string[] {
  const set = new Set<string>();
  for (const e of entities) {
    if ('category' in e && e.category) set.add(e.category);
  }
  return Array.from(set);
}

// ═══════════════════ T01：市场列表统一类型 ═══════════════════

/** 统一资源项 —— agent/skill/mcp 三类实体的规范化视图。 */
export interface ResourceItem {
  id: string;
  name: string;
  icon: string;
  description: string;
  tags: string[];
  category: string;
  installed: boolean;
  source: string;
}

/**
 * `useMarketList` 的行为选项。
 *
 * 由 `MarketLayout` 从 `props.config.showFeatured`（单一真源）下发，
 * 经 `MarketConfig.useList(opts)` 透传给 `useMarketList`。
 */
export interface MarketListOptions {
  /**
   * 是否启用「精选推荐」模块。
   *
   * 它同时控制两件事（必须同生同灭）：
   *   ① 精选模块是否有数据（进而是否显示）；
   *   ② 资源市场是否剔除已进精选的项（dedup）。
   * `false` 时资源市场返回完整候选集，不会「凭空少卡」。
   */
  showFeatured: boolean;
}

/** 市场配置 —— 由 ExpertsView / SkillsView / McpView / SettingsView 各自提供。 */
export interface MarketConfig {
  title: string;
  entityType: 'expert' | 'skill' | 'mcp';
  primaryTabs: Array<{ key: string; label: string; count: number }>;
  /** 数据源 composable，返回当前市场的列表状态。 */
  useList: (opts: MarketListOptions) => MarketListState;
  showFeatured: boolean;
  settingsMode: boolean;
}

/**
 * 市场列表的完整状态与方法 —— useMarketList 的返回类型。
 *
 * 数据字段均为 Vue Ref / ComputedRef（在 \<template\> 中自动解包），
 * 方法字段为普通函数引用。
 *
 * 分页命名约定：
 *   - 资源市场沿用历史名 `currentPage` / `totalPages` / `goToPage`；
 *   - 精选推荐用 `featured*` 前缀，已安装用 `installed*` 前缀；
 *   - 三组页码完全独立，切换其一不影响其余两个模块。
 */
export interface MarketListState {
  state: Ref<{ loading: boolean; error: string }>;
  /** 已安装 —— 当前页切片 */
  installedItems: ComputedRef<ResourceItem[]>;
  /** 资源市场 —— 当前页切片（含条件 dedup） */
  candidateItems: ComputedRef<ResourceItem[]>;
  /** 精选推荐 —— 当前页切片；精选未生效时为空数组 */
  featuredItems: ComputedRef<ResourceItem[]>;
  categories: ComputedRef<string[]>;
  selectedCategory: Ref<string>;
  searchQuery: Ref<string>;
  sortOrder: Ref<SortOrder>;
  /** 已安装总数（供数量徽标使用，非当前页长度） */
  installedCount: ComputedRef<number>;
  /** 精选推荐当前页码 */
  featuredPage: Ref<number>;
  featuredTotalPages: ComputedRef<number>;
  /** 已安装当前页码 */
  installedPage: Ref<number>;
  installedTotalPages: ComputedRef<number>;
  /** 资源市场当前页码 */
  currentPage: Ref<number>;
  totalPages: ComputedRef<number>;
  filterByCategory: (cat: string) => void;
  search: (q: string) => void;
  setSort: (s: SortOrder) => void;
  goToFeaturedPage: (p: number) => void;
  goToInstalledPage: (p: number) => void;
  goToPage: (p: number) => void;
  /** 在**全量原始数据**中按 id 查找，避免跨页误查 */
  findById: (id: string) => ResourceItem | undefined;
}
