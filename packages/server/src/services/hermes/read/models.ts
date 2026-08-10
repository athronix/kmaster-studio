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

      const modelList: ModelInfo[] = Object.keys(models).map((modelId) => ({
        id: modelId,
        name: modelId,
        provider: name,
        context: Number(models[modelId]?.context_length) || undefined,
        capabilities: models[modelId]?.capabilities,
      }));

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
