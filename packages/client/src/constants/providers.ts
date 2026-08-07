/**
 * constants/providers.ts —— 模型供应商预置表（Q4 决策：前端常量 + 后端 key 连通性）。
 *
 * 依赖方向：constants/layout.ts → types/settings.ts → **constants/providers.ts**
 * 本文件只依赖 `types/settings`（纯类型），不 import 任何 store / 组件，无环。
 *
 * 设计要点：
 *   - `PRESET_PROVIDERS` 提供「选供应商 → 自动带出 url / apiMethod / 常用模型」的开箱体验；
 *   - 用户仍可在 AddModelDialog 内改 url、增删模型，改完即脱离预置（存进 modelConfig store）；
 *   - `CUSTOM_PROVIDER_KEY` 为兜底项，url 与模型全部手填。
 */
import type {
  ApiMethod,
  DefaultModelSlot,
  ModelCapability,
  ModelConfig,
  PresetProvider,
  SelectOption,
} from '../types/settings';

// ═══════════════════════ 1. API 调用方式 ═══════════════════════

/** 4 种 API 调用方式；首项为新建供应商时的默认值。 */
export const API_METHOD_OPTIONS: readonly { label: string; value: ApiMethod }[] = [
  { label: 'OpenAI Chat Completions', value: 'openai-chat' },
  { label: 'OpenAI Responses', value: 'openai-response' },
  { label: 'Anthropic Messages', value: 'anthropic-chat' },
  { label: 'Anthropic Responses', value: 'anthropic-response' },
] as const;

/** 新建供应商时的默认调用方式。 */
export const DEFAULT_API_METHOD: ApiMethod = 'openai-chat';

/** API 调用方式 → 展示名；未知值原样返回。 */
export function apiMethodLabel(method: string): string {
  return API_METHOD_OPTIONS.find((o) => o.value === method)?.label ?? method;
}

// ═══════════════════════ 2. 模型能力 ═══════════════════════

/** 8 项能力开关（AddModelDialog 的复选组，顺序即展示顺序）。 */
export const MODEL_CAPABILITIES: readonly {
  label: string;
  value: ModelCapability;
  desc: string;
}[] = [
  { label: '文本', value: 'text', desc: '基础文本对话与推理' },
  { label: '图片理解', value: 'vision', desc: '可读取图片输入' },
  { label: '视频理解', value: 'video', desc: '可读取视频输入' },
  { label: '音频理解', value: 'audio', desc: '可读取音频输入' },
  { label: '图片生成', value: 'image-gen', desc: '可生成图片' },
  { label: '视频生成', value: 'video-gen', desc: '可生成视频' },
  { label: '音频生成', value: 'audio-gen', desc: '可生成语音 / 音频' },
  { label: '结构化输出', value: 'structured', desc: '支持 JSON Schema 约束输出' },
] as const;

/** 能力 → 展示名；未知值原样返回。 */
export function capabilityLabel(cap: string): string {
  return MODEL_CAPABILITIES.find((c) => c.value === cap)?.label ?? cap;
}

// ═══════════════════════ 3. 默认模型槽位 ═══════════════════════

/** 5 个默认模型槽位定义。 */
export const DEFAULT_MODEL_SLOTS: readonly {
  key: DefaultModelSlot;
  label: string;
  desc: string;
}[] = [
  { key: 'default', label: '默认模型', desc: '未显式指定时使用' },
  { key: 'simple', label: '轻量任务模型', desc: '标题生成 / 摘要等低成本场景' },
  { key: 'vision', label: '图片理解模型', desc: '带图片输入的任务' },
  { key: 'image', label: '图片生成模型', desc: '文生图任务' },
  { key: 'fallback', label: '兜底模型', desc: '主模型不可用时自动切换' },
] as const;

/**
 * 槽位 → 必备能力。选择该槽位默认模型时，只有具备对应能力的模型才可选。
 * `default` / `simple` / `fallback` 只要求文本能力。
 */
export const SLOT_REQUIRED_CAPS: Record<DefaultModelSlot, ModelCapability[]> = {
  default: ['text'],
  simple: ['text'],
  vision: ['vision'],
  image: ['image-gen'],
  fallback: ['text'],
};

/** 生成一份「全部未指定」的默认槽位映射。 */
export function emptyDefaults(): Record<DefaultModelSlot, string> {
  return {
    default: '',
    simple: '',
    vision: '',
    image: '',
    fallback: '',
  };
}

// ═══════════════════════ 4. 预置供应商 ═══════════════════════

/** 自定义供应商 key（url / 模型全部手填）。 */
export const CUSTOM_PROVIDER_KEY = 'custom';

/** 构造预置模型（id 由 `<providerKey>:<name>` 保证全局唯一）。 */
function model(
  providerKey: string,
  name: string,
  capabilities: ModelCapability[],
  contextLength: number
): ModelConfig {
  return { id: `${providerKey}:${name}`, name, alias: '', capabilities, contextLength };
}

