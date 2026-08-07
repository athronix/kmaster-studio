/**
 * constants/sidebar.ts —— 左栏增强的常量单一真源（B3，设计 §3.4）。
 *
 * 用途：Recent 分组口径、折叠 key 命名空间、会话行三态、工作区排序、运行状态映射。
 * 对应需求：F-01 / F-04 / F-05 / F-09 / F-10。
 *
 * 纪律同 `constants/layout.ts`：不 import 任何业务模块，杜绝循环依赖；
 * 组件内**禁止**写这些字面量。
 */

/** Q2：Recent 分组口径（「倒序前 N 条」∪「N 小时内活跃」∪ running）。 */
export const RECENT_DEFAULTS = {
  /** 倒序前 N 条 */
  maxCount: 5,
  /** N 小时内活跃 */
  withinHours: 3,
} as const;

/** Recent 并集结果的硬上限（防止 running 会话过多撑爆左栏）。 */
export const RECENT_HARD_CAP = 20;

/**
 * 固定分组的 collapse name（§3.8）。
 *
 * ⚠️ 前缀 `__` 是为了杜绝与真实目录名撞车 —— 用户完全可能有个目录就叫 `Recent`。
 */
export const SIDEBAR_GROUP = {
  RECENT: '__recent__',
  PINNED: '__pinned__',
} as const;

export type SidebarGroupKey = (typeof SIDEBAR_GROUP)[keyof typeof SIDEBAR_GROUP];

/**
 * 折叠态 localStorage key 命名空间（单键存 `Record<string, boolean>`，D4）。
 * 值语义统一为「是否折叠」：`true` = 收起，`false`/缺失 = 展开。
 */
export const SIDEBAR_COLLAPSE_KEYS = {
  recent: 'group:recent',
  pinned: 'group:pinned',
  workspace: (name: string): string => `ws:${name}`,
  jobsRoot: 'group:jobs',
  job: (jobId: string): string => `job:${jobId}`,
} as const;

/**
 * 会话行三态（Q8：分组非互斥，但行内视觉态互斥）。
 * 优先级：running > active > idle。
 */
export const SESSION_ROW_STATE = {
  running: 'running',
  active: 'active',
  idle: 'idle',
} as const;

export type SessionRowState = (typeof SESSION_ROW_STATE)[keyof typeof SESSION_ROW_STATE];

/**
 * 未绑定工作目录的分组 key。
 *
 * ⚠️ **必须保持英文 `'Default Workspace'` 不变**（F24）：它同时是
 * `types/newTask.ts` 里 `defaultNewTaskConfig().workspace` 的**实际落库值**，
 * 改字符串会污染 DB。中文展示文案单独走 i18n `sidebar.unboundWorkspace`。
 */
export const UNBOUND_WORKSPACE_KEY = 'Default Workspace';

/**
 * 工作区分组排序（U7 / PM 裁决，§7.6b，**不可更改**）。
 *
 * 用户原文：「以工作目录（按名称排列）为分类会话list」。
 * ⚠️ 不要"优化"成按活跃度排组间顺序 —— 那会让分组每次打开位置都变，
 * 功能上退化成第二个 Recent，与既有 Recent 分组重复。
 */
export const WORKSPACE_SORT = {
  /** 组间：目录名字典序升序；未绑定组恒置最末（兜底桶置底通例）。 */
  compareGroup(a: string, b: string): number {
    if (a === b) return 0;
    if (a === UNBOUND_WORKSPACE_KEY) return 1;
    if (b === UNBOUND_WORKSPACE_KEY) return -1;
    return a.localeCompare(b, 'zh-CN');
  },
  /** 组内：`updated_at` 倒序。 */
  compareSession(a: { updated_at: number }, b: { updated_at: number }): number {
    return b.updated_at - a.updated_at;
  },
} as const;

/** 运行状态 → 展示映射（大小写不敏感，查表前先 `toLowerCase()`）。 */
export const JOB_RUN_STATUS_MAP: Record<
  string,
  { label: string; type: 'success' | 'error' | 'warning' | 'default' }
> = {
  success: { label: '成功', type: 'success' },
  ok: { label: '成功', type: 'success' },
  failed: { label: '失败', type: 'error' },
  error: { label: '失败', type: 'error' },
  running: { label: '运行中', type: 'warning' },
  unknown: { label: '未知', type: 'default' },
};

/** 查表取运行状态展示；未知状态回落 `unknown` 档。 */
export function jobRunStatusOf(status: string | null | undefined): {
  label: string;
  type: 'success' | 'error' | 'warning' | 'default';
} {
  const key = String(status ?? '').trim().toLowerCase();
  return JOB_RUN_STATUS_MAP[key] ?? JOB_RUN_STATUS_MAP.unknown;
}

/** 成功率徽标阈值（E1）：`≥90` success、`60-89` warning、`<60` error、`-1` 不渲染。 */
export const SUCCESS_RATE_THRESHOLD = {
  good: 90,
  warn: 60,
  /** 无运行记录的哨兵值，前端据此不渲染徽标 */
  none: -1,
} as const;

/** 成功率 → 徽标类型；`-1` 返回 `null` 表示不渲染。 */
export function successRateType(rate: number): 'success' | 'warning' | 'error' | null {
  if (!Number.isFinite(rate) || rate < 0) return null;
  if (rate >= SUCCESS_RATE_THRESHOLD.good) return 'success';
  if (rate >= SUCCESS_RATE_THRESHOLD.warn) return 'warning';
  return 'error';
}

/** 首页最近会话卡片数量上限（D1 / F-01）。 */
export const HOME_RECENT_CARD_MAX = 6;

/** 计数徽标未就绪时的占位（§7.9：不显示 `0 / 0`）。 */
export const COUNT_PLACEHOLDER = '—';
