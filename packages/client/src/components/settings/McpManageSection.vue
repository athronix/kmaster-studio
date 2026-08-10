<script setup lang="ts">
/**
 * T08：McpManageSection — 设置 → MCP 管理。
 *
 * 数据源变更：从 chat store → `GET /api/mcp` → { deployed, candidates }。
 *
 * UI：已部署 / candidate 双 tab
 * - 已部署 tab：展示 name / command / tools，支持卸载
 * - Candidate tab：展示 name / 描述 / 一键安装按钮
 *
 * 部署操作：POST /api/mcp → safeWriteConfig 写入
 *
 * T04：双 tab 各自独立分页。
 * - 已部署：pageSize = gridCols × installedRows
 * - 候选池：pageSize = gridCols × marketRows
 * gridCols 从 localStorage['km_grid_cols'] 读取，
 * installedRows/marketRows 从 localStorage['km.v3.marketLayout'] 读取。
 */
import { computed, onMounted, ref, watch } from 'vue';
import { NButton, NSpin, NTag, NTabs, NTabPane, NEmpty, NPagination, NPopconfirm, useMessage } from 'naive-ui';
import KIcon from '../common/KIcon.vue';
import { getMcpList, postMcp, deleteMcp, type McpAsset } from '../../api/client';
import { MARKET_DEFAULTS } from '../../constants/layout';
import type { McpServer } from '../../types/chat';

/** T04：安全读取 localStorage['km_grid_cols']（可能是纯数字或 JSON 数字） */
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

const toast = useMessage();

// T04：读取分页配置
const gridCols = readGridCols();
const marketRows = readMarketRows();
/** 已部署分页大小 = 列数 × installed 行数 */
const deployedPageSize = gridCols * marketRows.installedRows;
/** 候选池分页大小 = 列数 × 市场行数 */
const candidatesPageSize = gridCols * marketRows.marketRows;
const deployedPage = ref<number>(1);
const candidatesPage = ref<number>(1);

const loading = ref(false);
const deployed = ref<McpServer[]>([]);
const candidates = ref<McpAsset[]>([]);
const activeTab = ref<'deployed' | 'candidates'>('deployed');
const deploying = ref<Set<string>>(new Set());
const uninstalling = ref<Set<string>>(new Set());

onMounted(() => {
  void load();
});

async function load(): Promise<void> {
  loading.value = true;
  try {
    const res = await getMcpList();
    deployed.value = res.deployed;
    candidates.value = res.candidates;
    // T04：刷新后重置页码
    deployedPage.value = 1;
    candidatesPage.value = 1;
  } catch (err) {
    toast.error(`MCP 列表加载失败：${err instanceof Error ? err.message : String(err)}`);
  } finally {
    loading.value = false;
  }
}

/** T04：已部署分页数据 */
const pagedDeployed = computed<McpServer[]>(() => {
  const start = (deployedPage.value - 1) * deployedPageSize;
  return deployed.value.slice(start, start + deployedPageSize);
});

/** T04：候选池分页数据 */
const pagedCandidates = computed<McpAsset[]>(() => {
  const start = (candidatesPage.value - 1) * candidatesPageSize;
  return candidates.value.slice(start, start + candidatesPageSize);
});

/** T04：数据变化时把越界页码拉回 */
watch(deployed, (list) => {
  const maxPage = Math.max(1, Math.ceil(list.length / deployedPageSize));
  if (deployedPage.value > maxPage) deployedPage.value = maxPage;
});

watch(candidates, (list) => {
  const maxPage = Math.max(1, Math.ceil(list.length / candidatesPageSize));
  if (candidatesPage.value > maxPage) candidatesPage.value = maxPage;
});

/** T04：动态网格列数 style */
const gridStyle = computed<Record<string, string>>(() => ({
  gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
}));

