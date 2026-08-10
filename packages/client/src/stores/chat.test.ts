// M1 单元测试：chat store 纯 reducer（dispatch 把 WS 事件聚合为消息流状态）
// 不依赖真实 socket / DOM，直接驱动 dispatch 验证状态机正确性。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useChatStore } from './chat';
import { startRun } from '../api/hermes/chat';

// M3 管理面 REST 封装全部 mock（避免真实 fetch / python 子进程）
vi.mock('../api/client', () => {
  const models = [{ provider: 'p', label: 'Provider', models: [{ id: 'm1', name: 'Model1', provider: 'p' }] }];
  const skills = [{ name: 's1', category: 'c1', description: 'desc', enabled: true }];
  const servers = [{ name: 'mc', command: 'npx', status: 'unknown' as const }];
  return {
    http: vi.fn().mockResolvedValue({ ok: true }),
    // getModels 返回 ModelsResponse（{ providers, usage }），store 取 res.providers；
    // 旧 mock 直接回裸数组导致 res.providers === undefined
    getModels: vi.fn().mockResolvedValue({ providers: models, usage: {} }),
    // ST-01：getSkills 返回 { installed, candidates, categories } 三段对象，
    // 🚫 不是裸数组（旧 mock 回数组会掩盖 store 侧 `.installed` 取值错误）
    getSkills: vi.fn().mockResolvedValue({ installed: skills, candidates: [], categories: ['c1'] }),
    getMcp: vi.fn().mockResolvedValue(servers),
    postMcp: vi.fn().mockImplementation((server: any) => Promise.resolve([...servers, { name: server.name, command: server.command, status: 'unknown' as const }])),
    deleteMcp: vi.fn().mockResolvedValue(undefined),
    uploadFile: vi.fn().mockImplementation((_sid: string, filename: string) => Promise.resolve({ filename, path: '/up/' + filename, size: 3, created_at: 1 })),
    getSettings: vi.fn().mockResolvedValue({ default_mode: 'default', default_model: '' }),
    putSettings: vi.fn().mockImplementation((b: any) => Promise.resolve({ default_mode: b.default_mode, default_model: b.default_model })),
  };
});
vi.mock('../api/hermes/chat', async () => {
  const actual = await vi.importActual<typeof import('../api/hermes/chat')>('../api/hermes/chat');
  return { ...actual, startRun: vi.fn(), invokeSkill: vi.fn() };
});

const SID = 'test-session-1';
const MID = 'assistant-msg-1';

beforeEach(() => {
  setActivePinia(createPinia());
});

