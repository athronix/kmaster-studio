/**
 * useSkillList — 技能列表聚合操作（T09 重写，T02 对齐 hermes-studio）。
 *
 * 数据源：**单次** `GET /api/skills`（一次拿全 installed + candidates + categories）
 * + SkillHub 在线搜索（`GET /api/skillhub/skills?q=`）。
 *
 * T02 三处修正：
 *   - ST-01：`getSkills()` 现返回 `{ installed, candidates, categories }` 全量对象
 *   - ST-02：删除对同一端点追加候选过滤 query 的第二发请求（服务端从未消费该参数，
 *            等于把同一个全量响应又拉了一遍，纯浪费一次往返）
 *   - ST-03：SkillHub 搜索路径由一个并不存在的 /api/skills 子路径改为真实的
 *            `/api/skillhub/skills`（旧路径会被 `/api/skills/:name` 之类的路由误吞或 404）
 *
 * D1 业务口径（市场区）：
 *   1. 从 candidates 中**过滤掉已安装项**（按 name 小写比对）
 *   2. candidates 自身**按 name 去重**（COS 与 hermes 两个来源可能重名）
 *   3. 分类维度**只用后端下发的 `categories`**，🚫 不在前端另造 category 列表
 *
 * 向后兼容：保留 filtered / loading / refresh / install / uninstall 供
 * SkillManageSection.vue 使用。
 */
import { ref, computed } from 'vue';
import { DataSourceState } from '../types/dataSource';
import {
  getSkills,
  searchSkillHub as apiSearchSkillHub,
  installSkill as apiInstallSkill,
  uninstallSkill as apiUninstallSkill,
} from '../api/client';
import type { Skill as ChatSkill, SkillHubResult } from '../types/chat';
import type { SkillAsset } from '../types/asset';

/** 展示用技能数据 */
export interface SkillItem {
  id: string;
  name: string;
  icon: string;
  description: string;
  tags: string[];
  source: string;
  installed: boolean;
  version?: string;
  category?: string;
}

