// F20 内置终端 · socket.io `/terminal` 命名空间编排（方案 §3.2 / §4.2）
// 职责：上下行事件转译、按 socket 归属回收 pty、进程退出兜底清理钩子注册。
//
// 硬约束：
//  1. 🚫 不引入 ws / express-ws —— 复用 index.ts 已创建的 socket.io 实例，仅 io.of('/terminal')。
//  2. 连接建立后若 node-pty 不可用，立即推 term.error{code:'pty_unavailable'}（AC4，前端渲染降级提示）。
//  3. socket.disconnect → killByOwner(socket.id)，不留孤儿进程（AC3 / NFR-M5-7）。
import type { Server, Namespace, Socket } from 'socket.io';
import {
  TERMINAL_NAMESPACE,
  type TerminalClientToServerEvents,
  type TerminalCloseMessage,
  type TerminalErrorPayload,
  type TerminalInputMessage,
  type TerminalOpenRequest,
  type TerminalResizeMessage,
  type TerminalServerToClientEvents,
} from './protocol.js';
import { TerminalError, terminalManager } from './services/terminal.js';

/** `/terminal` 命名空间的强类型别名（socket.io 泛型：C2S / S2C / Inter / SocketData）。 */
type TerminalNs = Namespace<
  TerminalClientToServerEvents,
  TerminalServerToClientEvents,
  Record<string, never>,
  Record<string, never>
>;
type TerminalSocket = Socket<
  TerminalClientToServerEvents,
  TerminalServerToClientEvents,
  Record<string, never>,
  Record<string, never>
>;

/** 命名空间引用（下行 data/exit 需要按 term 找回对应 socket）。 */
let terminalNs: TerminalNs | null = null;

/** term_id → owner socket id，供 onData / onExit 精准投递（避免全命名空间广播）。 */
const ownerBySession = new Map<string, string>();

/** 已注册标志，防止重复注册（热重载/多次调用）。 */
let registered = false;
/** 进程级清理钩子只装一次。 */
let cleanupHooked = false;

/**
 * 注册 `/terminal` 命名空间。
 * 在 index.ts 中于 socket.io 实例创建后调用一次。
 */
export function registerTerminal(io: Server): void {
  if (registered) return;
  registered = true;

  const ns = io.of(TERMINAL_NAMESPACE) as unknown as TerminalNs;
  terminalNs = ns;

  // Manager 不认识 socket.io，下行统一经此回调转译
  terminalManager.setHandlers({
    onData: (termId, data) => emitToOwner(termId, 'term.data', { term_id: termId, data }),
    onExit: (termId, exitCode, signal) => {
      emitToOwner(termId, 'term.exit', { term_id: termId, exit_code: exitCode, signal });
      ownerBySession.delete(termId);
    },
  });

  // 预热：提前完成 node-pty 懒加载，让首个连接能立刻拿到准确的可用性
  void terminalManager.init();

  ns.on('connection', (socket: TerminalSocket) => {
    void onConnection(socket);
  });

  registerProcessCleanup();
}

/** 连接建立：不可用时立即下发降级错误（AC4），并挂载四个上行事件。 */
async function onConnection(socket: TerminalSocket): Promise<void> {
  await terminalManager.init();
  if (!terminalManager.isAvailable()) {
    sendError(socket, {
      code: 'pty_unavailable',
      message: terminalManager.getError() || 'node-pty 不可用，内置终端已降级（其余功能不受影响）',
    });
  }

  socket.on('term.open', (req: TerminalOpenRequest) => {
    void onOpen(socket, req);
  });
  socket.on('term.input', (msg: TerminalInputMessage) => onInput(socket, msg));
  socket.on('term.resize', (msg: TerminalResizeMessage) => onResize(socket, msg));
  socket.on('term.close', (msg: TerminalCloseMessage) => onClose(socket, msg));
  socket.on('disconnect', () => onDisconnect(socket));
}

/** `term.open` → TerminalManager.open() → `term.opened` / `term.error`。 */
async function onOpen(socket: TerminalSocket, req: TerminalOpenRequest): Promise<void> {
  const request: TerminalOpenRequest = {
    cols: Number(req?.cols ?? 80),
    rows: Number(req?.rows ?? 24),
    cwd: typeof req?.cwd === 'string' ? req.cwd : undefined,
    shell: typeof req?.shell === 'string' ? req.shell : undefined,
  };
  try {
    const info = await terminalManager.open(request, socket.id);
    ownerBySession.set(info.term_id, socket.id);
    socket.emit('term.opened', info);
  } catch (err) {
    sendError(socket, toErrorPayload(err));
  }
}