/** 已部署 MCP 的状态标签 */
function statusTag(s: McpServer): { label: string; type: 'success' | 'error' | 'default' } {
  if (s.status === 'connected') return { label: '已连接', type: 'success' };
  if (s.status === 'error') return { label: '错误', type: 'error' };
  return { label: '未知', type: 'default' };
}

/** 候选 MCP 的传输类型标签 */
function transportLabel(a: McpAsset): string {
  if (a.transport === 'stdio') return 'stdio';
  if (a.transport === 'sse') return 'SSE';
  if (a.transport === 'http') return 'HTTP';
  return a.transport;
}

/** 一键部署候选 MCP */
async function onDeploy(asset: McpAsset): Promise<void> {
  if (deploying.value.has(asset.id)) return;
  deploying.value = new Set([...deploying.value, asset.id]);
  try {
    const name = asset.name;
    const command = asset.command ?? name;
    await postMcp({ name, command, args: asset.args, env: asset.env });
    toast.success(`已部署 MCP：${asset.name}`);
    // 刷新列表
    await load();
    activeTab.value = 'deployed';
  } catch (err) {
    toast.error(`部署失败：${err instanceof Error ? err.message : String(err)}`);
  } finally {
    const next = new Set(deploying.value);
    next.delete(asset.id);
    deploying.value = next;
  }
}

/** 卸载已部署 MCP */
async function onRemove(server: McpServer): Promise<void> {
  if (uninstalling.value.has(server.name)) return;
  uninstalling.value = new Set([...uninstalling.value, server.name]);
  try {
    await deleteMcp(server.name);
    toast.success(`已卸载 MCP：${server.name}`);
    deployed.value = deployed.value.filter((s) => s.name !== server.name);
  } catch (err) {
    toast.error(`卸载失败：${err instanceof Error ? err.message : String(err)}`);
  } finally {
    const next = new Set(uninstalling.value);
    next.delete(server.name);
    uninstalling.value = next;
  }
}
</script>

