/**
 * routes/skillhub.ts — SkillHub 在线代理（T07）
 *
 * 架构师 Q7 裁定：server 代理，不前端直连。
 * 5 个端点（全部 GET/POST）代理到 https://lightmake.site/api，
 * SkillHub 离线时降级返回空 + source: 'offline'，不抛 500。
 *
 * SkillHub 上游 API（无鉴权）：
 *   GET  /api/v1/categories        → 分类列表
 *   GET  /api/v1/skills?q=&page=&size= → 搜索技能
 *   GET  /api/v1/skills/{slug}      → 单个技能详情
 *   POST /api/v1/skills/exists      → 批量检查 { slugs: [...] }
 *
 * @module routes/skillhub
 */

import Router from '@koa/router';
import { installSkill } from '../services/hermes/write/skills-install.js';

export const skillhubRouter = new Router();

// ── 常量 ────────────────────────────────────────────────────────────────

const SKILLHUB_BASE = 'https://lightmake.site/api';
const HTTP_TIMEOUT_MS = 30_000;

// ── HTTP 工具 ───────────────────────────────────────────────────────────

/**
 * 带超时的 HTTP fetch 包装。
 * 复用 Node.js 内置 fetch（Node 18+）。
 */
async function httpGet<T = unknown>(url: string): Promise<{ ok: boolean; data?: T; status?: number; error?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
  try {
    const resp = await fetch(url, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' },
    });
    if (!resp.ok) {
      return { ok: false, status: resp.status, error: `SkillHub returned ${resp.status}` };
    }
    const data = await resp.json() as T;
    return { ok: true, data };
  } catch (err) {
    const msg = (err as Error).name === 'AbortError'
      ? 'SkillHub timeout'
      : `SkillHub unreachable: ${(err as Error).message}`;
    return { ok: false, error: msg };
  } finally {
    clearTimeout(timer);
  }
}

async function httpPost<T = unknown>(url: string, body: unknown): Promise<{ ok: boolean; data?: T; status?: number; error?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
  try {
    const resp = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      return { ok: false, status: resp.status, error: `SkillHub returned ${resp.status}` };
    }
    const data = await resp.json() as T;
    return { ok: true, data };
  } catch (err) {
    const msg = (err as Error).name === 'AbortError'
      ? 'SkillHub timeout'
      : `SkillHub unreachable: ${(err as Error).message}`;
    return { ok: false, error: msg };
  } finally {
    clearTimeout(timer);
  }
}

// ── 端点 ────────────────────────────────────────────────────────────────

/**
 * GET /api/skillhub/categories → 分类列表
 */
skillhubRouter.get('/api/skillhub/categories', async (ctx) => {
  const result = await httpGet<unknown[]>(`${SKILLHUB_BASE}/v1/categories`);
  if (result.ok && result.data) {
    ctx.body = { categories: result.data, source: 'skillhub' };
  } else {
    ctx.body = { categories: [], source: 'offline', hint: 'SkillHub 暂不可用' };
  }
});

/**
 * GET /api/skillhub/skills?q=&page=&size= → 搜索技能（分页）
 */
skillhubRouter.get('/api/skillhub/skills', async (ctx) => {
  const q = String(ctx.query.q ?? '');
  const page = Math.max(1, Number(ctx.query.page) || 1);
  const size = Math.min(50, Math.max(1, Number(ctx.query.size) || 20));

  const params = new URLSearchParams();
  if (q) params.set('q', q);
  params.set('page', String(page));
  params.set('size', String(size));

  const result = await httpGet<unknown>(`${SKILLHUB_BASE}/v1/skills?${params.toString()}`);
  if (result.ok && result.data) {
    ctx.body = { ...(result.data as Record<string, unknown>), source: 'skillhub' };
  } else {
    ctx.body = { skills: [], total: 0, page, size, source: 'offline', hint: 'SkillHub 暂不可用' };
  }
});

/**
 * GET /api/skillhub/skills/:slug → 单个技能详情
 */
skillhubRouter.get('/api/skillhub/skills/:slug', async (ctx) => {
  const slug = ctx.params.slug;
  if (!slug) { ctx.status = 400; ctx.body = { error: 'slug required' }; return; }

  const result = await httpGet<unknown>(`${SKILLHUB_BASE}/v1/skills/${encodeURIComponent(slug)}`);
  if (result.ok && result.data) {
    ctx.body = { ...(result.data as Record<string, unknown>), source: 'skillhub' };
  } else if (result.status === 404) {
    ctx.status = 404;
    ctx.body = { error: 'Skill not found', source: 'skillhub' };
  } else {
    ctx.body = { error: result.error, source: 'offline', hint: 'SkillHub 暂不可用' };
  }
});

/**
 * POST /api/skillhub/skills/exists → 批量检查技能是否存在
 * Body: { slugs: string[] }
 */
skillhubRouter.post('/api/skillhub/skills/exists', async (ctx) => {
  const b = ctx.request.body as Record<string, unknown>;
  const slugs: string[] = Array.isArray(b?.slugs) ? (b.slugs as string[]) : [];
  if (slugs.length === 0) { ctx.body = { exists: {} }; return; }

  const result = await httpPost<unknown>(`${SKILLHUB_BASE}/v1/skills/exists`, { slugs });
  if (result.ok && result.data) {
    ctx.body = { ...(result.data as Record<string, unknown>), source: 'skillhub' };
  } else {
    ctx.body = { exists: {}, source: 'offline', hint: 'SkillHub 暂不可用' };
  }
});

/**
 * POST /api/skillhub/skills/install → 安装技能到 hermes-agent/skills/
 *
 * 流程：
 *   1. GET /api/v1/skills/{slug} 拿技能元数据（含下载地址）
 *   2. 暂不可直接下载外部 zip（P2），当前版本返回「需手动安装」
 *   3. 如果技能已在本地 sources 中存在，调 installSkill
 *
 * 当前 P0 策略：检查 slug 是否已在本地 hermes 技能源中存在，
 * 若存在则调 installSkill 做 junction/copy，否则返回 not_found。
 */
skillhubRouter.post('/api/skillhub/skills/install', async (ctx) => {
  const b = ctx.request.body as Record<string, unknown>;
  const slug = String(b?.slug ?? b?.name ?? '').trim();
  if (!slug) { ctx.status = 400; ctx.body = { error: 'slug required' }; return; }

  // Step 1: 从 SkillHub 获取技能详情
  const detail = await httpGet<Record<string, unknown>>(`${SKILLHUB_BASE}/v1/skills/${encodeURIComponent(slug)}`);
  if (!detail.ok) {
    ctx.body = {
      ok: false,
      slug,
      installKind: null,
      error: detail.error ?? 'SkillHub unreachable',
      source: 'offline',
    };
    return;
  }

  // Step 2: 尝试本地安装（依赖本地已有技能源）
  const result = installSkill(slug);
  if (!result.ok) {
    ctx.body = {
      ok: false,
      slug,
      installKind: null,
      error: result.error ?? `Skill "${slug}" not found in local sources. P2 will support remote download.`,
      source: 'skillhub',
      skillhubDetail: detail.data,
    };
    return;
  }

  ctx.body = {
    ok: true,
    slug,
    installKind: result.installKind,
    source: 'skillhub',
  };
});
