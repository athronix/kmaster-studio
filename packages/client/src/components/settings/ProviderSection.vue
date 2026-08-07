<script setup lang="ts">
/**
 * T08：Provider & Model 分组。
 *
 * 数据源变更：
 * - Provider 信息：`GET /api/models` → ProviderGroup[]（含 provider/name/models/authenticated）
 * - Key 管理：仍走 `PUT /api/config/providers`
 * - 🔒 API Key **只写不回显** —— 保存成功即清空输入框。
 *
 * UI：名称 / 类型 / 模型数量 / Key 状态（已配置/未配置，脱敏显示前4后4）
 */
import { computed, onMounted, ref } from 'vue';
import { NInput, NButton, NSelect, NSpin, NTag, NEmpty, NPopconfirm, useMessage } from 'naive-ui';
import { getModels, getProviders, putProvider, type ModelsResponse } from '../../api/client';
import { useChatStore } from '../../stores/chat';
import type { ProviderGroup, ProviderInfo } from '../../types/chat';

const message = useMessage();
const store = useChatStore();

const loading = ref(false);
/** T08：来自 /api/models 的 ProviderGroup（语义真源） */
const providerGroups = ref<ProviderGroup[]>([]);
/** 来自 /api/config/providers 的配置态（Key 状态、脱敏值） */
const providerConfigs = ref<ProviderInfo[]>([]);
const current = ref('');
/** 正在编辑 Key 的 provider slug（同一时刻仅一个，避免误填串行） */
const editingSlug = ref('');
/** 输入框中的明文，仅在内存中短暂存在，保存/取消后立即清空 */
const draftKey = ref('');
const submitting = ref('');

const modelOptions = computed(() =>
  store.models.flatMap((g) =>
    g.models.map((m) => ({ label: `${m.name || m.id}  ·  ${g.label || g.provider}`, value: m.id }))
  )
);
const defaultModel = computed(() => store.globalSettings.default_model ?? '');

/** T08：合并 /api/models + /api/config/providers 的 provider 视图 */
interface ProviderView {
  slug: string;
  name: string;
  label: string;
  /** provider 类型（如 OpenAI / Anthropic / 自定义） */
  type: string;
  modelCount: number;
  authenticated: boolean;
  keyEnv: string;
  configured: boolean;
  masked: string;
  isCurrent: boolean;
}

const providerViews = computed<ProviderView[]>(() => {
  const configMap = new Map<string, ProviderInfo>();
  for (const cfg of providerConfigs.value) {
    configMap.set(cfg.slug, cfg);
  }
  return providerGroups.value.map((g) => {
    const cfg = configMap.get(g.provider);
    return {
      slug: g.provider,
      name: cfg?.name ?? g.label,
      label: g.label,
      type: g.provider,
      modelCount: g.models.length,
      authenticated: g.authenticated ?? cfg?.configured ?? false,
      keyEnv: cfg?.key_env ?? '',
      configured: cfg?.configured ?? false,
      masked: cfg?.masked ?? '',
      isCurrent: current.value === g.provider,
    };
  });
});

async function load(): Promise<void> {
  loading.value = true;
  try {
    const [modelsRes, configRes] = await Promise.all([
      getModels(),
      getProviders(),
      store.loadModels().catch(() => {}),
      store.loadGlobalSettings().catch(() => {}),
    ]);
    providerGroups.value = modelsRes.providers;
    providerConfigs.value = configRes.providers;
    current.value = configRes.current;
  } catch (err) {
    message.error(`Provider 加载失败：${String((err as Error)?.message ?? err)}`);
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void load();
});

function startEdit(slug: string): void {
  editingSlug.value = slug;
  draftKey.value = '';
}
function cancelEdit(): void {
  editingSlug.value = '';
  draftKey.value = '';
}

/** 脱敏显示：前4后4，不足8位用 * 替代 */
function maskKey(key: string): string {
  if (!key || key.length <= 8) return '****';
  return `${key.slice(0, 4)}****${key.slice(-4)}`;
}

/** 写入 Key：成功后立刻丢弃明文。 */
async function saveKey(pv: ProviderView): Promise<void> {
  const value = draftKey.value.trim();
  if (!value) {
    message.warning('请输入 API Key');
    return;
  }
  submitting.value = pv.slug;
  try {
    const res = await putProvider(pv.slug, value);
    // 更新本地配置态
    const cfg = providerConfigs.value.find((c) => c.slug === pv.slug);
    if (cfg) {
      cfg.configured = res.configured;
      cfg.masked = res.masked;
      cfg.warning = res.configured ? undefined : `未检测到 ${cfg.key_env}，保存 Key 后生效`;
    }
    cancelEdit();
    // Key 变更会影响可用模型
    await store.loadModels().catch(() => {});
    message.success(`${pv.name} 的 API Key 已写入（经 hermes config set 生效）`);
  } catch (err) {
    message.error(`保存失败：${String((err as Error)?.message ?? err)}`);
  } finally {
    submitting.value = '';
  }
}

/** 清除 Key：后端以空串调用 `hermes config set <key_env> ""`。 */
async function clearKey(pv: ProviderView): Promise<void> {
  submitting.value = pv.slug;
  try {
    const res = await putProvider(pv.slug, '');
    const cfg = providerConfigs.value.find((c) => c.slug === pv.slug);
    if (cfg) {
      cfg.configured = res.configured;
      cfg.masked = res.masked;
      cfg.warning = `未检测到 ${cfg.key_env}，保存 Key 后生效`;
    }
    await store.loadModels().catch(() => {});
    message.success(`已清除 ${pv.name} 的 API Key`);
  } catch (err) {
    message.error(`清除失败：${String((err as Error)?.message ?? err)}`);
  } finally {
    submitting.value = '';
  }
}

