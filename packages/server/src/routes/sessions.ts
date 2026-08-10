// 会话 REST：kmaster.db 本地索引（M1 子集）+ M3 枚举/上传/设置/MCP 管理面
import Router from '@koa/router';
import path from 'node:path';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { db, parseJsonArrayColumn, resolveTriStateFlag } from '../db.js';
import type { SessionFlagsPatch, SessionRow, Store } from '../db.js';
import type { SessionSummary } from '../protocol.js';
import {
  getSettings,
  setSettings,
  probeHealth,
} from '../hermes-proxy.js';
import { getContextEstimate } from '../run-chat.js';
// M5/F21：/api/health 的终端诊断字段来自 F20 的 TerminalManager（路由层合流，
// hermes-proxy 刻意不依赖 services/terminal）
import { terminalManager } from '../services/terminal.js';
import { failWith, notFound } from './error.js';
// T02/U-19：会话真源切换到 hermes state.db
import { querySessions, querySessionMessages, sessionCount, closeStateDb } from '../services/hermes/read/state-db.js';

export const sessionsRouter = new Router();

/**
 * M5/FR21.8：♻️ 扩展既有 `/api/health`（🚫 不新建诊断端点）。
 * 返回 `HealthInfo`：version / port / bridge_mock / hermes_home / python_ok /
 * hermes_cli_ok / terminal_available / node_pty_error / db_kind / db_error。
 * ⚠️ 诊断端点必须永不 5xx —— 任何探测失败都退化为 M1 的最小响应体，保证存活探针可用。
 */
sessionsRouter.get('/api/health', async (ctx) => {
  try {
    const health = await probeHealth();
    const term = terminalManager.getInfo();
    health.terminal_available = term.available;
    if (term.error) health.node_pty_error = term.error;
    ctx.body = health;
  } catch {
    ctx.body = { ok: true, service: 'kmaster-server', ts: Date.now() };
  }
});

// ——— F19 上传（JSON base64 落盘）———
sessionsRouter.post('/api/upload', async (ctx) => {
  const b = ctx.request.body as any;
  const sid = b?.session_id;
  const filename = b?.filename;
  const contentB64 = b?.content_base64;
  if (!sid || !filename || !contentB64) {
    ctx.status = 400;
    ctx.body = { error: 'session_id, filename and content_base64 required' };
    return;
  }
  // 防目录穿越：仅取 basename
  const safeName = path.basename(String(filename));
  const root = process.env.KMASTER_STUDIO_HOME
    ?? path.resolve(process.env.USERPROFILE ?? process.env.HOME ?? '.', '.kmaster-studio');
  const dir = path.join(root, 'uploads', String(sid));
  fs.mkdirSync(dir, { recursive: true });
  const absPath = path.join(dir, safeName);
  const buf = Buffer.from(String(contentB64), 'base64');
  fs.writeFileSync(absPath, buf);
  const upload = {
    filename: safeName,
    path: absPath,
    size: buf.length,
    created_at: Date.now(),
  };
  ctx.body = { upload };
});

// ——— 全局设置 ———
// M5/FR21.9：透传新增字段 theme / locale / terminal_cwd（全部可选，未传即保持原值）。
// `active_profile` 是只读镜像，写入一律走 `PUT /api/profiles/active`，此处刻意不接受。
sessionsRouter.get('/api/settings', async (ctx) => {
  ctx.body = { settings: await getSettings() };
});
sessionsRouter.put('/api/settings', async (ctx) => {
  const b = ctx.request.body as any;
  ctx.body = {
    settings: await setSettings({
      default_mode: b?.default_mode,
      default_model: b?.default_model,
      theme: b?.theme,
      locale: b?.locale,
      terminal_cwd: b?.terminal_cwd,
    }),
  };
});