/**
 * 预置供应商表（9 家 + 自定义）。
 * ⚠️ 这里只是「新建时的初始值」，用户改动后以 modelConfig store 为准。
 */
export const PRESET_PROVIDERS: readonly PresetProvider[] = [
  {
    key: 'openai',
    name: 'OpenAI',
    url: 'https://api.openai.com/v1',
    apiMethod: 'openai-chat',
    models: [
      model('openai', 'gpt-4o', ['text', 'vision', 'audio', 'structured'], 128_000),
      model('openai', 'gpt-4o-mini', ['text', 'vision', 'structured'], 128_000),
      model('openai', 'o3-mini', ['text', 'structured'], 200_000),
    ],
  },
  {
    key: 'anthropic',
    name: 'Anthropic',
    url: 'https://api.anthropic.com/v1',
    apiMethod: 'anthropic-chat',
    models: [
      model('anthropic', 'claude-sonnet-4-20250514', ['text', 'vision', 'structured'], 200_000),
      model('anthropic', 'claude-3-7-sonnet-latest', ['text', 'vision', 'structured'], 200_000),
      model('anthropic', 'claude-3-5-haiku-latest', ['text', 'vision'], 200_000),
    ],
  },
  {
    key: 'deepseek',
    name: 'DeepSeek',
    url: 'https://api.deepseek.com/v1',
    apiMethod: 'openai-chat',
    models: [
      model('deepseek', 'deepseek-chat', ['text', 'structured'], 64_000),
      model('deepseek', 'deepseek-reasoner', ['text'], 64_000),
    ],
  },
  {
    key: 'moonshot',
    name: 'Moonshot (Kimi)',
    url: 'https://api.moonshot.cn/v1',
    apiMethod: 'openai-chat',
    models: [
      model('moonshot', 'moonshot-v1-128k', ['text'], 128_000),
      model('moonshot', 'moonshot-v1-32k', ['text'], 32_000),
    ],
  },
  {
    key: 'dashscope',
    name: '阿里云百炼 (Qwen)',
    url: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    apiMethod: 'openai-chat',
    models: [
      model('dashscope', 'qwen-max', ['text', 'structured'], 32_000),
      model('dashscope', 'qwen-plus', ['text', 'structured'], 128_000),
      model('dashscope', 'qwen-vl-max', ['text', 'vision'], 32_000),
      model('dashscope', 'wanx-v1', ['image-gen'], 0),
    ],
  },
  {
    key: 'zhipu',
    name: '智谱 GLM',
    url: 'https://open.bigmodel.cn/api/paas/v4',
    apiMethod: 'openai-chat',
    models: [
      model('zhipu', 'glm-4-plus', ['text', 'structured'], 128_000),
      model('zhipu', 'glm-4v-plus', ['text', 'vision'], 8_000),
      model('zhipu', 'cogview-3-plus', ['image-gen'], 0),
    ],
  },
  {
    key: 'google',
    name: 'Google Gemini',
    url: 'https://generativelanguage.googleapis.com/v1beta/openai',
    apiMethod: 'openai-chat',
    models: [
      model('google', 'gemini-2.0-flash', ['text', 'vision', 'audio', 'video'], 1_000_000),
      model('google', 'gemini-1.5-pro', ['text', 'vision', 'audio', 'video'], 2_000_000),
    ],
  },
  {
    key: 'openrouter',
    name: 'OpenRouter',
    url: 'https://openrouter.ai/api/v1',
    apiMethod: 'openai-chat',
    models: [
      model('openrouter', 'anthropic/claude-sonnet-4', ['text', 'vision'], 200_000),
      model('openrouter', 'openai/gpt-4o', ['text', 'vision'], 128_000),
    ],
  },
  {
    key: 'siliconflow',
    name: '硅基流动 SiliconFlow',
    url: 'https://api.siliconflow.cn/v1',
    apiMethod: 'openai-chat',
    models: [
      model('siliconflow', 'deepseek-ai/DeepSeek-V3', ['text'], 64_000),
      model('siliconflow', 'Qwen/Qwen2.5-72B-Instruct', ['text'], 32_000),
    ],
  },
  {
    key: CUSTOM_PROVIDER_KEY,
    name: '自定义',
    url: '',
    apiMethod: 'openai-chat',
    models: [],
  },
] as const;

/** 供应商下拉选项（AddModelDialog 第一步）。 */
export const PROVIDER_OPTIONS: readonly SelectOption[] = PRESET_PROVIDERS.map((p) => ({
  label: p.name,
  value: p.key,
}));

/** 按 key 查预置供应商；未知 key 返回「自定义」。 */
export function presetProviderByKey(key: string): PresetProvider {
  return (
    PRESET_PROVIDERS.find((p) => p.key === key) ??
    PRESET_PROVIDERS.find((p) => p.key === CUSTOM_PROVIDER_KEY)!
  );
}

/** 供应商 key → 展示名；未知 key 原样返回。 */
export function providerLabel(key: string): string {
  return PRESET_PROVIDERS.find((p) => p.key === key)?.name ?? key;
}