describe('chat store reducer — 消息流聚合', () => {
  it('run.started 进入 running，run.completed 回到 idle', () => {
    const s = useChatStore();
    s.dispatch('run.started', { run_id: 'r1', session_id: SID });
    expect(s.runState[SID]).toBe('running');
    s.dispatch('run.completed', { session_id: SID, message_id: MID, message: 'x', usage: {} });
    expect(s.runState[SID]).toBe('idle');
  });

  it('message.delta 多次累加进同一条 assistant 消息', () => {
    const s = useChatStore();
    s.dispatch('run.started', { run_id: 'r1', session_id: SID });
    s.dispatch('message.delta', { session_id: SID, message_id: MID, delta: '你好' });
    s.dispatch('message.delta', { session_id: SID, message_id: MID, delta: '世界' });
    const msg = s.messagesBySession[SID].find((m) => m.id === MID)!;
    expect(msg.content).toBe('你好世界');
    expect(s.messagesBySession[SID].filter((m) => m.role === 'assistant').length).toBe(1);
  });

  it('reasoning.delta 折叠进 reasoning 字段', () => {
    const s = useChatStore();
    s.dispatch('reasoning.delta', { session_id: SID, message_id: MID, delta: '思考' });
    s.dispatch('reasoning.delta', { session_id: SID, message_id: MID, delta: '中…' });
    const msg = s.messagesBySession[SID].find((m) => m.id === MID)!;
    expect(msg.reasoning).toBe('思考中…');
  });

  it('tool.started + tool.completed 生成 done 工具卡（带结果）', () => {
    const s = useChatStore();
    s.dispatch('tool.started', { session_id: SID, message_id: MID, tool: 'web_search', args: { q: 'kmaster' } });
    s.dispatch('tool.completed', { session_id: SID, message_id: MID, tool: 'web_search', result: { hits: 5 } });
    const msg = s.messagesBySession[SID].find((m) => m.id === MID)!;
    expect(msg.toolCalls).toHaveLength(1);
    const t = msg.toolCalls![0];
    expect(t.tool).toBe('web_search');
    expect(t.status).toBe('done');
    expect(t.result).toEqual({ hits: 5 });
    expect(t.args).toEqual({ q: 'kmaster' });
  });

  it('tool.failed 标记 error 状态', () => {
    const s = useChatStore();
    s.dispatch('tool.started', { session_id: SID, message_id: MID, tool: 'fs_read' });
    s.dispatch('tool.failed', { session_id: SID, message_id: MID, tool: 'fs_read', error: 'ENOENT' });
    const t = s.messagesBySession[SID].find((m) => m.id === MID)!.toolCalls![0];
    expect(t.status).toBe('error');
    expect(t.error).toBe('ENOENT');
  });

  it('guidance 的 message.delta 作为用户消息追加（steer 场景）', () => {
    const s = useChatStore();
    s.dispatch('message.delta', { session_id: SID, message_id: 'guid-1', delta: '换个思路', guidance: true });
    const m = s.messagesBySession[SID].find((x) => x.id === 'guid-1')!;
    expect(m.role).toBe('user');
    expect(m.guidance).toBe(true);
    expect(m.content).toBe('换个思路');
  });

  it('usage.updated 记录到 usageBySession', () => {
    const s = useChatStore();
    s.dispatch('usage.updated', { session_id: SID, input_tokens: 120, output_tokens: 180, cost: 0.0021 });
    expect(s.usageBySession[SID]).toEqual({ input_tokens: 120, output_tokens: 180, cost: 0.0021 });
  });

  it('approval 请求/解决 生命周期', () => {
    const s = useChatStore();
    s.dispatch('approval.requested', { session_id: SID, approval_id: 'a1', tool: 'fs_write', args: {} });
    expect(s.pendingApprovals[SID]).toHaveLength(1);
    s.dispatch('approval.resolved', { session_id: SID, approval_id: 'a1' });
    expect(s.pendingApprovals[SID] ?? []).toHaveLength(0);
  });

  it('clarify 请求/解决 生命周期', () => {
    const s = useChatStore();
    s.dispatch('clarify.requested', { session_id: SID, clarify_id: 'c1', question: '选哪个?', options: ['A', 'B'] });
    expect(s.pendingClarifies[SID]).toHaveLength(1);
    s.dispatch('clarify.resolved', { session_id: SID, clarify_id: 'c1' });
    expect(s.pendingClarifies[SID] ?? []).toHaveLength(0);
  });

  it('abort 状态机：aborting → idle', () => {
    const s = useChatStore();
    s.dispatch('run.started', { run_id: 'r1', session_id: SID });
    s.dispatch('abort.started', { session_id: SID });
    expect(s.runState[SID]).toBe('aborting');
    s.dispatch('abort.completed', { session_id: SID });
    expect(s.runState[SID]).toBe('idle');
  });

  it('session.title.updated 更新 sessions 列表标题', () => {
    const s = useChatStore();
    s.sessions.push({ id: SID, title: '旧标题', created_at: 1, updated_at: 1, archived: 0 } as any);
    s.dispatch('session.title.updated', { session_id: SID, title: '新标题' });
    expect(s.sessions.find((x) => x.id === SID)!.title).toBe('新标题');
  });

  it('缺少 session_id 的事件被忽略（守卫）', () => {
    const s = useChatStore();
    s.dispatch('message.delta', { message_id: MID, delta: 'x' } as any);
    expect(s.messagesBySession[SID]).toBeUndefined();
  });

  it('plan 请求/解决 生命周期', () => {
    const s = useChatStore();
    s.dispatch('plan.requested', { session_id: SID, plan_id: 'p1', title: '计划', steps: ['a', 'b'] });
    expect(s.pendingPlans[SID]).toHaveLength(1);
    s.dispatch('plan.resolved', { session_id: SID, plan_id: 'p1' });
    expect(s.pendingPlans[SID] ?? []).toHaveLength(0);
  });

  it('artifact.created 入栈并在 updated 时按 id 替换', () => {
    const s = useChatStore();
    s.dispatch('artifact.created', { session_id: SID, artifact: { id: 'f1', name: 'a.md', kind: 'markdown', content: 'v1' } });
    expect(s.artifactsBySession[SID]).toHaveLength(1);
    s.dispatch('artifact.updated', { session_id: SID, artifact: { id: 'f1', name: 'a.md', kind: 'markdown', content: 'v2' } });
    expect(s.artifactsBySession[SID]).toHaveLength(1);
    expect(s.artifactsBySession[SID][0].content).toBe('v2');
  });

  it('deleteSession 本地移除并清空消息', async () => {
    const s = useChatStore();
    s.sessions.push({ id: SID, title: 't', created_at: 1, updated_at: 1, archived: 0 } as any);
    s.messagesBySession[SID] = [{ id: 'm1', session_id: SID, role: 'user', content: 'hi', created_at: 1 } as any];
    s.activeSessionId = SID;
    await s.deleteSession(SID);
    expect(s.sessions.find((x) => x.id === SID)).toBeUndefined();
    expect(s.messagesBySession[SID]).toBeUndefined();
    expect(s.activeSessionId).toBeNull();
  });

  it('renameSession 本地更新标题', async () => {
    const s = useChatStore();
    s.sessions.push({ id: SID, title: '旧', created_at: 1, updated_at: 1, archived: 0 } as any);
    await s.renameSession(SID, '新标题');
    expect(s.sessions.find((x) => x.id === SID)!.title).toBe('新标题');
  });
});