// ═══════════════════ B-01/B-02/B-03：会话双真源合并（D1）═══════════════════
// 会话主字段真源是 hermes `state.db`（只读），但 `skills`/`mcpServers` 在那边无处存放（F4），
// `pinned` 虽有字段却无写通道（U2 自查：`services/hermes/write/` 下只有
// agents / config-yaml / cron / skills-install，**没有 session 写能力**）。
// 因此这三者统一落 kmaster.db 侧车列，读时以 id 为键 left-join 回 state.db 结果。
//
// ⚠️ pinned / archived 采用**三态覆盖**（主理人 Q1 裁定）：
//   kmaster 侧车列 NULL = 未覆盖 → 回落 hermes 值；0/1 = 用户显式覆盖。
//   这样既保证用户操作可逆（能取消置顶），又不会因 run-chat 建行时写 0
//   而把 hermes 侧已有的 pinned=1 静默压平。求值统一走 resolveTriStateFlag()。

/** hermes state.db 会话行的最小结构约束（只取合并需要的字段）。 */
interface HermesSessionLike {
  id: string;
  title?: string | null;
  archived?: number | null;
  pinned?: number | null;
  cwd?: string | null;
  profile_name?: string | null;
  started_at?: number | null;
  ended_at?: number | null;
  message_count?: number | null;
  model?: string | null;
  source?: string | null;
}

/**
 * 把 hermes 主行 + kmaster 侧车行合并为对外的会话出参（camelCase 化）。
 * 任一侧可缺席：纯 hermes 会话（尚未被 KMaster 触碰）与纯 kmaster 会话（内存态/旧数据）都要能出。
 */
function mergeSession(hs: HermesSessionLike | undefined, km: SessionRow | undefined): SessionSummary {
  const id = hs?.id ?? km?.id ?? '';
  const createdAt = hs?.started_at ?? km?.created_at ?? 0;
  const updatedAt = hs?.ended_at ?? hs?.started_at ?? km?.updated_at ?? createdAt;
  return {
    id,
    title: hs?.title || km?.title || '',
    // §7.1：archived 因历史原因出参保持 number（0/1），**不要**改成 boolean。
    // 三态：archived_override 为 NULL 时回落「hermes 值 OR legacy archived 列」。
    // ⚠️ 这里必须是 OR 而**不能**写成 `hs?.archived ?? km?.archived`：
    //   hermes 侧的 archived=0 是非 nullish，会把 legacy 列直接短路掉，
    //   导致「中间版本用 UPDATE sessions SET archived=1 归档过的会话」在出参里
    //   复活成未归档 —— 而 listSessions 的 COALESCE(archived_override, archived, 0)
    //   仍然认为它已归档，两套口径就此漂移。
    archived: resolveTriStateFlag(km?.archived_override, (hs?.archived || km?.archived) ? 1 : 0) ? 1 : 0,
    // pinned 是新增字段，出参 boolean。三态：侧车 NULL 时回落 hermes 的 pinned。
    pinned: resolveTriStateFlag(km?.pinned, hs?.pinned),
    workspace: hs?.cwd || km?.workspace || '',
    profile: hs?.profile_name || km?.profile || '',
    // 会话级模型覆盖优先于 hermes 记录值。
    model: km?.model || hs?.model || '',
    source: hs?.source || (km ? 'kmaster' : 'unknown'),
    mode: km?.mode ?? null,
    created_at: createdAt,
    updated_at: updatedAt,
    message_count: hs?.message_count ?? 0,
    // §7.1：JSON 数组列解析失败静默回落 []，不得中断整个列表接口。
    skills: parseJsonArrayColumn(km?.skills),
    mcpServers: parseJsonArrayColumn(km?.mcp_servers),
    // T02：会话绑定的 Agent。优先 kmaster.db（创建时指定），回落 hermes profile_name
    agent: km?.agent ?? hs?.profile_name ?? null,
  };
}

/**
 * 确保 kmaster.db 侧车行存在。
 * PATCH pinned/archived/skills 前必须调用它，否则 UPDATE 会打在不存在的行上（静默无效）。
 *
 * ⚠️ 这里**刻意不 seed** hermes 的 pinned/archived：三态语义下侧车 NULL 已能正确
 * 回落 hermes 值，若在建行时写入 0/1 反而会把「回落态」固化成「显式覆盖」，
 * 之后 hermes 侧的变更就再也传导不过来了。
 */
