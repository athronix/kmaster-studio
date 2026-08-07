/**
 * useSidebarCounts 单测（B8）。
 *
 * 验收项：
 *   ① 重名专家只计 1 次（去重键 = name）
 *   ② MCP 用 `id ?? name` 作为唯一键
 *   ③ 某源 reject 时其余仍出数（Promise.allSettled 语义）
 *   ④ installed ∪ candidates 去重后才是 total（交集不重复计）
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ⚠️ mock 必须在 import 被测模块之前声明（vi.mock 会被提升）
vi.mock('../api/client', () => ({
  getAgents: vi.fn(),
  getSkills: vi.fn(),
  getMcpList: vi.fn(),
  http: vi.fn(),
}));

import { useSidebarCounts, dedupeCount } from './useSidebarCounts';
import { getAgents, getSkills, getMcpList, http } from '../api/client';

const mockGetAgents = vi.mocked(getAgents);
const mockGetSkills = vi.mocked(getSkills);
const mockGetMcpList = vi.mocked(getMcpList);
const mockHttp = vi.mocked(http);

/** 造一个最小可用的 agents 响应。 */
function agentsResponse(installed: string[], candidates: string[]) {
  return {
    installed: installed.map((name, i) => ({ id: `i-${i}`, name })),
    candidates: candidates.map((name, i) => ({ id: `c-${i}`, name })),
    categories: [],
  } as unknown as Awaited<ReturnType<typeof getAgents>>;
}

describe('dedupeCount —— 去重计数基元', () => {
  it('按键去重，重复项只算一次', () => {
    const list = [{ name: 'a' }, { name: 'a' }, { name: 'b' }];
    expect(dedupeCount(list, (x) => x.name)).toBe(2);
  });

  it('空串 / null / undefined 键一律丢弃', () => {
    const list = [{ name: 'a' }, { name: '' }, { name: '   ' }, { name: undefined }, { name: null }];
    expect(dedupeCount(list, (x) => x.name as string | undefined | null)).toBe(1);
  });

  it('键两侧空白视为同一个', () => {
    expect(dedupeCount([{ n: 'a' }, { n: ' a ' }], (x) => x.n)).toBe(1);
  });

  it('空列表返回 0', () => {
    expect(dedupeCount([], () => 'x')).toBe(0);
  });
});

