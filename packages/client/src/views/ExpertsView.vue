<script setup lang="ts">
/**
 * ExpertsView — 专家市场（T03 重写）。
 *
 * 轻量 wrapper：组装 expertConfig 并渲染 <MarketLayout :config="expertConfig" />。
 * 数据源：GET /api/agents?source=all → ResourceItem[]。
 */
import MarketLayout from '../components/common/MarketLayout.vue';
import { useMarketList } from '../composables/useMarketList';
import { getAgents, type AgentsResponse, type AgentEntry } from '../api/client';
import type { MarketConfig, ResourceItem } from '../types/market';

// ═══════════════════ 映射函数 ═══════════════════

function mapAgentEntry(entry: AgentEntry): ResourceItem {
  return {
    id: entry.id,
    name: entry.name,
    icon: '🤖',
    description: entry.prompt?.slice(0, 120) ?? '',
    tags: entry.specialties ?? [],
    category: '',
    installed: true,
    source: 'hermes',
  };
}

function mapCandidate(
  c: AgentsResponse['candidates'][number]
): ResourceItem {
  return {
    id: c.id,
    name: c.name,
    icon: c.icon || '',
    description: c.description || '',
    tags: c.tags ?? [],
    category: c.category ?? '',
    installed: c.installed,
    source: c.source,
  };
}

// ═══════════════════ fetchAll ═══════════════════

async function fetchAllExpert(): Promise<{
  installed: ResourceItem[];
  candidates: ResourceItem[];
}> {
  const data = await getAgents('all');
  const installed: ResourceItem[] = data.installed.map(mapAgentEntry);
  // 也收集 candidates 中 installed=true 但不在 installed 里的项
  const installedNames = new Set(installed.map((i) => i.name));
  const candidates: ResourceItem[] = data.candidates.map(mapCandidate);
  for (const c of candidates) {
    if (c.installed && !installedNames.has(c.name)) {
      installed.push(c);
      installedNames.add(c.name);
    }
  }
  return { installed, candidates };
}

// ═══════════════════ Config ═══════════════════

const expertConfig: MarketConfig = {
  title: '专家市场',
  entityType: 'expert',
  primaryTabs: [
    { key: 'expert', label: '专家', count: 0 },
    { key: 'team', label: '专家团', count: 0 },
  ],
  useList: () => useMarketList(fetchAllExpert),
  showFeatured: true,
  settingsMode: false,
};
</script>

<template>
  <div class="km-market-page">
    <MarketLayout :config="expertConfig" />
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
