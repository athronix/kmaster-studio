/**
 * stores/modelConfig.ts —— 模型供应商 / 模型 / 默认槽位（设计 §3.1 ModelConfigStore）。
 *
 * Q4 决策：供应商元数据来自前端 `PRESET_PROVIDERS`；
 *          Key 连通性走后端 `/api/config/providers`（明文 Key 不落 localStorage）。
 * Q5 决策：连通性 test 超时 10s，深度测试超时 30s，两者统一产出 `ConnectivityResult`。
 *
 * T08：/api/models 现在返回 `{ providers: ProviderGroup[], usage: {...} }`。
 *      模型用量直接从 /api/models 的 usage 聚合获取（近7天 calls + tokens）。
 *
 * 🔒 安全约定（设计 §7.3）：persist 时 `apiKey` 一律置空，只留 `keyMasked` 标记；
 *    刷新页面后 UI 显示「已配置」，需要重测时用户重新填 Key。
 */
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { getModels, getProviders, putProvider, type ModelsResponse } from '../api/client';
import { useChatStore } from './chat';
import { INTERACTION, LS_KEYS, lsGet, lsSet, shortId } from '../constants/layout';
import {
  CUSTOM_PROVIDER_KEY,
  DEFAULT_API_METHOD,
  SLOT_REQUIRED_CAPS,
  emptyDefaults,
  presetProviderByKey,
} from '../constants/providers';
import type {
  ApiMethod,
  ConnectivityResult,
  DefaultModelSlot,
  DefaultsMap,
  ModelCapability,
  ModelConfig,
  ModelConfigSnapshot,
  ModelProviderConfig,
  SelectOption,
} from '../types/settings';

/** T08：模型用量来自 /api/models usage 聚合（近7天）。 */
export interface ModelUsage {
  /** 近7天调用次数 */
  calls: number;
  /** 近7天 token 总量 */
  tokens: number;
  /** 是否有数据（false 时 UI 显示「—」） */
  known: boolean;
}

/** 空用量（未匹配到模型级数据）。 */
function unknownUsage(): ModelUsage {
  return { calls: 0, tokens: 0, known: false };
}

/**
 * 给 Promise 套超时。超时后以 `TimeoutError` 拒绝，绝不悬挂。
 * 注意：底层 fetch 不会被真正取消（无 AbortController 贯通），
 * 这里只保证 UI 不会无限转圈——对本地工具型应用足够。
 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label}超时（${Math.round(ms / 1000)}s）`));
    }, ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(timer);
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    );
  });
}

/** 规整单个模型（hydrate 防脏）。 */
function normalizeModel(raw: Partial<ModelConfig>, providerKey: string): ModelConfig {
  const name = typeof raw.name === 'string' ? raw.name : '';
  return {
    id: typeof raw.id === 'string' && raw.id !== '' ? raw.id : `${providerKey}:${name}`,
    name,
    alias: typeof raw.alias === 'string' ? raw.alias : '',
    capabilities: Array.isArray(raw.capabilities)
      ? (raw.capabilities.filter((c): c is ModelCapability => typeof c === 'string') as ModelCapability[])
      : ['text'],
    contextLength: typeof raw.contextLength === 'number' ? raw.contextLength : 0,
  };
}

/** 规整单个供应商（hydrate 防脏；apiKey 永远从空串起步）。 */
function normalizeProvider(raw: Partial<ModelProviderConfig>): ModelProviderConfig {
  const providerKey =
    typeof raw.providerKey === 'string' && raw.providerKey !== '' ? raw.providerKey : CUSTOM_PROVIDER_KEY;
  return {
    id: typeof raw.id === 'string' && raw.id !== '' ? raw.id : shortId('prov'),
    providerKey,
    name: typeof raw.name === 'string' ? raw.name : presetProviderByKey(providerKey).name,
    url: typeof raw.url === 'string' ? raw.url : '',
    apiMethod: (typeof raw.apiMethod === 'string' ? raw.apiMethod : DEFAULT_API_METHOD) as ApiMethod,
    apiKey: '',
    keyMasked: raw.keyMasked === true,
    models: Array.isArray(raw.models)
      ? (raw.models as Partial<ModelConfig>[])
          .filter((m) => typeof m === 'object' && m !== null)
          .map((m) => normalizeModel(m, providerKey))
      : [],
    verified: raw.verified === true,
    lastTestedAt: typeof raw.lastTestedAt === 'number' ? raw.lastTestedAt : 0,
  };
}

