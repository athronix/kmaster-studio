/**
 * stores/modelConfig.test.ts —— 模型配置 store 单测。
 *
 * 覆盖：供应商 CRUD / 模型 CRUD / 槽位能力过滤 / 删除联动清槽位 /
 *       Q5 test 与 deepTest 成功失败超时三分支 / 🔒 apiKey 不落盘 / 用量回落。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useModelConfigStore } from './modelConfig';
import { LS_KEYS } from '../constants/layout';
import type { ProviderGroup, ProviderListResult, UsageStatRow } from '../types/chat';

const state = vi.hoisted(() => ({
  models: [] as ProviderGroup[],
  providerList: { providers: [], current: '' } as ProviderListResult,
  usageRows: [] as UsageStatRow[],
  modelUsage: {} as Record<string, { calls: number; tokens: number }>,
  failModels: false,
  hangModels: false,
  putCalls: [] as { provider: string; apiKey: string }[],
}));

vi.mock('../api/client', () => ({
  getModels: vi.fn(async () => {
    if (state.failModels) throw new Error('network down');
    if (state.hangModels) return new Promise<{ providers: ProviderGroup[]; usage: Record<string, { calls: number; tokens: number }> }>(() => {}); // 永不 resolve
    return { providers: state.models, usage: state.modelUsage };
  }),
  getProviders: vi.fn(async () => state.providerList),
  putProvider: vi.fn(async (provider: string, apiKey: string) => {
    state.putCalls.push({ provider, apiKey });
    return { ok: true as const, provider, configured: apiKey !== '', masked: '****' };
  }),
  getUsageStats: vi.fn(async () => ({
    group: 'model' as const,
    rows: state.usageRows,
    totals: { input_tokens: 0, output_tokens: 0, cost: 0, sessions: 0 },
  })),
}));

function installMemoryStorage(): void {
  const map = new Map<string, string>();
  (globalThis as { localStorage?: Storage }).localStorage = {
    get length(): number {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    removeItem: (k: string) => {
      map.delete(k);
    },
    setItem: (k: string, v: string) => {
      map.set(k, String(v));
    },
  };
}

describe('stores/modelConfig', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    installMemoryStorage();
    state.models = [
      {
        provider: 'openai',
        label: 'OpenAI',
        models: [
          { id: 'gpt-4o', name: 'gpt-4o', provider: 'openai', context: 128000 },
          { id: 'gpt-4.1', name: 'gpt-4.1', provider: 'openai', context: 200000 },
        ],
      },
    ];
    state.providerList = {
      providers: [
        {
          slug: 'openai',
          name: 'OpenAI',
          key_env: 'OPENAI_API_KEY',
          configured: true,
          masked: '****abcd',
        },
      ],
      current: 'openai',
    };
    state.usageRows = [];
    state.modelUsage = {};
    state.failModels = false;
    state.hangModels = false;
    state.putCalls = [];
  });

  afterEach(() => {
    delete (globalThis as { localStorage?: Storage }).localStorage;
    vi.useRealTimers();
  });

  it('addProvider 按预置表带出 url / apiMethod / 预置模型', () => {
    const s = useModelConfigStore();
    const p = s.addProvider({ providerKey: 'openai' });
    expect(p.name).toBe('OpenAI');
    expect(p.url).toBe('https://api.openai.com/v1');
    expect(p.apiMethod).toBe('openai-chat');
    expect(p.models.length).toBeGreaterThan(0);
    expect(s.providerCount).toBe(1);
  });

  it('addProvider 未知 key 回落自定义', () => {
    const s = useModelConfigStore();
    const p = s.addProvider({ providerKey: '不存在的供应商' });
    expect(p.name).toBe('自定义');
    expect(p.models).toEqual([]);
  });

  it('addModel 同名幂等，空名拒绝', () => {
    const s = useModelConfigStore();
    const p = s.addProvider({ providerKey: 'custom', models: [] });
    const m1 = s.addModel(p.id, { name: 'my-model', capabilities: ['text'] });
    const m2 = s.addModel(p.id, { name: 'my-model', capabilities: ['text'] });
    expect(m1).not.toBeNull();
    expect(m2!.id).toBe(m1!.id);
    expect(s.getProvider(p.id)!.models).toHaveLength(1);
    expect(s.addModel(p.id, { name: '' })).toBeNull();
    expect(s.addModel('不存在', { name: 'x' })).toBeNull();
  });

  it('optionsForSlot 按能力过滤', () => {
    const s = useModelConfigStore();
    const p = s.addProvider({ providerKey: 'custom', models: [] });
    s.addModel(p.id, { name: 'text-only', capabilities: ['text'] });
    s.addModel(p.id, { name: 'sees', capabilities: ['text', 'vision'] });
    s.addModel(p.id, { name: 'draws', capabilities: ['image-gen'] });

    expect(s.optionsForSlot('default')).toHaveLength(2); // text-only + sees
    expect(s.optionsForSlot('vision')).toHaveLength(1);
    expect(s.optionsForSlot('image')).toHaveLength(1);
    expect(s.optionsForSlot('vision')[0].label).toContain('sees');
  });

  it('displayName 优先取别名', () => {
    const s = useModelConfigStore();
    const p = s.addProvider({ providerKey: 'custom', models: [] });
    const m = s.addModel(p.id, { name: 'raw-name', alias: '好记的名字' })!;
    expect(s.displayName(m)).toBe('好记的名字');
    expect(s.displayName({ ...m, alias: '   ' })).toBe('raw-name');
  });

  it('setDefault 拒绝不存在的模型，允许清空', () => {
    const s = useModelConfigStore();
    const p = s.addProvider({ providerKey: 'custom', models: [] });
    const m = s.addModel(p.id, { name: 'm1', capabilities: ['text'] })!;
    expect(s.setDefault('default', 'ghost')).toBe(false);
    expect(s.setDefault('default', m.id)).toBe(true);
    expect(s.defaults.default).toBe(m.id);
    expect(s.setDefault('default', '')).toBe(true);
    expect(s.defaults.default).toBe('');
  });

  it('removeModel / removeProvider 会清掉引用它的默认槽位', () => {
    const s = useModelConfigStore();
    const p = s.addProvider({ providerKey: 'custom', models: [] });
    const m = s.addModel(p.id, { name: 'm1', capabilities: ['text'] })!;
    s.setDefault('default', m.id);
    s.removeModel(p.id, m.id);
    expect(s.defaults.default).toBe('');

    const p2 = s.addProvider({ providerKey: 'custom', models: [] });
    const m2 = s.addModel(p2.id, { name: 'm2', capabilities: ['text'] })!;
    s.setDefault('fallback', m2.id);
    expect(s.removeProvider(p2.id)).toBe(true);
    expect(s.defaults.fallback).toBe('');
    expect(s.removeProvider(p2.id)).toBe(false);
  });

  it('fetchModels 合并后端模型且不重复', async () => {
    const s = useModelConfigStore();
    const p = s.addProvider({ providerKey: 'openai', models: [] });
    const added = await s.fetchModels(p.id);
    expect(added).toBe(2);
    expect(s.getProvider(p.id)!.models.map((m) => m.name)).toEqual(['gpt-4o', 'gpt-4.1']);
    expect(await s.fetchModels(p.id)).toBe(0);
    expect(s.busy).toBe(false);
  });

  it('fetchModels 失败返回 -1 且不抛错', async () => {
    state.failModels = true;
    const s = useModelConfigStore();
    const p = s.addProvider({ providerKey: 'openai', models: [] });
    await expect(s.fetchModels(p.id)).resolves.toBe(-1);
    expect(s.busy).toBe(false);
  });

  it('Q5：testConnectivity 成功返回模型数并标记 verified', async () => {
    const s = useModelConfigStore();
    const p = s.addProvider({ providerKey: 'openai', apiKey: 'sk-test', models: [] });
    const r = await s.testConnectivity(p.id);
    expect(r.ok).toBe(true);
    expect(r.modelCount).toBe(2);
    expect(state.putCalls[0]).toEqual({ provider: 'openai', apiKey: 'sk-test' });
    expect(s.getProvider(p.id)!.verified).toBe(true);
    expect(s.getProvider(p.id)!.lastTestedAt).toBeGreaterThan(0);
  });

  it('Q5：testConnectivity 在后端未配置 Key 时失败', async () => {
    state.providerList.providers[0].configured = false;
    const s = useModelConfigStore();
    const p = s.addProvider({ providerKey: 'openai', models: [] });
    const r = await s.testConnectivity(p.id);
    expect(r.ok).toBe(false);
    expect(r.error).toContain('API Key');
    expect(s.getProvider(p.id)!.verified).toBe(false);
  });

  it('Q5：testConnectivity 10s 超时', async () => {
    vi.useFakeTimers();
    state.hangModels = true;
    const s = useModelConfigStore();
    const p = s.addProvider({ providerKey: 'openai', models: [] });
    const pending = s.testConnectivity(p.id);
    await vi.advanceTimersByTimeAsync(10_001);
    const r = await pending;
    expect(r.ok).toBe(false);
    expect(r.error).toContain('超时');
  });

  it('Q5：deepTest 命中模型时返回样例文本', async () => {
    const s = useModelConfigStore();
    const p = s.addProvider({ providerKey: 'openai', models: [] });
    const m = s.addModel(p.id, { name: 'gpt-4o', capabilities: ['text'] })!;
    const r = await s.deepTest(p.id, m.id);
    expect(r.ok).toBe(true);
    expect(r.sample).toContain('gpt-4o');
    expect(r.modelCount).toBe(2);
  });

  it('Q5：deepTest 未命中模型时失败', async () => {
    const s = useModelConfigStore();
    const p = s.addProvider({ providerKey: 'openai', models: [] });
    const m = s.addModel(p.id, { name: '本地私有模型', capabilities: ['text'] })!;
    const r = await s.deepTest(p.id, m.id);
    expect(r.ok).toBe(false);
    expect(r.error).toContain('未找到模型');
  });

  it('Q5：deepTest 30s 超时', async () => {
    vi.useFakeTimers();
    state.hangModels = true;
    const s = useModelConfigStore();
    const p = s.addProvider({ providerKey: 'openai', models: [] });
    const m = s.addModel(p.id, { name: 'gpt-4o', capabilities: ['text'] })!;
    const pending = s.deepTest(p.id, m.id);
    await vi.advanceTimersByTimeAsync(30_001);
    const r = await pending;
    expect(r.ok).toBe(false);
    expect(r.error).toContain('超时');
  });

  it('deepTest 对不存在的供应商 / 模型直接返回失败', async () => {
    const s = useModelConfigStore();
    await expect(s.deepTest('ghost', 'x')).resolves.toMatchObject({ ok: false });
    const p = s.addProvider({ providerKey: 'openai', models: [] });
    await expect(s.deepTest(p.id, 'ghost')).resolves.toMatchObject({ ok: false });
  });

  it('🔒 persist 不落明文 apiKey，只留 keyMasked', () => {
    const s = useModelConfigStore();
    s.addProvider({ providerKey: 'openai', apiKey: 'sk-secret' });
    const raw = localStorage.getItem(LS_KEYS.modelConfig) ?? '';
    expect(raw).not.toContain('sk-secret');
    expect(raw).toContain('"keyMasked":true');
  });

  it('hydrate 还原供应商与槽位，apiKey 恢复为空串', () => {
    const s = useModelConfigStore();
    const p = s.addProvider({ providerKey: 'openai', apiKey: 'sk-secret', models: [] });
    const m = s.addModel(p.id, { name: 'gpt-4o', capabilities: ['text'] })!;
    s.setDefault('default', m.id);

    setActivePinia(createPinia());
    const s2 = useModelConfigStore();
    s2.hydrate();
    expect(s2.providerCount).toBe(1);
    expect(s2.providers[0].apiKey).toBe('');
    expect(s2.providers[0].keyMasked).toBe(true);
    expect(s2.defaults.default).toBe(m.id);
    expect(s2.modelCount).toBe(1);
  });

  it('hydrate 遇脏数据安全降级', () => {
    localStorage.setItem(
      LS_KEYS.modelConfig,
      JSON.stringify({ providers: 'oops', defaults: { default: 42 } })
    );
    const s = useModelConfigStore();
    s.hydrate();
    expect(s.providers).toEqual([]);
    expect(s.defaults.default).toBe('');
  });

  it('A5：usageOf 无模型级数据时 known=false', async () => {
    const s = useModelConfigStore();
    const p = s.addProvider({ providerKey: 'openai', models: [] });
    const m = s.addModel(p.id, { name: 'gpt-4o', capabilities: ['text'] })!;
    expect(s.usageOf(m.id).known).toBe(false);
    expect(s.usageOf('ghost').known).toBe(false);

    state.modelUsage = { 'gpt-4o': { calls: 3, tokens: 30 } };
    const u = s.usageOf(m.id);
    expect(u.known).toBe(true);
    expect(u.calls).toBe(3);
    expect(u.tokens).toBe(30);
  });
});
