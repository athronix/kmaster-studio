<script setup lang="ts">
/**
 * ModelManageSection — 设置 → 模型管理（V3 T4 / S4.7，覆盖 R-19 ~ R-25）。
 *
 * T02：对齐 hermes ModelsView 结构：
 *   - page-header：标题 + 刷新模型缓存 + 新增供应商
 *   - NTabs（type="line"）：通用模型 / 模型与默认槽位 / 用量
 *   - 通用模型 tab：ProviderModelCard 网格 + NEmpty 空态
 *
 * 弹窗联动：AddModelDialog（双测试）→ ResultDialog（结果展示）。
 */
import { computed, onMounted, ref } from 'vue';
import {
  NButton,
  NEmpty,
  NPopconfirm,
  NSelect,
  NSpin,
  NTabPane,
  NTabs,
  NTag,
  useMessage,
} from 'naive-ui';
import { useModelConfigStore } from '../../stores/modelConfig';
import AddModelDialog from '../dialog/AddModelDialog.vue';
import ResultDialog from '../dialog/ResultDialog.vue';
import ProviderModelCard from './ProviderModelCard.vue';
import {
  DEFAULT_MODEL_SLOTS,
  capabilityLabel,
} from '../../constants/providers';
import {
  emptyResultDialog,
  type ConnectivityResult,
  type DefaultModelSlot,
  type ModelProviderConfig,
  type ResultDialogState,
} from '../../types/settings';

const store = useModelConfigStore();
const toast = useMessage();

type SubTab = 'general' | 'models' | 'usage';
const subTab = ref<SubTab>('general');

const loading = ref<boolean>(false);
const refreshingCache = ref<boolean>(false);
const testingId = ref<string>('');

const dialogShow = ref<boolean>(false);
const dialogProviderId = ref<string>('');

const result = ref<ResultDialogState>(emptyResultDialog());

onMounted(() => {
  store.hydrate();
  void reloadModels();
});

/** T08：从 /api/models 加载 providers + usage */
async function reloadModels(): Promise<void> {
  loading.value = true;
  try {
    await store.loadModelsAndUsage();
  } finally {
    loading.value = false;
  }
}

/** page-header：刷新模型缓存 */
async function handleRefreshCache(): Promise<void> {
  refreshingCache.value = true;
  try {
    await store.loadModelsAndUsage();
    toast.success('模型缓存已刷新');
  } catch {
    toast.error('刷新模型缓存失败');
  } finally {
    refreshingCache.value = false;
  }
}

// ═══════════════════════ ① 通用模型 ═══════════════════════

function onAddProvider(): void {
  dialogProviderId.value = '';
  dialogShow.value = true;
}

function onEditProvider(provider: ModelProviderConfig): void {
  dialogProviderId.value = provider.id;
  dialogShow.value = true;
}

function onRemoveProvider(provider: ModelProviderConfig): void {
  const ok = store.removeProvider(provider.id);
  if (ok) toast.success(`已删除供应商「${provider.name}」`);
  else toast.error('删除失败：供应商不存在');
}

/** 列表内的快速重测（连通性，10s） */
async function onRetest(provider: ModelProviderConfig): Promise<void> {
  testingId.value = provider.id;
  try {
    const res = await store.testConnectivity(provider.id);
    showResult('connectivity', res);
  } finally {
    testingId.value = '';
  }
}

function showResult(kind: 'connectivity' | 'deep', res: ConnectivityResult): void {
  const label = kind === 'connectivity' ? '连通性测试' : '深度测试';
  result.value = {
    show: true,
    variant: res.ok ? 'success' : 'error',
    title: res.ok ? `${label}通过` : `${label}失败`,
    message: res.ok
      ? `后端可见 ${res.modelCount ?? 0} 个模型。`
      : (res.error ?? '未知错误'),
    detail: res.sample ?? '',
    durationMs: res.durationMs,
  };
}