/** 默认模型与「Agent 默认」分组共用 chat store 状态。 */
async function onDefaultModelChange(value: string | null): Promise<void> {
  try {
    await store.setGlobalSettings(store.globalSettings.default_mode, value ?? '');
    message.success('已更新默认模型');
  } catch (err) {
    message.error(`保存失败：${String((err as Error)?.message ?? err)}`);
  }
}
</script>

<template>
  <n-spin :show="loading">
    <div class="prov-body">
      <div class="prov-toolbar">
        <span class="prov-current">
          当前 Provider：<b>{{ current || '—' }}</b>
        </span>
        <n-button size="small" tertiary @click="load">刷新</n-button>
      </div>

      <n-empty v-if="!providerViews.length" description="未发现任何 provider" />
      <table v-else class="prov-table">
        <thead>
          <tr>
            <th>Provider</th>
            <th>类型</th>
            <th>模型数</th>
            <th>Key 状态</th>
            <th class="prov-ops">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="pv in providerViews" :key="pv.slug">
            <td>
              <div class="prov-name">
                {{ pv.name }}
                <n-tag v-if="pv.isCurrent" size="tiny" type="info" :bordered="false">当前</n-tag>
              </div>
              <div class="prov-slug">{{ pv.keyEnv || '无需 Key' }}</div>
            </td>
            <td>
              <n-tag size="small" :bordered="false">{{ pv.type }}</n-tag>
            </td>
            <td>
              <span class="prov-model-count">{{ pv.modelCount }}</span>
            </td>
            <td>
              <n-tag v-if="!pv.keyEnv" size="small" :bordered="false">无需配置</n-tag>
              <n-tag v-else-if="pv.configured" size="small" type="success" :bordered="false">● 已配置</n-tag>
              <n-tag v-else size="small" :bordered="false">○ 未配置</n-tag>
            </td>
            <td class="prov-ops">
              <template v-if="editingSlug === pv.slug">
                <n-input
                  v-model:value="draftKey"
                  type="password"
                  show-password-on="click"
                  placeholder="粘贴 API Key（保存后不再回显）"
                  :disabled="submitting === pv.slug"
                  size="small"
                  style="width: 180px"
                />
                <n-button
                  size="small"
                  type="primary"
                  :loading="submitting === pv.slug"
                  @click="saveKey(pv)"
                >保存</n-button>
                <n-button size="small" tertiary @click="cancelEdit">取消</n-button>
              </template>
              <template v-else-if="pv.keyEnv">
                <span v-if="pv.configured" class="prov-masked" :title="pv.masked">{{ maskKey(pv.masked) }}</span>
                <n-button size="small" @click="startEdit(pv.slug)">
                  {{ pv.configured ? '更换' : '输入 Key…' }}
                </n-button>
                <n-popconfirm v-if="pv.configured" @positive-click="clearKey(pv)">
                  <template #trigger>
                    <n-button size="small" tertiary :loading="submitting === pv.slug">清除</n-button>
                  </template>
                  确认清除 {{ pv.name }} 的 API Key？该操作会写入空值到 {{ pv.keyEnv }}。
                </n-popconfirm>
              </template>
              <span v-else class="prov-slug">—</span>
            </td>
          </tr>
        </tbody>
      </table>

      <div class="prov-row">
        <div class="prov-label">默认模型</div>
        <n-select
          :value="defaultModel || null"
          :options="modelOptions"
          filterable
          clearable
          placeholder="选择默认模型（留空则用 hermes 当前激活模型）"
          style="max-width: 420px"
          @update:value="onDefaultModelChange"
        />
      </div>

      <div class="prov-warn">
        ⚠️ API Key 仅写入不回显，保存后经 <code>hermes config set</code> 落到 hermes 的 .env（保留原有注释与其余键）。
      </div>
    </div>
  </n-spin>
</template>

<style scoped>
.prov-body { display: flex; flex-direction: column; gap: 16px; }
.prov-toolbar { display: flex; align-items: center; justify-content: space-between; }
.prov-current { font-size: 12px; opacity: 0.75; }
.prov-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.prov-table th,
.prov-table td {
  text-align: left;
  padding: 8px 10px;
  border-bottom: 1px solid var(--km-border);
  vertical-align: middle;
}
.prov-table th { font-size: 12px; opacity: 0.6; font-weight: 600; }
.prov-name { display: flex; align-items: center; gap: 6px; }
.prov-slug { font-size: 11px; opacity: 0.5; margin-top: 2px; }
.prov-masked { font-family: var(--km-mono, ui-monospace, monospace); opacity: 0.8; font-size: 12px; }
.prov-model-count { font-size: 13px; font-weight: 500; }
.prov-ops { display: flex; gap: 6px; align-items: center; white-space: nowrap; }
.prov-row { display: flex; flex-direction: column; gap: 6px; }
.prov-label { font-size: 13px; font-weight: 600; }
.prov-warn { font-size: 11px; opacity: 0.6; }
.prov-warn code { font-family: var(--km-mono, ui-monospace, monospace); }
</style>