<template>
  <div class="mcm">
    <div class="mcm-toolbar">
      <span class="mcm-title">MCP 管理</span>
      <n-button size="small" tertiary @click="load" :loading="loading">刷新</n-button>
    </div>

    <n-tabs v-model:value="activeTab" type="segment" animated>
      <n-tab-pane name="deployed" tab="已部署">
        <n-spin :show="loading">
          <n-empty v-if="!deployed.length" description="暂无已部署的 MCP 服务器" />

          <template v-else>
            <div class="mcm-grid" :style="gridStyle">
              <div v-for="s in pagedDeployed" :key="s.name" class="mcm-card">
                <div class="mcm-card-head">
                  <span class="mcm-card-icon"><KIcon name="PlugConnected" :size="16" /></span>
                  <span class="mcm-card-name">{{ s.name }}</span>
                  <n-tag size="tiny" :type="statusTag(s).type" :bordered="false">
                    {{ statusTag(s).label }}
                  </n-tag>
                </div>
                <div class="mcm-card-body">
                  <div v-if="s.command" class="mcm-card-row">
                    <span class="mcm-label">命令：</span>
                    <code>{{ s.command }} {{ (s.args ?? []).join(' ') }}</code>
                  </div>
                  <div class="mcm-card-row">
                    <span class="mcm-label">工具：</span>
                    <span>{{ s.tools ?? '—' }} 个</span>
                  </div>
                </div>
                <div class="mcm-card-ops">
                  <n-popconfirm @positive-click="onRemove(s)">
                    <template #trigger>
                      <n-button
                        size="tiny"
                        quaternary
                        type="error"
                        :loading="uninstalling.has(s.name)"
                      >卸载</n-button>
                    </template>
                    确认卸载 MCP「{{ s.name }}」？卸载后对应连接器将不可用。
                  </n-popconfirm>
                </div>
              </div>
            </div>

            <!-- T04：已部署分页 -->
            <div v-if="deployed.length > deployedPageSize" class="mcm-pager">
              <n-pagination
                :page="deployedPage"
                :page-size="deployedPageSize"
                :item-count="deployed.length"
                size="small"
                @update:page="(p: number) => (deployedPage = p)"
              />
            </div>
          </template>
        </n-spin>
      </n-tab-pane>

      <n-tab-pane name="candidates" tab="候选池">
        <n-spin :show="loading">
          <n-empty v-if="!candidates.length" description="暂无候选 MCP 连接器" />

          <template v-else>
            <div class="mcm-grid" :style="gridStyle">
              <div v-for="a in pagedCandidates" :key="a.id" class="mcm-card">
                <div class="mcm-card-head">
                  <span class="mcm-card-icon"><KIcon :name="a.icon || 'Package'" :size="16" /></span>
                  <span class="mcm-card-name">{{ a.name }}</span>
                  <n-tag size="tiny" :bordered="false">{{ transportLabel(a) }}</n-tag>
                  <n-tag v-if="a.source" size="tiny" :bordered="false" type="info">{{ a.source }}</n-tag>
                </div>
                <div class="mcm-card-body">
                  <div class="mcm-card-desc">{{ a.description }}</div>
                  <div v-if="a.version" class="mcm-card-row">
                    <span class="mcm-label">版本：</span>
                    <span>{{ a.version }}</span>
                  </div>
                </div>
                <div class="mcm-card-ops">
                  <n-button
                    size="small"
                    type="primary"
                    :loading="deploying.has(a.id)"
                    @click="onDeploy(a)"
                  >一键安装</n-button>
                </div>
              </div>
            </div>

            <!-- T04：候选池分页 -->
            <div v-if="candidates.length > candidatesPageSize" class="mcm-pager">
              <n-pagination
                :page="candidatesPage"
                :page-size="candidatesPageSize"
                :item-count="candidates.length"
                size="small"
                @update:page="(p: number) => (candidatesPage = p)"
              />
            </div>
          </template>
        </n-spin>
      </n-tab-pane>
    </n-tabs>
  </div>
</template>

<style scoped>
.mcm {
  display: flex;
  flex-direction: column;
  gap: var(--km-space-md);
  min-height: 480px;
}

.mcm-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.mcm-title {
  font-size: var(--km-font-base);
  font-weight: 600;
}

.mcm-grid {
  display: grid;
  /* grid-template-columns 由 :style 动态覆盖 */
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: var(--km-space-10);
  padding-top: var(--km-space-sm);
}

.mcm-pager {
  display: flex;
  justify-content: center;
  padding-top: var(--km-space-md);
}

.mcm-card {
  display: flex;
  flex-direction: column;
  gap: var(--km-space-sm);
 padding: var(--km-space-md);
  border: 1px solid var(--km-border);
  border-radius: var(--km-radius-lg);
  background: var(--km-panel);
}

.mcm-card-head {
  display: flex;
  align-items: center;
  gap: var(--km-space-sm);
}

.mcm-card-icon {
  font-size: var(--km-font-xl);
  flex-shrink: 0;
}

.mcm-card-name {
  flex: 1;
  min-width: 0;
  font-size: var(--km-font-sm);
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mcm-card-body {
  display: flex;
  flex-direction: column;
  gap: var(--km-space-xs);
}

.mcm-card-desc {
  font-size: var(--km-font-sm);
  line-height: 1.5;
  opacity: 0.7;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.mcm-card-row {
  font-size: var(--km-font-sm);
  display: flex;
  align-items: center;
  gap: var(--km-space-xs);
}

.mcm-label {
  opacity: 0.55;
  flex-shrink: 0;
}

.mcm-card-row code {
  font-family: var(--km-mono, ui-monospace, monospace);
  font-size: var(--km-font-xs);
  opacity: 0.75;
}

.mcm-card-ops {
  display: flex;
  justify-content: flex-end;
  gap: var(--km-space-6);
}
</style>
