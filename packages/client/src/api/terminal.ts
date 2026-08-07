// F20 内置终端 · `/terminal` socket.io 封装（方案 §3.2 / §4.2）
//
// 分层纪律（方案 §7，硬约束）：
//   组件 → store → api → server，逐层单向。
//   本文件是终端特性**唯一**允许出现 socket.io 的前端文件；
//   🚫 TerminalPane.vue / stores/terminal.ts 不得 import 'socket.io-client'。
//
// 职责边界：只做「连接生命周期 + 事件收发 + 监听器注册」，
//   不持有任何业务状态（term 表、活跃 term、可用性判定全在 store）。
import { io, type Socket } from 'socket.io-client';
import {
  TERMINAL_NAMESPACE,
  TERMINAL_WS_EVENTS,
  type TerminalClientToServerEvents,
  type TerminalCloseMessage,
  type TerminalDataPayload,
  type TerminalErrorPayload,
  type TerminalExitPayload,
  type TerminalInputMessage,
  type TerminalOpenRequest,
  type TerminalOpenedPayload,
  type TerminalResizeMessage,
  type TerminalServerToClientEvents,
  type TerminalWsEvent,
} from '../types/chat';

/** `/terminal` 命名空间的强类型 socket 别名（S2C / C2S 顺序与 socket.io-client 泛型一致）。 */
export type TerminalSocket = Socket<TerminalServerToClientEvents, TerminalClientToServerEvents>;

/**
 * 下行事件 → 载荷类型映射。
 * 供 `onTerminalEvent()` 做事件名与回调参数的联动推断，避免 store 侧手写断言。
 */
export interface TerminalEventPayloadMap {
  'term.opened': TerminalOpenedPayload;
  'term.data': TerminalDataPayload;
  'term.exit': TerminalExitPayload;
  'term.error': TerminalErrorPayload;
}

/** 连接态回调：store 据此维护 `connected`，并在重连后重建终端。 */
export interface TerminalLifecycleHandlers {
  onConnect?: () => void;
  onDisconnect?: (reason: string) => void;
  onConnectError?: (message: string) => void;
}

/** 取消订阅句柄（store 卸载时统一调用，避免 HMR 下重复注册）。 */
export type Unsubscribe = () => void;

/** 模块级单例：整个前端只维持一条 `/terminal` 连接。 */
let socket: TerminalSocket | null = null;

/**
 * 建立（或复用）`/terminal` 连接。
 *
 * 主机名约定（方案 §7）：使用**相对命名空间路径**，由 vite dev proxy / 同源部署接管，
 * 🚫 不硬编码 `127.0.0.1` / `0.0.0.0`（NekoBox TUN 会拦截 127.0.0.1）。
 *
 * @returns 命名空间 socket 单例（幂等，多次调用返回同一实例）
 */
export function connectTerminal(): TerminalSocket {
  if (!socket) {
    socket = io(TERMINAL_NAMESPACE, {
      transports: ['websocket'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 800,
    }) as TerminalSocket;
  }
  return socket;
}

/** 当前连接是否已建立（store 的 `connected` 初值判定用）。 */
export function isTerminalConnected(): boolean {
  return socket?.connected ?? false;
}

/**
 * 断开并释放单例。
 * 仅在应用级清理（store dispose / 测试 teardown）时调用；
 * 服务端会在 `disconnect` 时 killByOwner 回收该 socket 名下全部 pty（AC3）。
 */
export function disconnectTerminal(): void {
  if (!socket) return;
  socket.removeAllListeners();
  socket.disconnect();
  socket = null;
}

/**
 * 注册单个下行事件监听。
 * @returns 取消订阅函数
 */
export function onTerminalEvent<E extends TerminalWsEvent>(
  event: E,
  handler: (payload: TerminalEventPayloadMap[E]) => void
): Unsubscribe {
  const s = connectTerminal();
  // socket.io-client 的 on() 对「泛型事件名 + 映射载荷」推断不足；
  // TERMINAL_WS_EVENTS 与 TerminalServerToClientEvents 键集合由 types/chat.ts 单一来源保证一致。
  const listener = handler as (...args: unknown[]) => void;
  const bind = s.on.bind(s) as (ev: string, cb: (...args: unknown[]) => void) => unknown;
  const unbind = s.off.bind(s) as (ev: string, cb: (...args: unknown[]) => void) => unknown;
  bind(event, listener);
  return () => {
    unbind(event, listener);
  };
}

/**
 * 一次性注册全部下行事件（store 初始化用）。
 * 遍历 `TERMINAL_WS_EVENTS` 保证与服务端键集合零漂移。
 *
 * @returns 取消全部订阅的函数
 */
export function onTerminalEvents(handlers: {
  [E in TerminalWsEvent]?: (payload: TerminalEventPayloadMap[E]) => void;
}): Unsubscribe {
  const disposers: Unsubscribe[] = [];
  for (const event of TERMINAL_WS_EVENTS) {
    const handler = handlers[event];
    if (!handler) continue;
    disposers.push(
      onTerminalEvent(event, handler as (payload: TerminalEventPayloadMap[typeof event]) => void)
    );
  }
  return () => {
    for (const dispose of disposers) dispose();
  };
}

/**
 * 注册连接生命周期回调。
 * @returns 取消订阅函数
 */
export function onTerminalLifecycle(handlers: TerminalLifecycleHandlers): Unsubscribe {
  const s = connectTerminal();
  const onConnect = (): void => handlers.onConnect?.();
  const onDisconnect = (reason: string): void => handlers.onDisconnect?.(reason);
  const onConnectError = (err: Error): void => handlers.onConnectError?.(err.message);

  s.on('connect', onConnect);
  s.on('disconnect', onDisconnect);
  s.on('connect_error', onConnectError);

  return () => {
    s.off('connect', onConnect);
    s.off('disconnect', onDisconnect);
    s.off('connect_error', onConnectError);
  };
}

// ——— 上行事件（严格照抄 §3.2 协议表，事件名与载荷字段名禁止变形）———

/** 上行 `term.open`：请求创建 pty。 */
export function emitTerminalOpen(req: TerminalOpenRequest): void {
  connectTerminal().emit('term.open', req);
}

/** 上行 `term.input`：键盘输入原样透传。 */
export function emitTerminalInput(msg: TerminalInputMessage): void {
  connectTerminal().emit('term.input', msg);
}

/** 上行 `term.resize`：尺寸变化（调用方需已做 100ms 节流）。 */
export function emitTerminalResize(msg: TerminalResizeMessage): void {
  connectTerminal().emit('term.resize', msg);
}

/** 上行 `term.close`：主动关闭，服务端 kill 后回 `term.exit`。 */
export function emitTerminalClose(msg: TerminalCloseMessage): void {
  connectTerminal().emit('term.close', msg);
}
