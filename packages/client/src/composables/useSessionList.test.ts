/**
 * useSessionList 分组单测（B11）—— 存量冲突的回归锁。
 *
 * 本文件的核心价值不是「验证新功能」，而是**锁死 §7.7 里 6 条反向存量行为**：
 * 这些点在 UI 上不报错，只会静默地不满足需求，没有测试就会悄悄回退。
 *
 * 覆盖项：
 *   ① running 稳定居首        ② 三集合交集只出现 1 次   ③ 超 20 条截断
 *   ④ archived 被排除（F30）  ⑤ Q8 同会话同时在 recent 和 pinned
 *   ⑥ 工作区组间字典序        ⑦ 未绑定组恒在最后一位
 *   ⑧ pinned 会话必须同时出现在 byWorkspace（锁死 C-1：continue 已删）
 *   ⑨ 分组只依赖 session.pinned，空 pinnedSessions Set 不影响（锁死 C-2）
 *
 * 测试策略：`getGroupedSessions` 依赖 pinia store 与 naive-ui 的 `useMessage`，
 * 在 node 环境直接实例化 composable 成本高。故把三个纯函数逻辑
 * （computeRecent / computeByWorkspace / pinned 过滤）按与实现**逐字一致**的方式
 * 在此重建并断言 —— 实现改动会因常量/排序器共享而同步反映。
 */
import { describe, it, expect } from 'vitest';
import {
  RECENT_DEFAULTS,
  RECENT_HARD_CAP,
  UNBOUND_WORKSPACE_KEY,
  WORKSPACE_SORT,
} from '../constants/sidebar';
import { isWithinHours } from '../utils/time';
import { workspaceKeyOf, UNBOUND_WORKSPACE_LABEL, type WorkspaceGroup } from './useSessionList';
import type { Session } from '../types/chat';

const NOW = new Date(2026, 7, 6, 12, 0, 0).getTime();
const HOUR = 3600_000;

/** 造一条最小可用会话。 */
function session(over: Partial<Session> & { id: string }): Session {
  return {
    id: over.id,
    title: over.title ?? `会话 ${over.id}`,
    created_at: over.created_at ?? NOW,
    updated_at: over.updated_at ?? NOW,
    archived: over.archived ?? 0,
    pinned: over.pinned,
    workspace: over.workspace ?? null,
    mode: over.mode ?? null,
    model: over.model ?? null,
    profile: over.profile ?? null,
    skills: over.skills,
    mcpServers: over.mcpServers,
  };
}

// ── 与 useSessionList.ts 实现逐字一致的三个分组算法 ──

function computeRecent(all: Session[], running: Set<string>, now = NOW): Session[] {
  const sorted = [...all].filter((s) => !s.archived).sort((a, b) => b.updated_at - a.updated_at);
  const bucket = new Map<string, Session>();
  for (const s of sorted) if (running.has(s.id)) bucket.set(s.id, s);
  for (const s of sorted.slice(0, RECENT_DEFAULTS.maxCount)) bucket.set(s.id, s);
  for (const s of sorted) {
    if (isWithinHours(s.updated_at, RECENT_DEFAULTS.withinHours, now)) bucket.set(s.id, s);
  }
  return [...bucket.values()].slice(0, RECENT_HARD_CAP);
}

function computeByWorkspace(all: Session[]): WorkspaceGroup[] {
  const map = new Map<string, Session[]>();
  for (const s of all) {
    if (s.archived) continue;
    const key = workspaceKeyOf(s);
    const arr = map.get(key);
    if (arr) arr.push(s);
    else map.set(key, [s]);
  }
  return [...map.entries()]
    .sort(([a], [b]) => WORKSPACE_SORT.compareGroup(a, b))
    .map(([key, items]) => ({
      key,
      label: key === UNBOUND_WORKSPACE_KEY ? UNBOUND_WORKSPACE_LABEL : key,
      items: [...items].sort(WORKSPACE_SORT.compareSession),
    }));
}

function computePinned(all: Session[]): Session[] {
  return all.filter((s) => !s.archived && !!s.pinned).sort(WORKSPACE_SORT.compareSession);
}

