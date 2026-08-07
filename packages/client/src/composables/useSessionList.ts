/**
 * useSessionList — 会话列表核心业务逻辑提取。
 *
 * 从 SessionList.vue 提取：搜索 / 列表过滤 / 重命名 / 导出 / 拖拽 / 右键菜单。
 * 供 LeftSidebar.vue 消费。
 */
import { computed, ref, onMounted, onUnmounted } from 'vue';
import { useMessage } from 'naive-ui';
import { useChatStore } from '../stores/chat';
import { useAgentRolesStore } from '../stores/agentRoles';
import { exportSession } from '../api/client';
import { TIME_RANGE_MS, type TimeRange } from '../constants/layout';
import {
  RECENT_DEFAULTS,
  RECENT_HARD_CAP,
  UNBOUND_WORKSPACE_KEY,
  WORKSPACE_SORT,
} from '../constants/sidebar';
import { isWithinHours } from '../utils/time';
import type { Session } from '../types/chat';

export interface ContextMenuState {
  x: number;
  y: number;
  session: Session;
}

/**
 * 未绑定工作目录组的展示文案。
 *
 * ⚠️ 与 `UNBOUND_WORKSPACE_KEY`（英文 `'Default Workspace'`，落库值，F24）**刻意分离**：
 * 这里只改展示，绝不改 key，否则会污染 `defaultNewTaskConfig().workspace` 落库的数据。
 * 组件层若接了 i18n，应优先用 `t('sidebar.unboundWorkspace')` 覆盖本默认值。
 */
export const UNBOUND_WORKSPACE_LABEL = '未绑定工作目录';

/** 工作区分组条目（已按 §3.5b 排好序，消费方**不得二次排序**）。 */
export interface WorkspaceGroup {
  /** 分组内部 key（未绑定组为 `UNBOUND_WORKSPACE_KEY`，保持英文） */
  key: string;
  /** 展示文案（未绑定组为中文） */
  label: string;
  items: Session[];
}

/** 左栏会话三分组产物（Q8：三组**非互斥**，同一会话可重复出现）。 */
export interface GroupedSessions {
  recent: Session[];
  pinned: Session[];
  byWorkspace: WorkspaceGroup[];
}

/**
 * 左栏会话过滤条件（V3 T3 / S3.6 / R-31）。
 *
 * - `category`：workspace 末级目录名（A3 决策：类别 = workspace），空串表示不限；
 * - `timeRange`：按 `updated_at` 落在最近区间内，`'all'` 表示不限；
 * - `agentRole`：Agent 角色名称（会话 agent 字段），空串表示不限。
 */
export interface SessionFilters {
  category: string;
  timeRange: TimeRange;
  agentRole: string;
}

/** 过滤条件默认值（全部不限）。 */
export function emptyFilters(): SessionFilters {
  return { category: '', timeRange: 'all', agentRole: '' };
}

/**
 * 会话 → workspace 末级目录名；无 workspace 归入未绑定分组。
 *
 * ⚠️ 回落 key 必须是 `UNBOUND_WORKSPACE_KEY`（英文 `'Default Workspace'`）：
 * 它同时是 `types/newTask.ts` 里 `defaultNewTaskConfig().workspace` 的落库值（F24），
 * 改成中文会让「主动选 Default」与「未绑定」两类数据无法对齐。
 */
export function workspaceKeyOf(session: Session): string {
  const ws = session.workspace?.trim();
  if (!ws) return UNBOUND_WORKSPACE_KEY;
  return ws.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? ws;
}

/** 会话绑定的 Agent 角色名；取不到返回空串。 */
export function agentRoleOf(session: Session): string {
  const raw = (session as unknown as { agent?: unknown }).agent;
  return typeof raw === 'string' ? raw.trim() : '';
}

