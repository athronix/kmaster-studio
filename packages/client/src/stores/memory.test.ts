// M4/T14 单测：memory store（F13 / AC2）
// 覆盖：列表加载与分组归集、服务端过滤（group/q）、新增、编辑（内容寻址 id 变化）、
//       409 stale_id 分支（刷新 + 可读错误）、删除返回备份路径、错误路径的 loading 复位。
// api/client 全量 mock：用一个内存假后端复刻服务端的「内容寻址 + § 条目」语义。
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useMemoryStore, MEMORY_GROUP_LABELS } from './memory';

/** vi.mock 工厂在模块顶层被提升，共享状态必须经 vi.hoisted 创建。 */
const backend = vi.hoisted(() => {
  class HttpError extends Error {
    status: number;
    code: string;
    body: unknown;
    constructor(status: number, code: string, message: string, body: unknown = null) {
      super(message);
      this.name = 'HttpError';
      this.status = status;
      this.code = code;
      this.body = body;
    }
  }
  interface Entry { id: string; group: 'memory' | 'user'; content: string; index: number; updated_at: number }
  /** 与服务端 sha1(content).slice(0,8) 等价的稳定短哈希（测试内自洽即可）。 */
  const hash = (s: string): string => {
    let h = 0;
    for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h.toString(16).padStart(8, '0');
  };
  const state = {
    entries: [] as Entry[],
    /** 记录最近一次 getMemory 的入参，断言服务端过滤透传 */
    lastQuery: null as null | { group?: string; q?: string },
    /** 置真时下一次 updateMemory 抛 409 stale_id */
    nextUpdateStale: false,
    /** 置真时下一次 getMemory 抛网络错误 */
    nextLoadFails: false,
    backupSeq: 0,
  };
  const reindex = () => {
    let i = 0;
    for (const e of state.entries) { e.index = i; i += 1; }
  };
  const makeId = (group: string, content: string) => `${group}:${hash(content)}`;
  return { HttpError, state, makeId, reindex };
});

vi.mock('../api/client', () => {
  const { HttpError, state, makeId, reindex } = backend;
  return {
    HttpError,
    getMemory: vi.fn(async (params: { group?: string; q?: string } = {}) => {
      state.lastQuery = params;
      if (state.nextLoadFails) {
        state.nextLoadFails = false;
        throw new Error('network down');
      }
      return state.entries
        .filter((e) => (params.group ? e.group === params.group : true))
        .filter((e) => (params.q ? e.content.includes(params.q) : true))
        .map((e) => ({ ...e }));
    }),
    createMemory: vi.fn(async (group: 'memory' | 'user', content: string) => {
      const entry = { id: makeId(group, content), group, content, index: 0, updated_at: Date.now() };
      state.entries.push(entry);
      reindex();
      return { ...entry };
    }),
    updateMemory: vi.fn(async (id: string, content: string) => {
      if (state.nextUpdateStale) {
        state.nextUpdateStale = false;
        throw new HttpError(409, 'stale_id', '409 stale', { error: 'stale_id' });
      }
      const target = state.entries.find((e) => e.id === id);
      if (!target) throw new HttpError(409, 'stale_id', '409 stale', { error: 'stale_id' });
      target.content = content;
      target.id = makeId(target.group, content);
      target.updated_at = Date.now();
      return { ...target };
    }),
    deleteMemory: vi.fn(async (id: string) => {
      const idx = state.entries.findIndex((e) => e.id === id);
      if (idx < 0) throw new HttpError(404, 'not_found', '404 not found', { error: 'not_found' });
      state.entries.splice(idx, 1);
      reindex();
      backend.state.backupSeq += 1;
      return { ok: true, backup: `/home/.kmaster-studio/backups/memory/MEMORY.${backend.state.backupSeq}.md` };
    }),
  };
});

const seed = () => {
  backend.state.entries = [
    { id: backend.makeId('memory', '偏好中文回答'), group: 'memory', content: '偏好中文回答', index: 0, updated_at: 1 },
    { id: backend.makeId('memory', '写入前必须备份'), group: 'memory', content: '写入前必须备份', index: 1, updated_at: 1 },
    { id: backend.makeId('user', '工程背景用户'), group: 'user', content: '工程背景用户', index: 0, updated_at: 1 },
  ];
};

