// AgentBridge：连接 hermes-agent 的抽象层
// - MockBridge：模拟流式输出，保证无真实 agent 时前端全链路可验证
//   M4：按触发词合成 subagent.* 事件序列（≥2 个并行子代理）、按会话轮次合成 compression.* 序列
// - RealBridge：经 TCP 连接 Python bridge（hermes-agent run_agent.AIAgent），真实对接
//   M4：subagent/compression 事件在行协议中天然透传（onEvent 直转）；contextEstimate 走 context.estimate action
import net from 'node:net';
import { randomUUID } from 'node:crypto';
import { getModelContextWindow } from './hermes-proxy.js';
import type { BridgeEvent, HermesMode, ContextEstimate, SubagentIdentity } from './protocol.js';

export interface ChatOptions {
  sessionId: string;
  message: string;
  model?: string;
  profile?: string;
  instructions?: string;
  // F8：透传 hermes ACP 编辑审批令牌（dont_ask / accept_edits / default），不改行为
  mode?: HermesMode;
  onEvent: (e: BridgeEvent) => void;
}

/** F18：上下文估算入参（messages 为该会话完整历史，instructions/profile 计入系统区）。 */
export interface ContextEstimateOptions {
  messages: { role: string; content: string }[];
  model?: string;
  instructions?: string;
  profile?: string;
}

export interface Bridge {
  chat(opts: ChatOptions): Promise<{ run_id: string; text: string }>;
  interrupt(sessionId: string): Promise<void>;
  steer(sessionId: string, text: string): Promise<void>;
  getSessionTitle(sessionId: string): Promise<string>;
  respondApproval(sessionId: string, approvalId: string, choice: string): Promise<void>;
  respondClarify(sessionId: string, clarifyId: string, response: string): Promise<void>;
  respondPlan(sessionId: string, planId: string, choice: string): Promise<void>;
  /** T04：销毁 Python 侧 session 与 worker 资源。 */
  destroy(sessionId: string): Promise<void>;
  /**
   * F18：上下文占用估算。
   * Mock = 字符/4（与真实 hermes `_chars_to_tokens` 同源）；
   * Real = 发 `{action:'context.estimate'}`，2s 超时回退本地估算。
   */
  contextEstimate(sessionId: string, opts: ContextEstimateOptions): Promise<ContextEstimate>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 与 hermes `context_breakdown._chars_to_tokens` 同源的粗估：字符数 / 4。 */
function charsToTokens(chars: number): number {
  return Math.ceil(chars / 4);
}

/**
 * 本地上下文估算（Mock 与 Real 超时回退共用）。
 * 分类镜像 hermes `compute_session_context_breakdown()` 的 categories 结构。
 */
export function estimateContext(opts: ContextEstimateOptions): ContextEstimate {
  const messages = opts.messages ?? [];
  const systemChars = (opts.instructions ?? '').length + (opts.profile ?? '').length;
  let userChars = 0;
  let assistantChars = 0;
  let toolChars = 0;
  for (const m of messages) {
    const len = (m?.content ?? '').length;
    const role = (m?.role ?? '').toLowerCase();
    if (role === 'user' || role === 'command') userChars += len;
    else if (role === 'tool') toolChars += len;
    else if (role === 'system') userChars += 0;
    else assistantChars += len;
  }
  const categories = [
    { id: 'system', label: '系统指令', tokens: charsToTokens(systemChars), color: '#8b5cf6' },
    { id: 'user', label: '用户消息', tokens: charsToTokens(userChars), color: '#3b82f6' },
    { id: 'assistant', label: '助手回复', tokens: charsToTokens(assistantChars), color: '#10b981' },
    { id: 'tools', label: '工具输出', tokens: charsToTokens(toolChars), color: '#f59e0b' },
  ];
  const used = categories.reduce((acc, c) => acc + c.tokens, 0);
  const max = getModelContextWindow(opts.model);
  return {
    context_used: used,
    context_max: max,
    context_percent: max > 0 ? Math.min(100, Math.round((used / max) * 1000) / 10) : 0,
    estimated_total: used,
    model: opts.model ?? '',
    categories,
    estimated: true,
  };
}

// ───────────────────────── Mock ─────────────────────────

/** 触发子代理合成的关键词（命中即演示并行委派链路）。 */
const SUBAGENT_TRIGGER = /(委派|并行|子代理|分派|同时处理|delegate|parallel|subagent)/i;
/** 触发压缩合成的关键词（会话轮次 ≥3 时亦自动触发）。 */
const COMPRESSION_TRIGGER = /(压缩|compact|compress)/i;
/** 会话轮次达到该值时自动合成压缩序列（模拟长会话）。 */
const COMPRESSION_TURN_THRESHOLD = 3;

class MockBridge implements Bridge {
  /** 每会话轮次计数，用于「长会话触发压缩」的判定。 */
  private turns = new Map<string, number>();

