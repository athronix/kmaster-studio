/**
 * useSidebarCounts —— 左栏「专家 / 技能 / MCP」计数徽标聚合层（B7）。
 *
 * 用途：F-03 左栏菜单右侧的 `{installed} / {total}` 徽标。
 * 数据源：`GET /api/agents?source=all`、`GET /api/skills` + `?source=candidates`、`GET /api/mcp`。
 * 对应需求：F-03，去重口径见设计 §3.6，徽标渲染规则见 §7.9。
 *
 * ## 为什么要有这一层（D3）
 * 现有 `useExpertList` / `useSkillList` / `useMcpList` 三个 composable **都在 setup 时
 * 自动 `refresh()`**（F18）。左栏是常驻组件，直接调用它们会在每次挂载时打 3~4 个额外请求，
 * 且每个消费方各持一份状态。本文件用 **module-scope 单例 + 手动 refresh** 收敛：
 *   - 状态定义在模块作用域 → 多处 `useSidebarCounts()` 共享同一份数据；
 *   - **不 auto-refresh** → 由 `LeftSidebar` 在 `onMounted` 显式调一次；
 *   - 三源 `Promise.allSettled` 并行 → 单源失败不影响其余两个出数。
 */
import { computed, ref, type ComputedRef, type Ref } from 'vue';
import { getAgents, getSkills, getMcpList, http } from '../api/client';
import type { CountPair, SidebarCounts } from '../types/chat';
import type { SkillAsset } from '../types/asset';

/** 空数对（未就绪时的初值；`total===0` → 徽标不渲染，§7.9）。 */
function emptyPair(): CountPair {
  return { installed: 0, total: 0 };
}

/**
 * 按唯一键去重计数（§3.6）。
 * 空串 / null / undefined 键一律丢弃，避免把「无名条目」算成一个。
 */
export function dedupeCount<T>(list: readonly T[], keyOf: (x: T) => string | undefined | null): number {
  const seen = new Set<string>();
  for (const item of list) {
    const key = keyOf(item);
    if (typeof key === 'string' && key.trim() !== '') seen.add(key.trim());
  }
  return seen.size;
}

// ── module-scope 单例状态（多组件共享同一份）──
const experts = ref<CountPair>(emptyPair());
const skills = ref<CountPair>(emptyPair());
const mcp = ref<CountPair>(emptyPair());
const loading = ref(false);
const loaded = ref(false);
const error = ref('');
/** 进行中的请求，用于并发去重（多组件同帧调 refresh 只发一轮） */
let inflight: Promise<void> | null = null;

/** 专家计数：唯一键 = `name`。 */
async function fetchExperts(): Promise<CountPair> {
  const data = await getAgents('all');
  const installedList = data.installed ?? [];
  const candidateList = data.candidates ?? [];
  return {
    installed: dedupeCount(installedList, (e) => e.name),
    total: dedupeCount([...installedList, ...candidateList], (e) => e.name),
  };
}

/** 技能计数：唯一键 = `name`。候选源失败时降级为「只算已装」。 */
async function fetchSkills(): Promise<CountPair> {
  const installedList = await getSkills();
  let candidateList: SkillAsset[] = [];
  try {
    const res = await http<{ candidates: SkillAsset[] }>('/api/skills?source=candidates');
    candidateList = res.candidates ?? [];
  } catch {
    // 候选池是增强信息，拿不到不应让整个徽标失败（与 useSkillList 的容错策略一致）
    candidateList = [];
  }
  return {
    installed: dedupeCount(installedList, (s) => s.name),
    total: dedupeCount(
      [
        ...installedList.map((s) => ({ name: s.name })),
        ...candidateList.map((c) => ({ name: c.name })),
      ],
      (s) => s.name
    ),
  };
}

/** MCP 计数：唯一键 = `id ?? name`（部署态没有 id，只能用 name）。 */
async function fetchMcp(): Promise<CountPair> {
  const { deployed, candidates } = await getMcpList();
  const deployedList = deployed ?? [];
  const candidateList = candidates ?? [];
  const keyOf = (m: { id?: string; name?: string }): string => m.id ?? m.name ?? '';
  return {
    installed: dedupeCount(deployedList, keyOf),
    total: dedupeCount([...deployedList, ...candidateList] as { id?: string; name?: string }[], keyOf),
  };
}

/**
 * 拉取三类计数。
 *
 * `Promise.allSettled` 保证**单源失败不影响其余**（B8 验收项）：
 * 失败的那一类保持上一次的值（首次则为 `{0,0}` → 徽标不渲染），
 * 并把首条错误信息写入 `error` 供 F5 错误态展示。
 */
async function runRefresh(): Promise<void> {
  loading.value = true;
  error.value = '';
  const [e, s, m] = await Promise.allSettled([fetchExperts(), fetchSkills(), fetchMcp()]);

  const messages: string[] = [];
  if (e.status === 'fulfilled') experts.value = e.value;
  else messages.push(e.reason instanceof Error ? e.reason.message : '专家计数加载失败');

  if (s.status === 'fulfilled') skills.value = s.value;
  else messages.push(s.reason instanceof Error ? s.reason.message : '技能计数加载失败');

  if (m.status === 'fulfilled') mcp.value = m.value;
  else messages.push(m.reason instanceof Error ? m.reason.message : 'MCP 计数加载失败');

  error.value = messages.join('；');
  loaded.value = true;
  loading.value = false;
}

export interface UseSidebarCountsReturn {
  counts: ComputedRef<SidebarCounts>;
  experts: Ref<CountPair>;
  skills: Ref<CountPair>;
  mcp: Ref<CountPair>;
  loading: Ref<boolean>;
  /** 是否已完成过至少一次拉取（未完成时徽标显示骨架而非 `0 / 0`） */
  loaded: Ref<boolean>;
  error: Ref<string>;
  refresh: () => Promise<void>;
  /** 已加载过就直接返回，用于左栏挂载时的「至多一次」拉取 */
  ensureLoaded: () => Promise<void>;
  /** 仅供单测：把单例状态复位 */
  __reset: () => void;
}

/**
 * 左栏计数聚合（**模块级单例，手动 refresh，不 auto-refresh**）。
 */
export function useSidebarCounts(): UseSidebarCountsReturn {
  const counts = computed<SidebarCounts>(() => ({
    experts: experts.value,
    skills: skills.value,
    mcp: mcp.value,
  }));

  /** 并发去重：同帧多次调用只发一轮请求。 */
  async function refresh(): Promise<void> {
    if (inflight) return inflight;
    inflight = runRefresh().finally(() => {
      inflight = null;
    });
    return inflight;
  }

  /**
   * 「至多一次」拉取：已完成过就直接返回，不再打请求。
   *
   * ⚠️ 缺陷 #2 修复：原实现两个分支都是 `return refresh()`，等价于 `ensureLoaded = refresh`，
   * 左栏每次重新挂载都会重打 4 个请求（agents + skills + skills?source=candidates + mcp），
   * 恰好抵消了本 composable 存在的意义（规避 F18 的重复请求）。
   */
  async function ensureLoaded(): Promise<void> {
    if (loaded.value) return;
    // 未完成：`refresh()` 内部已做 inflight 去重，并发调用共享同一轮请求
    return refresh();
  }

  function __reset(): void {
    experts.value = emptyPair();
    skills.value = emptyPair();
    mcp.value = emptyPair();
    loading.value = false;
    loaded.value = false;
    error.value = '';
    inflight = null;
  }

  return { counts, experts, skills, mcp, loading, loaded, error, refresh, ensureLoaded, __reset };
}
