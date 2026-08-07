<script setup lang="ts">
/**
 * SettingsView — 设置类别派发器（V3 T3 / S3.7 + T4 / R-07 R-38）。
 *
 * V2 的「单页 12 段锚点滚动 + 自带 .set-side 左导航 + 设置覆盖层」全部删除：
 *   - 左导航上提到左栏（`components/layout/SettingsNav.vue`）；
 *   - 本组件只负责「PageHeader + 按类别渲染一个 section 组件」；
 *   - 类别来源 = 路由参数（`props.category`），与 `layout.settingsCategory` 同源。
 *
 * T03 修改：agent-role / skills / mcp 三类统一走 MarketLayout（settingsMode: true），
 * 通过 NTabs 顶部切换 Agent 管理 / Skills 管理 / MCP 管理。
 *
 * T02 修改：右侧新增 SettingsDetailPanel，点击卡片查看详情。
 *
 * 内嵌复用约定（A4）：`MemoryView` / `JobsView` 同时服务独立路由与设置类别，
 * 内嵌时通过 `embedded` prop 关闭其自带 PageHeader 的左右栏按钮，避免双 title 栏。
 */
import { computed, defineAsyncComponent, ref, watch, type Component } from 'vue';
import { NSpin, NTabs, NTabPane, useMessage } from 'naive-ui';
import { useRouter } from 'vue-router';
import PageHeader from '../components/layout/PageHeader.vue';
import MarketLayout from '../components/common/MarketLayout.vue';
import SettingsDetailPanel from '../components/common/SettingsDetailPanel.vue';
import { useMarketList } from '../composables/useMarketList';
import { useInstall } from '../composables/useInstall';
import {
  getAgents,
  getSkills,
  getMcpList,
  http,
  postMcp,
  deleteMcp as apiDeleteMcp,
  installSkill as installSkillApi,
  uninstallSkill as uninstallSkillApi,
  type AgentsResponse,
  type McpAsset,
} from '../api/client';
import type { MarketConfig, ResourceItem } from '../types/market';
import type { SkillAsset } from '../types/asset';
import type { McpServer } from '../types/chat';
import {
  DEFAULT_SETTINGS_CATEGORY,
  isSettingsCategory,
  settingsCategoryDef,
  type SettingsCategory,
} from '../constants/layout';

// 同步加载：进设置默认落在监控页，首屏不该有二次加载闪烁
import MonitorSection from '../components/settings/MonitorSection.vue';
import GeneralSection from '../components/settings/GeneralSection.vue';
import ToolsSection from '../components/settings/ToolsSection.vue';

// 异步加载：体量较大或访问频次较低的类别
const ProfileSection = defineAsyncComponent(
  () => import('../components/settings/ProfileSection.vue')
);
const ModelManageSection = defineAsyncComponent(
  () => import('../components/settings/ModelManageSection.vue')
);
const MemoryView = defineAsyncComponent(() => import('./MemoryView.vue'));
const JobsView = defineAsyncComponent(() => import('./JobsView.vue'));
const PlaceholderSection = defineAsyncComponent(
  () => import('../components/settings/PlaceholderSection.vue')
);

// ═══════════════════ Props ═══════════════════

const props = withDefaults(
  defineProps<{
    /** 路由参数 `:category`；非法值回落默认类别 */
    category?: string;
  }>(),
  { category: DEFAULT_SETTINGS_CATEGORY }
);

const router = useRouter();
const message = useMessage();

/** PageHeader 搜索关键字（已在 PageHeader 内做 300ms 防抖）。 */
const searchQuery = ref<string>('');

/** 规范化后的当前类别。 */
const activeCategory = computed<SettingsCategory>(() =>
  isSettingsCategory(props.category) ? props.category : DEFAULT_SETTINGS_CATEGORY
);

/** 当前类别的元信息（标题 / 图标）。 */
const meta = computed(() => settingsCategoryDef(activeCategory.value));

