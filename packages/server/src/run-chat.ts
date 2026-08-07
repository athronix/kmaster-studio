// run-chat 编排：/chat-run 命名空间，把 Bridge 事件转译为前端 WS 事件
// M4 重构要点：
//  1. 抽出可复用的 executeRun(ns, req)，下行一律 ns.emit 广播（自动出队的 run 无发起 socket；
//     本地单用户工具，前端按 session_id 分发，无泄漏面）
//  2. F17 队列：activeRuns 判忙 → 入队 + run.queued；run 结束 finally → dequeueNext 自动续发
//     R-M4-5：仅进程内 run 结束时出队，server 启动不扫队列；手动冲刷经 sendQueueItemNow
//  3. F22 usage 落库（model 用有效值补齐，事件 payload 本身无 model）
//  4. F16/F18 subagent.* / compression.* 事件转译（补 session_id + message_id 锚点）
//  5. F18 contextEstimate 缓存：run 结束与压缩完成时失效
import type { Server, Namespace } from 'socket.io';
import { randomUUID } from 'node:crypto';
import { db } from './db.js';
import { createBridge } from './bridge.js';
import type { BridgeEvent, StartRunRequest, HermesMode, ContextEstimate, QueueItem, Settings } from './protocol.js';

// M5/F21：profile 切换后需要丢弃指向旧 HERMES_HOME 的连接并重建，故为可重新赋值绑定。
let bridge = createBridge();

/** 会话忙判定（仅当前进程内有效；server 重启后天然清空 → R-M4-5 不自动续发）。 */
const activeRuns = new Set<string>();
/** F18：上下文估算缓存，run 结束 / 压缩完成时失效。 */
const estimateCache = new Map<string, ContextEstimate>();
/** REST 路由需要广播队列变化，这里保留命名空间引用。 */
let chatNs: Namespace | null = null;

/** 当前会话是否有正在执行的 run。 */
export function isSessionBusy(sessionId: string): boolean {
  return activeRuns.has(sessionId);
}

/**
 * M5/F21：进程内是否有**任意**会话正在执行 run。
 * `PUT /api/profiles/active` 用它做「有 run 在跑则拒绝切换」的前置判定（§0.2.1）。
 */
export function hasActiveRuns(): boolean {
  return activeRuns.size > 0;
}

/**
 * M5/F21：重建 Bridge 实例。
 *
 * ⚠️ 事实校正：kmaster-server **不 spawn** Bridge 子进程 —— `MockBridge` 完全在进程内，
 * `RealBridge` 是连到外部 Python bridge（`HERMES_AGENT_BRIDGE_ENDPOINT`）的 TCP 客户端。
 * 因此设计文档 §0.2.1 所说的「重启 Bridge 子进程」在本架构下的等价动作是：丢弃缓存的旧
 * socket 并重建客户端，使下一次 run 重新建连；外部 bridge 进程本身仍需用户重启，这正是
 * `PUT /api/profiles/active` 返回 `restart_required: true` 的语义所在。
 */
export function restartBridge(): void {
  bridge = createBridge();
}

/**
 * M5/F21：经 `/chat-run` 广播全局设置变更（§0.2.1 ③）。
 * 命名空间尚未注册时静默跳过（server 启动早期不应因此崩）。
 */
export function broadcastSettingsUpdated(settings: Settings): void {
  chatNs?.emit('settings.updated', { settings });
}

/** F18：使指定会话的上下文估算缓存失效。 */
export function invalidateContextEstimate(sessionId: string): void {
  estimateCache.delete(sessionId);
}

/** 广播某会话最新队列（托盘 / /queue 页同源刷新）。 */
async function broadcastQueue(sessionId: string): Promise<QueueItem[]> {
  const store = await db();
  const items = store.listQueue(sessionId);
  chatNs?.emit('queue.updated', { session_id: sessionId, items });
  return items;
}

/**
 * F18：取会话上下文估算（带缓存）。
 * 缓存未命中时调 Bridge.contextEstimate（Mock 字符/4；Real 走 context.estimate action）。
 */
export async function getContextEstimate(sessionId: string, force = false): Promise<ContextEstimate> {
  if (!force) {
    const cached = estimateCache.get(sessionId);
    if (cached) return cached;
  }
  const store = await db();
  const row = store.getSession(sessionId);
  const messages = store.getMessages(sessionId).map((m) => ({ role: m.role, content: m.content }));
  const model = row?.model ?? store.getSetting('default_model') ?? '';
  const estimate = await bridge.contextEstimate(sessionId, { messages, model: model || undefined });
  estimateCache.set(sessionId, estimate);
  return estimate;
}

/**
 * 执行一次完整 run（F1 全链路）。下行事件一律 ns.emit 广播。
 * 结束后在 finally 中释放忙标记并尝试出队下一条（F17 自动续发）。
 */
