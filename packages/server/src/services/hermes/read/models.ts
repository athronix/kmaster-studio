/**
 * read/models.ts — 真实模型读取（U-06）
 *
 * 从 config.yaml `custom_providers[].models{}` 解析 provider → model 映射。
 * 不读 MODELS_SNAPSHOT 硬编码。
 *
 * @module services/hermes/read/models
 */

import path from 'node:path';
import fs from 'node:fs';
import yaml from 'js-yaml';
import { resolveActiveHermesHome } from '../env.js';
import type { ProviderGroup, ModelInfo } from '../../../protocol.js';

/** Check if a `${ENV_VAR}` reference resolves to a real environment variable */
function checkEnvVar(ref: string): boolean {
  const m = ref.match(/^\$\{(.+?)\}$/);
  if (!m) return true; // literal key, not an env var reference
  return !!process.env[m[1]];
}

/** 8 类合法能力标识（与前端 `ModelCapability` 逐字对齐）。 */
const VALID_CAPABILITIES: ReadonlySet<string> = new Set([
  'text',
  'vision',
  'video',
  'audio',
  'image-gen',
  'video-gen',
  'audio-gen',
  'structured',
]);

/** 视觉理解关键词（长词元，直接子串匹配）。 */
const VISION_KEYWORDS: readonly string[] = [
  'vision',
  'qwen-vl',
  'qwen2-vl',
  'qwen2.5-vl',
  'glm-4v',
  'glm-4.1v',
  'qvq',
  'gpt-4o',
  'gpt-4-turbo',
  'gpt-4.1',
  'gpt-4.5',
  'claude',
  'gemini',
  'deepseek-vl',
  'internvl',
  'pixtral',
  'llava',
  'kimi-vl',
  'minicpm-v',
];

/**
 * 视觉理解短词元（`vl` / `o1` / `o3`）。
 * 这类两字符词裸子串匹配极易误伤（如 `vllm`、版本号 `v1.0.1`），
 * 故要求前后是非字母数字边界。
 */
const VISION_SHORT_TOKENS: readonly string[] = ['vl', 'o1', 'o3'];

/** 视觉短词元边界正则（在 `inferCapabilities` 内对小写 id 求值）。 */
const VISION_SHORT_TOKEN_RE = new RegExp(
  `(^|[^a-z0-9])(${VISION_SHORT_TOKENS.join('|')})([^a-z0-9]|$)`
);

/** 文生图关键词。 */
const IMAGE_GEN_KEYWORDS: readonly string[] = [
  'wanx',
  'cogview',
  'dall',
  'flux',
  'imagen',
  'sdxl',
  'stable-diffusion',
  'dreamshaper',
  'juggernaut',
  'kolors',
];

/** 语音合成关键词。 */
const AUDIO_GEN_KEYWORDS: readonly string[] = [
  'tts',
  'cosyvoice',
  'f5-tts',
  'fish-audio',
  'seed-tts',
  'bark',
  'chattts',
];

/** 文生视频关键词。 */
const VIDEO_GEN_KEYWORDS: readonly string[] = [
  'veo',
  'kling',
  'wan-video',
  'hunyuanvideo',
  'cogvideo',
  'sora',
  'wan2',
];

/**
 * 推导模型能力列表。
 *
 * 用户的 config.yaml 里绝大多数模型只写了 `context_length`，没有 `capabilities`；
 * 直接透传 `undefined` 会让前端「默认模型槽位」下拉框过滤后无任何候选（本次修复的根因）。
 * 因此这里做两级处理：
 *   1. 显式声明优先——`declared` 是数组时过滤出 8 类合法值，非空则原样采用
 *      （尊重用户配置，不强行补 `text`，避免纯生图模型混进「默认模型」槽）；
 *   2. 否则按模型名关键词兜底推断，基线始终包含 `text`。
 *
 * 纯函数、无副作用，便于单测。
 *
 * @param modelId  模型标识（如 `qwen-vl-plus`）
 * @param declared config.yaml 中声明的 capabilities（可能是任意脏值）
 * @returns 去重后的能力字符串数组，永不为空
 */
