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
 */
import { computed, onMounted, ref } from 'vue';
import { NButton, NSpin, NTag, NTabs, NTabPane, NEmpty, NPopconfirm, useMessage } from 'naive-ui';
import { getMcpList, postMcp, deleteMcp, type McpAsset } from '../../api/client';
import type { McpServer } from '../../types/chat';

const toast = useMessage();

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
  } catch (err) {
    toast.error(`MCP 列表加载失败：${err instanceof Error ? err.message : String(err)}`);
  } finally {
    loading.value = false;
  }
}

/** 已部署 MCP 的状态标签 */
function statusTag(s: McpServer): { label: string; type: 'success' | 'error' | 'default' } {
  if (s.status === 'connected') return { label: '● 已连接', type: 'success' };
  if (s.status === 'error') return { label: '✕ 错误', type: 'error' };
  return { label: '○ 未知', type: 'default' };
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

          <div v-else class="mcm-grid">
            <div v-for="s in deployed" :key="s.name" class="mcm-card">
              <div class="mcm-card-head">
                <span class="mcm-card-icon">🔌</span>
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
        </n-spin>
      </n-tab-pane>

      <n-tab-pane name="candidates" tab="候选池">
        <n-spin :show="loading">
          <n-empty v-if="!candidates.length" description="暂无候选 MCP 连接器" />

          <div v-else class="mcm-grid">
            <div v-for="a in candidates" :key="a.id" class="mcm-card">
              <div class="mcm-card-head">
                <span class="mcm-card-icon">{{ a.icon || '📦' }}</span>
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
        </n-spin>
      </n-tab-pane>
    </n-tabs>
  </div>
</template>

<style scoped>
.mcm {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 480px;
}

.mcm-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.mcm-title {
  font-size: 14px;
  font-weight: 600;
}

.mcm-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 10px;
  padding-top: 8px;
}

.mcm-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--km-border);
  border-radius: 8px;
  background: var(--km-panel);
}

.mcm-card-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.mcm-card-icon {
  font-size: 18px;
  flex-shrink: 0;
}

.mcm-card-name {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mcm-card-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.mcm-card-desc {
  font-size: 12px;
  line-height: 1.5;
  opacity: 0.7;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.mcm-card-row {
  font-size: 12px;
  display: flex;
  align-items: center;
  gap: 4px;
}

.mcm-label {
  opacity: 0.55;
  flex-shrink: 0;
}

.mcm-card-row code {
  font-family: var(--km-mono, ui-monospace, monospace);
  font-size: 11px;
  opacity: 0.75;
}

.mcm-card-ops {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
}
</style>