export function useSkillList() {
  // ── 状态 ──
  const state = ref<DataSourceState>(DataSourceState.Loading);
  const installedSkills = ref<SkillItem[]>([]);
  const candidateSkills = ref<SkillItem[]>([]);
  const allCandidates = ref<SkillItem[]>([]);
  /** D1：分类维度**只**来自后端 `GET /api/skills` 的 `categories`，前端不另造 */
  const categories = ref<string[]>([]);
  const searchQuery = ref('');
  const error = ref('');
  const loading = ref(false);

  // SkillHub 在线搜索结果
  const skillHubResults = ref<SkillHubResult[]>([]);
  const skillHubSearching = ref(false);

  // ── 派生 ──
  const installedCount = computed(() => installedSkills.value.length);
  const candidateCount = computed(
    () => candidateSkills.value.length + skillHubResults.value.length
  );

  // ── 兼容旧接口 ──
  const filtered = computed(() => installedSkills.value);

  // ── 映射 ──
  function mapInstalled(raw: ChatSkill[]): SkillItem[] {
    return raw.map((s) => ({
      id: `skill-${s.name}`,
      name: s.name,
      icon: 'Puzzle',
      description: s.description ?? '',
      tags: s.category ? [s.category] : [],
      source: 'hermes',
      installed: true,
      category: s.category,
    }));
  }

  // ── 内部过滤 ──
  function applyLocalFilter(): void {
    const q = searchQuery.value.trim().toLowerCase();
    if (!q) {
      candidateSkills.value = allCandidates.value;
      return;
    }
    candidateSkills.value = allCandidates.value.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        (s.tags ?? []).some((t: string) => t.toLowerCase().includes(q))
    );
  }

  /**
   * D1 口径：候选 → 展示项。
   * ① 过滤掉已安装项  ② 按 name 去重  ③ 保留后端给的 category（不前端另造）
   */
  function mapCandidates(raw: SkillAsset[], installedNames: Set<string>): SkillItem[] {
    const seen = new Set<string>();
    const result: SkillItem[] = [];
    for (const c of raw) {
      const key = (c.name ?? '').trim().toLowerCase();
      if (!key) continue;
      if (installedNames.has(key)) continue; // ① 市场区不重复展示已装项
      if (seen.has(key)) continue; // ② COS / hermes 双来源同名去重
      seen.add(key);
      result.push({
        id: c.id,
        name: c.name,
        icon: c.icon || 'Tool',
        description: c.description,
        tags: c.tags ?? [],
        source: c.source,
        installed: false, // 已装项已被过滤，剩下的一定未装
        version: c.version,
        category: c.category,
      });
    }
    return result;
  }

  // ── 操作 ──
  async function refresh(): Promise<void> {
    loading.value = true;
    state.value = DataSourceState.Loading;
    try {
      // ST-01/ST-02：**一次**请求拿全三段，不再追加那次带候选过滤 query 的幽灵往返
      const { installed, candidates: rawCandidates, categories: rawCategories } = await getSkills();

      installedSkills.value = mapInstalled(installed);

      const installedNames = new Set(
        installed.map((s) => (s.name ?? '').trim().toLowerCase()).filter(Boolean),
      );
      allCandidates.value = mapCandidates(rawCandidates, installedNames);

      // ③ 分类维度只认后端下发的 categories
      categories.value = rawCategories;

      applyLocalFilter();

      state.value =
        installedSkills.value.length === 0 && allCandidates.value.length === 0
          ? DataSourceState.Empty
          : DataSourceState.Live;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '加载技能列表失败';
      error.value = msg;
      state.value = DataSourceState.Error;
      // 失败时清空而不是留半截脏数据
      installedSkills.value = [];
      allCandidates.value = [];
      candidateSkills.value = [];
      categories.value = [];
    } finally {
      loading.value = false;
    }
  }

  function search(q: string): void {
    searchQuery.value = q;
    applyLocalFilter();
    if (q.trim().length > 0) {
      searchSkillHub(q.trim());
    } else {
      skillHubResults.value = [];
    }
  }

  /**
   * SkillHub 在线搜索（P2-2 双源）。
   *
   * ST-03：路径为真实存在的 `GET /api/skillhub/skills?q=`（server 端代理 lightmake.site，
   * 上游不可达时降级返回 `{ skills: [], source: 'offline' }`，🚫 不抛 500）。
   * 旧代码打的那个 /api/skills 搜索子路径在服务端根本不存在，会被 `/api/skills/:name` 误吞。
   */
  async function searchSkillHub(q: string): Promise<void> {
    skillHubSearching.value = true;
    try {
      // 网络与字段归一由 api/client.ts 的 searchSkillHub 负责（NFR1 分层：组合层零直接网络调用）
      const results = await apiSearchSkillHub(q);
      const installedNames = new Set(
        installedSkills.value.map((s) => s.name.trim().toLowerCase()).filter(Boolean),
      );
      // D1 同口径：在线结果也过滤掉已装项（去重已在 API 层完成）
      skillHubResults.value = results.filter(
        (r: SkillHubResult) => !installedNames.has(r.name.trim().toLowerCase()),
      );
    } catch {
      skillHubResults.value = [];
    } finally {
      skillHubSearching.value = false;
    }
  }

  async function installSkill(skillName: string): Promise<void> {
    loading.value = true;
    try {
      await apiInstallSkill(skillName);
      await refresh();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '安装技能失败';
      error.value = msg;
    } finally {
      loading.value = false;
    }
  }

  async function uninstallSkill(skillName: string): Promise<void> {
    loading.value = true;
    try {
      await apiUninstallSkill(skillName);
      await refresh();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '卸载技能失败';
      error.value = msg;
    } finally {
      loading.value = false;
    }
  }

  // ── 向后兼容别名 ──
  const install = installSkill;
  const uninstall = uninstallSkill;

  // ── 自动加载 ──
  refresh();

  return {
    state,
    installedSkills,
    candidateSkills,
    allCandidates,
    categories,
    searchQuery,
    error,
    loading,
    installedCount,
    candidateCount,
    skillHubResults,
    skillHubSearching,
    filtered,
    refresh,
    search,
    searchSkillHub,
    installSkill,
    uninstallSkill,
    install,
    uninstall,
  };
}