export function inferCapabilities(modelId: string, declared?: unknown): string[] {
  // —— 1. 显式声明优先 ——
  if (Array.isArray(declared)) {
    const filtered = declared
      .filter((c): c is string => typeof c === 'string')
      .map((c) => c.trim().toLowerCase())
      .filter((c) => VALID_CAPABILITIES.has(c));
    if (filtered.length > 0) return Array.from(new Set(filtered));
  }

  // —— 2. 按模型名兜底推断 ——
  const id = typeof modelId === 'string' ? modelId.toLowerCase() : '';
  const caps = new Set<string>(['text']);

  if (VISION_KEYWORDS.some((k) => id.includes(k)) || VISION_SHORT_TOKEN_RE.test(id)) {
    caps.add('vision');
  }
  if (IMAGE_GEN_KEYWORDS.some((k) => id.includes(k))) {
    caps.add('image-gen');
  }
  if (AUDIO_GEN_KEYWORDS.some((k) => id.includes(k))) {
    caps.add('audio-gen');
  }
  if (VIDEO_GEN_KEYWORDS.some((k) => id.includes(k))) {
    caps.add('video-gen');
  }

  return Array.from(caps);
}

/**
 * 从 config.yaml 读取所有 provider 的模型列表。
 *
 * config.yaml 结构：
 *   custom_providers:
 *     - name: ark-coding-plan-anthropic
 *       base_url: ...
 *       api_mode: anthropic_messages
 *       models:
 *         glm-5.2: { context_length: 262144 }
 *         doubao-seed-code: { context_length: 262144 }
 *       model: doubao-seed-code   # 默认模型
 */
export function getRealModels(): ProviderGroup[] {
  const hermesHome = resolveActiveHermesHome();
  const configPath = path.join(hermesHome, 'config.yaml');

  if (!fs.existsSync(configPath)) return [];

  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    const config = yaml.load(raw) as Record<string, unknown>;
    const providers = (config.custom_providers as Array<Record<string, unknown>>) ?? [];

    return providers.map((p) => {
      const name = String(p.name ?? 'unknown');
      const models = (p.models as Record<string, Record<string, unknown>>) ?? {};
      const defaultModel = String(p.model ?? Object.keys(models)[0] ?? '');
      const baseUrl = typeof p.base_url === 'string' ? p.base_url : undefined;
      const apiMode = typeof p.api_mode === 'string' ? p.api_mode : undefined;
      const apiKeyRaw = typeof p.api_key === 'string' ? p.api_key : undefined;
      // api_key is set if it's a real token OR references an env var that exists
      const apiKeySet = apiKeyRaw
        ? (apiKeyRaw.startsWith('${') ? checkEnvVar(apiKeyRaw) : true)
        : false;

      const modelList: ModelInfo[] = Object.keys(models).map((modelId) => {
        // 不透传裸值：config.yaml 里多数模型没写 capabilities，需推导后再下发
        const caps = inferCapabilities(modelId, models[modelId]?.capabilities);
        return {
          id: modelId,
          name: modelId,
          provider: name,
          context: Number(models[modelId]?.context_length) || undefined,
          capabilities: caps,
        };
      });

      // 生成友好标签
      const labelMap: Record<string, string> = {
        'ark-coding-plan-anthropic': 'Ark (Anthropic)',
        'ark-agent-plan': 'Ark (Agent Plan)',
        'Coding.dashscope.aliyuncs.com': 'DashScope Coding',
      };
      const label = labelMap[name] || name;

      return {
        provider: name,
        label,
        authenticated: apiKeySet,
        models: modelList,
        base_url: baseUrl,
        api_mode: apiMode,
        api_key_set: apiKeySet,
        default_model: defaultModel,
      };
    });
  } catch {
    return [];
  }
}