beforeEach(() => {
  setActivePinia(createPinia());
  backend.state.lastQuery = null;
  backend.state.nextUpdateStale = false;
  backend.state.nextLoadFails = false;
  seed();
});

describe('memory store — F13 记忆管理（AC2）', () => {
  it('load 填充 entries、按分组归集并统计总数', async () => {
    const s = useMemoryStore();
    await s.load();
    expect(s.entries).toHaveLength(3);
    expect(s.total).toBe(3);
    expect(s.groups.memory).toHaveLength(2);
    expect(s.groups.user).toHaveLength(1);
    expect(s.loading).toBe(false);
    expect(s.error).toBe('');
  });

  it('分组标签覆盖 MEMORY.md / USER.md 两个文件', () => {
    expect(MEMORY_GROUP_LABELS.memory).toContain('MEMORY.md');
    expect(MEMORY_GROUP_LABELS.user).toContain('USER.md');
  });

  it('setQuery / setGroup 透传到服务端过滤（视图零本地过滤）', async () => {
    const s = useMemoryStore();
    await s.setQuery('备份');
    expect(backend.state.lastQuery).toEqual({ group: undefined, q: '备份' });
    expect(s.entries).toHaveLength(1);
    expect(s.entries[0].content).toBe('写入前必须备份');

    await s.setGroup('user');
    expect(backend.state.lastQuery).toEqual({ group: 'user', q: '备份' });

    await s.setQuery('');
    // 空串归一为 undefined（不过滤）
    expect(backend.state.lastQuery).toEqual({ group: 'user', q: undefined });
    expect(s.entries.every((e) => e.group === 'user')).toBe(true);
  });

  it('add 新增条目后自动重载列表并返回新 entry', async () => {
    const s = useMemoryStore();
    await s.load();
    const entry = await s.add('memory', '新增：单测条目');
    expect(entry.id.startsWith('memory:')).toBe(true);
    expect(s.entries).toHaveLength(4);
    expect(s.groups.memory.some((e) => e.content === '新增：单测条目')).toBe(true);
  });

  it('update 编辑生效且 id 随内容变化（内容寻址）', async () => {
    const s = useMemoryStore();
    await s.load();
    const before = s.entries[0];
    const after = await s.update(before.id, '偏好中文回答（已编辑）');
    expect(after.content).toBe('偏好中文回答（已编辑）');
    expect(after.id).not.toBe(before.id);
    expect(s.entries.some((e) => e.id === after.id)).toBe(true);
    expect(s.entries.some((e) => e.id === before.id)).toBe(false);
  });

  it('update 命中 409 stale_id → 刷新列表并抛出可读提示', async () => {
    const s = useMemoryStore();
    await s.load();
    backend.state.nextUpdateStale = true;
    // 期间外部修改：列表应在失败后被重新拉取
    backend.state.entries.push({
      id: backend.makeId('user', '外部新增条目'), group: 'user', content: '外部新增条目', index: 1, updated_at: 2,
    });
    await expect(s.update(s.entries[0].id, '任意内容')).rejects.toThrow('该条目已被外部修改');
    expect(s.entries).toHaveLength(4);
  });

  it('remove 删除条目并记录备份路径（服务端写前自动备份）', async () => {
    const s = useMemoryStore();
    await s.load();
    const target = s.entries[1];
    const backup = await s.remove(target.id);
    expect(backup).toContain('backups/memory/');
    expect(s.lastBackup).toBe(backup);
    expect(s.entries).toHaveLength(2);
    expect(s.entries.some((e) => e.id === target.id)).toBe(false);
  });

  it('load 失败时记录 error 并复位 loading', async () => {
    const s = useMemoryStore();
    backend.state.nextLoadFails = true;
    await expect(s.load()).rejects.toThrow('network down');
    expect(s.error).toBe('network down');
    expect(s.loading).toBe(false);
  });
});
