<script setup lang="ts">
/**
 * SkillsView — 技能市场（T03 重写）。
 *
 * 轻量 wrapper：组装 skillConfig 并渲染 <MarketLayout :config="skillConfig" />。
 * 数据源：**单次** `GET /api/skills`，一次带回 installed + candidates + categories。
 */
import MarketLayout from '../components/common/MarketLayout.vue';
import { useMarketList } from '../composables/useMarketList';
import { getSkills } from '../api/client';
import type { MarketConfig, ResourceItem } from '../types/market';
import type { Skill as ChatSkill } from '../types/chat';
import type { SkillAsset } from '../types/asset';

// ═══════════════════ 映射函数 ═══════════════════

function mapInstalledSkill(s: ChatSkill): ResourceItem {
  return {
    id: `skill-${s.name}`,
    name: s.name,
    icon: 'Puzzle',
    description: s.description ?? '',
    tags: s.category ? [s.category] : [],
    category: s.category ?? '',
    installed: true,
    source: 'hermes',
  };
}

function mapCandidateSkill(c: SkillAsset): ResourceItem {
  return {
    id: c.id,
    name: c.name,
    icon: c.icon || '',
    description: c.description ?? '',
    tags: c.tags ?? [],
    category: c.category ?? '',
    installed: false, // D1：已装项已在上游过滤，剩下的一定未装
    source: c.source,
  };
}

// ═══════════════════ fetchAll ═══════════════════

/**
 * ST-01/ST-02：只发**一次** `GET /api/skills`。
 * D1 口径：候选区过滤掉已装项 + 按 name 去重。
 */
async function fetchAllSkill(): Promise<{
  installed: ResourceItem[];
  candidates: ResourceItem[];
}> {
  const { installed: rawInstalled, candidates: rawCandidates } = await getSkills();

  const installedNames = new Set(
    rawInstalled.map((s) => (s.name ?? '').trim().toLowerCase()).filter(Boolean),
  );

  const seen = new Set<string>();
  const candidates: ResourceItem[] = [];
  for (const c of rawCandidates) {
    const key = (c.name ?? '').trim().toLowerCase();
    if (!key || installedNames.has(key) || seen.has(key)) continue;
    seen.add(key);
    candidates.push(mapCandidateSkill(c));
  }

  return { installed: rawInstalled.map(mapInstalledSkill), candidates };
}

// ═══════════════════ Config ═══════════════════

const skillConfig: MarketConfig = {
  title: '技能市场',
  entityType: 'skill',
  primaryTabs: [
    { key: 'skill', label: '技能', count: 0 },
  ],
  useList: () => useMarketList(fetchAllSkill),
  showFeatured: true,
  settingsMode: false,
};
</script>

<template>
  <div class="km-market-page">
    <MarketLayout :config="skillConfig" />
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