  /** 合成 2 个并行子代理的完整事件序列，字段名逐字对齐 delegate_tool.py。 */
  private async emitSubagents(opts: ChatOptions): Promise<void> {
    const parentId = randomUUID();
    const topic = opts.message.slice(0, 24);
    const specs: { identity: SubagentIdentity; tools: string[]; text: string[]; thinking: string }[] = [
      {
        identity: {
          subagent_id: randomUUID(),
          parent_id: parentId,
          task_index: 0,
          task_count: 2,
          goal: `检索与「${topic}」相关的公开资料并汇总要点`,
          depth: 1,
          model: opts.model || 'gpt-4o-mini',
          toolsets: ['web', 'files'],
          child_session_id: randomUUID(),
          tool_count: 0,
        },
        tools: ['web_search', 'fetch_page', 'file_write'],
        text: ['已定位 5 条高相关资料，', '正在提炼核心结论与佐证数据，', '汇总完成。'],
        thinking: '优先选择一手来源，交叉验证冲突数据。',
      },
      {
        identity: {
          subagent_id: randomUUID(),
          parent_id: parentId,
          task_index: 1,
          task_count: 2,
          goal: `基于「${topic}」生成结构化大纲与风险清单`,
          depth: 1,
          model: opts.model || 'gpt-4o-mini',
          toolsets: ['files'],
          child_session_id: randomUUID(),
          tool_count: 0,
        },
        tools: ['read_file', 'file_write'],
        text: ['大纲草案已生成，', '补充 3 项风险与对应缓解措施。'],
        thinking: '按「结论先行」组织结构，风险按影响面排序。',
      },
    ];

    // 1) 两个子代理同时启动（并行语义）
    for (const s of specs) {
      opts.onEvent({ type: 'subagent.start', preview: s.identity.goal ?? '', ...s.identity });
      await sleep(40);
    }

    // 2) 交错推进：thinking → tool → text（模拟真实并行流）
    for (const s of specs) {
      opts.onEvent({ type: 'subagent.thinking', preview: s.thinking, ...s.identity });
      await sleep(30);
    }

    const maxTools = Math.max(...specs.map((s) => s.tools.length));
    for (let i = 0; i < maxTools; i += 1) {
      for (const s of specs) {
        const tool = s.tools[i];
        if (!tool) continue;
        s.identity.tool_count = (s.identity.tool_count ?? 0) + 1;
        opts.onEvent({
          type: 'subagent.tool',
          tool,
          preview: `${tool}(${topic || 'task'})`,
          args: { query: topic, index: i },
          ...s.identity,
        });
        await sleep(50);
      }
    }

    for (let i = 0; i < 3; i += 1) {
      for (const s of specs) {
        const piece = s.text[i];
        if (!piece) continue;
        opts.onEvent({ type: 'subagent.text', preview: piece, ...s.identity });
        await sleep(40);
      }
    }

    // 3) 批量工具摘要（真实链路每 5 个工具 flush 一次）
    for (const s of specs) {
      opts.onEvent({
        type: 'subagent.progress',
        preview: `🔀 ${s.tools.join(', ')}`,
        ...s.identity,
      });
      await sleep(30);
    }

    // 4) 完成
    for (const s of specs) {
      opts.onEvent({
        type: 'subagent.complete',
        preview: `已完成：${s.identity.goal}`,
        status: 'ok',
        duration_seconds: Math.round((1.2 + (s.identity.task_index ?? 0) * 0.8) * 10) / 10,
        ...s.identity,
      });
      await sleep(40);
    }
  }