/** 页面标题：「设置 · 类别名」。 */
const pageTitle = computed<string>(() => `设置 · ${meta.value.label}`);

/** 市场类设置类别（T03 统一走 MarketLayout + NTabs）。 */
const MARKET_SETTINGS_CATEGORIES: readonly SettingsCategory[] = ['agent-role', 'skills', 'mcp'];

/** 当前是否在市场类设置页面。 */
const isMarketSettings = computed(() =>
  MARKET_SETTINGS_CATEGORIES.includes(activeCategory.value)
);

// ═══════════════════ T02：选中项 & 详情面板 ═══════════════════

const selectedItem = ref<ResourceItem | null>(null);

/** SettingsDetailPanel 的实体类型，由当前路由类别派生。 */
const detailEntityType = computed<'expert' | 'skill' | 'mcp'>(() => {
  switch (activeCategory.value) {
    case 'agent-role': return 'expert';
    case 'skills': return 'skill';
    case 'mcp': return 'mcp';
    default: return 'expert';
  }
});

// useInstall('expert') — 仅用于 summon（仅 expert 类型支持）
const { summon: detailSummon } = useInstall('expert');

async function handleDetailInstall(id: string): Promise<void> {
  try {
    const item = selectedItem.value;
    if (!item || item.id !== id) return;
    if (detailEntityType.value === 'mcp') {
      await postMcp({ name: item.name, command: item.name });
      message.success(`${item.name} 部署成功`);
      return;
    }
    if (detailEntityType.value === 'skill') {
      await installSkillApi(item.name);
      message.success(`${item.name} 安装成功`);
      return;
    }
    // expert
    const { install: inst } = useInstall('expert');
    await inst(item.name);
    message.success(`${item.name} 安装成功`);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '操作失败';
    message.error(msg);
  }
}

async function handleDetailUninstall(id: string): Promise<void> {
  try {
    const item = selectedItem.value;
    if (!item || item.id !== id) return;
    if (detailEntityType.value === 'mcp') {
      await apiDeleteMcp(item.name);
      message.success(`${item.name} 已卸载`);
      return;
    }
    if (detailEntityType.value === 'skill') {
      await uninstallSkillApi(item.name);
      message.success(`${item.name} 已卸载`);
      return;
    }
    // expert
    const { uninstall: unst } = useInstall('expert');
    await unst(item.name);
    message.success(`${item.name} 已卸载`);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '卸载失败';
    message.error(msg);
  }
}

async function handleDetailSummon(id: string): Promise<void> {
  try {
    const item = selectedItem.value;
    if (!item || item.id !== id) return;
    await detailSummon(item.name);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '召唤失败';
    message.error(msg);
  }
}

function onCardClick(item: ResourceItem): void {
  selectedItem.value = item;
}

// ═══════════════════ T03：市场设置 configs ═══════════════════

// --- Expert settings fetchAll ---
function mapAgentEntry(entry: { id: string; name: string; prompt: string; specialties?: string[] }): ResourceItem {
  return {
    id: entry.id,
    name: entry.name,
    icon: 'Robot',
    description: entry.prompt?.slice(0, 120) ?? '',
    tags: entry.specialties ?? [],
    category: '',
    installed: true,
    source: 'hermes',
  };
}

