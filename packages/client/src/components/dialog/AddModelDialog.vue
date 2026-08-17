<script setup lang="ts">
/**
 * AddModelDialog — 新增 / 编辑模型供应商弹窗（V3 T5 / S5.3，覆盖 R-19 ~ R-23）。
 *
 * 双测试时序（Q5）：
 *   ① 连通性测试（10s）：写 Key → 校验后端 configured → 数一次模型列表；
 *   ② 深度测试（30s）：**必须先通过 ①**，且必须选定一个目标模型，
 *      确认该模型确实出现在后端可用列表中。
 *   两个测试都产出 ConnectivityResult，向外 emit('test-result')，
 *   由调用方用 ResultDialog 呈现（本弹窗内只做行内状态提示，不抢占模态）。
 *
 * 草稿策略：连通性测试 / 拉取模型列表都需要 store 里存在真实 provider，
 * 因此首次触发时会落一条草稿供应商；用户点「取消」时若是新建草稿则回滚删除，
 * 不留脏数据。
 */
import { computed, ref, watch } from 'vue';
import KIcon from '../common/KIcon.vue';
import {
  NButton,
  NCheckbox,
  NCheckboxGroup,
  NInput,
  NInputNumber,
  NModal,
  NSelect,
  NSpace,
  NTag,
  useMessage,
} from 'naive-ui';
import { useModelConfigStore } from '../../stores/modelConfig';
import { putProvider, putProviderMeta } from '../../api/client';
import {
  API_METHOD_OPTIONS,
  CUSTOM_PROVIDER_KEY,
  MODEL_CAPABILITIES,
  PROVIDER_OPTIONS,
  presetProviderByKey,
} from '../../constants/providers';
import type {
  ApiMethod,
  ConnectivityResult,
  ModelCapability,
  ModelConfig,
} from '../../types/settings';

const props = withDefaults(
  defineProps<{
    show: boolean;
    /** 传入时为编辑既有供应商；空串为新建 */
    providerId?: string;
  }>(),
  { providerId: '' }
);

const emit = defineEmits<{
  (e: 'update:show', v: boolean): void;
  (e: 'confirm', providerId: string): void;
  (e: 'test-result', payload: { kind: 'connectivity' | 'deep'; result: ConnectivityResult }): void;
}>();

const store = useModelConfigStore();
const toast = useMessage();

// ═══════════════════════ 表单状态 ═══════════════════════

const providerKey = ref<string>('openai');
const name = ref<string>('');
const url = ref<string>('');
const apiMethod = ref<ApiMethod>('openai-chat');
const apiKey = ref<string>('');
const models = ref<ModelConfig[]>([]);

/** 新模型输入行 */
const draftModelName = ref<string>('');
const draftModelCaps = ref<ModelCapability[]>(['text']);
const draftModelContext = ref<number>(0);

/** 草稿供应商 id；编辑态直接等于 props.providerId */
const draftId = ref<string>('');
/** 是否为编辑既有供应商（取消时不删除） */
const editing = ref<boolean>(false);

/** 连通性测试是否已通过（深度测试的前置条件） */
const connOk = ref<boolean>(false);
const connMsg = ref<string>('');
const testingConn = ref<boolean>(false);
const testingDeep = ref<boolean>(false);
const fetching = ref<boolean>(false);

/** 深度测试的目标模型 id */
const deepModelId = ref<string>('');

const nameError = ref<string>('');

const title = computed<string>(() => (editing.value ? '编辑模型供应商' : '新增模型供应商'));

const modelOptions = computed(() =>
  models.value.map((m) => ({ label: m.alias.trim() === '' ? m.name : m.alias, value: m.id }))
);

const canDeepTest = computed<boolean>(
  () => connOk.value && deepModelId.value !== '' && !testingDeep.value
);

// ═══════════════════════ 生命周期 ═══════════════════════

watch(
  () => props.show,
  (open) => {
    if (open) resetForm();
  }
);