  /** 合成压缩事件序列（对齐 conversation_compression.py 的 started/completed 归一化）。 */
  private async emitCompression(opts: ChatOptions, turn: number): Promise<void> {
    const tokensBefore = 96_000 + turn * 4_000;
    const tokensAfter = Math.round(tokensBefore * 0.42);
    opts.onEvent({ type: 'compression.started', reason: '上下文接近上限，自动压缩历史消息' });
    await sleep(220);
    opts.onEvent({
      type: 'compression.completed',
      old_session_id: randomUUID(),
      in_place: true,
      compression_count: Math.max(1, turn - COMPRESSION_TURN_THRESHOLD + 1),
      tokens_before: tokensBefore,
      tokens_after: tokensAfter,
    });
  }

  async chat(opts: ChatOptions): Promise<{ run_id: string; text: string }> {
    const runId = randomUUID();
    const turn = (this.turns.get(opts.sessionId) ?? 0) + 1;
    this.turns.set(opts.sessionId, turn);

    // T04: emit run.started for Mock/Real shape consistency (NFR-7)
    opts.onEvent({ type: 'run.started', sessionId: opts.sessionId, runId });

    const reasoning = '正在分析你的请求，规划调用合适的工具来回答…';
    for (const ch of chunk(reasoning, 6)) {
      opts.onEvent({ type: 'reasoning.delta', delta: ch });
      await sleep(20);
    }
    // F6 计划卡
    opts.onEvent({ type: 'plan.requested', plan_id: randomUUID(), title: '本次任务执行计划', steps: [
      '检索与「' + opts.message.slice(0, 20) + '」相关的资料',
      '汇总要点并生成结构化答复',
      '产出可预览的 Markdown 文档',
    ] });
    await sleep(200);
    opts.onEvent({ type: 'tool.started', tool: 'web_search', args: { query: opts.message.slice(0, 40) } });
    await sleep(400);
    opts.onEvent({ type: 'tool.completed', tool: 'web_search', result: { hits: 5 } });

    // M4/F16：触发词命中 → 合成并行子代理事件序列
    const withSubagents = SUBAGENT_TRIGGER.test(opts.message);
    if (withSubagents) await this.emitSubagents(opts);

    // F4 授权卡
    opts.onEvent({ type: 'approval.requested', approval_id: randomUUID(), tool: 'file_write', args: { path: 'output/summary.md', overwrite: true }, risk: '将写入一个本地文件' });
    await sleep(200);
    // F5 澄清卡
    opts.onEvent({ type: 'clarify.requested', clarify_id: randomUUID(), question: '你希望摘要以哪种语言输出？', options: ['中文', 'English', '双语对照'] });
    await sleep(200);
    // F10 Artifact
    opts.onEvent({ type: 'artifact', artifact: {
      id: randomUUID(), name: 'summary.md', kind: 'markdown', language: 'markdown',
      content: '# 摘要\n\n来自 kmaster-studio（Mock）的示例产出。\n\n- 关键词：**' + opts.message.slice(0, 20) + '**\n- 生成时间：' + new Date().toLocaleString() + '\n',
    } });
    await sleep(100);

    // M4/F18：长会话（第 ≥3 轮）或触发词命中 → 合成压缩事件序列
    const withCompression = turn >= COMPRESSION_TURN_THRESHOLD || COMPRESSION_TRIGGER.test(opts.message);
    if (withCompression) await this.emitCompression(opts, turn);

    const answer =
      `这是来自 kmaster-studio（Mock 模式）的回复。\n\n` +
      `你说了：**${opts.message}**\n\n` +
      `（当前模式：${opts.mode ?? 'default'}）\n\n` +
      `1. 当前为演示数据流，已打通「发消息 → 计划卡 → 工具卡 → 授权卡 → 澄清卡 → Artifact → 正文」全链路。\n` +
      `2. 设置 \`HERMES_BRIDGE_MOCK=0\` 并将 Python bridge 连上真实 hermes-agent 后即为真实能力。\n` +
      `3. 前端布局与交互对齐 WorkBuddy（三栏 / 消息卡片 / 暗亮主题）。` +
      (withSubagents ? `\n4. 本轮已合成 2 个并行子代理事件序列（F16）。` : '') +
      (withCompression ? `\n5. 本轮已合成上下文压缩事件（F18，第 ${turn} 轮）。` : '');
    for (const ch of chunk(answer, 8)) {
      opts.onEvent({ type: 'message.delta', delta: ch });
      await sleep(18);
    }
    opts.onEvent({ type: 'usage.updated', input_tokens: 120, output_tokens: 180, cost: 0.0021 });
    opts.onEvent({ type: 'completed', text: answer });
    return { run_id: runId, text: answer };
  }

