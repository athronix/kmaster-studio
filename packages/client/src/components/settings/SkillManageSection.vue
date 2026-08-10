<script setup lang="ts">
/**
 * SkillManageSection — 设置 → Skills 管理（V3 T4 / S4.9）。
 *
 * 薄封装：复用 CardMarketLayout 的市场浏览能力，
 * 并以 installedMode 把首屏模块换成「已安装技能」（独立搜索 + 标签 + 动态列数 + 分页）。
 *
 * 数据源两侧**均为后端真实数据**（ST-04：mock 常量已于 U-09 删除，此处不再有任何桩数据）：
 *   - 已安装：`useSkillList().filtered`（← `GET /api/skills` 的 `installed`）
 *   - 市场候选：`useSkillList().candidateSkills`（← 同一响应的 `candidates`，已按 D1 过滤去重）
 * 两侧通过名称做已安装标记。
 *
 * T04：分页大小 = gridCols × marketRows，gridCols 从 localStorage['km_grid_cols'] 读取，
 * marketRows 从 localStorage['km.v3.marketLayout'] 读取。
 */
import { computed, onMounted, ref } from 'vue';
import { NSpin, useMessage } from 'naive-ui';
import CardMarketLayout from '../market/CardMarketLayout.vue';
import EntityCard from '../market/EntityCard.vue';
import InstalledCard from '../market/InstalledCard.vue';
import { useSkillList } from '../../composables/useSkillList';
import { useChatStore } from '../../stores/chat';
import { MARKET_DEFAULTS } from '../../constants/layout';
import { type EntityDef, type Skill as MarketSkill, type SortOrder } from '../../types/market';

/** T04：安全读取 localStorage['km_grid_cols'] */
function readGridCols(): number {
  try {
    const raw = localStorage.getItem('km_grid_cols');
    if (raw === null || raw === '') return MARKET_DEFAULTS.gridCols;
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed === 'number' && Number.isFinite(parsed) && parsed >= 3 && parsed <= 8) return parsed;
    } catch { /* not JSON */ }
    const n = Number(raw);
    return Number.isFinite(n) && n >= 3 && n <= 8 ? n : MARKET_DEFAULTS.gridCols;
  } catch {
    return MARKET_DEFAULTS.gridCols;
  }
}

/** T04：安全读取 localStorage['km.v3.marketLayout'] */
interface MarketRowsConfig {
  featuredRows: number;
  installedRows: number;
  marketRows: number;
}

function readMarketRows(): MarketRowsConfig {
  try {
    const raw = localStorage.getItem('km.v3.marketLayout');
    if (raw === null || raw === '') {
      return { featuredRows: MARKET_DEFAULTS.featuredRows, installedRows: MARKET_DEFAULTS.installedRows, marketRows: MARKET_DEFAULTS.marketRows };
    }
    const parsed = JSON.parse(raw) as Partial<MarketRowsConfig>;
    return {
      featuredRows: Number.isFinite(parsed.featuredRows) && (parsed.featuredRows ?? 0) > 0 ? parsed.featuredRows! : MARKET_DEFAULTS.featuredRows,
      installedRows: Number.isFinite(parsed.installedRows) && (parsed.installedRows ?? 0) > 0 ? parsed.installedRows! : MARKET_DEFAULTS.installedRows,
      marketRows: Number.isFinite(parsed.marketRows) && (parsed.marketRows ?? 0) > 0 ? parsed.marketRows! : MARKET_DEFAULTS.marketRows,
    };
  } catch {
    return { featuredRows: MARKET_DEFAULTS.featuredRows, installedRows: MARKET_DEFAULTS.installedRows, marketRows: MARKET_DEFAULTS.marketRows };
  }
}

const emit = defineEmits<{
  (e: 'open-detail', entity: EntityDef): void;
}>();

const chat = useChatStore();
const toast = useMessage();
const { filtered: installedRaw, candidateSkills, loading, refresh, install, uninstall } = useSkillList();

// T04：读取配置
const gridCols = readGridCols();
const marketRows = readMarketRows();

const searchQuery = ref<string>('');
const sort = ref<SortOrder>('default');
const page = ref<number>(1);
/** T04：动态分页大小 = 列数 × 市场行数 */
const pageSize = ref<number>(gridCols * marketRows.marketRows);

onMounted(() => {
  void refresh();
});

/** 后端技能 → 市场 Skill 实体（T04/U-10：元数据全部来自后端，不再借用任何 mock 常量） */
function toEntity(name: string, category: string, description: string): MarketSkill {
  return {
    id: `skill-installed-${name}`,
    entityType: 'skill',
    name,
    englishName: name,
    icon: 'Puzzle',
    description: description !== '' ? description : '本地已安装技能',
    tags: category !== '' ? [category] : [],
    source: 'local',
    scenarios: [],
    samplePrompts: [],
    installed: true,
  };
}

