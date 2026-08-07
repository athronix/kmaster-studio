// 路由层统一错误映射：把 ProxyError 的结构化错误码翻译为 HTTP 状态码 + 裸对象响应体
// 响应体沿用 M1-M3 的裸对象风格（不引入 {code,data} 包装）。
import type { Context } from 'koa';
import { ProxyError } from '../hermes-proxy.js';

/**
 * 统一错误出口。
 * - ProxyError：按其 status/code 返回（400 bad_request / 404 not_found / 409 stale_id
 *   / 423 locked / 502 cli_failed）
 * - 其他异常：500 internal
 */
export function failWith(ctx: Context, err: unknown): void {
  if (err instanceof ProxyError) {
    ctx.status = err.status;
    ctx.body = err.detail
      ? { error: err.code, message: err.message, detail: err.detail }
      : { error: err.code, message: err.message };
    return;
  }
  ctx.status = 500;
  ctx.body = { error: 'internal', message: String((err as Error)?.message ?? err) };
}

/** 400 参数缺失/非法的快捷出口。 */
export function badRequest(ctx: Context, message: string): void {
  ctx.status = 400;
  ctx.body = { error: 'bad_request', message };
}

/** 404 目标不存在的快捷出口。 */
export function notFound(ctx: Context, message: string): void {
  ctx.status = 404;
  ctx.body = { error: 'not_found', message };
}
