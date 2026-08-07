<script setup lang="ts">
/**
 * McpView — MCP 市场（T03 重写）。
 *
 * 轻量 wrapper：组装 mcpConfig 并渲染 <MarketLayout :config="mcpConfig" />。
 * 数据源：GET /api/mcp（T07 聚合 deployed + candidates）。
 */
import MarketLayout from '../components/common/MarketLayout.vue';
import { useMarketList } from '../composables/useMarketList';
import { getMcpList } from '../api/client';
import type { McpServer } from '../types/chat';
import type { McpAsset } from '../api/client';
import type { MarketConfig, ResourceItem } from '../types/market';

// ═══════════════════ 映射函数 ═══════════════════

function mapDeployedMcp(s: McpServer): ResourceItem {
  return {
    id: `mcp-${s.name}`,
    name: s.name,
    icon: '🔌',
    description: s.command ?? '',
    tags: [],
    category: '',
    installed: true,
    source: 'hermes',
  };
}

function mapCandidateMcp(a: McpAsset): ResourceItem {
  return {
    id: a.id,
    name: a.name,
    icon: a.icon || '',
    description: a.description ?? '',
    tags: [],
    category: a.category ?? '',
    installed: a.installed,
    source: a.source,
  };
}

// ═══════════════════ fetchAll ═══════════════════

async function fetchAllMcp(): Promise<{
  installed: ResourceItem[];
  candidates: ResourceItem[];
}> {
  const data = await getMcpList();
  const installed: ResourceItem[] = (data.deployed ?? []).map(mapDeployedMcp);
  const candidates: ResourceItem[] = (data.candidates ?? []).map(mapCandidateMcp);
  return { installed, candidates };
}

// ═══════════════════ Config ═══════════════════

const mcpConfig: MarketConfig = {
  title: 'MCP 管理',
  entityType: 'mcp',
  primaryTabs: [
    { key: 'mcp', label: 'MCP', count: 0 },
  ],
  useList: () => useMarketList(fetchAllMcp),
  showFeatured: false,
  settingsMode: false,
};
</script>

<template>
  <div class="km-market-page">
    <MarketLayout :config="mcpConfig" />
  </div>
</template>

<style scoped>
.km-market-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
  flex: 1;
}
</style>