describe('chat store M3 — 管理面（模式/模型/技能/MCP/上传/设置）', () => {
  it('setMode / setModel 更新每会话覆盖', () => {
    const s = useChatStore();
    s.activeSessionId = SID;
    s.setMode(SID, 'dont_ask');
    s.setModel(SID, 'm1');
    expect(s.modeBySession[SID]).toBe('dont_ask');
    expect(s.modelBySession[SID]).toBe('m1');
  });

  it('loadModels / loadSkills 填充枚举', async () => {
    const s = useChatStore();
    await s.loadModels();
    await s.loadSkills();
    expect(s.models.length).toBe(1);
    expect(s.models[0].models[0].id).toBe('m1');
    expect(s.skills.length).toBe(1);
    expect(s.skills[0].name).toBe('s1');
  });

  it('loadMcp / addMcp 维护 mcpServers', async () => {
    const s = useChatStore();
    await s.loadMcp();
    expect(s.mcpServers.length).toBe(1);
    await s.addMcp({ name: 'mc2', command: 'node' });
    expect(s.mcpServers.some((m) => m.name === 'mc2')).toBe(true);
  });

  it('uploadFile 推入待发送附件并生成 @引用路径', async () => {
    const s = useChatStore();
    s.activeSessionId = SID;
    const file = new File(['hello'], 'note.txt', { type: 'text/plain' });
    const ref = await s.uploadFile(SID, file);
    expect(ref.path).toContain('note.txt');
    expect((s.uploads[SID] ?? []).some((u) => u.filename === 'note.txt')).toBe(true);
  });

  it('sendMessage 携带 mode/model 并在末尾拼接 @引用（F8/F19）', async () => {
    const s = useChatStore();
    s.activeSessionId = SID;
    s.setMode(SID, 'accept_edits');
    s.setModel(SID, 'm1');
    s.uploads[SID] = [{ filename: 'note.txt', path: '/up/note.txt', size: 3, created_at: 1 }];
    await s.sendMessage('看这个文件');
    expect(startRun).toHaveBeenCalledWith(
      expect.objectContaining({ session_id: SID, mode: 'accept_edits', model: 'm1' })
    );
    const call = (startRun as any).mock.calls[0][0];
    expect(call.message).toContain('看这个文件');
    expect(call.message).toContain('@/up/note.txt');
    // 发出后清空待发送附件
    expect(s.uploads[SID]).toEqual([]);
  });

  it('globalSettings 读写（GET/PUT /api/settings）', async () => {
    const s = useChatStore();
    await s.loadGlobalSettings();
    expect(s.globalSettings.default_mode).toBe('default');
    await s.setGlobalSettings('dont_ask', 'm1');
    expect(s.globalSettings.default_mode).toBe('dont_ask');
    expect(s.globalSettings.default_model).toBe('m1');
  });

  it('invokeSkill 注入 /skill 触发语（零协议改动）', async () => {
    const s = useChatStore();
    s.activeSessionId = SID;
    // store 内 invokeSkill 调 api/hermes/chat 的 invokeSkill（已 mock）
    s.invokeSkill(SID, 's1');
    const { invokeSkill: apiInvoke } = await import('../api/hermes/chat');
    expect(apiInvoke).toHaveBeenCalledWith(SID, 's1');
  });
});