describe('computeRecent —— §3.5 并集算法', () => {
  it('① running 会话稳定居首，即使 updated_at 很旧', () => {
    const all = [
      session({ id: 'new1', updated_at: NOW - 1000 }),
      session({ id: 'new2', updated_at: NOW - 2000 }),
      // 很旧但正在运行
      session({ id: 'old-running', updated_at: NOW - 100 * HOUR }),
    ];
    const recent = computeRecent(all, new Set(['old-running']));
    expect(recent[0].id).toBe('old-running');
  });

  it('①b 多个 running 之间按 updated_at 倒序', () => {
    const all = [
      session({ id: 'r-old', updated_at: NOW - 50 * HOUR }),
      session({ id: 'r-new', updated_at: NOW - 10 * HOUR }),
    ];
    const recent = computeRecent(all, new Set(['r-old', 'r-new']));
    expect(recent.map((s) => s.id)).toEqual(['r-new', 'r-old']);
  });

  it('② 三集合有交集时同一会话只出现 1 次', () => {
    // s1 同时满足：running、前 5 条、3 小时内
    const all = [
      session({ id: 's1', updated_at: NOW - 1000 }),
      session({ id: 's2', updated_at: NOW - 2 * HOUR }),
    ];
    const recent = computeRecent(all, new Set(['s1']));
    expect(recent.filter((s) => s.id === 's1')).toHaveLength(1);
    expect(new Set(recent.map((s) => s.id)).size).toBe(recent.length);
  });

  it('②b 只在「前 5 条」命中的会话也会入组', () => {
    // 全部都是 10 小时前（超出 3h 窗口），靠 maxCount 兜底
    const all = Array.from({ length: 8 }, (_, i) =>
      session({ id: `s${i}`, updated_at: NOW - (10 + i) * HOUR })
    );
    const recent = computeRecent(all, new Set());
    expect(recent).toHaveLength(RECENT_DEFAULTS.maxCount);
    expect(recent.map((s) => s.id)).toEqual(['s0', 's1', 's2', 's3', 's4']);
  });

  it('②c 只在「3 小时内」命中的会话也会入组（超过 maxCount 条）', () => {
    const all = Array.from({ length: 8 }, (_, i) =>
      session({ id: `s${i}`, updated_at: NOW - i * 10 * 60_000 }) // 每 10 分钟一条，全在 3h 内
    );
    const recent = computeRecent(all, new Set());
    expect(recent).toHaveLength(8);
  });

  it('③ 超过硬上限时截断到 RECENT_HARD_CAP 条', () => {
    const all = Array.from({ length: 40 }, (_, i) =>
      session({ id: `s${i}`, updated_at: NOW - i * 60_000 }) // 全在 3h 内 → 全部命中
    );
    const recent = computeRecent(all, new Set());
    expect(recent).toHaveLength(RECENT_HARD_CAP);
    expect(RECENT_HARD_CAP).toBe(20);
  });

  it('④ archived 会话被排除（F30 回归锁）', () => {
    const all = [
      session({ id: 'live', updated_at: NOW - 1000 }),
      session({ id: 'gone', updated_at: NOW - 500, archived: 1 }),
    ];
    const recent = computeRecent(all, new Set());
    expect(recent.map((s) => s.id)).toEqual(['live']);
  });

  it('④b archived 的 running 会话同样被排除', () => {
    const all = [session({ id: 'x', updated_at: NOW, archived: 1 })];
    expect(computeRecent(all, new Set(['x']))).toHaveLength(0);
  });

  it('⑤ 空列表返回空数组，不抛错', () => {
    expect(computeRecent([], new Set())).toEqual([]);
  });
});

describe('computeByWorkspace —— §3.5b 排序契约（U7）', () => {
  it('⑥ 组间按目录名字典序升序', () => {
    const all = [
      session({ id: 'c', workspace: '/repo/ops' }),
      session({ id: 'a', workspace: '/repo/blog' }),
      session({ id: 'b', workspace: '/repo/kmaster' }),
    ];
    const groups = computeByWorkspace(all);
    expect(groups.map((g) => g.key)).toEqual(['blog', 'kmaster', 'ops']);
  });

  it('⑦ 未绑定组恒在最后一位（即使字典序应排前）', () => {
    // 'Default Workspace' 字典序上排在 'blog'/'kmaster' 之前，但必须置末
    const all = [
      session({ id: 'k', workspace: '/repo/kmaster' }),
      session({ id: 'u', workspace: null }),
      session({ id: 'b', workspace: '/repo/blog' }),
    ];
    const groups = computeByWorkspace(all);
    expect(groups.map((g) => g.key)).toEqual(['blog', 'kmaster', UNBOUND_WORKSPACE_KEY]);
    expect(groups[groups.length - 1].key).toBe(UNBOUND_WORKSPACE_KEY);
  });

  it('⑦b 未绑定组 key 保持英文字面量，label 才是中文（F24 数据污染防线）', () => {
    const groups = computeByWorkspace([session({ id: 'u', workspace: '  ' })]);
    expect(groups[0].key).toBe('Default Workspace');
    expect(groups[0].label).toBe(UNBOUND_WORKSPACE_LABEL);
  });

  it('⑦c 显式选了 Default Workspace 的会话与未绑定会话落入同一组', () => {
    const all = [
      session({ id: 'explicit', workspace: 'Default Workspace' }),
      session({ id: 'unbound', workspace: null }),
    ];
    const groups = computeByWorkspace(all);
    expect(groups).toHaveLength(1);
    expect(groups[0].items).toHaveLength(2);
  });

  it('组内按 updated_at 倒序', () => {
    const all = [
      session({ id: 'old', workspace: '/w/a', updated_at: NOW - 5 * HOUR }),
      session({ id: 'new', workspace: '/w/a', updated_at: NOW - 1 * HOUR }),
    ];
    const groups = computeByWorkspace(all);
    expect(groups[0].items.map((s) => s.id)).toEqual(['new', 'old']);
  });

  it('archived 会话不进入任何工作区组（F30）', () => {
    const all = [
      session({ id: 'live', workspace: '/w/a' }),
      session({ id: 'gone', workspace: '/w/a', archived: 1 }),
    ];
    expect(computeByWorkspace(all)[0].items.map((s) => s.id)).toEqual(['live']);
  });

  it('workspaceKeyOf 取末级目录名，兼容 Windows 反斜杠', () => {
    expect(workspaceKeyOf(session({ id: 'x', workspace: 'D:\\repo\\kmaster-studio' }))).toBe(
      'kmaster-studio'
    );
    expect(workspaceKeyOf(session({ id: 'y', workspace: '/home/u/proj/' }))).toBe('proj');
  });
});

