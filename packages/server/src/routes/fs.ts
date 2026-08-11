/**
 * routes/fs.ts — /api/fs/* 白名单文件系统端点（U-28）
 *
 * 桌面壳 preload 文件系统桥的 HTTP 兜底。
 * 仅允许白名单路径内的读写操作。
 *
 * GET  /api/fs/read?path=...     — 读取文件内容
 * GET  /api/fs/list?dir=...      — 列出目录
 * GET  /api/fs/stat?path=...     — 文件元信息
 * POST /api/fs/write             — 写入文件 { path, content }
 *
 * @module routes/fs
 */

import path from 'node:path';
import fs from 'node:fs';
import Router from '@koa/router';

export const fsRouter = new Router();

// ── 白名单 ──────────────────────────────────────────────────────────────

/** 允许访问的目录前缀（安全基础目录）。模块级导出，供 Web 目录选择器获取合法起始根。 */
export const ALLOWED_ROOTS = (() => {
  const roots: string[] = [];
  // hermes 主目录
  const hermesHome = process.env.HERMES_HOME;
  if (hermesHome) roots.push(path.resolve(hermesHome));
  // 用户主目录
  const home = process.env.HOME || process.env.USERPROFILE;
  if (home) roots.push(path.resolve(home));
  return roots.map(r => r.toLowerCase());
})();

/** 校验路径是否在白名单内 */
function isAllowed(p: string): boolean {
  const resolved = path.resolve(p).toLowerCase();
  return ALLOWED_ROOTS.some(root => resolved.startsWith(root + path.sep) || resolved === root);
}

// ── 路由 ────────────────────────────────────────────────────────────────

/** GET /api/fs/roots — 返回服务端允许访问的目录根，供 Web 目录选择器作为起始点 */
fsRouter.get('/api/fs/roots', async (ctx) => {
  ctx.body = { ok: true, roots: ALLOWED_ROOTS };
});

/** GET /api/fs/read?path=... */
fsRouter.get('/api/fs/read', async (ctx) => {
  const p = String(ctx.query.path ?? '');
  if (!p) { ctx.status = 400; ctx.body = { error: 'path required' }; return; }
  if (!isAllowed(p)) { ctx.status = 403; ctx.body = { error: 'path not allowed' }; return; }
  try {
    const content = fs.readFileSync(p, 'utf8');
    ctx.body = { ok: true, content };
  } catch (err: unknown) {
    ctx.status = 404;
    ctx.body = { error: 'read failed', detail: err instanceof Error ? err.message : String(err) };
  }
});

/** GET /api/fs/list?dir=... */
fsRouter.get('/api/fs/list', async (ctx) => {
  const dir = String(ctx.query.dir ?? '');
  if (!dir) { ctx.status = 400; ctx.body = { error: 'dir required' }; return; }
  if (!isAllowed(dir)) { ctx.status = 403; ctx.body = { error: 'dir not allowed' }; return; }
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true }).map(e => ({
      name: e.name,
      isDirectory: e.isDirectory(),
      isFile: e.isFile(),
    }));
    ctx.body = { ok: true, entries };
  } catch (err: unknown) {
    ctx.status = 404;
    ctx.body = { error: 'list failed', detail: err instanceof Error ? err.message : String(err) };
  }
});

/** GET /api/fs/stat?path=... */
fsRouter.get('/api/fs/stat', async (ctx) => {
  const p = String(ctx.query.path ?? '');
  if (!p) { ctx.status = 400; ctx.body = { error: 'path required' }; return; }
  if (!isAllowed(p)) { ctx.status = 403; ctx.body = { error: 'path not allowed' }; return; }
  try {
    const stat = fs.statSync(p);
    ctx.body = {
      ok: true,
      stat: {
        size: stat.size,
        isDirectory: stat.isDirectory(),
        isFile: stat.isFile(),
        mtime: stat.mtime.toISOString(),
      },
    };
  } catch (err: unknown) {
    ctx.status = 404;
    ctx.body = { error: 'stat failed', detail: err instanceof Error ? err.message : String(err) };
  }
});

/** POST /api/fs/write  { path, content } */
fsRouter.post('/api/fs/write', async (ctx) => {
  const b = ctx.request.body as Record<string, unknown>;
  const p = String(b?.path ?? '');
  const content = String(b?.content ?? '');
  if (!p) { ctx.status = 400; ctx.body = { error: 'path required' }; return; }
  if (!isAllowed(p)) { ctx.status = 403; ctx.body = { error: 'path not allowed' }; return; }
  try {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content, 'utf8');
    ctx.body = { ok: true };
  } catch (err: unknown) {
    ctx.status = 500;
    ctx.body = { error: 'write failed', detail: err instanceof Error ? err.message : String(err) };
  }
});