  async interrupt(): Promise<void> { await sleep(50); }
  async respondApproval(): Promise<void> { await sleep(10); }
  async respondClarify(): Promise<void> { await sleep(10); }
  async respondPlan(): Promise<void> { await sleep(10); }
  async steer(): Promise<void> { await sleep(20); }
  async destroy(): Promise<void> { await sleep(10); }
  async getSessionTitle(_sessionId: string): Promise<string> { return '新会话'; }

  async contextEstimate(_sessionId: string, opts: ContextEstimateOptions): Promise<ContextEstimate> {
    return estimateContext(opts);
  }
}

// ───────────────────────── Real (TCP → Python bridge) ─────────────────────────
class RealBridge implements Bridge {
  private endpoint = process.env.HERMES_AGENT_BRIDGE_ENDPOINT ?? 'tcp://127.0.0.1:16765';
  /**
   * F15/R8：按 sessionId 路由的连接表。
   * 此前用单例 `this.sock`，并发会话下 interrupt/steer/审批一律发往「最后建连的会话」；
   * 行缓冲同理不可全局共享，故已下沉为 `chat()` 内的局部变量。
   */
  private socks = new Map<string, net.Socket>();

  private connect(): Promise<net.Socket> {
    const url = new URL(this.endpoint);
    const port = Number(url.port || 16765);
    const host = url.hostname || '127.0.0.1';
    return new Promise((resolve, reject) => {
      const s = net.connect(port, host, () => {
        s.setKeepAlive(true, 30_000);  // T04: TCP keepalive every 30s
        resolve(s);
      });
      s.on('error', reject);
    });
  }

  async chat(opts: ChatOptions): Promise<{ run_id: string; text: string }> {
    const sock = await this.connect();
    this.socks.set(opts.sessionId, sock);
    // 行缓冲必须是 run 级局部变量：并发 chat 共享缓冲会互相截断半行 JSON
    let buf = '';
    let full = '';
    /** T04: bridge 回传的 runId（run.started 事件中），优先使用；超时退回落本地 UUID */
    let bridgeRunId = '';
    /** 释放该会话连接（幂等）：只有仍是自己那条 socket 时才摘表，避免误删重连后的新连接。 */
    const release = () => {
      if (this.socks.get(opts.sessionId) === sock) this.socks.delete(opts.sessionId);
      try { sock.destroy(); } catch { /* ignore */ }
    };
    try {
      await new Promise<void>((resolve, reject) => {
        let settled = false;
        const done = () => { if (!settled) { settled = true; resolve(); } };
        const fail = (err: Error) => { if (!settled) { settled = true; reject(err); } };
        // 连接异常/对端提前关闭：不能悬挂，否则该会话永远停在 running
        sock.on('error', fail);
        sock.on('close', () => fail(new Error('hermes bridge connection closed before completed')));
        sock.on('data', (d) => {
          buf += d.toString();
          let idx: number;
          while ((idx = buf.indexOf('\n')) >= 0) {
            const line = buf.slice(0, idx).trim();
            buf = buf.slice(idx + 1);
            if (!line) continue;
            try {
              const ev = JSON.parse(line) as BridgeEvent & { type: string };
              // T04: capture bridge-assigned runId
              if (ev.type === 'run.started' && (ev as any).runId) {
                bridgeRunId = (ev as any).runId;
              }
              // T04: error events also end the run (prevents permanent hang)
              if (ev.type === 'error') {
                full = ((ev as any).message || (ev as any).code || 'bridge error');
                opts.onEvent(ev);
                done();
                return;
              }
              // M4：subagent.* / compression.* 无需特殊处理，行协议天然透传给 onEvent
              if (ev.type === 'completed') { full = (ev as any).text; done(); }
              else opts.onEvent(ev);
            } catch { /* ignore malformed */ }
          }
        });
        sock.write(JSON.stringify({ action: 'chat', sessionId: opts.sessionId, message: opts.message, model: opts.model, mode: opts.mode, profile: opts.profile, instructions: opts.instructions }) + '\n');
      });
    } finally {
      // completed / error / 异常 / 对端断开 —— 任一路径都摘表，杜绝 Map 泄漏与串台
      release();
    }
    return { run_id: bridgeRunId || randomUUID(), text: full };
  }