function ensureSidecarRow(store: Store, id: string, hs: HermesSessionLike | undefined): SessionRow | undefined {
  const existing = store.getSession(id);
  if (existing) return existing;
  if (!hs) return undefined;
  const created = store.getOrCreateSession(id, hs.profile_name ?? undefined, hs.cwd ?? null);
  if (hs.title) store.renameSession(id, hs.title);
  return store.getSession(id) ?? created;
}

/** 从请求体里取 skills 数组（只接受 string[]，其余一律视为「未提供」）。 */
function pickStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((x): x is string => typeof x === 'string' && x.trim() !== '');
}

sessionsRouter.get('/api/sessions', async (ctx) => {
  // U-19: 读 hermes state.db（真源），侧车字段（mode/model/skills/mcp/pinned）从 kmaster.db 补。
  const hermesSessions = querySessions();
  const store = await db();
  // A5：**单次批量查库**，禁止在 map 里逐条 getSession（N+1）。
  const kmRows = store.getSessionsByIds(hermesSessions.map((s) => s.id));
  const kmById = new Map<string, SessionRow>(kmRows.map((r) => [r.id, r]));
  const sessions = hermesSessions.map((s) => mergeSession(s as HermesSessionLike, kmById.get(s.id)));
  ctx.body = { sessions, count: sessions.length, source: 'state.db' };
});

sessionsRouter.post('/api/sessions', async (ctx) => {
  const store = await db();
  const body = (ctx.request.body as any) ?? {};
  const id = String(body.id ?? randomUUID());
  const profile = body.profile;
  // V3/#19：创建会话时即可指定 workspace（web 模式用户在对话框中粘贴路径）。
  // 传 null/'' 与不传效果一致——留给 getOrCreateSession 归一化。
  const workspace = body.workspace ?? null;
  // T02：传入 Agent ID（若前端在 createSession 或 createSessionWithConfig 中指定）
  const agent = typeof body.agent === 'string' ? body.agent : null;
  store.getOrCreateSession(id, profile, workspace, agent);

  // B-01（A4）：skills / mcp_servers 落库。入参双写兼容——
  // 客户端 createSessionWithConfig() 现在发的是 snake_case 的 mcp_servers（F5）。
  const skills = pickStringArray(body.skills);
  const mcpServers = pickStringArray(body.mcpServers) ?? pickStringArray(body.mcp_servers);
  if (skills !== undefined || mcpServers !== undefined) {
    store.setSessionSkillsMcp(id, skills, mcpServers);
  }
  // 契约 §3.3：POST 亦支持 title / mode / model（此前被静默丢弃）。
  if (typeof body.title === 'string' && body.title.trim()) store.renameSession(id, body.title);
  if (body.mode !== undefined || body.model !== undefined) {
    const cur = store.getSession(id);
    store.setSessionModeModel(
      id,
      body.mode !== undefined ? body.mode ?? null : cur?.mode ?? null,
      body.model !== undefined ? body.model ?? null : cur?.model ?? null
    );
  }

  const hs = querySessions().find((s) => s.id === id) as HermesSessionLike | undefined;
  ctx.body = { ok: true, session: mergeSession(hs, store.getSession(id)) };
});

sessionsRouter.get('/api/sessions/:id', async (ctx) => {
  // U-19: 优先从 state.db 读，kmaster.db 补侧车字段
  const id = ctx.params.id;
  const hs = querySessions().find((s) => s.id === id) as HermesSessionLike | undefined;
  const store = await db();
  const km = store.getSession(id);
  if (!hs && !km) {
    ctx.status = 404;
    ctx.body = { ok: false, error: 'session_not_found', message: `会话 ${id} 不存在` };
    return;
  }
  ctx.body = { session: mergeSession(hs, km) };
});

