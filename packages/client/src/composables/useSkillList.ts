/**
 * useSkillList — 技能列表聚合操作（T09 重写）。
 *
 * 数据源：GET /api/skills（installed）+ COS candidates + SkillHub 在线。
 * 提供已装技能 / 市场候选双区数据 + 搜索（本地 + SkillHub 在线）+ 安装/卸载。
 *
 * 向后兼容：保留 filtered / loading / refresh / install / uninstall 供
 * SkillManageSection.vue 使用。
 */
import { ref, computed } from 'vue';
import { DataSourceState } from '../types/dataSource';
import {
  getSkills,
  installSkill as apiInstallSkill,
  uninstallSkill as apiUninstallSkill,
  http,
} from '../api/client';
import type { Skill as ChatSkill } from '../types/chat';
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

/** SkillHub 在线搜索结果项 */
interface SkillHubResult {
  name: string;
  description: string;
  icon: string;
  tags: string[];
  source: string;
}

export function useSkillList() {
  // ── 状态 ──
  const state = ref<DataSourceState>(DataSourceState.Loading);
  const installedSkills = ref<SkillItem[]>([]);
  const candidateSkills = ref<SkillItem[]>([]);
  const allCandidates = ref<SkillItem[]>([]);
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

  // ── 操作 ──
  async function refresh(): Promise<void> {
    loading.value = true;
    state.value = DataSourceState.Loading;
    try {
      // 已装技能
      const skills = await getSkills();
      installedSkills.value = mapInstalled(skills);

      // 候选技能（COS）：尝试从聚合端点获取
      try {
        const res = await http<{ candidates: SkillAsset[] }>('/api/skills?source=candidates');
        allCandidates.value = (res.candidates ?? []).map((c: SkillAsset) => ({
          id: c.id,
          name: c.name,
          icon: c.icon || 'Tool',
          description: c.description,
          tags: c.tags ?? [],
          source: c.source,
          installed: c.installed,
          version: c.version,
          category: c.category,
        }));
      } catch {
        allCandidates.value = [];
      }
      applyLocalFilter();

      state.value =
        installedSkills.value.length === 0 && allCandidates.value.length === 0
          ? DataSourceState.Empty
          : DataSourceState.Live;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '加载技能列表失败';
      error.value = msg;
      state.value = DataSourceState.Error;
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

  /** SkillHub 在线搜索（P2-2 双源） */
  async function searchSkillHub(q: string): Promise<void> {
    skillHubSearching.value = true;
    try {
      const data = await http<{ results: SkillHubResult[] }>(
        `/api/skills/search?q=${encodeURIComponent(q)}`
      );
      skillHubResults.value = data.results ?? [];
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