describe('useSidebarCounts —— 三源聚合', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useSidebarCounts().__reset();
  });

  it('① 重名专家只计 1 次；installed ∪ candidates 去重得 total', async () => {
    // installed 有重名 'pm'；candidates 与 installed 有交集 'pm'
    mockGetAgents.mockResolvedValue(agentsResponse(['pm', 'pm', 'dev'], ['pm', 'qa']));
    mockGetSkills.mockResolvedValue([]);
    mockHttp.mockResolvedValue({ candidates: [] } as never);
    mockGetMcpList.mockResolvedValue({ deployed: [], candidates: [] });

    const c = useSidebarCounts();
    await c.refresh();

    // installed 去重后 = {pm, dev} = 2
    expect(c.counts.value.experts.installed).toBe(2);
    // 并集去重 = {pm, dev, qa} = 3（交集 pm 不重复计）
    expect(c.counts.value.experts.total).toBe(3);
  });

  it('② MCP 唯一键为 id ?? name：有 id 用 id，无 id 回落 name', async () => {
    mockGetAgents.mockResolvedValue(agentsResponse([], []));
    mockGetSkills.mockResolvedValue([]);
    mockHttp.mockResolvedValue({ candidates: [] } as never);
    mockGetMcpList.mockResolvedValue({
      // deployed 无 id（McpServer 只有 name）
      deployed: [{ name: 'git' }, { name: 'fs' }] as never,
      // candidates 带 id；'git-id' 与 deployed 的 'git' 不同键 → 各算一个
      candidates: [
        { id: 'git-id', name: 'git' },
        { id: 'sql-id', name: 'sql' },
      ] as never,
    });

    const c = useSidebarCounts();
    await c.refresh();

    expect(c.counts.value.mcp.installed).toBe(2); // git, fs
    // 键集合 = {git, fs, git-id, sql-id} = 4
    expect(c.counts.value.mcp.total).toBe(4);
  });

  it('②b MCP 同 id 的重复项只计一次', async () => {
    mockGetAgents.mockResolvedValue(agentsResponse([], []));
    mockGetSkills.mockResolvedValue([]);
    mockHttp.mockResolvedValue({ candidates: [] } as never);
    mockGetMcpList.mockResolvedValue({
      deployed: [{ id: 'x', name: 'a' }] as never,
      candidates: [{ id: 'x', name: 'a-renamed' }] as never,
    });

    const c = useSidebarCounts();
    await c.refresh();

    expect(c.counts.value.mcp.installed).toBe(1);
    expect(c.counts.value.mcp.total).toBe(1);
  });

  it('③ 专家源 reject 时，技能与 MCP 仍正常出数', async () => {
    mockGetAgents.mockRejectedValue(new Error('专家接口 500'));
    mockGetSkills.mockResolvedValue([{ name: 'pdf' }, { name: 'xlsx' }] as never);
    mockHttp.mockResolvedValue({ candidates: [{ name: 'pdf' }, { name: 'ppt' }] } as never);
    mockGetMcpList.mockResolvedValue({
      deployed: [{ name: 'git' }] as never,
      candidates: [] as never,
    });

    const c = useSidebarCounts();
    await c.refresh();

    // 失败源保持初值 {0,0} → 徽标不渲染
    expect(c.counts.value.experts).toEqual({ installed: 0, total: 0 });
    // 其余两源正常
    expect(c.counts.value.skills.installed).toBe(2);
    expect(c.counts.value.skills.total).toBe(3); // {pdf, xlsx, ppt}
    expect(c.counts.value.mcp.installed).toBe(1);
    // 错误信息被收集，供 F5 错误态展示
    expect(c.error.value).toContain('专家接口 500');
  });

  it('③b 三源全 reject 时不抛异常，全部保持 {0,0}', async () => {
    mockGetAgents.mockRejectedValue(new Error('e1'));
    mockGetSkills.mockRejectedValue(new Error('e2'));
    mockGetMcpList.mockRejectedValue(new Error('e3'));

    const c = useSidebarCounts();
    await expect(c.refresh()).resolves.toBeUndefined();

    expect(c.counts.value.experts.total).toBe(0);
    expect(c.counts.value.skills.total).toBe(0);
    expect(c.counts.value.mcp.total).toBe(0);
    expect(c.loaded.value).toBe(true);
  });

  it('④ 技能候选源失败时降级为「只算已装」，不影响 installed', async () => {
    mockGetAgents.mockResolvedValue(agentsResponse([], []));
    mockGetSkills.mockResolvedValue([{ name: 'pdf' }] as never);
    mockHttp.mockRejectedValue(new Error('candidates 挂了'));
    mockGetMcpList.mockResolvedValue({ deployed: [], candidates: [] });

    const c = useSidebarCounts();
    await c.refresh();

    expect(c.counts.value.skills.installed).toBe(1);
    expect(c.counts.value.skills.total).toBe(1);
    // 技能整体成功（内部已容错），不写入 error
    expect(c.error.value).toBe('');
  });

  it('⑤ 模块级单例：两次调用共享同一份状态', async () => {
    mockGetAgents.mockResolvedValue(agentsResponse(['a'], ['b']));
    mockGetSkills.mockResolvedValue([]);
    mockHttp.mockResolvedValue({ candidates: [] } as never);
    mockGetMcpList.mockResolvedValue({ deployed: [], candidates: [] });

    const a = useSidebarCounts();
    await a.refresh();
    const b = useSidebarCounts();

    expect(b.counts.value.experts.total).toBe(2);
    expect(b.loaded.value).toBe(true);
  });

  it('⑥ 不 auto-refresh：仅构造 composable 不发任何请求', () => {
    useSidebarCounts();
    expect(mockGetAgents).not.toHaveBeenCalled();
    expect(mockGetSkills).not.toHaveBeenCalled();
    expect(mockGetMcpList).not.toHaveBeenCalled();
  });

  it('⑥b ensureLoaded 在已加载后不再重复请求（缺陷 #2 回归锁）', async () => {
    mockGetAgents.mockResolvedValue(agentsResponse(['a'], []));
    mockGetSkills.mockResolvedValue([]);
    mockHttp.mockResolvedValue({ candidates: [] } as never);
    mockGetMcpList.mockResolvedValue({ deployed: [], candidates: [] });

    const c = useSidebarCounts();
    await c.refresh();
    const callsAfterFirst = mockGetAgents.mock.calls.length;

    await c.ensureLoaded();
    await c.ensureLoaded();

    // 已 loaded → 一次都不该再打
    expect(mockGetAgents.mock.calls.length).toBe(callsAfterFirst);
  });

  it('⑥c ensureLoaded 在未加载时会触发一次拉取', async () => {
    mockGetAgents.mockResolvedValue(agentsResponse(['a'], []));
    mockGetSkills.mockResolvedValue([]);
    mockHttp.mockResolvedValue({ candidates: [] } as never);
    mockGetMcpList.mockResolvedValue({ deployed: [], candidates: [] });

    const c = useSidebarCounts();
    await c.ensureLoaded();

    expect(mockGetAgents).toHaveBeenCalledTimes(1);
    expect(c.loaded.value).toBe(true);
  });

  it('⑦ 并发 refresh 去重：同帧两次只发一轮请求', async () => {
    mockGetAgents.mockResolvedValue(agentsResponse(['a'], []));
    mockGetSkills.mockResolvedValue([]);
    mockHttp.mockResolvedValue({ candidates: [] } as never);
    mockGetMcpList.mockResolvedValue({ deployed: [], candidates: [] });

    const c = useSidebarCounts();
    await Promise.all([c.refresh(), c.refresh()]);

    expect(mockGetAgents).toHaveBeenCalledTimes(1);
  });
});