/** 打开弹窗时初始化表单 */
function resetForm(): void {
  connOk.value = false;
  connMsg.value = '';
  nameError.value = '';
  draftModelName.value = '';
  draftModelCaps.value = ['text'];
  draftModelContext.value = 0;
  deepModelId.value = '';

  const existing = props.providerId === '' ? null : store.getProvider(props.providerId);
  if (existing !== null) {
    editing.value = true;
    draftId.value = existing.id;
    providerKey.value = existing.providerKey;
    name.value = existing.name;
    url.value = existing.url;
    apiMethod.value = existing.apiMethod;
    apiKey.value = existing.apiKey;
    models.value = existing.models.map((m) => ({ ...m, capabilities: [...m.capabilities] }));
    deepModelId.value = models.value.length > 0 ? models.value[0].id : '';
    return;
  }

  editing.value = false;
  draftId.value = '';
  applyPreset('openai');
  apiKey.value = '';
}

/** 选择预置供应商 → 带出 name / url / apiMethod / 预置模型 */
function applyPreset(key: string): void {
  const preset = presetProviderByKey(key);
  providerKey.value = preset.key;
  name.value = preset.name;
  url.value = preset.url;
  apiMethod.value = preset.apiMethod;
  models.value = preset.models.map((m) => ({ ...m, capabilities: [...m.capabilities] }));
  deepModelId.value = models.value.length > 0 ? models.value[0].id : '';
  connOk.value = false;
  connMsg.value = '';
}

function onProviderKeyChange(key: string): void {
  applyPreset(key);
}

// ═══════════════════════ 模型编辑 ═══════════════════════

function addDraftModel(): void {
  const modelName = draftModelName.value.trim();
  if (modelName === '') {
    toast.warning('请先填写模型名称');
    return;
  }
  const id = `${providerKey.value}:${modelName}`;
  if (models.value.some((m) => m.id === id)) {
    toast.warning('该模型已在列表中');
    return;
  }
  const caps: ModelCapability[] = draftModelCaps.value.length > 0 ? [...draftModelCaps.value] : ['text'];
  models.value = [
    ...models.value,
    {
      id,
      name: modelName,
      alias: '',
      capabilities: caps,
      contextLength: draftModelContext.value > 0 ? draftModelContext.value : 0,
    },
  ];
  if (deepModelId.value === '') deepModelId.value = id;
  draftModelName.value = '';
  draftModelCaps.value = ['text'];
  draftModelContext.value = 0;
}

function removeDraftModel(id: string): void {
  models.value = models.value.filter((m) => m.id !== id);
  if (deepModelId.value === id) {
    deepModelId.value = models.value.length > 0 ? models.value[0].id : '';
  }
}

function capLabels(caps: ModelCapability[]): string[] {
  return caps.map((c) => MODEL_CAPABILITIES.find((x) => x.value === c)?.label ?? c);
}

// ═══════════════════════ 草稿落库 ═══════════════════════

function validate(): boolean {
  if (name.value.trim() === '') {
    nameError.value = '供应商名称不能为空';
    return false;
  }
  nameError.value = '';
  return true;
}

/** 确保 store 中存在对应 provider，并把当前表单同步过去；返回 providerId */
function ensureDraft(): string {
  const patch = {
    providerKey: providerKey.value,
    name: name.value.trim() === '' ? presetProviderByKey(providerKey.value).name : name.value.trim(),
    url: url.value.trim(),
    apiMethod: apiMethod.value,
    apiKey: apiKey.value,
    models: models.value.map((m) => ({ ...m, capabilities: [...m.capabilities] })),
  };
  if (draftId.value !== '' && store.getProvider(draftId.value) !== null) {
    store.updateProvider(draftId.value, patch);
    return draftId.value;
  }
  const created = store.addProvider(patch);
  draftId.value = created.id;
  return created.id;
}

// ═══════════════════════ 网络动作 ═══════════════════════

