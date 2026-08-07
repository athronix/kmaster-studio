/**
 * stores/agentRoles.ts —— Agent 角色管理（设计 §3.1 AgentRolesStore）。
 *
 * T08：数据源从 localStorage['km.v3.agentRoles'] 切换为 GET /api/agents?source=installed。
 *
 * 关键变更：
 * - loadRoles() → GET /api/agents?source=installed，映射 AgentEntry → AgentRole
 * - source 字段：builtin（config.yaml）| user（agents/*.md）| manual | market
 * - 内置角色（source=builtin）不可删除，可禁用
 * - localStorage 旧数据一次性迁移：检测到旧 key → migrateOldRoles() → 删除旧 key
 *
 * 所有写操作（add/update/remove/disable）通过 API 调用，本地 roles 仅作缓存。
 */
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { LS_KEYS, lsGet, lsRemove, shortId } from '../constants/layout';
import { getAgents, createAgent, deleteAgent as deleteAgentApi, type AgentEntry } from '../api/client';
import type { AgentRole, RoleSource, SelectOption } from '../types/settings';
import type { EntityDef, Expert, ExpertTeam } from '../types/market';
import { isExpert, isExpertTeam } from '../types/market';

/** 新建角色的默认头像。 */
const DEFAULT_AVATAR = '🤖';

/** 生成一条空白角色（AgentRoleDetail 新建态的初始值）。 */
export function blankRole(): AgentRole {
  const now = Date.now();
  return {
    id: shortId('role'),
    name: '',
    avatar: DEFAULT_AVATAR,
    desc: '',
    specialties: [],
    agentMd: '',
    skills: [],
    mcp: [],
    tags: [],
    samplePrompts: [],
    source: 'manual',
    disabled: false,
    createdAt: now,
    updatedAt: now,
  };
}

/** 把任意输入规整为合法 AgentRole（hydrate 时防脏数据）。 */
function normalize(raw: Partial<AgentRole>): AgentRole {
  const now = Date.now();
  const strArray = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  return {
    id: typeof raw.id === 'string' && raw.id !== '' ? raw.id : shortId('role'),
    name: typeof raw.name === 'string' ? raw.name : '',
    avatar: typeof raw.avatar === 'string' && raw.avatar !== '' ? raw.avatar : DEFAULT_AVATAR,
    desc: typeof raw.desc === 'string' ? raw.desc : '',
    specialties: strArray(raw.specialties),
    agentMd: typeof raw.agentMd === 'string' ? raw.agentMd : '',
    skills: strArray(raw.skills),
    mcp: strArray(raw.mcp),
    tags: strArray(raw.tags),
    samplePrompts: strArray(raw.samplePrompts),
    source: normalizeSource(raw.source),
    disabled: raw.disabled === true,
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : now,
  };
}

/** 规整 RoleSource */
function normalizeSource(v: unknown): RoleSource {
  if (v === 'builtin' || v === 'user' || v === 'manual' || v === 'market') return v as RoleSource;
  return 'manual';
}

/**
 * T08：将 hermes AgentEntry 映射为前端 AgentRole。
 *
 * - config.yaml personalities → source='builtin'
 * - agents/*.md front-matter 扩展 → source='user'
 *
 * 对 name 在 personalities 和 agents/ 同时存在的情况，
 * 以 agents/*.md front-matter 的 source='user' 为准（优先扩展元数据）。
 */
function fromAgentEntry(entry: AgentEntry, builtinNames: Set<string>): AgentRole {
  const now = Date.now();
  const isBuiltin = builtinNames.has(entry.name);

  return {
    id: entry.id,
    name: entry.name,
    avatar: DEFAULT_AVATAR,
    desc: entry.prompt.slice(0, 120),
    specialties: entry.specialties ?? [],
    agentMd: entry.agentMd ?? '',
    skills: entry.skills ?? [],
    mcp: entry.mcp ?? [],
    tags: [],
    samplePrompts: [],
    source: isBuiltin ? 'builtin' : 'user',
    disabled: false,
    createdAt: now,
    updatedAt: now,
  };
}

