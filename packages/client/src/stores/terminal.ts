// F20 内置终端 · Pinia store（方案 §3.3 类图 TerminalStore / §4.2 时序）
//
// 分层纪律（方案 §7）：组件 → store → api → server。
//   本 store 是组件与网络之间的唯一中介；🚫 不 import 'socket.io-client'，
//   所有收发一律经 `../api/terminal`。
//
// 职责：
//   1. 连接生命周期编排（ensureConnected 幂等）
//   2. 会话表 terms + activeTermId 维护
//   3. pty 输出的订阅分发（含订阅前的数据缓冲，避免丢首屏提示符）
//   4. 降级态 available / unavailableReason（AC4：渲染提示而非白屏）
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import {
  connectTerminal,
  emitTerminalClose,
  emitTerminalInput,
  emitTerminalOpen,
  emitTerminalResize,
  isTerminalConnected,
  onTerminalEvents,
  onTerminalLifecycle,
  type Unsubscribe,
} from '../api/terminal';
import type {
  TerminalDataPayload,
  TerminalErrorCode,
  TerminalErrorPayload,
  TerminalExitPayload,
  TerminalOpenedPayload,
} from '../types/chat';

/** 单个终端会话在前端的状态机。 */
export type TermStatus = 'opening' | 'open' | 'exited' | 'error';

/** 前端会话状态（服务端 PtyInfo 的镜像 + UI 状态位）。 */
export interface TermState {
  term_id: string;
  shell: string;
  cwd: string;
  pid: number;
  cols: number;
  rows: number;
  status: TermStatus;
  /** 退出码（status='exited' 时有效）。 */
  exit_code?: number;
  /** 退出信号（可缺省）。 */
  signal?: number;
  /** 错误码（status='error' 时有效）。 */
  error_code?: TerminalErrorCode;
  /** 错误文案（status='error' 时有效）。 */
  error_message?: string;
}

/** pty 输出订阅回调。 */
export type TermDataListener = (data: string) => void;

/** `openTerm()` 等待 `term.opened` 的超时（毫秒）。 */
const OPEN_TIMEOUT_MS = 10_000;

/** 打开失败类错误码：收到即判定当前 pending 的 openTerm 失败。 */
const OPEN_FAILURE_CODES: ReadonlySet<TerminalErrorCode> = new Set<TerminalErrorCode>([
  'pty_unavailable',
  'spawn_failed',
  'bad_cwd',
  'limit_exceeded',
]);