function onDialogTestResult(payload: { kind: 'connectivity' | 'deep'; result: ConnectivityResult }): void {
  showResult(payload.kind, payload.result);
}

function onDialogConfirm(providerId: string): void {
  const provider = store.getProvider(providerId);
  if (provider !== null && provider.models.length > 0 && store.defaults.default === '') {
    store.setDefault('default', provider.models[0].id);
  }
}

// ═══════════════════════ ② 模型与默认槽位 ═══════════════════════

const slotOptions = computed(() =>
  DEFAULT_MODEL_SLOTS.map((slot) => ({
    ...slot,
    options: [{ label: '未指定', value: '' }, ...store.optionsForSlot(slot.key)],
  }))
);

function onSetDefault(slot: DefaultModelSlot, modelId: string): void {
  const ok = store.setDefault(slot, modelId);
  if (!ok) {
    toast.error('设置失败：所选模型不存在');
    return;
  }
  toast.success(modelId === '' ? '已清除该槽位' : '默认模型已更新');
}

function onRemoveModel(providerId: string, modelId: string, modelName: string): void {
  const ok = store.removeModel(providerId, modelId);
  if (ok) toast.success(`已删除模型「${modelName}」`);
  else toast.error('删除失败：模型不存在');
}

// ═══════════════════════ ③ 用量 ═══════════════════════

/** T08：用量展示行（calls + tokens，来自 /api/models usage） */
interface UsageRow {
  providerName: string;
  modelId: string;
  modelName: string;
  calls: string;
  tokens: string;
}

function fmtInt(v: number, known: boolean): string {
  return known ? v.toLocaleString() : '—';
}

const usageTable = computed<UsageRow[]>(() =>
  store.allModels.map(({ provider, model }) => {
    const u = store.usageOf(model.id);
    return {
      providerName: provider.name,
      modelId: model.id,
      modelName: store.displayName(model),
      calls: fmtInt(u.calls, u.known),
      tokens: fmtInt(u.tokens, u.known),
    };
  })
);
</script>