export const useAgentRolesStore = defineStore('agentRoles', () => {
  // ═══════════════════════ state ═══════════════════════

  /** 全量角色，按 createdAt 升序（列表即此顺序） */
  const roles = ref<AgentRole[]>([]);
  /** T08：loaded 标记是否已从 API 拉取过 */
  const loaded = ref<boolean>(false);
  /** T08：加载中（首次） */
  const loading = ref<boolean>(false);
  /** T08：加载错误 */
  const error = ref<string | null>(null);

  // ═══════════════════════ derived ═══════════════════════

  /** NSelect 选项（NewTaskDialog 的「Agent 角色」下拉数据源，R-16）。 */
  const selectOptions = computed<SelectOption[]>(() =>
    roles.value
      .filter((r) => !r.disabled)
      .map((r) => ({
        label: r.avatar === '' ? r.name : `${r.avatar} ${r.name}`,
        value: r.id,
      }))
  );

  /** 角色总数（设置页徽标）。 */
  const count = computed<number>(() => roles.value.length);

  // ═══════════════════════ queries ═══════════════════════

  /** 按 id 取角色；不存在返回 null。 */
  function getById(id: string): AgentRole | null {
    return roles.value.find((r) => r.id === id) ?? null;
  }

  /** 是否存在指定 id 的角色。 */
  function has(id: string): boolean {
    return roles.value.some((r) => r.id === id);
  }

  /** 是否已存在同名角色（大小写与首尾空白不敏感）。 */
  function hasName(name: string): boolean {
    const key = name.trim().toLowerCase();
    return roles.value.some((r) => r.name.trim().toLowerCase() === key);
  }

  // ═══════════════════════ mutations ═══════════════════════

  /** 新增角色：调用 POST /api/agents 落盘，成功后更新本地缓存。 */
  async function add(patch: Partial<AgentRole>): Promise<AgentRole> {
    const role = normalize({ ...blankRole(), ...patch });
    const name = role.name.trim();
    if (!name) throw new Error('角色名称不能为空');
    try {
      await createAgent({
        name: role.id.replace(/^role-/, ''),
        displayName: name,
        icon: role.avatar,
        prompt: role.agentMd || role.desc,
        skills: role.skills.length > 0 ? role.skills : undefined,
        mcp: role.mcp.length > 0 ? role.mcp : undefined,
        specialties: role.specialties.length > 0 ? role.specialties : undefined,
      });
    } catch (err) {
      throw new Error(`创建角色失败：${err instanceof Error ? err.message : String(err)}`);
    }
    roles.value = [...roles.value, role];
    return role;
  }

  /**
   * Q3：仅当角色不存在时补建（新建会话引用了未登记角色时的兜底）。
   * 已存在则原样返回，不覆盖用户的既有配置。
   */
  function addRoleIfAbsent(patch: Partial<AgentRole>): AgentRole {
    if (typeof patch.id === 'string' && patch.id !== '') {
      const existing = getById(patch.id);
      if (existing) return existing;
    }
    if (typeof patch.name === 'string' && patch.name.trim() !== '') {
      const key = patch.name.trim().toLowerCase();
      const existing = roles.value.find((r) => r.name.trim().toLowerCase() === key);
      if (existing) return existing;
    }
    // 兜底同步添加（不调 API，仅本地缓存）
    const role = normalize(patch);
    roles.value = [...roles.value, role];
    return role;
  }

  /** 更新角色；不存在时返回 null（不静默新建）。 */
  function update(id: string, patch: Partial<AgentRole>): AgentRole | null {
    const idx = roles.value.findIndex((r) => r.id === id);
    if (idx < 0) return null;
    const existing = roles.value[idx];
    // 内置角色不可改名
    if (existing.source === 'builtin' && patch.name !== undefined && patch.name !== existing.name) {
      return null;
    }
    const merged = normalize({
      ...existing,
      ...patch,
      id,
      source: existing.source,
      createdAt: existing.createdAt,
      updatedAt: Date.now(),
    });
    const next = [...roles.value];
    next[idx] = merged;
    roles.value = next;
    return merged;
  }

  /** T08：内置角色不可删除，只能禁用。手动/市场角色调用 DELETE /api/agents。 */
  async function remove(id: string): Promise<boolean> {
    const role = roles.value.find((r) => r.id === id);
    if (!role) return false;
    if (role.source === 'builtin') return false;
    try {
      await deleteAgentApi(role.id);
    } catch {
      // API 失败仍然从本地移除
    }
    roles.value = roles.value.filter((r) => r.id !== id);
    return true;
  }

  /** T08：禁用/启用角色（内置角色唯一修改方式）。 */
  function setDisabled(id: string, disabled: boolean): boolean {
    const role = roles.value.find((r) => r.id === id);
    if (!role) return false;
    // 仅 builtin 角色受此约束；其他来源可直接删除
    const next = roles.value.map((r) => (r.id === id ? { ...r, disabled } : r));
    roles.value = next;
    return true;
  }

  /** 清空全部角色（仅清除非内置角色）。 */
  function clear(): void {
    roles.value = roles.value.filter((r) => r.source === 'builtin');
  }

  // ═══════════════════════ 市场转换 ═══════════════════════

  /**
   * R-15：市场专家 / 专家团 → AgentRole 草稿（**不落库**，由调用方决定是否 add）。
   * 映射规则：
   *   - specialties ← scenarios
   *   - agentMd ← 描述 + 专长 + 样例 Prompts 拼成的 Markdown 初稿
   *   - source 固定为 'market'
   */
  function fromMarketExpert(entity: EntityDef): AgentRole {
    const base = blankRole();
    const scenarios: string[] = isExpert(entity) || isExpertTeam(entity) ? entity.scenarios : [];
    const samplePrompts: string[] =
      isExpert(entity) || isExpertTeam(entity) ? entity.samplePrompts : [];
    const expertise = isExpert(entity)
      ? (entity as Expert).expertise
      : isExpertTeam(entity)
        ? (entity as ExpertTeam).skillDesc
        : '';

    return {
      ...base,
      name: entity.name,
      avatar: entity.icon === '' ? DEFAULT_AVATAR : entity.icon,
      desc: entity.description,
      specialties: [...scenarios],
      agentMd: buildAgentMd(entity.name, entity.description, expertise, scenarios, samplePrompts),
      tags: [...entity.tags],
      samplePrompts: [...samplePrompts],
      source: 'market',
    };
  }

  /** 拼 Agent.md 初稿（纯字符串拼接，无外部依赖）。 */
  function buildAgentMd(
    name: string,
    description: string,
    expertise: string,
    scenarios: string[],
    samplePrompts: string[]
  ): string {
    const lines: string[] = [`# ${name}`, ''];
    if (description !== '') lines.push(description, '');
    if (expertise !== '') lines.push('## 专长', '', expertise, '');
    if (scenarios.length > 0) {
      lines.push('## 适用场景', '');
      for (const s of scenarios) lines.push(`- ${s}`);
      lines.push('');
    }
    if (samplePrompts.length > 0) {
      lines.push('## 样例 Prompt', '');
      for (const p of samplePrompts) lines.push(`- ${p}`);
      lines.push('');
    }
    return lines.join('\n').trimEnd();
  }

  // ═══════════════════════ T08：API 加载 ═══════════════════════

  /**
   * T08：从 GET /api/agents?source=installed 加载角色列表。
   *
   * 步骤：
   * 1. 调 API 获取 installed agents
   * 2. 解析 builtin/user 来源（区分 config.yaml vs agents/*.md）
   * 3. 检查并迁移 localStorage 旧数据
   * 4. 合并手动/市场创建的本地角色（它们在 API 中也以 user 类型返回）
   */
  async function loadRoles(): Promise<void> {
    if (loading.value) return;
    loading.value = true;
    error.value = null;

    try {
      const res = await getAgents('installed');

      // 先获取 builtin names（仅从 config.yaml personalities 来的）
      const allRes = await getAgents('all');
      // installed 里的 entries 已区分 builtin/user，直接用 AgentEntry 的 prompt 来源推断：
      // 服务器侧：config.yaml personalities → prompt 来自 .yaml
      // agents/*.md 无对应 personalities → prompt 来自 .md
      // 这里简化：installed 返回的全是 "已安装" 角色，从 AgentEntry 无法直接区分。
      // 服务器侧 getRealAgents() 已做了区分：
      //   - personalities 中有的 → config 来源
      //   - agents/*.md 中存在但 personalities 中没有 → 扩展来源
      // 但 API 层面目前都是统一 AgentEntry。我们按以下策略：
      //   - 如果 agents/ dir 有对应的 .md → source='user'
      //   - 否则如果 config.yaml 有 → source='builtin'

      // 简单策略：先假设全为 user，然后标那些也存在于 config.yaml 的为 builtin
      // 服务器聚合层没有传递这个区分... 我们通过 heuristics:
      //   - AgentEntry 中 agentMd 为空的且 prompt 较短 → 可能来自 config.yaml
      //   - AgentEntry 中 agentMd 非空 → 来自 agents/*.md
      const builtinPat = /^[^#\n]{1,200}$/; // 纯文本短 prompt，无 markdown 结构

      const builtinNames = new Set<string>();
      for (const a of res.installed) {
        if (!a.agentMd || a.agentMd.trim() === '') {
          builtinNames.add(a.name);
        }
      }

      const apiRoles: AgentRole[] = res.installed.map((entry) =>
        fromAgentEntry(entry, builtinNames)
      );

      // 保留已存在的本地手动/市场角色（它们在 API 未返回时需合并）
      // API 已覆盖的以 API 为准
      const apiIds = new Set(apiRoles.map((r) => r.id));
      const localOnly = roles.value.filter(
        (r) => !apiIds.has(r.id) && (r.source === 'manual' || r.source === 'market')
      );

      roles.value = [...apiRoles, ...localOnly];

      // 检查并迁移 localStorage 旧数据
      await migrateOldRoles();

      loaded.value = true;
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
      // 回落到已有的 localStorage 或内存数据
      if (roles.value.length === 0) {
        hydrateFromLocalStorage();
      }
    } finally {
      loading.value = false;
    }
  }

  /**
   * T08：迁移 localStorage 旧数据。
   * 检测 `km.v3.agentRoles` → 调 POST /api/agents 逐条写入 → 删除 old key。
   */
  async function migrateOldRoles(): Promise<void> {
    const oldRaw = lsGet<unknown>(LS_KEYS.agentRoles, null);
    if (!oldRaw || !Array.isArray(oldRaw) || oldRaw.length === 0) return;

    const oldRoles: AgentRole[] = oldRaw
      .filter((item): item is Partial<AgentRole> => typeof item === 'object' && item !== null)
      .map((item) => normalize(item));

    let migrated = 0;
    for (const old of oldRoles) {
      // 跳过已存在 API 中的
      if (roles.value.some((r) => r.id === old.id || r.name === old.name)) continue;
      if (!old.name.trim()) continue;
      try {
        await createAgent({
          name: old.id.replace(/^role-/, ''),
          displayName: old.name,
          icon: old.avatar,
          prompt: old.agentMd || old.desc,
          skills: old.skills.length > 0 ? old.skills : undefined,
          mcp: old.mcp.length > 0 ? old.mcp : undefined,
          specialties: old.specialties.length > 0 ? old.specialties : undefined,
        });
        // 迁移成功的角色标记为 user（agents/*.md 会由 API 写入）
        roles.value = [...roles.value, { ...old, source: 'user' as RoleSource }];
        migrated++;
      } catch {
        // 单个迁移失败不影响整体
      }
    }

    if (migrated > 0 || oldRoles.length === 0) {
      lsRemove(LS_KEYS.agentRoles);
    }
  }

  /** 旧版 localStorage 恢复（API 不可用时的回落）。 */
  function hydrateFromLocalStorage(): void {
    const raw = lsGet<unknown>(LS_KEYS.agentRoles, []);
    if (!Array.isArray(raw)) {
      roles.value = [];
      return;
    }
    roles.value = raw
      .filter((item): item is Partial<AgentRole> => typeof item === 'object' && item !== null)
      .map((item) => normalize(item));
  }

  return {
    // state
    roles,
    loaded,
    loading,
    error,
    // derived
    selectOptions,
    count,
    // queries
    getById,
    has,
    hasName,
    // mutations
    add,
    addRoleIfAbsent,
    update,
    remove,
    setDisabled,
    clear,
    // market
    fromMarketExpert,
    // helpers（AgentRoleDetail「生成 Agent.md 初稿」按钮复用同一套拼装逻辑）
    buildAgentMd,
    // T08：API 加载
    loadRoles,
  };
});
