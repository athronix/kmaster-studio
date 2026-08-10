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
import { TIME_RANGE_MS, LS_KEYS, lsGet, lsSet, type TimeRange } from '../constants/layout';
import {
  UNBOUND_WORKSPACE_KEY,
} from '../constants/sidebar';
import { getGroupedSessions as groupSessions } from '../utils/sessionGrouping';
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
  /** SL-04 新增：已归档会话列表（showArchived=true 时有值）。 */
  archived: Session[];
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

  // ── SL-04：归档会话可见性开关 ──
  const showArchived = ref(lsGet<boolean>(LS_KEYS.showArchived, false));

  /** 切换 showArchived 并持久化到 localStorage。 */
  function toggleShowArchived(): void {
    showArchived.value = !showArchived.value;
    lsSet(LS_KEYS.showArchived, showArchived.value);
  }

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
    // SL-04：showArchived 为 true 时不过滤 archived；默认 false 时排除 archived。
    const visible = showArchived.value
      ? store.sessions
      : store.sessions.filter((s) => !s.archived);
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
   * 已归档会话列表（SL-04）。
   *
   * 当 `showArchived === true` 时，从 store 全量筛选 `archived === 1` 的会话。
   * 不经过搜索/过滤管线（Q2：归档量通常不大，加搜索/过滤无实际收益）。
   */
  const archivedSessions = computed<Session[]>(() => {
    if (!showArchived.value) return [];
    return store.sessions.filter((s) => s.archived === 1);
  });

  /**
   * 三分组产物：`{ recent, pinned, byWorkspace, archived }`。
   *
   * 🔴 Q8 **非互斥**：同一会话可同时出现在 recent、pinned、某工作区组里。
   *    渲染时 key 必须写 `` `${groupKey}:${s.id}` `` 防冲突（§7.6）。
   * 🔴 B10-②：`pinned` 判据是 **`s.pinned`（服务端字段）**，不再读
   *    `store.pinnedSessions` 本地 Set —— 后者刷新即丢（F6）。
   *
   * SL-01 改造：分组算法已下沉为 `utils/sessionGrouping.ts` 纯函数。
   */
  const getGroupedSessions = computed<GroupedSessions>(() => {
    const filtered = list.value;
    const result = groupSessions(filtered, runningIds.value);
    result.archived = archivedSessions.value;
    return result;
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
    // SL-04：归档可见性
    showArchived,
    toggleShowArchived,
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