<template>
  <div class="mms">
    <!-- page-header（对齐 hermes ModelsView header 布局） -->
    <header class="page-header">
      <h2 class="header-title">模型管理</h2>
      <div v-if="subTab === 'general'" class="header-actions">
        <NButton
          size="small"
          :loading="refreshingCache"
          :disabled="loading"
          title="刷新模型缓存"
          @click="handleRefreshCache"
        >
          <template #icon>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 0 1-9 9 9.7 9.7 0 0 1-6.7-2.7"/><path d="M3 12a9 9 0 0 1 9-9 9.7 9.7 0 0 1 6.7 2.7"/><path d="M21 3v6h-6"/><path d="M3 21v-6h6"/></svg>
          </template>
          <span class="header-action-label">刷新模型缓存</span>
        </NButton>
        <NButton
          size="small"
          type="primary"
          title="新增供应商"
          @click="onAddProvider"
        >
          <template #icon>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </template>
          <span class="header-action-label">新增供应商</span>
        </NButton>
      </div>
    </header>

    <div class="mms-content">
      <NTabs v-model:value="subTab" type="line" animated>
        <!-- ① 通用模型（T02：ProviderModelCard 网格 + NEmpty 空态） -->
        <NTabPane name="general" tab="通用模型">
          <div class="mms-panel">
            <NSpin :show="loading && store.providerCount === 0">
              <NEmpty
                v-if="!store.providerCount"
                description="还没有配置任何模型供应商"
              >
                <template #extra>
                  <NButton size="small" type="primary" @click="onAddProvider">新增第一个供应商</NButton>
                </template>
              </NEmpty>

              <div v-else class="mms-provider-grid">
                <ProviderModelCard
                  v-for="provider in store.providers"
                  :key="provider.id"
                  :provider="provider"
                  :testing-id="testingId"
                  :model-display-name="store.displayName"
                  @retest="onRetest"
                  @edit="onEditProvider"
                  @delete="onRemoveProvider"
                />
              </div>
            </NSpin>
          </div>
        </NTabPane>

        <!-- ② 模型与默认槽位（保留不动） -->
        <NTabPane name="models" tab="模型与默认槽位">
          <div class="mms-panel">
            <div class="mms-block-title">默认模型槽位</div>
            <div class="mms-slots">
              <div v-for="slot in slotOptions" :key="slot.key" class="mms-slot">
                <div class="mms-slot-label">
                  {{ slot.label }}
                  <span class="mms-slot-desc">{{ slot.desc }}</span>
                </div>
                <n-select
                  :value="store.defaults[slot.key]"
                  :options="slot.options"
                  size="small"
                  :placeholder="slot.options.length > 1 ? '选择模型' : '暂无符合能力要求的模型'"
                  @update:value="(v: string) => onSetDefault(slot.key, v)"
                />
              </div>
            </div>

            <div class="mms-block-title mms-block-title-gap">全部模型（{{ store.modelCount }}）</div>
            <n-empty
              v-if="!store.modelCount"
              description="还没有任何模型"
            >
              <template #extra>
                <n-button size="small" type="primary" @click="onAddProvider">新增供应商并添加模型</n-button>
              </template>
            </n-empty>
            <table v-else class="mms-table">
              <thead>
                <tr>
                  <th>模型</th>
                  <th>供应商</th>
                  <th>能力</th>
                  <th class="mms-num">上下文</th>
                  <th>可见性</th>
                  <th class="mms-ops">操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="{ provider, model } in store.allModels" :key="model.id">
                  <td>
                    <div class="mms-model-name">{{ store.displayName(model) }}</div>
                    <div class="mms-model-id">{{ model.id }}</div>
                  </td>
                  <td>{{ provider.name }}</td>
                  <td>
                    <n-tag
                      v-for="cap in model.capabilities"
                      :key="cap"
                      size="tiny"
                      :bordered="false"
                      class="mms-cap"
                    >{{ capabilityLabel(cap) }}</n-tag>
                  </td>
                  <td class="mms-num">{{ model.contextLength > 0 ? `${Math.round(model.contextLength / 1000)}k` : '—' }}</td>
                  <td>
                    <n-tag size="tiny" :bordered="false" type="success">可见</n-tag>
                  </td>
                  <td class="mms-ops">
                    <n-popconfirm @positive-click="onRemoveModel(provider.id, model.id, store.displayName(model))">
                      <template #trigger>
                        <n-button size="tiny" quaternary type="error">删除</n-button>
                      </template>
                      删除模型「{{ store.displayName(model) }}」后，引用它的默认槽位会被清空。确认删除？
                    </n-popconfirm>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </NTabPane>

        <!-- ③ 用量（保留不动） -->
        <NTabPane name="usage" tab="用量">
          <div class="mms-panel">
            <n-spin :show="loading">
              <div class="mms-usage-bar">
                <span class="mms-usage-hint">
                  T08：数据来自 <code>/api/models</code> 的 usage 聚合（近7天）；
                  未匹配到模型级统计时显示「—」，不做估算。
                </span>
                <n-button size="tiny" tertiary @click="reloadModels">刷新</n-button>
              </div>

              <n-empty
                v-if="!usageTable.length"
                description="还没有可统计的模型"
              >
                <template #extra>
                  <n-button size="small" type="primary" @click="onAddProvider">先添加一个供应商</n-button>
                </template>
              </n-empty>
              <table v-else class="mms-table">
                <thead>
                  <tr>
                    <th>模型</th>
                    <th>供应商</th>
                    <th class="mms-num">近7天调用</th>
                    <th class="mms-num">近7天 Tokens</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="row in usageTable" :key="row.modelId">
                    <td>{{ row.modelName }}</td>
                    <td>{{ row.providerName }}</td>
                    <td class="mms-num">{{ row.calls }}</td>
                    <td class="mms-num">{{ row.tokens }}</td>
                  </tr>
                </tbody>
              </table>
            </n-spin>
          </div>
        </NTabPane>
      </NTabs>
    </div>

    <!-- 弹窗 -->
    <AddModelDialog
      v-model:show="dialogShow"
      :provider-id="dialogProviderId"
      @confirm="onDialogConfirm"
      @test-result="onDialogTestResult"
    />
    <ResultDialog
      v-model:show="result.show"
      :variant="result.variant"
      :title="result.title"
      :message="result.message"
      :detail="result.detail"
      :duration-ms="result.durationMs"
    />
  </div>