export async function executeRun(ns: Namespace, req: StartRunRequest): Promise<string> {
  const { session_id, message, profile, model, mode, instructions } = req;
  const store = await db();
  store.getOrCreateSession(session_id, profile);
  const runId = randomUUID();

  activeRuns.add(session_id);
  ns.emit('run.started', { run_id: runId, session_id });

  // 有效值优先级：req 显式覆盖 > sessions 行 > 全局默认
  // 注意：以下落库动作必须位于 try 内，否则一旦抛错就会跳过 finally，
  // 让 activeRuns 永久残留该会话（后续所有输入被误判为「忙」而无限入队）。
  const assistantMsgId = randomUUID();
  let effModel = '';
  let fullText = '';
  let inputTokens = 0;
  let outputTokens = 0;

  const onEvent = (e: BridgeEvent) => {
    switch (e.type) {
      case 'reasoning.delta':
        ns.emit('reasoning.delta', { session_id, message_id: assistantMsgId, delta: e.delta });
        break;
      case 'message.delta':
        fullText += e.delta;
        outputTokens += Math.ceil(e.delta.length / 4);
        ns.emit('message.delta', { session_id, message_id: assistantMsgId, delta: e.delta });
        break;
      case 'tool.started':
        ns.emit('tool.started', { session_id, message_id: assistantMsgId, tool: e.tool, args: e.args });
        break;
      case 'tool.completed':
        ns.emit('tool.completed', { session_id, message_id: assistantMsgId, tool: e.tool, result: e.result });
        break;
      case 'tool.failed':
        ns.emit('tool.failed', { session_id, message_id: assistantMsgId, tool: e.tool, error: e.error });
        break;
      case 'approval.requested':
        ns.emit('approval.requested', { session_id, approval_id: e.approval_id, tool: e.tool, args: e.args, risk: e.risk });
        break;
      case 'clarify.requested':
        ns.emit('clarify.requested', { session_id, clarify_id: e.clarify_id, question: e.question, options: e.options });
        break;
      case 'plan.requested':
        ns.emit('plan.requested', { session_id, plan_id: e.plan_id, title: e.title, steps: e.steps });
        break;
      case 'artifact':
        ns.emit('artifact.created', { session_id, artifact: e.artifact });
        break;
      case 'usage.updated': {
        inputTokens = e.input_tokens;
        outputTokens = e.output_tokens;
        // F22：落库（model 从有效值补齐，事件 payload 无该字段）
        store.addUsage({
          session_id,
          model: effModel,
          input_tokens: e.input_tokens,
          output_tokens: e.output_tokens,
          cost: e.cost,
        });
        ns.emit('usage.updated', { session_id, input_tokens: e.input_tokens, output_tokens: e.output_tokens, cost: e.cost });
        break;
      }
      // —— M4/F16 子代理：原样透传身份字段，仅补会话与宿主消息锚点 ——
      case 'subagent.start':
      case 'subagent.tool':
      case 'subagent.text':
      case 'subagent.thinking':
      case 'subagent.progress':
      case 'subagent.complete': {
        const { type, ...rest } = e;
        ns.emit(type, { session_id, message_id: assistantMsgId, ...rest });
        break;
      }
      // —— M4/F18 上下文压缩 ——
      case 'compression.started':
        ns.emit('compression.started', { session_id, reason: e.reason });
        break;
      case 'compression.completed':
        estimateCache.delete(session_id);
        ns.emit('compression.completed', {
          session_id,
          old_session_id: e.old_session_id,
          in_place: e.in_place,
          compression_count: e.compression_count,
          tokens_before: e.tokens_before,
          tokens_after: e.tokens_after,
        });
        break;
      case 'completed':
        fullText = e.text;
        break;
    }
  };

  try {
    const rowMode = store.getSession(session_id)?.mode ?? null;
    const rowModel = store.getSession(session_id)?.model ?? null;
    const defMode = store.getSetting('default_mode') ?? 'default';
    const defModel = store.getSetting('default_model') ?? '';
    const effMode = (mode ?? rowMode ?? defMode) as HermesMode;
    effModel = model ?? rowModel ?? defModel;
    // 每会话覆盖持久化
    store.setSessionModeModel(session_id, effMode, effModel);
    // 用户消息落库
    store.appendMessage({ session_id, role: 'user', content: message, guidance: 0 });

    await bridge.chat({ sessionId: session_id, message, model: effModel, mode: effMode, profile, instructions, onEvent });
    store.appendMessage({ session_id, role: 'assistant', content: fullText, usage_json: JSON.stringify({ input_tokens: inputTokens, output_tokens: outputTokens }) });
    ns.emit('run.completed', { session_id, message_id: assistantMsgId, message: fullText, usage: { input_tokens: inputTokens, output_tokens: outputTokens } });
    // 标题自动生成
    const title = await bridge.getSessionTitle(session_id);
    if (title && title !== '新会话') {
      store.renameSession(session_id, title.slice(0, 40));
      ns.emit('session.title.updated', { session_id, title: title.slice(0, 40) });
    }
  } catch (err) {
    ns.emit('run.failed', { session_id, error: String(err) });
  } finally {
    activeRuns.delete(session_id);
    estimateCache.delete(session_id); // 历史已变化，下次按需重算
    scheduleDequeue(ns, session_id);
  }
  return runId;
}