/** 已安装技能实体列表 */
const installedItems = computed<EntityDef[]>(() =>
  installedRaw.value.map((s) => toEntity(s.name, s.category ?? '', s.description ?? ''))
);

/** 已安装技能名集合（用于市场侧标记） */
const installedNames = computed<Set<string>>(() => {
  const set = new Set<string>();
  for (const s of installedRaw.value) set.add(s.name.toLowerCase());
  return set;
});

function isInstalled(entity: EntityDef): boolean {
  if (entity.entityType !== 'skill') return false;
  return (
    installedNames.value.has(entity.englishName.toLowerCase()) ||
    installedNames.value.has(entity.name.toLowerCase())
  );
}

/** 市场候选池（从 useSkillList 获取真实候选数据并映射为 EntityDef） */
const marketPool = computed<EntityDef[]>(() =>
  candidateSkills.value.map((s): MarketSkill => ({
    id: s.id,
    entityType: 'skill',
    name: s.name,
    englishName: s.name,
    icon: s.icon || 'Puzzle',
    description: s.description || '',
    tags: s.tags || [],
    source: (s.source === 'cos' ? 'marketplace' : 'local') as 'marketplace' | 'local',
    scenarios: [],
    samplePrompts: [],
    installed: s.installed,
  }))
);

const filteredBySearch = computed<EntityDef[]>(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (q === '') return marketPool.value;
  return marketPool.value.filter(
    (e) => e.name.toLowerCase().includes(q) || e.description.toLowerCase().includes(q)
  );
});

const sortedEntities = computed<EntityDef[]>(() => {
  const list = [...filteredBySearch.value];
  if (sort.value === 'newest') return list.reverse();
  return list;
});

const pagedEntities = computed<EntityDef[]>(() => {
  const start = (page.value - 1) * pageSize.value;
  return sortedEntities.value.slice(start, start + pageSize.value);
});

const total = computed<number>(() => sortedEntities.value.length);

const domainTags = computed<string[]>(() => {
  const tags = new Set<string>();
  for (const e of marketPool.value) {
    for (const t of e.tags ?? []) tags.add(t);
  }
  return Array.from(tags);
});

function onSelect(entity: EntityDef): void {
  chat.openDetail(entity);
  emit('open-detail', entity);
}

/** 市场卡片操作：安装 */
async function onInstall(entity: EntityDef): Promise<void> {
  if (entity.entityType !== 'skill') return;
  await install(entity.englishName === '' ? entity.name : entity.englishName);
  toast.success(`已提交安装请求：${entity.name}`);
}

/** 已安装卡片操作：卸载 */
async function onUninstall(entity: EntityDef): Promise<void> {
  if (entity.entityType !== 'skill') return;
  await uninstall(entity.englishName === '' ? entity.name : entity.englishName);
  toast.success(`已卸载：${entity.name}`);
}
</script>

<template>
  <n-spin :show="loading">
    <div class="skm">
      <CardMarketLayout
        hide-header
        installed-mode
        title="技能管理"
        installed-title="已安装技能"
        :installed-items="installedItems"
        :entities="pagedEntities"
        :categories="[]"
        :current-category="''"
        :sort="sort"
        :page="page"
        :page-size="pageSize"
        :total="total"
        :domain-tags="domainTags"
        :grid-cols="gridCols"
        :installed-rows="marketRows.installedRows"
        :market-rows="marketRows.marketRows"
        @update:sort="(s: SortOrder) => (sort = s)"
        @update:page="(p: number) => (page = p)"
        @update:page-size="(ps: number) => ((pageSize = ps), (page = 1))"
        @search="(q: string) => ((searchQuery = q), (page = 1))"
        @select="onSelect"
      >
        <template #installed-card="{ entity }">
          <InstalledCard
            :entity="entity"
            action-label="卸载"
            action-type="error"
            @card-click="onSelect"
            @action="onUninstall"
          />
        </template>

        <template #card="{ entity }">
          <EntityCard
            :entity="entity"
            action-label="安装"
            action-type="primary"
            @card-click="onSelect"
            @action="onInstall"
          />
        </template>
      </CardMarketLayout>
    </div>
  </n-spin>
</template>

<style scoped>
.skm {
  display: flex;
  flex-direction: column;
  min-height: 480px;
  height: 100%;
}

.skm > :deep(.km-market) {
  flex: 1;
  min-height: 0;
}

/* 内嵌在设置页内，去掉市场页的外层左右留白 */
.skm :deep(.km-market-installed),
.skm :deep(.km-market-toolbar),
.skm :deep(.km-market-grid) {
  padding-left: 0;
  padding-right: 0;
}
</style>