/** 拉取该供应商在后端可见的模型列表（10s） */
async function onFetchModels(): Promise<void> {
  if (!validate()) return;
  fetching.value = true;
  try {
    const id = ensureDraft();
    const added = await store.fetchModels(id);
    const provider = store.getProvider(id);
    if (provider !== null) {
      models.value = provider.models.map((m) => ({ ...m, capabilities: [...m.capabilities] }));
      if (deepModelId.value === '' && models.value.length > 0) deepModelId.value = models.value[0].id;
    }
    if (added < 0) toast.error('拉取模型列表失败：请检查 Base URL / API Key 或后端是否可达');
    else if (added === 0) toast.warning('未发现新的模型（后端返回列表为空或均已存在）');
    else toast.success(`已新增 ${added} 个模型`);
  } finally {
    fetching.value = false;
  }
}

/** ① 连通性测试（10s） */
async function onTestConnectivity(): Promise<void> {
  if (!validate()) return;
  testingConn.value = true;
  connMsg.value = '';
  try {
    const id = ensureDraft();
    const result = await store.testConnectivity(id);
    connOk.value = result.ok;
    connMsg.value = result.ok
      ? `连通正常，后端可见 ${result.modelCount ?? 0} 个模型（${result.durationMs} ms）`
      : `连通失败：${result.error ?? '未知错误'}（${result.durationMs} ms）`;
    emit('test-result', { kind: 'connectivity', result });
  } finally {
    testingConn.value = false;
  }
}

/** ② 深度测试（30s，必须先通过 ①） */
async function onDeepTest(): Promise<void> {
  if (!connOk.value) {
    toast.warning('请先完成连通性测试');
    return;
  }
  if (deepModelId.value === '') {
    toast.warning('请先选择要深度测试的模型');
    return;
  }
  testingDeep.value = true;
  try {
    const id = ensureDraft();
    const result = await store.deepTest(id, deepModelId.value);
    emit('test-result', { kind: 'deep', result });
    if (!result.ok) connOk.value = false;
  } finally {
    testingDeep.value = false;
  }
}

// ═══════════════════════ 收尾 ═══════════════════════

async function onConfirm(): Promise<void> {
  if (!validate()) return;
  if (models.value.length === 0) {
    toast.warning('请至少添加一个模型');
    return;
  }
  const id = ensureDraft();
  // 先确保后端 config.yaml 已生成该 provider 的「模型配置段」（含 base_url / api_mode / models），
  // 再写 Key。否则 setProviderKey 生成 api_key_env 时 provider 尚未落盘，
  // 会与 addProvider 的异步落盘互相覆盖、或丢模型段。
  try {
    await putProviderMeta({
      name: providerKey.value,
      base_url: url.value.trim() || undefined,
      api_mode: apiMethod.value === 'anthropic-chat' ? 'anthropic_messages' : 'openai',
      models: Object.fromEntries(
        models.value.map((m) => [m.name, { context_length: m.contextLength || undefined }]),
      ),
    });
  } catch {
    /* 静默：连通性另有 ① 测试覆盖，不阻断保存 */
  }
  // 用户填了 Key → 随确认一并落后端 .env（变量名遵循 {provider_name}_{序号} 格式，
  // 已在 config.yaml 配置则沿用），避免仅点「确认」而 Key 永不上传，
  // 导致后续重测 / 聊天均报「未检测到该供应商的 API Key」
  const key = apiKey.value.trim();
  if (key !== '') {
    try {
      await putProvider(providerKey.value, key);
    } catch {
      /* 静默：连通性另有 ① 测试覆盖，不阻断保存 */
    }
  }
  emit('confirm', id);
  emit('update:show', false);
  toast.success(editing.value ? '供应商已更新' : `已添加供应商「${name.value.trim()}」`);
}

function onCancel(): void {
  // 新建草稿未确认 → 回滚，避免留下半成品供应商
  if (!editing.value && draftId.value !== '') {
    store.removeProvider(draftId.value);
    draftId.value = '';
  }
  emit('update:show', false);
}

function onUpdateShow(v: boolean): void {
  if (!v) {
    onCancel();
    return;
  }
  emit('update:show', true);
}
</script>