function mapCandidate(c: AgentsResponse['candidates'][number]): ResourceItem {
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

async function fetchAllExpertSettings(): Promise<{ installed: ResourceItem[]; candidates: ResourceItem[] }> {
  const data = await getAgents('all');
  const installed: ResourceItem[] = data.installed.map(mapAgentEntry);
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

const expertSettingsConfig: MarketConfig = {
  title: 'Agent 管理',
  entityType: 'expert',
  primaryTabs: [
    { key: 'expert', label: '专家', count: 0 },
    { key: 'team', label: '专家团', count: 0 },
  ],
  useList: () => useMarketList(fetchAllExpertSettings),
  showFeatured: false,
  settingsMode: true,
};

// --- Skill settings fetchAll ---
function mapInstalledSkill(s: { name: string; description?: string; category?: string }): ResourceItem {
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

async function fetchAllSkillSettings(): Promise<{ installed: ResourceItem[]; candidates: ResourceItem[] }> {
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

const skillSettingsConfig: MarketConfig = {
  title: 'Skills 管理',
  entityType: 'skill',
  primaryTabs: [
    { key: 'skill', label: '技能', count: 0 },
  ],
  useList: () => useMarketList(fetchAllSkillSettings),
  showFeatured: false,
  settingsMode: true,
};

// --- MCP settings fetchAll ---
function mapDeployedMcp(s: McpServer): ResourceItem {
  return {
    id: `mcp-${s.name}`,
    name: s.name,
    icon: 'PlugConnected',
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

async function fetchAllMcpSettings(): Promise<{ installed: ResourceItem[]; candidates: ResourceItem[] }> {
  const data = await getMcpList();
  const installed: ResourceItem[] = (data.deployed ?? []).map(mapDeployedMcp);
  const candidates: ResourceItem[] = (data.candidates ?? []).map(mapCandidateMcp);
  return { installed, candidates };
}

const mcpSettingsConfig: MarketConfig = {
  title: 'MCP 管理',
  entityType: 'mcp',
  primaryTabs: [
    { key: 'mcp', label: 'MCP', count: 0 },
  ],
  useList: () => useMarketList(fetchAllMcpSettings),
  showFeatured: false,
  settingsMode: true,
};

/** NTabs 激活的 key，默认跟随当前路由 category。 */
const marketTabValue = computed(() => {
  switch (activeCategory.value) {
    case 'agent-role': return 'agent-role';
    case 'skills': return 'skills';
    case 'mcp': return 'mcp';
    default: return 'agent-role';
  }
});

/** 市场设置 Tab 切换 → URL 同步。 */
function onMarketTabChange(val: string): void {
  router.push({ name: 'settings', params: { category: val } });
}

// ═══════════════════ 原有 section 映射 ═══════════════════

/** 12 类别 → 渲染组件映射（市场类除外，由 T03 MarketLayout 接管）。 */
const SECTION_MAP: Record<SettingsCategory, Component> = {
  monitor: MonitorSection,
  general: GeneralSection,
  account: ProfileSection,
  'agent-role': {} as Component, // 占位，由 isMarketSettings 分支接管
  skills: {} as Component,
  mcp: {} as Component,
  tools: ToolsSection,
  plugins: PlaceholderSection,
  channel: PlaceholderSection,
  memory: MemoryView,
  model: ModelManageSection,
  jobs: JobsView,
};

/** 当前渲染的 section 组件。 */
const activeSection = computed<Component>(() => SECTION_MAP[activeCategory.value]);

/** 这些类别复用整页视图组件，需要走「内嵌」模式（A4）。 */
const EMBEDDED_CATEGORIES: readonly SettingsCategory[] = ['memory', 'jobs'];

/** 是否内嵌整页视图（此时外层不再套卡片内边距）。 */
const isEmbeddedView = computed<boolean>(() => EMBEDDED_CATEGORIES.includes(activeCategory.value));

/** 占位类别（P2 范围，PRD §8.3 未禁止）。 */
const isPlaceholder = computed<boolean>(
  () => activeCategory.value === 'plugins' || activeCategory.value === 'channel'
);

/** 支持内容搜索的类别（其余类别隐藏 PageHeader 搜索框，避免出现无效控件）。 */
const SEARCHABLE_CATEGORIES: readonly SettingsCategory[] = [
  'agent-role',
  'skills',
  'mcp',
  'model',
  'jobs',
];

/** 当前类别是否支持搜索。 */
const searchable = computed<boolean>(() => SEARCHABLE_CATEGORIES.includes(activeCategory.value));

/** 传给 section 的 props：占位页需类别名，内嵌视图需 embedded，可搜索页需 search。 */
const sectionProps = computed<Record<string, unknown>>(() => {
  if (isPlaceholder.value) {
    return { label: meta.value.label, icon: meta.value.icon };
  }
  if (isEmbeddedView.value) {
    return { embedded: true, search: searchQuery.value };
  }
  return searchable.value ? { search: searchQuery.value } : {};
});

/** PageHeader 搜索回调。 */
function onSearch(q: string): void {
  searchQuery.value = q;
}

// 切换类别时清空搜索与选中项，避免上一页的关键字/选中污染下一页
watch(activeCategory, () => {
  searchQuery.value = '';
  selectedItem.value = null;
});
</script>

<template>
  <div class="km-settings">
    <PageHeader
      :title="pageTitle"
      :show-search="searchable"
      :search-placeholder="`在「${meta.label}」中搜索…`"
      @search="onSearch"
    >
      <template #title-extra>
        <span class="km-settings-icon">{{ meta.icon }}</span>
      </template>
    </PageHeader>

    <div class="km-settings-body" :class="{ 'km-settings-body-flush': isEmbeddedView || isMarketSettings }">
      <!-- T02/T03：市场类设置 → NTabs + MarketLayout（左） + SettingsDetailPanel（右） -->
      <template v-if="isMarketSettings">
        <div class="km-market-settings-row">
          <NTabs
            :value="marketTabValue"
            type="line"
            size="small"
            class="km-market-settings-tabs"
            @update:value="onMarketTabChange"
          >
            <NTabPane name="agent-role" tab="Agent 管理">
              <MarketLayout :config="expertSettingsConfig" :key="'settings-expert'" @card-click="onCardClick" />
            </NTabPane>
            <NTabPane name="skills" tab="Skills 管理">
              <MarketLayout :config="skillSettingsConfig" :key="'settings-skill'" @card-click="onCardClick" />
            </NTabPane>
            <NTabPane name="mcp" tab="MCP 管理">
              <MarketLayout :config="mcpSettingsConfig" :key="'settings-mcp'" @card-click="onCardClick" />
            </NTabPane>
          </NTabs>
          <SettingsDetailPanel
            :item="selectedItem"
            :entity-type="detailEntityType"
            class="km-settings-detail"
            @install="handleDetailInstall"
            @uninstall="handleDetailUninstall"
            @summon="handleDetailSummon"
          />
        </div>
      </template>

      <!-- 原有 section 映射 -->
      <template v-else>
        <Suspense>
          <component :is="activeSection" v-bind="sectionProps" :key="activeCategory" />
          <template #fallback>
            <div class="km-settings-loading">
              <n-spin size="small" />
              <span>正在加载「{{ meta.label }}」…</span>
            </div>
          </template>
        </Suspense>
      </template>
    </div>
  </div>
</template>

<style scoped>
.km-settings {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
  flex: 1;
  background: var(--km-bg);
  color: var(--km-text);
}

.km-settings-icon {
  font-size: 14px;
  opacity: 0.7;
}

.km-settings-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px 20px 32px;
}

/* 内嵌整页视图（记忆 / 定时任务 / 市场设置）自带布局，去掉外层内边距与滚动 */
.km-settings-body-flush {
  padding: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.km-settings-body-flush > :deep(*) {
  flex: 1;
  min-height: 0;
}

/* T02：市场设置左右分栏 */
.km-market-settings-row {
  display: flex;
  flex-direction: row;
  flex: 1;
  min-height: 0;
}

/* T03：市场设置 NTabs */
.km-market-settings-tabs {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
}

.km-market-settings-tabs :deep(.n-tabs-pane-wrapper) {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.km-market-settings-tabs :deep(.n-tab-pane) {
  height: 100%;
  display: flex;
  flex-direction: column;
}

/* T02：右侧详情面板 */
.km-settings-detail {
  width: 320px;
  flex-shrink: 0;
  border-left: 1px solid var(--km-card-border);
  overflow-y: auto;
  background: var(--km-card-bg);
}

.km-settings-loading {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 40px 0;
  justify-content: center;
  font-size: 13px;
  opacity: 0.6;
}
</style>
