<script setup lang="ts">
/**
 * SkillsView — 技能市场（T03 重写）。
 *
 * 轻量 wrapper：组装 skillConfig 并渲染 <MarketLayout :config="skillConfig" />。
 * 数据源：GET /api/skills（已装）+ /api/skills?source=candidates（候选）。
 */
import MarketLayout from '../components/common/MarketLayout.vue';
import { useMarketList } from '../composables/useMarketList';
import { getSkills, http } from '../api/client';
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
    installed: c.installed,
    source: c.source,
  };
}

// ═══════════════════ fetchAll ═══════════════════

async function fetchAllSkill(): Promise<{
  installed: ResourceItem[];
  candidates: ResourceItem[];
}> {
  const [skills, candidatesRes] = await Promise.all([
    getSkills(),
    http<{ candidates: SkillAsset[] }>('/api/skills?source=candidates').catch(() => ({
      candidates: [] as SkillAsset[],
    })),
  ]);

  const installed: ResourceItem[] = skills.map(mapInstalledSkill);
  const candidates: ResourceItem[] = (candidatesRes.candidates ?? []).map(mapCandidateSkill);

  return { installed, candidates };
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