  async interrupt(sessionId: string): Promise<void> { this.send(sessionId, { action: 'interrupt', sessionId }); }
  async steer(sessionId: string, text: string): Promise<void> { this.send(sessionId, { action: 'steer', sessionId, text }); }
  async destroy(sessionId: string): Promise<void> {
    this.send(sessionId, { action: 'destroy', sessionId });
    // Clean up socket after destroy
    const sock = this.socks.get(sessionId);
    if (sock) {
      this.socks.delete(sessionId);
      try { sock.destroy(); } catch { /* ignore */ }
    }
  }
  async getSessionTitle(sessionId: string): Promise<string> {
    this.send(sessionId, { action: 'title', sessionId });
    return '会话'; // Python bridge 异步回传标题时由 run-chat 另行 emit
  }
  async respondApproval(sessionId: string, approvalId: string, choice: string): Promise<void> { this.send(sessionId, { action: 'approval.respond', sessionId, approvalId, choice }); }
  async respondClarify(sessionId: string, clarifyId: string, response: string): Promise<void> { this.send(sessionId, { action: 'clarify.respond', sessionId, clarifyId, response }); }
  async respondPlan(sessionId: string, planId: string, choice: string): Promise<void> { this.send(sessionId, { action: 'plan.respond', sessionId, planId, choice }); }

  /**
   * F18：向 Python bridge 请求真实上下文分解（context_breakdown）。
   * 2s 内无有效响应即回退本地字符/4 估算，保证 REST 始终可用（O-5 兜底）。
   */
  async contextEstimate(sessionId: string, opts: ContextEstimateOptions): Promise<ContextEstimate> {
    const fallback = () => estimateContext(opts);
    let sock: net.Socket;
    try {
      sock = await this.connect();
    } catch {
      return fallback();
    }
    return new Promise<ContextEstimate>((resolve) => {
      let buf = '';
      let settled = false;
      const finish = (value: ContextEstimate) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try { sock.destroy(); } catch { /* ignore */ }
        resolve(value);
      };
      const timer = setTimeout(() => finish(fallback()), 2000);
      sock.on('error', () => finish(fallback()));
      sock.on('close', () => finish(fallback()));
      sock.on('data', (d) => {
        buf += d.toString();
        let idx: number;
        while ((idx = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, idx).trim();
          buf = buf.slice(idx + 1);
          if (!line) continue;
          try {
            const payload = JSON.parse(line) as Partial<ContextEstimate> & { type?: string };
            if (typeof payload?.context_used === 'number' && typeof payload?.context_max === 'number') {
              const max = payload.context_max || getModelContextWindow(opts.model);
              finish({
                context_used: payload.context_used,
                context_max: max,
                context_percent: payload.context_percent
                  ?? (max > 0 ? Math.round((payload.context_used / max) * 1000) / 10 : 0),
                estimated_total: payload.estimated_total,
                model: payload.model ?? opts.model ?? '',
                categories: payload.categories,
                estimated: true,
              });
              return;
            }
          } catch { /* ignore malformed */ }
        }
      });
      sock.write(JSON.stringify({ action: 'context.estimate', sessionId, model: opts.model }) + '\n');
    });
  }

  /**
   * F15/R8：只写该会话自己的连接。
   * 会话无在跑的 run（Map 无键）时静默丢弃 —— 与原先「写到最后一条 socket」相比，
   * 宁可不发也绝不串台到别的会话。
   */
  private send(sessionId: string, obj: unknown): void {
    this.socks.get(sessionId)?.write(JSON.stringify(obj) + '\n');
  }
}

export function createBridge(): Bridge {
  const mock = process.env.HERMES_BRIDGE_MOCK === '1';
  return mock ? new MockBridge() : new RealBridge();
}

function chunk(s: string, n: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < s.length; i += n) out.push(s.slice(i, i + n));
  return out;
}