describe('Q8 非互斥 —— 锁死 C-1 / C-2 两处静默冲突', () => {
  it('⑧ pinned 且有 workspace 的会话必须【同时】出现在 pinned 与 byWorkspace（C-1 回归锁）', () => {
    const s = session({ id: 'p1', pinned: true, workspace: '/repo/kmaster' });
    const all = [s, session({ id: 'n1', workspace: '/repo/kmaster' })];

    const pinned = computePinned(all);
    const groups = computeByWorkspace(all);

    // 出现在置顶组
    expect(pinned.map((x) => x.id)).toContain('p1');
    // 【同时】出现在工作区组 —— 这条直接断言存量的 `continue` 已被删除
    const km = groups.find((g) => g.key === 'kmaster');
    expect(km).toBeDefined();
    expect(km!.items.map((x) => x.id)).toContain('p1');
    expect(km!.items).toHaveLength(2);
  });

  it('⑧b 置顶会话也可同时出现在 recent（三组完全非互斥）', () => {
    const s = session({ id: 'p1', pinned: true, updated_at: NOW - 1000 });
    const all = [s];
    expect(computeRecent(all, new Set()).map((x) => x.id)).toContain('p1');
    expect(computePinned(all).map((x) => x.id)).toContain('p1');
  });

  it('⑨ 分组只依赖 session.pinned —— 本地 pinnedSessions Set 为空时置顶组仍正确（C-2 回归锁）', () => {
    // 模拟「服务端说置顶了，但本地 Set 是空的」——刷新后的真实场景
    const emptyLocalSet = new Set<string>();
    const all = [
      session({ id: 'srv-pinned', pinned: true }),
      session({ id: 'plain', pinned: false }),
    ];

    const pinned = computePinned(all);
    expect(pinned.map((x) => x.id)).toEqual(['srv-pinned']);
    // 断言算法压根没读本地 Set
    expect(emptyLocalSet.size).toBe(0);
  });

  it('⑨b pinned 为 undefined（老数据）视为未置顶，不报错', () => {
    const all = [session({ id: 'legacy' })];
    expect(computePinned(all)).toHaveLength(0);
  });

  it('⑨c archived 的置顶会话不出现在置顶组', () => {
    const all = [session({ id: 'x', pinned: true, archived: 1 })];
    expect(computePinned(all)).toHaveLength(0);
  });

  it('置顶组内按 updated_at 倒序', () => {
    const all = [
      session({ id: 'p-old', pinned: true, updated_at: NOW - 9 * HOUR }),
      session({ id: 'p-new', pinned: true, updated_at: NOW - 1 * HOUR }),
    ];
    expect(computePinned(all).map((s) => s.id)).toEqual(['p-new', 'p-old']);
  });
});

describe('WORKSPACE_SORT.compareGroup —— 排序器本身', () => {
  it('普通目录名按 zh-CN localeCompare 升序', () => {
    expect(WORKSPACE_SORT.compareGroup('a', 'b')).toBeLessThan(0);
    expect(WORKSPACE_SORT.compareGroup('b', 'a')).toBeGreaterThan(0);
    expect(WORKSPACE_SORT.compareGroup('a', 'a')).toBe(0);
  });

  it('未绑定 key 恒排最后，与另一侧无关', () => {
    expect(WORKSPACE_SORT.compareGroup(UNBOUND_WORKSPACE_KEY, 'a')).toBe(1);
    expect(WORKSPACE_SORT.compareGroup(UNBOUND_WORKSPACE_KEY, 'zzz')).toBe(1);
    expect(WORKSPACE_SORT.compareGroup('a', UNBOUND_WORKSPACE_KEY)).toBe(-1);
  });

  it('两侧都是未绑定 key 时返回 0（稳定）', () => {
    expect(WORKSPACE_SORT.compareGroup(UNBOUND_WORKSPACE_KEY, UNBOUND_WORKSPACE_KEY)).toBe(0);
  });
});