export const useModelConfigStore = defineStore('modelConfig', () => {
  // ═══════════════════════ state ═══════════════════════

  /** 已配置供应商列表 */
  const providers = ref<ModelProviderConfig[]>([]);
  /** 5 个默认模型槽位 → modelId */
  const defaults = ref<DefaultsMap>(emptyDefaults());
  /** 最近一次 fetchModels / test / deepTest 是否在进行中 */
  const busy = ref<boolean>(false);
  /** T08：模型用量（来自 /api/models usage 聚合，按模型名 key） */
  const modelUsage = ref<Record<string, { calls: number; tokens: number }>>({});

  // ═══════════════════════ derived ═══════════════════════

  /** 供应商总数。 */
  const providerCount = computed<number>(() => providers.value.length);

  /** 全量模型（带所属供应商），列表页与槽位下拉共用。 */
  const allModels = computed<{ provider: ModelProviderConfig; model: ModelConfig }[]>(() =>
    providers.value.flatMap((p) => p.models.map((m) => ({ provider: p, model: m })))
  );

  /** 模型总数。 */
  const modelCount = computed<number>(() => allModels.value.length);

  // ═══════════════════════ queries ═══════════════════════

  /** 按 id 取供应商；不存在返回 null。 */
  function getProvider(id: string): ModelProviderConfig | null {
    return providers.value.find((p) => p.id === id) ?? null;
  }

  /** 按 modelId 取模型；不存在返回 null。 */
  function getModel(modelId: string): ModelConfig | null {
    return allModels.value.find((x) => x.model.id === modelId)?.model ?? null;
  }

  /** 模型展示名：有别名用别名，否则用原名。 */
  function displayName(model: ModelConfig): string {
    return model.alias.trim() === '' ? model.name : model.alias;
  }

  /**
   * 某个默认槽位可选的模型下拉项。
   * 只列出具备该槽位全部必备能力的模型（如 vision 槽只列有 vision 能力的）。
   */
  function optionsForSlot(slot: DefaultModelSlot): SelectOption[] {
    const required = SLOT_REQUIRED_CAPS[slot] ?? [];
    return allModels.value
      .filter(({ model }) => required.every((cap) => model.capabilities.includes(cap)))
      .map(({ provider, model }) => ({
        label: `${provider.name} / ${displayName(model)}`,
        value: model.id,
      }));
  }

  /** T08：取模型用量（来自 /api/models usage）；无数据时返回 `known:false`（UI 显示「—」）。 */
  function usageOf(modelId: string): ModelUsage {
    const model = getModel(modelId);
    if (!model) return unknownUsage();
    // 按模型名匹配（usage key 可能是 model.name 或 model.id）
    const entry = modelUsage.value[model.name] ?? modelUsage.value[modelId];
    if (!entry) return unknownUsage();
    return {
      calls: entry.calls,
      tokens: entry.tokens,
      known: true,
    };
  }

  // ═══════════════════════ mutations ═══════════════════════

  /** 新增供应商；未给字段时按预置表带出 url / apiMethod / 预置模型。 */
  function addProvider(patch: Partial<ModelProviderConfig>): ModelProviderConfig {
    const preset = presetProviderByKey(patch.providerKey ?? CUSTOM_PROVIDER_KEY);
    const provider = normalizeProvider({
      ...patch,
      providerKey: patch.providerKey ?? CUSTOM_PROVIDER_KEY,
      name: patch.name ?? preset.name,
      url: patch.url ?? preset.url,
      apiMethod: patch.apiMethod ?? preset.apiMethod,
      models: patch.models ?? preset.models.map((m) => ({ ...m })),
    });
    // 明文 Key 只留在内存，不进 normalize 的清洗流程
    provider.apiKey = typeof patch.apiKey === 'string' ? patch.apiKey : '';
    provider.keyMasked = provider.apiKey !== '' || patch.keyMasked === true;
    providers.value = [...providers.value, provider];
    persist();
    void useChatStore().reloadModels();
    return provider;
  }

  /** 更新供应商；不存在返回 null。 */
  function updateProvider(id: string, patch: Partial<ModelProviderConfig>): ModelProviderConfig | null {
    const idx = providers.value.findIndex((p) => p.id === id);
    if (idx < 0) return null;
    const prev = providers.value[idx];
    const merged: ModelProviderConfig = {
      ...prev,
      ...patch,
      id,
      models: patch.models ?? prev.models,
      apiKey: typeof patch.apiKey === 'string' ? patch.apiKey : prev.apiKey,
    };
    merged.keyMasked = merged.apiKey !== '' || merged.keyMasked;
    const next = [...providers.value];
    next[idx] = merged;
    providers.value = next;
    persist();
    return merged;
  }

  /** 删除供应商，并清掉引用其模型的默认槽位。 */
  function removeProvider(id: string): boolean {
    const target = getProvider(id);
    if (!target) return false;
    const removedIds = new Set(target.models.map((m) => m.id));
    providers.value = providers.value.filter((p) => p.id !== id);
    pruneDefaults(removedIds);
    persist();
    void useChatStore().reloadModels();
    return true;
  }

  /** 给供应商加模型；供应商不存在返回 null；同名模型直接返回既有项。 */
  function addModel(providerId: string, patch: Partial<ModelConfig>): ModelConfig | null {
    const provider = getProvider(providerId);
    if (!provider) return null;
    const model = normalizeModel(patch, provider.providerKey);
    if (model.name === '') return null;
    const existing = provider.models.find((m) => m.id === model.id);
    if (existing) return existing;
    updateProvider(providerId, { models: [...provider.models, model] });
    return model;
  }

  /** 删除模型，并清掉引用它的默认槽位。 */
  function removeModel(providerId: string, modelId: string): boolean {
    const provider = getProvider(providerId);
    if (!provider) return false;
    const next = provider.models.filter((m) => m.id !== modelId);
    if (next.length === provider.models.length) return false;
    updateProvider(providerId, { models: next });
    pruneDefaults(new Set([modelId]));
    persist();
    void useChatStore().reloadModels();
    return true;
  }

  /** 设置默认槽位；传空串表示清除。modelId 不存在时不生效并返回 false。 */
  function setDefault(slot: DefaultModelSlot, modelId: string): boolean {
    if (modelId !== '' && !getModel(modelId)) return false;
    defaults.value = { ...defaults.value, [slot]: modelId };
    persist();
    void useChatStore().reloadModels();
    return true;
  }

  /** 清掉引用了已删除模型的槽位。 */
  function pruneDefaults(removedIds: Set<string>): void {
    let changed = false;
    const next: DefaultsMap = { ...defaults.value };
    for (const key of Object.keys(next) as DefaultModelSlot[]) {
      if (removedIds.has(next[key])) {
        next[key] = '';
        changed = true;
      }
    }
    if (changed) defaults.value = next;
  }

  // ═══════════════════════ 网络动作 ═══════════════════════

  /**
   * 拉取该供应商在后端可见的模型列表并合并进本地配置。
   * Q5：10s 超时。返回本次新增的模型数；失败返回 -1（不抛错）。
   * T08：/api/models 现返回 ModelsResponse{providers, usage}。
   */
  async function fetchModels(providerId: string): Promise<number> {
    const provider = getProvider(providerId);
    if (!provider) return -1;
    busy.value = true;
    try {
      const res = await withTimeout(getModels(), INTERACTION.fetchModelsTimeoutMs, '拉取模型列表');
      const groups = res.providers;
      const group =
        groups.find((g) => g.provider === provider.providerKey) ??
        groups.find((g) => g.label === provider.name);
      if (!group) return 0;
      const existing = new Set(provider.models.map((m) => m.name));
      const added: ModelConfig[] = group.models
        .filter((m) => !existing.has(m.name))
        .map((m) =>
          normalizeModel(
            {
              id: `${provider.providerKey}:${m.name}`,
              name: m.name,
              alias: '',
              capabilities: ['text'],
              contextLength: typeof (m as { context?: number }).context === 'number' ? (m as { context: number }).context : 0,
            },
            provider.providerKey
          )
        );
      if (added.length > 0) {
        updateProvider(providerId, { models: [...provider.models, ...added] });
      }
      // T08：同步用量
      if (res.usage) {
        modelUsage.value = res.usage;
      }
      return added.length;
    } catch {
      return -1;
    } finally {
      busy.value = false;
    }
  }

  /**
   * Q5：连通性测试（10s）。
   * 步骤：写 Key → 读回 providers 校验 configured → 拉一次模型列表数数量。
   */
  async function testConnectivity(providerId: string): Promise<ConnectivityResult> {
    const provider = getProvider(providerId);
    if (!provider) {
      return { ok: false, durationMs: 0, error: '供应商不存在' };
    }
    const started = Date.now();
    busy.value = true;
    try {
      const run = async (): Promise<ConnectivityResult> => {
        if (provider.apiKey !== '') {
          await putProvider(provider.providerKey, provider.apiKey);
        }
        const list = await getProviders();
        const info = list.providers.find((p) => p.slug === provider.providerKey);
        if (info && !info.configured) {
          return { ok: false, durationMs: Date.now() - started, error: '后端未检测到该供应商的 API Key' };
        }
        const res = await getModels();
        const group = res.providers.find((g) => g.provider === provider.providerKey);
        // T08：同步用量
        if (res.usage) {
          modelUsage.value = res.usage;
        }
        return {
          ok: true,
          durationMs: Date.now() - started,
          modelCount: group ? group.models.length : 0,
        };
      };
      const result = await withTimeout(run(), INTERACTION.testTimeoutMs, '连通性测试');
      markTested(providerId, result.ok);
      return result;
    } catch (err) {
      markTested(providerId, false);
      return {
        ok: false,
        durationMs: Date.now() - started,
        error: err instanceof Error ? err.message : String(err),
      };
    } finally {
      busy.value = false;
    }
  }

  /**
   * Q5：深度测试（30s）。
   * 在连通性基础上进一步确认「目标模型确实出现在后端可用列表里」，
   * 并把命中的模型名回填为样例文本，供 ResultDialog 展示。
   */
  async function deepTest(providerId: string, modelId: string): Promise<ConnectivityResult> {
    const provider = getProvider(providerId);
    if (!provider) {
      return { ok: false, durationMs: 0, error: '供应商不存在' };
    }
    const model = getModel(modelId);
    if (!model) {
      return { ok: false, durationMs: 0, error: '模型不存在' };
    }
    const started = Date.now();
    busy.value = true;
    try {
      const run = async (): Promise<ConnectivityResult> => {
        if (provider.apiKey !== '') {
          await putProvider(provider.providerKey, provider.apiKey);
        }
        const res = await getModels();
        const group = res.providers.find((g) => g.provider === provider.providerKey);
        const hit = group?.models.find((m) => m.name === model.name);
        if (!hit) {
          return {
            ok: false,
            durationMs: Date.now() - started,
            modelCount: group ? group.models.length : 0,
            error: `后端可用列表中未找到模型 ${model.name}`,
          };
        }
        // T08：同步用量
        if (res.usage) {
          modelUsage.value = res.usage;
        }
        return {
          ok: true,
          durationMs: Date.now() - started,
          modelCount: group ? group.models.length : 0,
          sample: `模型 ${hit.name} 已就绪（provider=${provider.providerKey}，context=${(hit as { context?: number }).context ?? '未知'}）`,
        };
      };
      const result = await withTimeout(run(), INTERACTION.deepTestTimeoutMs, '深度测试');
      markTested(providerId, result.ok);
      return result;
    } catch (err) {
      markTested(providerId, false);
      return {
        ok: false,
        durationMs: Date.now() - started,
        error: err instanceof Error ? err.message : String(err),
      };
    } finally {
      busy.value = false;
    }
  }

  /** 记录一次测试结果。 */
  function markTested(providerId: string, ok: boolean): void {
    updateProvider(providerId, { verified: ok, lastTestedAt: Date.now() });
  }

  /**
   * T08：加载模型列表与用量（来自 /api/models）。
   * 替代旧版 loadUsage()，一次调用同时获取 providers + usage。
   */
  async function loadModelsAndUsage(): Promise<void> {
    busy.value = true;
    try {
      const res = await getModels();
      if (res.usage) {
        modelUsage.value = res.usage;
      }
      // 同步 API ProviderGroup → 本地 providers
      const merged: ModelProviderConfig[] = [];
      for (const group of res.providers) {
        const existing = providers.value.find((p) => p.providerKey === group.provider);
        if (existing) {
          // 已存在：更新验证状态 + 模型列表（API 为准）
          existing.verified = group.authenticated === true;
          existing.lastTestedAt = group.authenticated === true ? Date.now() : 0;
          // 合并 API 模型列表（保留用户自定义模型）
          const apiIds = new Set(group.models.map((m) => m.id));
          const userDefined = existing.models.filter((m) => !apiIds.has(m.id));
          const apiModels: ModelConfig[] = group.models.map((m) => ({
            id: m.id,
            name: m.name,
            alias: '',
            capabilities: ([] as ModelCapability[]),
            contextLength: m.context || 0,
          }));
          existing.models = [...apiModels, ...userDefined];
          merged.push(existing);
        } else {
          // 🆕 新增：从 API 创建 provider 条目
          merged.push({
            id: group.provider,
            providerKey: group.provider,
            name: group.label || group.provider,
            url: '',
            apiMethod: 'openai' as ApiMethod,
            apiKey: '',
            keyMasked: group.authenticated === true,
            models: group.models.map((m) => ({
              id: m.id,
              name: m.name,
              alias: '',
              capabilities: ([] as ModelCapability[]),
              contextLength: m.context || 0,
            })),
            verified: group.authenticated === true,
            lastTestedAt: group.authenticated === true ? Date.now() : 0,
          });
        }
      }
      providers.value = merged;
      persist();
      // MD-01：写后同步 chat store 模型列表
      void useChatStore().reloadModels();
    } catch {
      // 静默失败，保留现有数据
    } finally {
      busy.value = false;
    }
  }

  // ═══════════════════════ persistence ═══════════════════════

  /** 落盘。🔒 明文 apiKey 一律剔除，只保留 keyMasked 标记。 */
  function persist(): void {
    const snapshot: ModelConfigSnapshot = {
      providers: providers.value.map((p) => ({ ...p, apiKey: '' })),
      defaults: defaults.value,
    };
    lsSet(LS_KEYS.modelConfig, snapshot);
  }

  /** 从 localStorage 恢复；脏数据一律规整。 */
  function hydrate(): void {
    const snap = lsGet<Partial<ModelConfigSnapshot>>(LS_KEYS.modelConfig, {});
    providers.value = Array.isArray(snap.providers)
      ? (snap.providers as Partial<ModelProviderConfig>[])
          .filter((p) => typeof p === 'object' && p !== null)
          .map((p) => normalizeProvider(p))
      : [];
    const base = emptyDefaults();
    const raw = (snap.defaults ?? {}) as Partial<DefaultsMap>;
    for (const key of Object.keys(base) as DefaultModelSlot[]) {
      base[key] = typeof raw[key] === 'string' ? (raw[key] as string) : '';
    }
    defaults.value = base;
  }

  return {
    // state
    providers,
    defaults,
    busy,
    modelUsage,
    // derived
    providerCount,
    allModels,
    modelCount,
    // queries
    getProvider,
    getModel,
    displayName,
    optionsForSlot,
    usageOf,
    // mutations
    addProvider,
    updateProvider,
    removeProvider,
    addModel,
    removeModel,
    setDefault,
    // network
    fetchModels,
    testConnectivity,
    deepTest,
    loadModelsAndUsage,
    // persistence
    persist,
    hydrate,
  };
});