/** 用 setImmediate 解耦，避免 finally → executeRun → finally 形成深层同步调用栈。 */
function scheduleDequeue(ns: Namespace, sessionId: string): void {
  setImmediate(() => {
    void dequeueNext(ns, sessionId).catch(() => { /* 出队失败不影响已完成的 run */ });
  });
}

/** F17：当前 run 结束后取队首继续执行（R-M4-5：仅运行期出队）。 */
async function dequeueNext(ns: Namespace, sessionId: string): Promise<void> {
  if (activeRuns.has(sessionId)) return;
  const store = await db();
  const next = store.peekQueue(sessionId);
  if (!next) return;
  store.removeQueueItem(next.id);
  ns.emit('queue.updated', { session_id: sessionId, items: store.listQueue(sessionId) });
  await executeRun(ns, {
    session_id: sessionId,
    message: next.message,
    mode: (next.mode ?? undefined) as HermesMode | undefined,
    model: next.model ?? undefined,
  });
}

/**
 * F17 手动冲刷入口（REST `POST /api/queue/:id/send`）。
 * 会话空闲 → 立即执行；会话忙 → 提到队首，等当前 run 结束后优先发送。
 */
export async function sendQueueItemNow(id: string): Promise<{ ok: true; started: boolean; note: string } | null> {
  const store = await db();
  const item = store.getQueueItem(id);
  if (!item) return null;

  if (activeRuns.has(item.session_id) || !chatNs) {
    store.moveQueueItemToFront(id);
    await broadcastQueue(item.session_id);
    return { ok: true, started: false, note: '会话正在运行，已提到队首，当前 run 结束后优先发送' };
  }

  store.removeQueueItem(id);
  await broadcastQueue(item.session_id);
  const ns = chatNs;
  void executeRun(ns, {
    session_id: item.session_id,
    message: item.message,
    mode: (item.mode ?? undefined) as HermesMode | undefined,
    model: item.model ?? undefined,
  }).catch(() => { /* 错误已通过 run.failed 广播 */ });
  return { ok: true, started: true, note: '已立即发送' };
}

/** F17：移除排队项并广播（REST `DELETE /api/queue/:id`）。 */
export async function dropQueueItem(id: string): Promise<boolean> {
  const store = await db();
  const item = store.getQueueItem(id);
  if (!item) return false;
  store.removeQueueItem(id);
  await broadcastQueue(item.session_id);
  return true;
}

export function registerChatRun(io: Server) {
  const ns = io.of('/chat-run');
  chatNs = ns;

  ns.on('connection', (socket) => {
    socket.on('run', async (req: StartRunRequest, cb?: (resp: { run_id: string; session_id: string }) => void) => {
      const session_id = req?.session_id;
      if (!session_id) return;
      // 入参校验：message 缺失时显式报错，避免「run.started 之后无声无息」的黑洞
      if (typeof req.message !== 'string' || req.message.length === 0) {
        ns.emit('run.failed', { session_id, error: 'message required' });
        cb?.({ run_id: '', session_id });
        return;
      }

      // F17：会话忙 → 入队，不阻塞用户输入
      if (activeRuns.has(session_id)) {
        const store = await db();
        store.getOrCreateSession(session_id, req.profile);
        const item = store.enqueue({
          id: randomUUID(),
          session_id,
          message: req.message,
          mode: req.mode ?? null,
          model: req.model ?? null,
          created_at: Date.now(),
        });
        const items = store.listQueue(session_id);
        ns.emit('run.queued', { session_id, item, pending: items.length });
        ns.emit('queue.updated', { session_id, items });
        cb?.({ run_id: '', session_id });
        return;
      }

      const runId = await executeRun(ns, req);
      cb?.({ run_id: runId, session_id });
    });

    socket.on('abort', async ({ session_id }) => {
      ns.emit('abort.started', { session_id });
      try {
        await bridge.interrupt(session_id);
      } catch { /* ignore */ }
      ns.emit('abort.completed', { session_id });
    });

    socket.on('steer', async ({ session_id, text }) => {
      try { await bridge.steer(session_id, text); } catch { /* ignore */ }
      const id = randomUUID();
      (await db()).appendMessage({ session_id, role: 'user', content: text, guidance: 1 });
      ns.emit('message.delta', { session_id, message_id: id, delta: text, guidance: true });
    });

    socket.on('approval.respond', async ({ session_id, approval_id, choice }) => {
      try { await bridge.respondApproval(session_id, approval_id, choice); } catch { /* ignore */ }
      ns.emit('approval.resolved', { session_id, approval_id });
    });

    socket.on('clarify.respond', async ({ session_id, clarify_id, response }) => {
      try { await bridge.respondClarify(session_id, clarify_id, response); } catch { /* ignore */ }
      ns.emit('clarify.resolved', { session_id, clarify_id });
    });

    socket.on('plan.respond', async ({ session_id, plan_id, choice }) => {
      try { await bridge.respondPlan(session_id, plan_id, choice); } catch { /* ignore */ }
      ns.emit('plan.resolved', { session_id, plan_id });
    });
  });
}