/**
 * V3/#19 + B-01/B-02/B-03：会话局部更新。
 * - title：改名。
 * - mode/model：每会话覆盖（继承自全局默认）。**部分更新**——只传 mode 不会把 model 抹成 null。
 * - workspace：每会话工作目录（绑终端 cwd，web 模式作为文件上下文锚点）。
 * - agent：T04/CH-D 会话绑定的 Agent 角色（kmaster.db 侧车列，null/'' 解除绑定）。
 * - skills / mcpServers（亦接受 mcp_servers）：B-01 侧车列。
 * - pinned / archived：B-02 / B-03，boolean 入参，落库 0/1。
 *
 * 实现：保留既有 PATCH（部分更新语义），并新增 PUT 作为同一语义的别名。
 * 这样既不破坏现有调用方，又满足「PUT /api/sessions/:id 接受 workspace」的契约。
 *
 * @returns 实际命中的合法字段数；为 0 时调用方应返回 400 `no_valid_field`。
 */
function applySessionPatch(store: Store, id: string, body: any): number {
  let hits = 0;
  if (body?.title !== undefined) { store.renameSession(id, String(body.title)); hits++; }
  if (body?.mode !== undefined || body?.model !== undefined) {
    // 修正历史缺陷：此前无条件写 `body.model ?? null`，导致「只改 mode」会把 model 清空。
    const cur = store.getSession(id);
    const nextMode = body.mode !== undefined ? body.mode ?? null : cur?.mode ?? null;
    const nextModel = body.model !== undefined ? body.model ?? null : cur?.model ?? null;
    store.setSessionModeModel(id, nextMode, nextModel);
    hits++;
  }
  if (body?.workspace !== undefined) {
    // body.workspace === null 或 '' 视为「清空工作区」。
    store.setSessionWorkspace(id, body.workspace ?? null);
    hits++;
  }
  // —— T04/CH-D：agent 角色（只写 kmaster.db 侧车列，🚫 绝不写 hermes state.db）——
  // null / '' / 非字符串 一律归一为「解除绑定」，出参 mergeSession() 随即回落
  // hermes 的 profile_name；不传该键则完全不动（与 workspace 同一部分更新语义）。
  if (body?.agent !== undefined) {
    store.setSessionAgent(id, typeof body.agent === 'string' ? body.agent : null);
    hits++;
  }
  // —— B-01：skills / mcpServers（双写兼容 snake_case）——
  const skills = pickStringArray(body?.skills);
  const mcpServers = pickStringArray(body?.mcpServers) ?? pickStringArray(body?.mcp_servers);
  if (skills !== undefined || mcpServers !== undefined) {
    store.setSessionSkillsMcp(id, skills, mcpServers);
    hits++;
  }
  // —— B-02 / B-03：pinned / archived（U2 分支：写 kmaster.db 侧车，三态）——
  // 入参 true/false → 显式覆盖；显式传 null → 清除覆盖回落 hermes；不传 → 不动。
  const flags: SessionFlagsPatch = {};
  const readFlag = (raw: unknown): boolean | null | undefined => {
    if (raw === null) return null;
    if (typeof raw === 'boolean') return raw;
    if (typeof raw === 'number') return raw !== 0;
    return undefined;
  };
  const nextPinned = readFlag(body?.pinned);
  if (nextPinned !== undefined) { flags.pinned = nextPinned; hits++; }
  const nextArchived = readFlag(body?.archived);
  if (nextArchived !== undefined) { flags.archived = nextArchived; hits++; }
  if (flags.pinned !== undefined || flags.archived !== undefined) store.setSessionFlags(id, flags);
  return hits;
}

/** PATCH / PUT 共用处理体（两者语义完全一致，PUT 仅为路由别名）。 */
async function handleSessionPatch(ctx: any): Promise<void> {
  const id = ctx.params.id as string;
  const body = (ctx.request.body as any) ?? {};
  const store = await db();
  const hs = querySessions().find((s) => s.id === id) as HermesSessionLike | undefined;
  const km = ensureSidecarRow(store, id, hs);
  if (!hs && !km) {
    ctx.status = 404;
    ctx.body = { ok: false, error: 'session_not_found', message: `会话 ${id} 不存在` };
    return;
  }
  const hits = applySessionPatch(store, id, body);
  if (hits === 0) {
    ctx.status = 400;
    ctx.body = { ok: false, error: 'no_valid_field', message: '补丁体不含任何可更新字段' };
    return;
  }
  ctx.body = { ok: true, session: mergeSession(hs, store.getSession(id)) };
}