<template>
  <n-modal
    :show="show"
    preset="card"
    class="amd"
    style="width: 720px; max-width: 94vw"
    :title="title"
    :mask-closable="false"
    @update:show="onUpdateShow"
  >
    <div class="amd-body">
      <!-- 供应商基础信息 -->
      <div class="amd-grid">
        <div class="amd-field">
          <div class="amd-label">供应商</div>
          <n-select
            :value="providerKey"
            :options="[...PROVIDER_OPTIONS]"
            size="small"
            :disabled="editing"
            @update:value="onProviderKeyChange"
          />
        </div>
        <div class="amd-field">
          <div class="amd-label">显示名称 <span class="amd-req">*</span></div>
          <n-input
            v-model:value="name"
            size="small"
            placeholder="例如：OpenAI 主账号"
            :status="nameError === '' ? undefined : 'error'"
            @update:value="nameError = ''"
          />
          <div v-if="nameError !== ''" class="amd-error">{{ nameError }}</div>
        </div>
        <div class="amd-field amd-field-wide">
          <div class="amd-label">Base URL</div>
          <n-input
            v-model:value="url"
            size="small"
            :placeholder="providerKey === CUSTOM_PROVIDER_KEY ? 'https://your-endpoint/v1' : ''"
          />
        </div>
        <div class="amd-field">
          <div class="amd-label">API 调用方式</div>
          <n-select
            v-model:value="apiMethod"
            :options="[...API_METHOD_OPTIONS]"
            size="small"
          />
        </div>
        <div class="amd-field">
          <div class="amd-label">API Key</div>
          <n-input
            v-model:value="apiKey"
            type="password"
            show-password-on="click"
            size="small"
            placeholder="仅保存在内存，刷新后需重新填写"
          />
        </div>
      </div>

      <div class="amd-hint">
        <KIcon name="Lock" :size="14" /> 出于安全约定，API Key 不会写入 localStorage；刷新页面后本地只保留「已配置」标记，
        需要重新测试时请再次填写。
      </div>

      <!-- 模型列表 -->
      <div class="amd-block">
        <div class="amd-block-head">
          <span class="amd-block-title">模型列表（{{ models.length }}）</span>
          <n-button size="tiny" tertiary :loading="fetching" @click="onFetchModels">
            从后端拉取
          </n-button>
        </div>

        <div v-if="models.length" class="amd-models">
          <div v-for="m in models" :key="m.id" class="amd-model-row">
            <span class="amd-model-name">{{ m.name }}</span>
            <span class="amd-model-caps">
              <n-tag
                v-for="label in capLabels(m.capabilities)"
                :key="label"
                size="tiny"
                :bordered="false"
              >{{ label }}</n-tag>
            </span>
            <span class="amd-model-ctx">{{ m.contextLength > 0 ? `${Math.round(m.contextLength / 1000)}k` : '—' }}</span>
            <n-button size="tiny" quaternary type="error" @click="removeDraftModel(m.id)">删除</n-button>
          </div>
        </div>
        <div v-else class="amd-models-empty">
          还没有模型。可点「从后端拉取」，或在下方手动添加。
        </div>

        <!-- 手动添加模型 -->
        <div class="amd-add-model">
          <n-input
            v-model:value="draftModelName"
            size="small"
            placeholder="模型名称，例如 gpt-4o"
            class="amd-add-name"
          />
          <n-input-number
            v-model:value="draftModelContext"
            size="small"
            :min="0"
            :step="1000"
            placeholder="上下文长度"
            class="amd-add-ctx"
          />
          <n-button size="small" type="primary" ghost @click="addDraftModel">添加模型</n-button>
        </div>
        <n-checkbox-group v-model:value="draftModelCaps" class="amd-caps">
          <n-checkbox
            v-for="cap in MODEL_CAPABILITIES"
            :key="cap.value"
            :value="cap.value"
            :label="cap.label"
          />
        </n-checkbox-group>
      </div>

      <!-- 双测试 -->
      <div class="amd-block">
        <div class="amd-block-title">连通性验证</div>
        <div class="amd-tests">
          <n-button
            size="small"
            :loading="testingConn"
            :disabled="testingDeep"
            @click="onTestConnectivity"
          >① 连通性测试（10s）</n-button>

          <n-select
            v-model:value="deepModelId"
            :options="modelOptions"
            size="small"
            placeholder="选择深度测试模型"
            class="amd-deep-model"
            :disabled="!models.length"
          />

          <n-button
            size="small"
            type="primary"
            ghost
            :loading="testingDeep"
            :disabled="!canDeepTest"
            @click="onDeepTest"
          >② 深度测试（30s）</n-button>
        </div>
        <div v-if="connMsg !== ''" class="amd-conn-msg" :class="{ ok: connOk }">{{ connMsg }}</div>
        <div v-if="!connOk" class="amd-hint">深度测试需要先通过连通性测试，并选定一个目标模型。</div>
      </div>
    </div>

    <template #footer>
      <n-space justify="end">
        <n-button size="small" @click="onCancel">取消</n-button>
        <n-button size="small" type="primary" @click="onConfirm">确认</n-button>
      </n-space>
    </template>
  </n-modal>