describe('chat store M4 — F17 队列 reducer（AC5）', () => {
  const mkItem = (
    id: string, sid: string, position: number, message = 'hi'
  ) => ({ id, session_id: sid, message, mode: 'default', model: 'm1', position, created_at: Date.now() });

  it('run.queued 追加排队项并按 position 升序排列', () => {
    const s = useChatStore();
    s.dispatch('run.queued', { session_id: SID, item: mkItem('q2', SID, 2) });
    s.dispatch('run.queued', { session_id: SID, item: mkItem('q1', SID, 1) });
    expect(s.queueBySession[SID]).toHaveLength(2);
    expect(s.queueBySession[SID].map((x) => x.id)).toEqual(['q1', 'q2']);
    expect(s.queuedTotal).toBe(2);
  });

  it('run.queued 同 id 幂等更新（不增重复项）', () => {
    const s = useChatStore();
    s.dispatch('run.queued', { session_id: SID, item: mkItem('q1', SID, 1) });
    s.dispatch('run.queued', { session_id: SID, item: mkItem('q1', SID, 1, 'updated') });
    expect(s.queueBySession[SID]).toHaveLength(1);
    expect(s.queueBySession[SID][0].message).toBe('updated');
  });

  it('queue.updated 用完整列表覆盖并按 position 排序', () => {
    const s = useChatStore();
    s.dispatch('queue.updated', {
      session_id: SID,
      items: [mkItem('q3', SID, 3), mkItem('q1', SID, 1), mkItem('q2', SID, 2)],
    });
    expect(s.queueBySession[SID].map((x) => x.id)).toEqual(['q1', 'q2', 'q3']);
  });

  it('queue.updated 空数组清空该会话队列', () => {
    const s = useChatStore();
    s.dispatch('run.queued', { session_id: SID, item: mkItem('q1', SID, 1) });
    s.dispatch('queue.updated', { session_id: SID, items: [] });
    expect(s.queueBySession[SID]).toHaveLength(0);
    expect(s.queuedTotal).toBe(0);
  });

  it('多会话队列独立归组，queuedTotal 跨会话求和', () => {
    const s = useChatStore();
    s.dispatch('run.queued', { session_id: SID, item: mkItem('q1', SID, 1) });
    s.dispatch('run.queued', { session_id: 'other-session', item: mkItem('q9', 'other-session', 1) });
    expect(s.queuedTotal).toBe(2);
    expect(s.queueBySession[SID]).toHaveLength(1);
    expect(s.queueBySession['other-session']).toHaveLength(1);
  });

  it('缺 item 的 run.queued 不污染状态', () => {
    const s = useChatStore();
    s.dispatch('run.queued', { session_id: SID } as any);
    expect(s.queueBySession[SID]).toBeUndefined();
  });
});