sessionsRouter.patch('/api/sessions/:id', handleSessionPatch);

// PUT 作为 PATCH 的别名：与 V3/#19 文档契约对齐（不引入新的语义面，仅路由层别名）。
sessionsRouter.put('/api/sessions/:id', handleSessionPatch);

sessionsRouter.delete('/api/sessions/:id', async (ctx) => {
  const store = await db();
  store.deleteSession(ctx.params.id);
  ctx.body = { ok: true };
});

sessionsRouter.get('/api/sessions/:id/messages', async (ctx) => {
  // U-19: 读 state.db 消息（真源）
  const msgs = querySessionMessages(ctx.params.id);
  if (msgs.length > 0) {
    ctx.body = { messages: msgs.map(m => ({
      id: String(m.id),
      session_id: m.session_id,
      role: m.role,
      content: m.content || '',
      created_at: m.timestamp,
      reasoning: m.reasoning_content || undefined,
      tool_calls: m.tool_calls ? JSON.parse(m.tool_calls) : undefined,
      tool_name: m.tool_name || undefined,
      token_count: m.token_count,
      finish_reason: m.finish_reason || undefined,
    })) };
    return;
  }
  // 回落 kmaster.db（兼容旧数据迁移期）
  const store = await db();
  ctx.body = { messages: store.getMessages(ctx.params.id) };
});

// ——— F22 上下文长度估算 ———
// 结果带进程内缓存，run 结束 / compression 事件后由 run-chat 主动失效；
// 传 ?force=1 可强制重算（前端「刷新」按钮用）。
sessionsRouter.get('/api/sessions/:id/context-length', async (ctx) => {
  const store = await db();
  if (!store.getSession(ctx.params.id)) {
    notFound(ctx, `session ${ctx.params.id} not found`);
    return;
  }
  const q = ctx.query.force;
  const force = q === '1' || q === 'true';
  try {
    ctx.body = await getContextEstimate(ctx.params.id, force);
  } catch (err) {
    failWith(ctx, err);
  }
});

// —— P1 #18：会话导出 Markdown ——
sessionsRouter.get('/api/sessions/:id/export', async (ctx) => {
  const store = await db();
  const session = store.getSession(ctx.params.id);
  if (!session) {
    notFound(ctx, `session ${ctx.params.id} not found`);
    return;
  }
  const messages = store.getMessages(ctx.params.id);

  // 组装 Markdown
  const lines: string[] = [];
  lines.push(`# ${session.title}`);
  lines.push('');
  lines.push(`> 导出时间：${new Date().toISOString().slice(0, 19).replace('T', ' ')}`);
  lines.push(`> 消息数：${messages.length}`);
  lines.push('');

  for (const msg of messages) {
    const roleLabel = msg.role === 'user' ? '🧑 用户' : msg.role === 'assistant' ? '🤖 助手' : msg.role;
    const time = new Date(msg.created_at).toISOString().slice(0, 19).replace('T', ' ');
    lines.push(`### ${roleLabel} — ${time}`);
    lines.push('');
    if (msg.guidance) {
      lines.push(`> *(引导消息)*`);
      lines.push('');
    }
    lines.push(msg.content || '*(空消息)*');
    lines.push('');
    if (msg.usage_json) {
      try {
        const usage = JSON.parse(msg.usage_json);
        if (usage.input_tokens || usage.output_tokens) {
          lines.push(`> tokens：输入 ${usage.input_tokens ?? 0} / 输出 ${usage.output_tokens ?? 0}`);
          lines.push('');
        }
      } catch { /* ignore malformed JSON */ }
    }
    lines.push('---');
    lines.push('');
  }

  const markdown = lines.join('\n');
  const filename = `${(session.title || '会话').replace(/[\\/:*?"<>|]/g, '_').slice(0, 60)}.md`;

  ctx.set('Content-Type', 'text/markdown; charset=utf-8');
  ctx.set('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
  ctx.body = markdown;
});