</template>

<style scoped>
.mms {
  display: flex;
  flex-direction: column;
}

/* ═══════════ page-header（对齐 hermes ModelsView header） ═══════════ */
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--km-space-md);
  padding: 0 0 var(--km-space-lg);
}

.header-title {
  font-size: var(--km-font-xl);
  font-weight: 700;
  margin: 0;
  color: var(--km-text);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: var(--km-space-8);
  flex-wrap: wrap;
  justify-content: flex-end;
}

/* ═══════════ NTabs 内容区 ═══════════ */
.mms-content {
  flex: 1;
  overflow-y: auto;
}

.mms-panel {
  display: flex;
  flex-direction: column;
  gap: var(--km-space-10);
  padding-top: var(--km-space-sm);
}

/* ═══════════ 供应商网格（对齐 hermes providers-grid） ═══════════ */
.mms-provider-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 420px), 1fr));
  gap: 14px;
}

/* ═══════════ 默认槽位（保留不动） ═══════════ */
.mms-block-title {
  font-size: var(--km-font-sm);
  font-weight: 600;
}

.mms-block-title-gap {
  margin-top: var(--km-space-sm);
  padding-top: var(--km-space-md);
  border-top: 1px solid var(--km-border);
}

.mms-slots {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: var(--km-space-10);
}

.mms-slot {
  display: flex;
  flex-direction: column;
  gap: var(--km-space-xs);
}

.mms-slot-label {
  font-size: var(--km-font-sm);
  font-weight: 500;
}

.mms-slot-desc {
  font-size: var(--km-font-xs);
  font-weight: 400;
  opacity: 0.5;
  margin-left: var(--km-space-6);
}

/* ═══════════ 表格（保留不动） ═══════════ */
.mms-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--km-font-sm);
}

.mms-table th,
.mms-table td {
  text-align: left;
  padding: 7px var(--km-space-10);
  border-bottom: 1px solid var(--km-border);
  vertical-align: middle;
}

.mms-table th {
  font-size: var(--km-font-xs);
  opacity: 0.6;
  font-weight: 600;
}

.mms-num {
  text-align: right;
}

.mms-ops {
  text-align: right;
  white-space: nowrap;
}

.mms-model-name {
  font-weight: 500;
}

.mms-model-id {
  font-size: var(--km-font-xs);
  opacity: 0.45;
  font-family: var(--km-mono, ui-monospace, monospace);
  margin-top: 1px;
}

.mms-cap {
  margin-right: 3px;
}

/* ═══════════ 用量（保留不动） ═══════════ */
.mms-usage-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--km-space-md);
  margin-bottom: var(--km-space-sm);
}

.mms-usage-hint {
  font-size: var(--km-font-xs);
  opacity: 0.55;
  line-height: 1.7;
}

code {
  font-family: var(--km-mono, ui-monospace, monospace);
}

/* ═══════════ 响应式：窄屏隐藏按钮文字 ═══════════ */
@media (max-width: 640px) {
  .header-actions {
    flex-wrap: nowrap;
  }

  .header-action-label {
    display: none;
  }

  .header-actions :deep(.n-button) {
    width: 32px;
    height: 32px;
    padding: 0;
  }

  .header-actions :deep(.n-button__content),
  .header-actions :deep(.n-button__icon),
  .header-actions :deep(.n-icon-slot) {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .header-actions :deep(.n-button__icon) {
    margin: 0;
  }
}
</style>