export function useSessionList() {
  const store = useChatStore();
  const agentRoles = useAgentRolesStore();
  const toast = useMessage();
  const search = ref('');

  // ── V3 S3.6：三维过滤条件 ──
  const filters = ref<SessionFilters>(emptyFilters());

  /** 是否有任一过滤条件生效（过滤图标激活态的判据）。 */
  const filterActive = computed<boolean>(
    () =>
      filters.value.category !== '' ||
      filters.value.timeRange !== 'all' ||
      filters.value.agentRole !== ''
  );

  /** 清空全部过滤条件。 */
  function clearFilters(): void {
    filters.value = emptyFilters();
  }

  /** workspace 候选项（来自当前全部会话，去重后按字母序）。 */
  const categoryOptions = computed<{ label: string; value: string }[]>(() => {
    const set = new Set<string>();
    for (const s of store.sessions) set.add(workspaceKeyOf(s));
    return Array.from(set)
      .sort((a, b) => a.localeCompare(b))
      .map((k) => ({ label: k, value: k }));
  });

  /** Agent 角色候选项：本地角色库 ∪ 会话里出现过的角色名。 */
  const agentRoleOptions = computed<{ label: string; value: string }[]>(() => {
    const set = new Set<string>();
    for (const r of agentRoles.roles) {
      if (r.name.trim() !== '') set.add(r.name.trim());
    }
    for (const s of store.sessions) {
      const name = agentRoleOf(s);
      if (name !== '') set.add(name);
    }
    return Array.from(set)
      .sort((a, b) => a.localeCompare(b))
      .map((k) => ({ label: k, value: k }));
  });

  /** 单条会话是否命中当前三维过滤。 */
  function matchFilters(s: Session): boolean {
    const f = filters.value;
    if (f.category !== '' && workspaceKeyOf(s) !== f.category) return false;
    if (f.agentRole !== '' && agentRoleOf(s) !== f.agentRole) return false;
    if (f.timeRange !== 'all') {
      const span = TIME_RANGE_MS[f.timeRange];
      const ts = new Date(s.updated_at).getTime();
      if (!Number.isFinite(ts)) return false;
      if (Date.now() - ts > span) return false;
    }
    return true;
  }

  // ── 搜索 + 过滤 ──
  const list = computed(() => {
    const q = search.value.trim().toLowerCase();
    // 🔴 B10-③（F30）：先排除归档会话。存量实现 `base = store.sessions` **完全不过滤
    // archived**，导致 B-03 归档功能做完后归档会话仍显示在左栏。
    // ⚠️ `archived` 是 number（0/1）不是 boolean，判据必须写 `!s.archived`。
    const visible = store.sessions.filter((s) => !s.archived);
    const base = filterActive.value ? visible.filter(matchFilters) : visible;
    if (!q) return base;
    return base.filter((s) => {
      if (s.title.toLowerCase().includes(q)) return true;
      const msgs = store.messagesBySession[s.id];
      if (msgs && msgs.length) {
        return msgs.some((m) => (m.content ?? '').toLowerCase().includes(q));
      }
      return false;
    });
  });

  // ── 分组（B10：recent / pinned / byWorkspace 三组，Q8 非互斥）──

  /**
   * 当前处于 running 态的会话 id 集合（§7.7，真源 = `chatStore.runState`）。
   *
   * 🔴 **不要改回 `store.agentStates`**（缺陷 #4，主理人已采信）：
   * `agentStates` 的唯一写入点是 `chat.ts:237` 的
   * `agentStates[session.id] = config.agent` —— 存的是**专家角色名**（'pm'/'dev'），
   * 全仓从没有一行往里写过 `'running'`，照它判定会得到恒空集，
   * 导致 F-04 整条「运行中」需求实现了却看不见效果。
   *
   * 真源是 `runState: Record<sessionId, RunState>`（`'idle' | 'running' | 'aborting'`，
   * chat.ts:48 声明 / :881 导出，由 WS 事件与 send/stop 驱动），
   * ChatView.vue:26、ChatInput.vue:42、MessageList.vue:111 早已在正确消费它。
   */
  const runningIds = computed<Set<string>>(() => {
    const ids = new Set<string>();
    for (const [sid, state] of Object.entries(store.runState)) {
      if (state === 'running') ids.add(sid);
    }
    return ids;
  });

  /**
   * Recent 并集算法（§3.5 规范实现）：`running ∪ 前 maxCount 条 ∪ withinHours 小时内活跃`。
   *
   * ⚠️ 刻意依赖 JS `Map.set()` 对已存在 key **不改变插入顺序**的语义：
   * running 先入 Map 故稳定居首，其余按 `updated_at` 倒序。单测已锁死此行为。
   */
  function computeRecent(all: Session[], running: Set<string>, now = Date.now()): Session[] {
    const sorted = [...all]
      .filter((s) => !s.archived)
      .sort((a, b) => b.updated_at - a.updated_at);

    const bucket = new Map<string, Session>();
    // ① running（最高优先级，先入 Map 保证排最前）
    for (const s of sorted) if (running.has(s.id)) bucket.set(s.id, s);
    // ② 倒序前 maxCount 条
    for (const s of sorted.slice(0, RECENT_DEFAULTS.maxCount)) bucket.set(s.id, s);
    // ③ withinHours 小时内活跃
    for (const s of sorted) {
      if (isWithinHours(s.updated_at, RECENT_DEFAULTS.withinHours, now)) bucket.set(s.id, s);
    }
    return [...bucket.values()].slice(0, RECENT_HARD_CAP);
  }

  /**
   * 工作区分组（§3.5b 规范实现）。
   *
   * 组间：目录名字典序**升序**，未绑定组恒置最末（U7 / PM 裁决，不可改成按活跃度）。
   * 组内：`updated_at` 倒序。
   */
  function computeByWorkspace(all: Session[]): WorkspaceGroup[] {
    const map = new Map<string, Session[]>();
    for (const s of all) {
      if (s.archived) continue; // ✅ 必须保留：归档过滤（B10-③ / F30）
      // ⚠️ 这里【没有】跳过 pinned 的分支 —— 置顶会话必须同时出现在工作区组（Q8 非互斥）。
      //    存量实现在此处有个 `continue` 把置顶踢出去了，已按 B10-① 删除。
      const key = workspaceKeyOf(s);
      const arr = map.get(key);
      if (arr) arr.push(s);
      else map.set(key, [s]);
    }
    return [...map.entries()]
      .sort(([a], [b]) => WORKSPACE_SORT.compareGroup(a, b))
      .map(([key, items]) => ({
        key,
        // 未绑定组展示中文文案，但 key 保持英文字面量不变（F24：它是落库值）
        label: key === UNBOUND_WORKSPACE_KEY ? UNBOUND_WORKSPACE_LABEL : key,
        items: [...items].sort(WORKSPACE_SORT.compareSession),
      }));
  }

  /**
   * 三分组产物：`{ recent, pinned, byWorkspace }`。
   *
   * 🔴 Q8 **非互斥**：同一会话可同时出现在 recent、pinned、某工作区组里。
   *    渲染时 key 必须写 `` `${groupKey}:${s.id}` `` 防冲突（§7.6）。
   * 🔴 B10-②：`pinned` 判据是 **`s.pinned`（服务端字段）**，不再读
   *    `store.pinnedSessions` 本地 Set —— 后者刷新即丢（F6）。
   */
  const getGroupedSessions = computed<GroupedSessions>(() => {
    const filtered = list.value;
    return {
      recent: computeRecent(filtered, runningIds.value),
      pinned: filtered.filter((s) => !s.archived && !!s.pinned).sort(WORKSPACE_SORT.compareSession),
      byWorkspace: computeByWorkspace(filtered),
    };
  });

  // ── 重命名 ──
  const editingId = ref<string | null>(null);
  const editTitle = ref('');

  function startRename(s: Session) {
    editingId.value = s.id;
    editTitle.value = s.title;
  }

  function commitRename() {
    if (editingId.value) {
      store.renameSession(editingId.value, (editTitle.value || '').trim() || '新会话');
    }
    editingId.value = null;
  }

  // ── 删除 ──
  function remove(s: Session) {
    store.deleteSession(s.id);
  }

  // ── 导出 ──
  const exportingId = ref<string | null>(null);

  async function doExport(s: Session) {
    if (exportingId.value) return;
    exportingId.value = s.id;
    try {
      const blob = await exportSession(s.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const safeTitle = (s.title || '会话').replace(/[\\/:*?"<>|]/g, '_').slice(0, 60);
      const date = new Date().toISOString().slice(0, 10);
      a.download = `${safeTitle}_${date}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('导出成功');
    } catch (err: any) {
      toast.error(err?.message || '导出失败');
    } finally {
      exportingId.value = null;
    }
  }

  // ── 拖拽排序 ──
  const dragIdx = ref<number | null>(null);

  function onDragStart(e: DragEvent, idx: number) {
    dragIdx.value = idx;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(idx));
    }
  }

  function onDragOver(e: DragEvent, _idx: number) {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
  }

  function onDrop(e: DragEvent, targetIdx: number) {
    e.preventDefault();
    if (dragIdx.value === null || dragIdx.value === targetIdx) {
      dragIdx.value = null;
      return;
    }
    const arr = store.sessions;
    const [item] = arr.splice(dragIdx.value, 1);
    arr.splice(targetIdx, 0, item);
    dragIdx.value = null;
  }

  function onDragEnd() {
    dragIdx.value = null;
  }

  // ── 右键菜单 ──
  const contextMenu = ref<ContextMenuState | null>(null);

  function openMenu(e: MouseEvent, session: Session) {
    e.preventDefault();
    contextMenu.value = { x: e.clientX, y: e.clientY, session };
  }

  function closeMenu() {
    contextMenu.value = null;
  }

  function onMenuAction(action: string, session: Session) {
    closeMenu();
    switch (action) {
      case 'rename':
        startRename(session);
        break;
      case 'export':
        doExport(session);
        break;
      case 'bind-workspace':
        // 真实闭环：Electron 走原生文件夹选择器，Web 走 prompt，结果写回会话列表（§7.5 空态约定：不出现占位文案）
        store
          .setWorkspace(session.id, null)
          .then(() => toast.success('工作区已更新'))
          .catch((e: unknown) => toast.error(String((e as { message?: string })?.message ?? e)));
        break;
    }
  }

  function onGlobalClick(_e: MouseEvent) {
    if (contextMenu.value) closeMenu();
  }

  onMounted(() => document.addEventListener('click', onGlobalClick, true));
  onUnmounted(() => document.removeEventListener('click', onGlobalClick, true));

  // ── 工具函数 ──
  function abbreviateWorkspace(path: string | null | undefined, max = 30): string {
    if (!path) return '';
    const normalized = String(path).replace(/\\/g, '/');
    if (normalized.length <= max) return normalized;
    return '…' + normalized.slice(-(max - 1));
  }

  return {
    search,
    list,
    getGroupedSessions,
    // V3 S3.6：过滤
    filters,
    filterActive,
    clearFilters,
    categoryOptions,
    agentRoleOptions,
    editingId,
    editTitle,
    startRename,
    commitRename,
    remove,
    doExport,
    exportingId,
    dragIdx,
    onDragStart,
    onDragOver,
    onDrop,
    onDragEnd,
    contextMenu,
    openMenu,
    closeMenu,
    onMenuAction,
    abbreviateWorkspace,
  };
}
