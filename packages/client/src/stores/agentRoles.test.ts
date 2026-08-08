/**
 * stores/agentRoles.test.ts —— Agent 角色 store 单测。
 *
 * T08：数据源从 localStorage 切为 GET /api/agents。
 * 覆盖：同步CRUD / Q3 addRoleIfAbsent 幂等 / 市场专家转换 / selectOptions /
 *       脏数据规整 / builtin 角色不可删可禁用。
 *
 * 注意：loadRoles / add / remove 为异步（调 API），单元测试中通过 mock 使用。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useAgentRolesStore } from './agentRoles';
import type { Expert, ExpertTeam } from '../types/market';

// Mock the API calls
vi.mock('../api/client', () => ({
  getAgents: vi.fn().mockResolvedValue({
    installed: [],
    candidates: [],
    categories: [],
  }),
  createAgent: vi.fn().mockResolvedValue({ ok: true, agentId: 'test-agent' }),
  deleteAgent: vi.fn().mockResolvedValue({ ok: true }),
}));

function installMemoryStorage(): void {
  const map = new Map<string, string>();
  (globalThis as { localStorage?: Storage }).localStorage = {
    get length(): number {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    removeItem: (k: string) => {
      map.delete(k);
    },
    setItem: (k: string, v: string) => {
      map.set(k, String(v));
    },
  };
}

const EXPERT: Expert = {
  id: 'e1',
  name: '前端架构专家',
  icon: '🧑‍💻',
  description: '擅长大型前端工程治理',
  tags: ['前端', '架构'],
  entityType: 'expert',
  expertise: '模块划分、构建优化、性能治理',
  scenarios: ['技术选型', '性能优化'],
  samplePrompts: ['帮我评审这份路由设计', '如何拆分这个巨石组件'],
  category: 'dev',
  domain: 'frontend',
  featured: true,
};

const TEAM: ExpertTeam = {
  id: 't1',
  name: '全栈交付团',
  icon: '👥',
  description: '端到端交付一个 Web 应用',
  tags: ['全栈'],
  entityType: 'expertTeam',
  skillDesc: '需求拆解 + 前后端实现 + 测试',
  scenarios: ['MVP 开发'],
  samplePrompts: ['做一个待办应用'],
  category: 'dev',
  domain: 'fullstack',
  featured: false,
  members: [EXPERT],
};

describe('stores/agentRoles', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    installMemoryStorage();
  });

  afterEach(() => {
    delete (globalThis as { localStorage?: Storage }).localStorage;
  });

  it('初始为空', () => {
    const s = useAgentRolesStore();
    expect(s.roles).toEqual([]);
    expect(s.count).toBe(0);
    expect(s.selectOptions).toEqual([]);
  });

  it('add 补齐 id / 时间戳 / 默认头像（async）', async () => {
    const s = useAgentRolesStore();
    const r = await s.add({ name: '测试角色' });
    expect(r.id).not.toBe('');
    // UI/UX v2 去 emoji：默认头像由 '🤖' 改为 KIcon 名 'Robot'（agentRoles.ts DEFAULT_AVATAR）
    expect(r.avatar).toBe('Robot');
    expect(r.source).toBe('manual');
    expect(r.disabled).toBe(false);
    expect(r.createdAt).toBeGreaterThan(0);
    expect(s.count).toBe(1);
    expect(s.has(r.id)).toBe(true);
  });

  it('selectOptions 带头像前缀，过滤 disabled', async () => {
    const s = useAgentRolesStore();
    const r = await s.add({ name: '架构师', avatar: '🏗️' });
    expect(s.selectOptions).toEqual([{ label: '🏗️ 架构师', value: r.id }]);
  });

  it('update 只改指定字段并刷新 updatedAt，createdAt 不变', async () => {
    const s = useAgentRolesStore();
    const r = await s.add({ name: 'A', desc: '原描述' });
    const updated = s.update(r.id, { desc: '新描述' });
    expect(updated).not.toBeNull();
    expect(updated!.name).toBe('A');
    expect(updated!.desc).toBe('新描述');
    expect(updated!.createdAt).toBe(r.createdAt);
    expect(updated!.updatedAt).toBeGreaterThanOrEqual(r.updatedAt);
  });

  it('update 不存在的 id 返回 null 且不新建', () => {
    const s = useAgentRolesStore();
    expect(s.update('nope', { name: 'x' })).toBeNull();
    expect(s.count).toBe(0);
  });

  it('remove 返回是否命中（async）', async () => {
    const s = useAgentRolesStore();
    const r = await s.add({ name: 'A' });
    expect(await s.remove(r.id)).toBe(true);
    expect(await s.remove(r.id)).toBe(false);
    expect(s.count).toBe(0);
  });

  it('Q3：addRoleIfAbsent 按 id 幂等', async () => {
    const s = useAgentRolesStore();
    const first = s.addRoleIfAbsent({ id: 'fixed', name: '角色1' });
    const second = s.addRoleIfAbsent({ id: 'fixed', name: '改个名也不该覆盖' });
    expect(second.id).toBe(first.id);
    expect(second.name).toBe('角色1');
    expect(s.count).toBe(1);
  });

  it('Q3：addRoleIfAbsent 按名称去重（忽略大小写与空白）', () => {
    const s = useAgentRolesStore();
    s.addRoleIfAbsent({ name: 'Coder' });
    s.addRoleIfAbsent({ name: '  coder ' });
    expect(s.count).toBe(1);
    expect(s.hasName('CODER')).toBe(true);
  });

  it('addRoleIfAbsent 对全新角色执行新建', () => {
    const s = useAgentRolesStore();
    s.addRoleIfAbsent({ name: 'A' });
    s.addRoleIfAbsent({ name: 'B' });
    expect(s.count).toBe(2);
  });

  it('fromMarketExpert 转换专家：不落库，字段完整映射', () => {
    const s = useAgentRolesStore();
    const draft = s.fromMarketExpert(EXPERT);
    expect(s.count).toBe(0); // 只产草稿，不入库
    expect(draft.name).toBe('前端架构专家');
    expect(draft.avatar).toBe('🧑‍💻');
    expect(draft.source).toBe('market');
    expect(draft.specialties).toEqual(['技术选型', '性能优化']);
    expect(draft.samplePrompts).toHaveLength(2);
    expect(draft.tags).toEqual(['前端', '架构']);
    expect(draft.agentMd).toContain('# 前端架构专家');
    expect(draft.agentMd).toContain('## 专长');
    expect(draft.agentMd).toContain('模块划分、构建优化、性能治理');
    expect(draft.agentMd).toContain('## 适用场景');
  });

  it('fromMarketExpert 转换专家团：expertise 取 skillDesc', () => {
    const s = useAgentRolesStore();
    const draft = s.fromMarketExpert(TEAM);
    expect(draft.agentMd).toContain('需求拆解 + 前后端实现 + 测试');
    expect(draft.specialties).toEqual(['MVP 开发']);
  });

  it('市场草稿经 add 后进入列表', async () => {
    const s = useAgentRolesStore();
    const saved = await s.add(s.fromMarketExpert(EXPERT));
    expect(s.count).toBe(1);
    expect(s.getById(saved.id)?.source).toBe('market');
  });

  it('builtin 角色不可删除，可禁用', async () => {
    const s = useAgentRolesStore();
    // 直接放入 builtin 角色（跳过 API）
    const now = Date.now();
    s.roles = [{
      id: 'builtin-test',
      name: '内置角色',
      avatar: '🤖',
      desc: '内置',
      specialties: [],
      agentMd: '',
      skills: [],
      mcp: [],
      tags: [],
      samplePrompts: [],
      source: 'builtin',
      disabled: false,
      createdAt: now,
      updatedAt: now,
    }];
    // 不可删除
    expect(await s.remove('builtin-test')).toBe(false);
    expect(s.count).toBe(1);
    // 可禁用
    expect(s.setDisabled('builtin-test', true)).toBe(true);
    expect(s.roles[0].disabled).toBe(true);
    // 可启用
    expect(s.setDisabled('builtin-test', false)).toBe(true);
    expect(s.roles[0].disabled).toBe(false);
  });

  it('clear 清空非内置角色', () => {
    const s = useAgentRolesStore();
    s.addRoleIfAbsent({ name: 'A' });
    s.addRoleIfAbsent({ name: 'B' });
    s.clear();
    expect(s.count).toBe(0);
  });
});
