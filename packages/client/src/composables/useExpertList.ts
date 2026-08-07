/**
 * useExpertList — 专家列表聚合操作（T09）。
 *
 * 数据源：GET /api/agents?source=all（T07/T08 聚合 installed + candidates + categories）。
 * 提供已装角色 / 候选池双区数据 + 分类筛选 + 搜索 + 导入。
 */
import { ref, computed } from 'vue';
import { DataSourceState } from '../types/dataSource';
import { getAgents, createAgent, deleteAgent, type AgentsResponse, type AgentEntry } from '../api/client';
import type { ExpertAsset } from '../types/asset';

/** 候选专家展示用包装 */
export interface CandidateExpert {
  id: string;
  name: string;
  description: string;
  source: string;
  category?: string;
  icon: string;
  installed: boolean;
  profession: string;
  tags: string[];
  doNotRedistribute: boolean;
}

/** 已装专家展示用包装 */
export interface InstalledExpert {
  id: string;
  name: string;
  icon: string;
  description: string;
  tags: string[];
  source: 'hermes' | 'user';
  prompt: string;
  skills: string[];
  mcp: string[];
}

export function useExpertList() {
  // ── 状态 ──
  const state = ref<DataSourceState>(DataSourceState.Loading);
  const installedExperts = ref<InstalledExpert[]>([]);
  const candidateExperts = ref<CandidateExpert[]>([]);
  const allCandidates = ref<CandidateExpert[]>([]);
  const categories = ref<string[]>([]);
  const selectedCategory = ref<string>('');
  const searchQuery = ref('');
  const error = ref('');
  const loading = ref(false);

  // ── 派生 ──
  const installedCount = computed(() => installedExperts.value.length);
  const candidateCount = computed(() => candidateExperts.value.length);

  // ── 兼容旧接口：filtered = installedExperts ──
  const filtered = computed(() => installedExperts.value as unknown as any[]);

  // ── 内部过滤 ──
  function applyFilters(): void {
    let list = [...allCandidates.value];
    if (selectedCategory.value) {
      list = list.filter((e) => e.category === selectedCategory.value);
    }
    const q = searchQuery.value.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          e.description.toLowerCase().includes(q) ||
          e.profession.toLowerCase().includes(q)
      );
    }
    candidateExperts.value = list;
  }

  // ── 映射函数 ──
  function mapInstalled(entries: AgentEntry[]): InstalledExpert[] {
    return entries.map((a) => ({
      id: a.id,
      name: a.name,
      icon: '🤖',
      description: a.prompt?.slice(0, 120) ?? '',
      tags: a.specialties ?? [],
      source: 'hermes' as const,
      prompt: a.prompt ?? '',
      skills: a.skills ?? [],
      mcp: a.mcp ?? [],
    }));
  }

  function mapCandidates(raw: AgentsResponse['candidates']): CandidateExpert[] {
    return raw.map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      source: c.source,
      category: c.category,
      icon: c.icon || '🤖',
      installed: c.installed,
      profession: c.profession,
      tags: c.tags,
      doNotRedistribute: c.doNotRedistribute,
    }));
  }

  // ── 操作 ──
  async function refresh(): Promise<void> {
    loading.value = true;
    state.value = DataSourceState.Loading;
    try {
      const data = await getAgents('all');
      installedExperts.value = mapInstalled(data.installed);
      allCandidates.value = mapCandidates(data.candidates);
      categories.value = (data.categories ?? []).map((c) => c.name);
      applyFilters();
      state.value =
        installedExperts.value.length === 0 && allCandidates.value.length === 0
          ? DataSourceState.Empty
          : DataSourceState.Live;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '加载专家列表失败';
      error.value = msg;
      state.value = DataSourceState.Error;
    } finally {
      loading.value = false;
    }
  }

  function filterByCategory(cat: string): void {
    selectedCategory.value = selectedCategory.value === cat ? '' : cat;
    applyFilters();
  }

  function search(q: string): void {
    searchQuery.value = q;
    applyFilters();
  }

  async function importExpert(id: string): Promise<void> {
    loading.value = true;
    try {
      const candidate = allCandidates.value.find((c) => c.id === id);
      if (!candidate) throw new Error('候选专家未找到');
      await createAgent({
        name: candidate.name,
        displayName: candidate.name,
        icon: candidate.icon,
        prompt: candidate.description,
        specialties: candidate.tags,
      });
      await refresh();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '导入专家失败';
      error.value = msg;
    } finally {
      loading.value = false;
    }
  }

  async function removeExpert(name: string): Promise<void> {
    loading.value = true;
    try {
      await deleteAgent(name);
      await refresh();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '删除专家失败';
      error.value = msg;
    } finally {
      loading.value = false;
    }
  }

  // ── 自动加载 ──
  refresh();

  return {
    state,
    installedExperts,
    candidateExperts,
    allCandidates,
    categories,
    selectedCategory,
    searchQuery,
    error,
    loading,
    installedCount,
    candidateCount,
    filtered,
    refresh,
    filterByCategory,
    search,
    importExpert,
    removeExpert,
  };
}
