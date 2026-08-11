/**
 * routes/fs.ts — /api/fs/* 白名单文件系统端点（U-28）
 *
 * 桌面壳 preload 文件系统桥的 HTTP 兜底。
 * 仅允许白名单路径内的读写操作。
 *
 * GET  /api/fs/read?path=...     — 读取文件内容
 * GET  /api/fs/list?dir=...      — 列出目录
 * GET  /api/fs/stat?path=...      — 文件元信息
 * POST /api/fs/write             — 写入文件 { path, content }
 *
 * @module routes/fs
 */

import path from 'node:path';
import fs from 'node:fs';
import Router from '@koa/router';

export const fsRouter = new Router();

// ── 白名单 ──────────────────────────────────────────────────────────────

/**
 * 列出本机所有可访问的盘根（仅 win32 有意义）。
 *
 * win32：遍历 A–Z，对每个 `letter + ':\\'` 尝试 `fs.readdirSync`，
 * 跳过不可访问（无介质 / 无权限 / 网络盘未就绪）的盘；返回小写化
 * `path.resolve` 后的盘根字符串。
 * 非 win32：返回 `['/']`（单一文件系统根）。
 */
function listDriveRoots(): string[] {
  if (process.platform !== 'win32') return ['/'];
  const roots: string[] = [];
  for (let code = 65; code <= 90; code++) {
    const letter = String.fromCharCode(code);
    const root = `${letter}:\\`;
    try {
      fs.readdirSync(root);
      roots.push(path.resolve(root).toLowerCase());
    } catch {
      // 跳过不可访问的盘（无介质 / 权限不足）
    }
  }
  return roots;
}

/** 允许访问的目录前缀（安全基础目录）。模块级导出，供 Web 目录选择器获取合法起始根。 */
export const ALLOWED_ROOTS = (() => {
  const roots: string[] = [];
  // hermes 主目录
  const hermesHome = process.env.HERMES_HOME;
  if (hermesHome) roots.push(path.resolve(hermesHome));
  // 用户主目录
  const home = process.env.HOME || process.env.USERPROFILE;
  if (home) roots.push(path.resolve(home));
  // 盘根：覆盖 A–Z 所有可访问盘，使用户能上到 C:/D: 盘根（REQ 2）。
  // hermesHome / home 保持在前，确保 roots[0] 仍是用户主目录（默认起始点不变）。
  for (const drive of listDriveRoots()) {
    const normalized = drive.toLowerCase();
    if (!roots.some((r) => r.toLowerCase() === normalized)) {
      roots.push(normalized);
    }
  }
  return roots.map((r) => r.toLowerCase());
})();

/**
 * 校验路径是否落在白名单内。
 *
 * 修复点：先把 root 末尾的分隔符去掉再判，避免盘根本身（如 `c:\`）
 * 因 `c:\` + path.sep(`\`) = `c:\\` 导致子路径 `c:\foo` 匹配不上、
 * 从而无法上到盘根的问题。
 */
function isAllowed(p: string): boolean {
  const resolved = path.resolve(p).toLowerCase();
  return ALLOWED_ROOTS.some((root) => {
    const r = root.replace(/[\\/]+$/, '');
    return resolved === r || resolved.startsWith(r + path.sep);
  });
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
