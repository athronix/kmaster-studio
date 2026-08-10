<script setup lang="ts">
import KIcon from '../common/KIcon.vue';/**
 * ModelManageSection — 设置 → 模型管理（V3 T4 / S4.7，覆盖 R-19 ~ R-25）。
 *
 * 三个区块：
 *   ① 供应商管理：新增 / 编辑 / 删除 / 连通性重测，Key 状态与最近测试时间可见；
 *   ② 模型列表 + 默认槽位：5 个槽位按能力过滤候选模型，删除模型自动清理槽位引用；
 *   ③ 用量：来自 `/api/usage/stats?group_by=model` 的真实数据，
 *      未匹配到模型级数据时显示「—」而不是编造 0（A5）。
 *
 * 弹窗联动：AddModelDialog（双测试）→ ResultDialog（结果展示）。
 *
 * T02：标签从自定义 button → NTabs；供应商列表从行式 → ProviderModelCard 网格。
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

type SubTab = 'providers' | 'models' | 'usage';
const subTab = ref<SubTab>('providers');

const loading = ref<boolean>(false);
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

// ═══════════════════════ ① 供应商 ═══════════════════════

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
    <!-- T02：标签改用 NTabs（type="line"） -->
    <n-tabs v-model:value="subTab" type="line" animated>
      <n-tab-pane name="providers" tab="供应商">
        <div class="mms-panel">
          <!-- 工具栏 -->
          <div class="mms-toolbar">
            <span class="mms-toolbar-hint" v-if="store.providerCount">
              共 {{ store.providerCount }} 个供应商
            </span>
            <span v-else></span>
            <n-button size="small" type="primary" @click="onAddProvider">
              <template #icon><KIcon name="Plus" :size="16" /></template>
              新增供应商
            </n-button>
          </div>

          <!-- 空态 -->
          <n-empty
            v-if="!store.providerCount"
            description="还没有配置任何模型供应商"
          >
            <template #extra>
              <n-button size="small" type="primary" @click="onAddProvider">新增第一个供应商</n-button>
            </template>
          </n-empty>

          <!-- T02：供应商网格（替代行式 .mms-provider 布局） -->
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
        </div>
      </n-tab-pane>

      <n-tab-pane name="models" tab="模型与默认槽位">
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
      </n-tab-pane>

      <n-tab-pane name="usage" tab="用量">
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
      </n-tab-pane>
    </n-tabs>

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

/* T02：NTabs 下方面板间距（naive-ui NTabs 本身自带 tabs-nav 间距，这里统一面板上边距） */
.mms-panel {
  display: flex;
  flex-direction: column;
  gap: var(--km-space-10);
  padding-top: var(--km-space-sm);
}

/* 工具栏 */
.mms-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--km-space-md);
}

.mms-toolbar-hint {
  font-size: var(--km-font-xs);
  opacity: 0.5;
}

/* T02：供应商卡片网格（替代旧 .mms-provider 行式布局） */
.mms-provider-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
  gap: var(--km-space-10);
}

/* 默认槽位 */
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

/* 表格 */
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
</style>