// ── V3/R-31：定时任务产物右栏联动（openJobArtifact 三档回落） ──
// 单测跑在 node 环境（无 window），桌面桥用 vi.stubGlobal 注入，用完即还原。
describe('chat store — 定时任务产物（R-31 / Q8）', () => {
  const RUN = {
    job_id: 'j1',
    job_name: '每日晨报',
    run_time: '2026-01-01 09:00',
    status: 'ok',
    mode: 'default',
    excerpt: '摘要回落文本',
    file: '/tmp/jobs/j1/2026-01-01.md',
  };

  /** 注入一个只实现 readTextFile 的最小桌面桥。 */
  function stubBridge(readTextFile: (path: string, maxBytes?: number) => Promise<string | null>): void {
    vi.stubGlobal('window', { kmasterDesktop: { isDesktop: true, readTextFile } });
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('打开产物即切右栏 job-artifact 态并带上原始运行记录', () => {
    const s = useChatStore();
    s.openJobArtifact({ ...RUN });
    expect(s.rightPanelMode).toBe('job-artifact');
    expect(s.jobArtifact?.run.job_name).toBe('每日晨报');
    expect(s.detailEntity).toBeNull();
    expect(s.editingRoleId).toBe('');
  });

  it('桌面端读到全文 → content 填充且 loading 收尾', async () => {
    stubBridge(vi.fn().mockResolvedValue('# 产物全文'));
    const s = useChatStore();
    s.openJobArtifact({ ...RUN });
    await vi.waitFor(() => expect(s.jobArtifact?.loading).toBe(false));
    expect(s.jobArtifact?.content).toBe('# 产物全文');
    expect(s.jobArtifact?.error).toBe('');
  });

  it('Web 端无文件桥 → 静默收敛为空内容（UI 回落 excerpt），不报错', async () => {
    const s = useChatStore();
    s.openJobArtifact({ ...RUN });
    await vi.waitFor(() => expect(s.jobArtifact?.loading).toBe(false));
    expect(s.jobArtifact?.content).toBe('');
    expect(s.jobArtifact?.error).toBe('');
  });

  it('桥读取失败（返回 null）→ 内容为空但不置错误态，UI 回落摘要', async () => {
    stubBridge(vi.fn().mockResolvedValue(null));
    const s = useChatStore();
    s.openJobArtifact({ ...RUN });
    await vi.waitFor(() => expect(s.jobArtifact?.loading).toBe(false));
    expect(s.jobArtifact?.content).toBe('');
    expect(s.jobArtifact?.error).toBe('');
  });

  it('run.file 为空时不发起读取，直接结束 loading', async () => {
    const readTextFile = vi.fn().mockResolvedValue('never');
    stubBridge(readTextFile);
    const s = useChatStore();
    s.openJobArtifact({ ...RUN, file: '' });
    await vi.waitFor(() => expect(s.jobArtifact?.loading).toBe(false));
    expect(readTextFile).not.toHaveBeenCalled();
    expect(s.jobArtifact?.content).toBe('');
  });

  it('读取返回前切换到另一条产物 → 旧结果被丢弃（防竞态）', async () => {
    let resolveFirst!: (v: string) => void;
    const pending = new Promise<string>((res) => {
      resolveFirst = res;
    });
    stubBridge(
      vi.fn().mockImplementation((path: string) =>
        path === RUN.file ? pending : Promise.resolve('第二条全文')
      )
    );
    const s = useChatStore();
    s.openJobArtifact({ ...RUN });
    s.openJobArtifact({ ...RUN, file: '/tmp/jobs/j1/2026-01-02.md' });
    await vi.waitFor(() => expect(s.jobArtifact?.content).toBe('第二条全文'));

    resolveFirst('第一条全文');
    await pending;
    await Promise.resolve();
    expect(s.jobArtifact?.content).toBe('第二条全文');
  });
});
