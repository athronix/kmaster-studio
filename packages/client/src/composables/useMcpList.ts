/**
 * useMcpList — MCP 连接器列表聚合操作（T09 重写）。
 *
 * 数据源：GET /api/mcp（T07 聚合 deployed + candidates）。
 * 提供已部署 / 候选池双区数据 + 搜索 + 部署/删除。
 *
 * 向后兼容：保留 filtered / loading / refresh / addServer / deleteServer 供
 * McpManageSection.vue 使用。
 */
import { ref, computed } from 'vue';
import { DataSourceState } from '../types/dataSource';
import { getMcpList, postMcp, deleteMcp as apiDeleteMcp } from '../api/client';
import type { McpServer } from '../types/chat';
import type { McpAsset } from '../types/asset';

/** 展示用 MCP 数据 */
export interface McpItem {
  id: string;
  name: string;
  icon: string;
  description: string;
  tags: string[];
  source: string;
  deployed: boolean;
  /** 已部署时的命令/状态 */
  command?: string;
  status?: string;
  tools?: number;
  /** 候选时的传输/认证信息 */
  transport?: string;
  authMode?: string;
  url?: string;
}

export function useMcpList() {
  // ── 状态 ──
  const state = ref<DataSourceState>(DataSourceState.Loading);
  const deployedMcps = ref<McpItem[]>([]);
  const candidateMcps = ref<McpItem[]>([]);
  const allCandidates = ref<McpItem[]>([]);
  const searchQuery = ref('');
  const error = ref('');
  const loading = ref(false);

  // ── 派生 ──
  const deployedCount = computed(() => deployedMcps.value.length);
  const candidateCount = computed(() => candidateMcps.value.length);

  // ── 兼容旧接口 ──
  const filtered = computed(() => deployedMcps.value);

  // ── 映射 ──
  function mapDeployed(raw: McpServer[]): McpItem[] {
    return raw.map((s) => ({
      id: `mcp-${s.name}`,
      name: s.name,
      icon: '🔌',
      description: s.command ?? '',
      tags: [],
      source: 'hermes',
      deployed: true,
      command: s.command,
      status: s.status,
      tools: s.tools,
    }));
  }

  function mapCandidates(raw: McpAsset[]): McpItem[] {
    return raw.map((a) => ({
      id: a.id,
      name: a.name,
      icon: a.icon || '🔌',
      description: a.description,
      tags: [],
      source: a.source,
      deployed: a.installed,
      transport: a.transport,
      authMode: a.authMode,
      url: a.url,
    }));
  }

  // ── 内部过滤 ──
  function applyFilter(): void {
    const q = searchQuery.value.trim().toLowerCase();
    if (!q) {
      candidateMcps.value = allCandidates.value;
      return;
    }
    candidateMcps.value = allCandidates.value.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.description.toLowerCase().includes(q)
    );
  }

  // ── 操作 ──
  async function refresh(): Promise<void> {
    loading.value = true;
    state.value = DataSourceState.Loading;
    try {
      const data = await getMcpList();
      deployedMcps.value = mapDeployed(data.deployed);
      allCandidates.value = mapCandidates(data.candidates as unknown as McpAsset[]);
      applyFilter();
      state.value =
        deployedMcps.value.length === 0 && allCandidates.value.length === 0
          ? DataSourceState.Empty
          : DataSourceState.Live;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '加载 MCP 列表失败';
      error.value = msg;
      state.value = DataSourceState.Error;
    } finally {
      loading.value = false;
    }
  }

  function search(q: string): void {
    searchQuery.value = q;
    applyFilter();
  }

  async function deployMcp(
    id: string,
    _credentials: Record<string, string>
  ): Promise<void> {
    loading.value = true;
    try {
      const candidate = allCandidates.value.find((c) => c.id === id);
      if (!candidate) throw new Error('候选 MCP 未找到');
      await postMcp({
        name: candidate.name,
        command: candidate.command ?? candidate.name,
      });
      await refresh();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '部署 MCP 失败';
      error.value = msg;
    } finally {
      loading.value = false;
    }
  }

  async function deleteMcp(name: string): Promise<void> {
    loading.value = true;
    try {
      await apiDeleteMcp(name);
      await refresh();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '删除 MCP 失败';
      error.value = msg;
    } finally {
      loading.value = false;
    }
  }

  // ── 向后兼容别名 ──
  const addServer = deployMcp;
  const deleteServer = deleteMcp;

  // ── 自动加载 ──
  refresh();

  return {
    state,
    deployedMcps,
    candidateMcps,
    allCandidates,
    searchQuery,
    error,
    loading,
    deployedCount,
    candidateCount,
    filtered,
    refresh,
    search,
    deployMcp,
    deleteMcp,
    addServer,
    deleteServer,
  };
}