</template>

<style scoped>
.amd-body {
  display: flex;
  flex-direction: column;
  gap: var(--km-space-14);
  max-height: 64vh;
  overflow-y: auto;
  padding-right: var(--km-space-xs);
}

.amd-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--km-space-10) var(--km-space-14);
}

.amd-field {
  display: flex;
  flex-direction: column;
  gap: var(--km-space-xs);
  min-width: 0;
}

.amd-field-wide {
  grid-column: 1 / -1;
}

.amd-label {
  font-size: var(--km-font-sm);
  font-weight: 500;
  opacity: 0.8;
}

.amd-req {
  color: var(--km-danger, #e88);
}

.amd-error {
  font-size: var(--km-font-xs);
  color: var(--km-danger, #e88);
}

.amd-hint {
  font-size: var(--km-font-xs);
  opacity: 0.55;
  line-height: 1.7;
}

.amd-block {
  display: flex;
  flex-direction: column;
  gap: var(--km-space-sm);
  padding-top: var(--km-space-10);
  border-top: 1px solid var(--km-border);
}

.amd-block-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.amd-block-title {
  font-size: var(--km-font-sm);
  font-weight: 600;
}

.amd-models {
  display: flex;
  flex-direction: column;
  gap: var(--km-space-xs);
  max-height: 180px;
  overflow-y: auto;
  border: 1px solid var(--km-border);
  border-radius: var(--km-radius-md);
 padding: var(--km-space-6);
  background: var(--km-bg);
}

.amd-model-row {
  display: flex;
  align-items: center;
  gap: var(--km-space-sm);
  font-size: var(--km-font-sm);
}

.amd-model-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--km-mono, ui-monospace, monospace);
}

.amd-model-caps {
  display: flex;
  gap: 3px;
  flex-wrap: wrap;
  max-width: 240px;
}

.amd-model-ctx {
  width: 44px;
  text-align: right;
  opacity: 0.6;
}

.amd-models-empty {
  font-size: var(--km-font-sm);
  opacity: 0.55;
 padding: var(--km-space-10);
  border: 1px dashed var(--km-border);
  border-radius: var(--km-radius-md);
}

.amd-add-model {
  display: flex;
  gap: var(--km-space-sm);
  align-items: center;
}

.amd-add-name {
  flex: 1;
}

.amd-add-ctx {
  width: 150px;
}

.amd-caps {
  display: flex;
  flex-wrap: wrap;
  gap: var(--km-space-xs) var(--km-space-md);
}

.amd-tests {
  display: flex;
  align-items: center;
  gap: var(--km-space-sm);
  flex-wrap: wrap;
}

.amd-deep-model {
  width: 220px;
}

.amd-conn-msg {
  font-size: var(--km-font-sm);
  color: var(--km-danger, #e88);
}

.amd-conn-msg.ok {
  color: var(--km-accent);
}
</style>