/** 等待 `term.opened` 的挂起请求（协议无 request_id，按 FIFO 配对）。 */
interface PendingOpen {
  resolve: (termId: string) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export const useTerminalStore = defineStore('terminal', () => {
  // ——— 状态 ———
  /** node-pty 是否可用；连接期收到 `pty_unavailable` 则置 false（AC4）。乐观默认 true。 */
  const available = ref<boolean>(true);
  /** 不可用原因（降级提示文案）。 */
  const unavailableReason = ref<string>('');
  /** 会话表：term_id → TermState。 */
  const terms = ref<Map<string, TermState>>(new Map());
  /** 当前活跃终端 id；无终端时为空串。 */
  const activeTermId = ref<string>('');
  /** socket 连接态。 */
  const connected = ref<boolean>(isTerminalConnected());
  /** 最近一次连接层错误（非 pty 错误），用于区分「后端没起」与「pty 不可用」。 */
  const connectionError = ref<string>('');

  // ——— 非响应式内部结构（不需要进 Vue 依赖收集）———
  /** 输出订阅表：term_id → 回调集合。 */
  const dataListeners = new Map<string, Set<TermDataListener>>();
  /** 订阅前到达的输出缓冲，订阅时一次性冲刷（避免丢 shell 首屏提示符）。 */
  const pendingData = new Map<string, string[]>();
  /** FIFO 挂起的 open 请求。 */
  const pendingOpens: PendingOpen[] = [];
  /** 事件订阅句柄（仅注册一次）。 */
  let disposeEvents: Unsubscribe | null = null;
  let disposeLifecycle: Unsubscribe | null = null;
  /** ensureConnected 的进行中 Promise（幂等复用）。 */
  let connectingPromise: Promise<void> | null = null;

  // ——— 派生 ———
  /** 会话列表（模板 v-for 用，Map 不便直接遍历）。 */
  const termList = computed<TermState[]>(() => [...terms.value.values()]);
  /** 当前活跃会话。 */
  const activeTerm = computed<TermState | null>(
    () => (activeTermId.value ? terms.value.get(activeTermId.value) ?? null : null)
  );
  /** 是否存在存活会话。 */
  const hasLiveTerm = computed<boolean>(() =>
    termList.value.some((t) => t.status === 'open' || t.status === 'opening')
  );

  // ——— 下行事件处理 ———

  /** `term.opened`：登记会话并结算最早的挂起 open 请求。 */
  function handleOpened(payload: TerminalOpenedPayload): void {
    const state: TermState = {
      term_id: payload.term_id,
      shell: payload.shell,
      cwd: payload.cwd,
      pid: payload.pid,
      cols: payload.cols,
      rows: payload.rows,
      status: 'open',
    };
    terms.value.set(payload.term_id, state);
    if (!activeTermId.value) activeTermId.value = payload.term_id;
    // 能开出 pty，说明后端可用（覆盖此前可能的悲观标记）
    available.value = true;
    unavailableReason.value = '';
    settleOpen(payload.term_id);
  }

  /** `term.data`：有订阅者则直投，否则缓冲待订阅时冲刷。 */
  function handleData(payload: TerminalDataPayload): void {
    const listeners = dataListeners.get(payload.term_id);
    if (listeners && listeners.size > 0) {
      for (const listener of listeners) listener(payload.data);
      return;
    }
    const buffer = pendingData.get(payload.term_id);
    if (buffer) buffer.push(payload.data);
    else pendingData.set(payload.term_id, [payload.data]);
  }

  /** `term.exit`：收敛 UI 状态，清理该 term 的订阅与缓冲。 */
  function handleExit(payload: TerminalExitPayload): void {
    const state = terms.value.get(payload.term_id);
    if (state) {
      state.status = 'exited';
      state.exit_code = payload.exit_code;
      state.signal = payload.signal;
    }
    pendingData.delete(payload.term_id);
  }

  /**
   * `term.error`：
   *  - `pty_unavailable`（连接期，无 term_id）→ 全局降级标记（AC4）
   *  - 带 term_id → 标记该会话错误
   *  - 有挂起的 open 且属于打开失败类 → 结算为 reject
   */
  function handleError(payload: TerminalErrorPayload): void {
    if (payload.code === 'pty_unavailable') {
      available.value = false;
      unavailableReason.value = payload.message || 'node-pty 不可用，内置终端已降级';
    }
    if (payload.term_id) {
      const state = terms.value.get(payload.term_id);
      if (state) {
        state.status = 'error';
        state.error_code = payload.code;
        state.error_message = payload.message;
      }
    }
    if (OPEN_FAILURE_CODES.has(payload.code)) {
      rejectOpen(new TerminalOpenError(payload.code, payload.message));
    }
  }

  /** socket 断开：服务端会 killByOwner，本地全部会话同步收敛为 exited。 */
  function handleDisconnect(reason: string): void {
    connected.value = false;
    for (const state of terms.value.values()) {
      if (state.status === 'open' || state.status === 'opening') {
        state.status = 'exited';
        state.exit_code = 0;
      }
    }
    pendingData.clear();
    rejectOpen(new Error(`连接已断开（${reason}）`));
  }

  // ——— 挂起 open 请求的结算 ———

  function settleOpen(termId: string): void {
    const pending = pendingOpens.shift();
    if (!pending) return;
    clearTimeout(pending.timer);
    pending.resolve(termId);
  }

  function rejectOpen(err: Error): void {
    const pending = pendingOpens.shift();
    if (!pending) return;
    clearTimeout(pending.timer);
    pending.reject(err);
  }

  // ——— 对外动作（方案 §3.3 类图）———

  /**
   * 建立 `/terminal` 连接并注册事件（幂等）。
   * 已连接时立即返回；连接失败不抛出，交由 `connectionError` 呈现。
   */
  function ensureConnected(): Promise<void> {
    if (connected.value && disposeEvents) return Promise.resolve();
    if (connectingPromise) return connectingPromise;

    registerHandlers();
    const socket = connectTerminal();
    if (socket.connected) {
      connected.value = true;
      return Promise.resolve();
    }

    connectingPromise = new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        connectingPromise = null;
        resolve();
      }, OPEN_TIMEOUT_MS);

      const stop = onTerminalLifecycle({
        onConnect: () => {
          clearTimeout(timer);
          stop();
          connectingPromise = null;
          resolve();
        },
        onConnectError: (message) => {
          clearTimeout(timer);
          stop();
          connectingPromise = null;
          connectionError.value = message;
          resolve();
        },
      });
    });
    return connectingPromise;
  }

  /** 注册下行事件与生命周期回调（仅一次）。 */
  function registerHandlers(): void {
    if (disposeEvents) return;
    disposeEvents = onTerminalEvents({
      'term.opened': handleOpened,
      'term.data': handleData,
      'term.exit': handleExit,
      'term.error': handleError,
    });
    disposeLifecycle = onTerminalLifecycle({
      onConnect: () => {
        connected.value = true;
        connectionError.value = '';
      },
      onDisconnect: handleDisconnect,
      onConnectError: (message) => {
        connected.value = false;
        connectionError.value = message;
      },
    });
  }

  /**
   * 打开一个 pty 会话。
   * @param cols 列数（来自 addon-fit 实测）
   * @param rows 行数
   * @param cwd  工作目录；缺省由服务端按 Settings.terminal_cwd → process.cwd() 回落
   * @returns 新会话的 term_id
   * @throws TerminalOpenError pty 不可用 / spawn 失败 / cwd 非法 / 超出并发上限
   */
  async function openTerm(cols: number, rows: number, cwd?: string): Promise<string> {
    await ensureConnected();
    if (!available.value) {
      throw new TerminalOpenError(
        'pty_unavailable',
        unavailableReason.value || 'node-pty 不可用，内置终端已降级'
      );
    }

    const promise = new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = pendingOpens.findIndex((p) => p.timer === timer);
        if (idx >= 0) pendingOpens.splice(idx, 1);
        reject(new Error('打开终端超时（10s 未收到 term.opened）'));
      }, OPEN_TIMEOUT_MS);
      pendingOpens.push({ resolve, reject, timer });
    });

    emitTerminalOpen({ cols, rows, cwd });
    return promise;
  }

  /** 发送键盘输入。会话不存在或已退出时静默忽略。 */
  function sendInput(termId: string, data: string): void {
    const state = terms.value.get(termId);
    if (!state || state.status !== 'open') return;
    emitTerminalInput({ term_id: termId, data });
  }

  /**
   * 调整远端 pty 尺寸。
   * 节流由调用方（TerminalPane）按 `TERMINAL_RESIZE_THROTTLE_MS` 完成；
   * 此处只做「尺寸未变则不发」的去抖，避免无谓帧。
   */
  function resize(termId: string, cols: number, rows: number): void {
    const state = terms.value.get(termId);
    if (!state || state.status !== 'open') return;
    if (state.cols === cols && state.rows === rows) return;
    state.cols = cols;
    state.rows = rows;
    emitTerminalResize({ term_id: termId, cols, rows });
  }

  /** 主动关闭会话；真正的状态收敛由 `term.exit` 完成。 */
  function closeTerm(termId: string): void {
    const state = terms.value.get(termId);
    if (!state) return;
    if (state.status === 'open' || state.status === 'opening') {
      emitTerminalClose({ term_id: termId });
    }
  }

  /**
   * 从会话表移除（UI 层「清理已结束会话」用，不发网络请求）。
   */
  function forgetTerm(termId: string): void {
    terms.value.delete(termId);
    dataListeners.delete(termId);
    pendingData.delete(termId);
    if (activeTermId.value === termId) {
      const next = termList.value[0];
      activeTermId.value = next ? next.term_id : '';
    }
  }

  /**
   * 订阅某终端的输出。订阅时会先冲刷订阅前缓冲的数据（不丢首屏提示符）。
   *
   * @returns 取消订阅函数（组件卸载必须调用；类图标注为 void，此处返回句柄以保证可回收）
   */
  function onData(termId: string, cb: TermDataListener): Unsubscribe {
    let listeners = dataListeners.get(termId);
    if (!listeners) {
      listeners = new Set<TermDataListener>();
      dataListeners.set(termId, listeners);
    }
    listeners.add(cb);

    const buffered = pendingData.get(termId);
    if (buffered && buffered.length > 0) {
      pendingData.delete(termId);
      cb(buffered.join(''));
    }

    return () => {
      const set = dataListeners.get(termId);
      if (!set) return;
      set.delete(cb);
      if (set.size === 0) dataListeners.delete(termId);
    };
  }

  /** 设置活跃终端。 */
  function setActiveTerm(termId: string): void {
    activeTermId.value = termId;
  }

  /** 释放全部订阅（测试 teardown / HMR 用；不断开 socket 以免误杀他处会话）。 */
  function dispose(): void {
    disposeEvents?.();
    disposeLifecycle?.();
    disposeEvents = null;
    disposeLifecycle = null;
    dataListeners.clear();
    pendingData.clear();
  }

  return {
    // state
    available,
    unavailableReason,
    terms,
    activeTermId,
    connected,
    connectionError,
    // getters
    termList,
    activeTerm,
    hasLiveTerm,
    // actions
    ensureConnected,
    openTerm,
    sendInput,
    resize,
    closeTerm,
    forgetTerm,
    onData,
    setActiveTerm,
    dispose,
  };
});

/** 打开终端失败的领域错误：携带协议错误码，便于 UI 分支渲染。 */
export class TerminalOpenError extends Error {
  readonly code: TerminalErrorCode;

  constructor(code: TerminalErrorCode, message: string) {
    super(message);
    this.name = 'TerminalOpenError';
    this.code = code;
  }
}