/** `term.input` → pty.write()。 */
function onInput(socket: TerminalSocket, msg: TerminalInputMessage): void {
  if (!msg?.term_id || typeof msg.data !== 'string') return;
  try {
    terminalManager.write(msg.term_id, msg.data);
  } catch (err) {
    sendError(socket, toErrorPayload(err, msg.term_id));
  }
}

/** `term.resize` → pty.resize()。 */
function onResize(socket: TerminalSocket, msg: TerminalResizeMessage): void {
  if (!msg?.term_id) return;
  try {
    terminalManager.resize(msg.term_id, Number(msg.cols), Number(msg.rows));
  } catch (err) {
    sendError(socket, toErrorPayload(err, msg.term_id));
  }
}

/** `term.close` → pty.kill()；`term.exit` 由 Manager 的 onExit 回调统一下发。 */
function onClose(socket: TerminalSocket, msg: TerminalCloseMessage): void {
  if (!msg?.term_id) return;
  try {
    terminalManager.kill(msg.term_id);
    // kill 后 pty 的 onExit 可能不再触发（Windows conpty 已摘表），显式补一发保证前端能收敛 UI
    if (ownerBySession.has(msg.term_id)) {
      socket.emit('term.exit', { term_id: msg.term_id, exit_code: 0 });
      ownerBySession.delete(msg.term_id);
    }
  } catch (err) {
    sendError(socket, toErrorPayload(err, msg.term_id));
  }
}

/** socket 断开：回收该 socket 名下全部 pty（AC3 / NFR-M5-7）。 */
function onDisconnect(socket: TerminalSocket): void {
  for (const [termId, owner] of [...ownerBySession.entries()]) {
    if (owner === socket.id) ownerBySession.delete(termId);
  }
  const killed = terminalManager.killByOwner(socket.id);
  if (killed > 0) {
    console.log(`[terminal] socket ${socket.id} disconnected, killed ${killed} pty session(s)`);
  }
}

/** 精准投递到 pty 归属 socket；socket 已消失则丢弃（无接收方）。 */
function emitToOwner<E extends 'term.data' | 'term.exit'>(
  termId: string,
  event: E,
  payload: Parameters<TerminalServerToClientEvents[E]>[0]
): void {
  const ns = terminalNs;
  if (!ns) return;
  const ownerId = ownerBySession.get(termId);
  if (!ownerId) return;
  const socket = ns.sockets.get(ownerId);
  if (!socket) return;
  // socket.io 的 emit 重载对联合事件名推断不足，此处按协议表已保证 payload 与事件匹配
  (socket.emit as (ev: string, p: unknown) => boolean)(event, payload);
}

/** 统一下发 `term.error`。 */
function sendError(socket: TerminalSocket, payload: TerminalErrorPayload): void {
  socket.emit('term.error', payload);
}

/** 领域错误 → 协议错误载荷；未知异常一律归为 spawn_failed（有明确 code 才好前端分支）。 */
function toErrorPayload(err: unknown, fallbackTermId?: string): TerminalErrorPayload {
  if (err instanceof TerminalError) {
    return {
      term_id: err.term_id ?? fallbackTermId,
      code: err.code,
      message: err.message,
    };
  }
  return {
    term_id: fallbackTermId,
    code: 'spawn_failed',
    message: err instanceof Error ? err.message : String(err),
  };
}

/**
 * 进程退出兜底：SIGINT / SIGTERM / exit 三处统一 killAll（方案 §4.2 第三条回收路径）。
 * 导出以便 index.ts 显式调用（幂等）。
 */
export function registerProcessCleanup(): void {
  if (cleanupHooked) return;
  cleanupHooked = true;

  const cleanup = (reason: string): void => {
    const killed = terminalManager.killAll();
    if (killed > 0) console.log(`[terminal] ${reason}: killed ${killed} pty session(s)`);
  };

  process.on('exit', () => cleanup('process exit'));
  process.on('SIGINT', () => {
    cleanup('SIGINT');
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    cleanup('SIGTERM');
    process.exit(0);
  });
}
