<script setup lang="ts">
/**
 * LeftSidebar — 应用左栏（V3 T3 / S3.4 S3.5 S3.6 改造为「双导航态壳」）。
 *
 * V3 关键变更：
 * - **删除旧版「设置覆盖层」与「左栏折叠」两个 inject**（LayoutShell 已不再 provide）。
 *   左栏导航态唯一真源改为 `stores/layout.navMode`（派生自路由），折叠由 `layout.leftCollapsed` 单点驱动。
 * - `navMode === 'home'` → 首页导航（原内容，菜单区已移除「⚙️ 设置」按钮）；
 *   `navMode === 'settings'` → `<SettingsNav/>`（整栏切换，而非覆盖层）。
 * - 底栏改为「⚙️ 设置 ⟷ 🌙/☀️」同行两端。
 * - 菜单项持久选中高亮（按当前路由判定）+ 冷启动自动选中最近会话。
 * - 过滤面板升级为真实的三维过滤（workspace / 时间 / Agent 角色）。
 */
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import {
  NButton,
  NInput,
  NPopconfirm,
  NCollapse,
  NCollapseItem,
  NScrollbar,
  NPopover,
  NEmpty,
  NSelect,
  NSwitch,
  useMessage,
} from 'naive-ui';
import { useChatStore } from '../../stores/chat';
import { useJobsStore } from '../../stores/jobs';
import { useLayoutStore } from '../../stores/layout';
import { useSessionList } from '../../composables/useSessionList';
import { useWorkspacePicker } from '../../composables/useWorkspacePicker';
import { useCollapseState } from '../../composables/useCollapseState';
import { useSidebarCounts } from '../../composables/useSidebarCounts';
import { useTheme } from '../../styles/theme';
import { LS_KEYS, TIME_RANGE_OPTIONS, lsGet, lsSet, type TimeRange } from '../../constants/layout';
import { SIDEBAR_GROUP, SIDEBAR_COLLAPSE_KEYS } from '../../constants/sidebar';
import { timeAgo } from '../../utils/time';
import { isDesktop } from '../../utils/desktop-bridge';
import { errText } from '../../api/client';
import { AGENT_STATUS_ICONS, type AgentState } from '../../types/agent';
import type { CronJob, Session } from '../../types/chat';
import type { NewTaskConfig } from '../../types/newTask';
import NewTaskDialog from '../dialog/NewTaskDialog.vue';
import SettingsNav from './SettingsNav.vue';
import DirPickerModal from '../common/DirPickerModal.vue';
import KIcon from '../common/KIcon.vue';

const router = useRouter();
const store = useChatStore();
const jobsStore = useJobsStore();
const layout = useLayoutStore();
const theme = useTheme();
const message = useMessage();

const sl = useSessionList();
const { show: wsShow, initialPath: wsInitialPath, open: wsOpen, resolve: wsResolve, cancel: wsCancel } = useWorkspacePicker();

/**
 * 右键「绑定工作区」：桌面端调系统原生选择器（store.setWorkspace(sid, null) 走 pickFolder），
 * Web 端用 DirPickerModal 选目录后写回会话；全仓不再使用 prompt 手输。
 */
async function onBindWorkspace(session: Session): Promise<void> {
  try {
    if (isDesktop()) {
      await store.setWorkspace(session.id, null);
    } else {
      const picked = await wsOpen(session.workspace ?? undefined);
      if (picked !== null) await store.setWorkspace(session.id, picked);
    }
    message.success('工作区已更新');
  } catch (e: unknown) {
    message.error(String((e as { message?: string })?.message ?? e));
  }
}

const { experts, skills, mcp, ensureLoaded } = useSidebarCounts();

/** 左栏导航态（唯一真源 = 路由派生）。 */
const navMode = computed<'home' | 'settings'>(() => layout.navMode);

// ── 搜索展开 ──
const searchOpen = ref(false);
const searchInputRef = ref<InstanceType<typeof NInput> | null>(null);

function toggleSearch(): void {
  searchOpen.value = !searchOpen.value;
}

function focusSearch(): void {
  searchOpen.value = true;
  setTimeout(() => {
    (searchInputRef.value as unknown as { focus?: () => void })?.focus?.();
  }, 50);
}

// ── 过滤 popover（S3.6：真实面板） ──
const filterOpen = ref(false);

/** 时间区间下拉选项（常量单一真源）。 */
const timeOptions = computed(() => TIME_RANGE_OPTIONS.map((o) => ({ label: o.label, value: o.value })));

function onFilterCategory(v: string | null): void {
  sl.filters.value = { ...sl.filters.value, category: v ?? '' };
}

function onFilterTime(v: TimeRange | null): void {
  sl.filters.value = { ...sl.filters.value, timeRange: v ?? 'all' };
}

function onFilterAgent(v: string | null): void {
  sl.filters.value = { ...sl.filters.value, agentRole: v ?? '' };
}

function onClearFilters(): void {
  sl.clearFilters();
}

// ── 定时任务数据 ──
const automations = computed<CronJob[]>(() => jobsStore.jobs);

/** Agent 状态图标；无状态返回 null。 */
function agentStatusIcon(sessionId: string): string | null {
  const state = store.agentStates[sessionId];
  if (!state) return null;
  return AGENT_STATUS_ICONS[state as AgentState] ?? null;
}

// ── 分组视图（B10 契约：{ recent, pinned, byWorkspace: WorkspaceGroup[] }）──
const grouped = computed(() => sl.getGroupedSessions.value);

/** P0-5: 最近会话下拉列表（前10个，按 updated_at 倒序，排除已归档）。 */
const recentDropdownSessions = computed(() =>
  [...store.sessions]
    .filter((s) => !s.archived)
    .sort((a, b) => b.updated_at - a.updated_at)
    .slice(0, 10),
);

/**
 * 折叠面板默认展开项（§3.8 / PM 修正）。
 *
 * ⚠️ 只展开 Recent 与置顶两组，**工作目录组一律默认收缩**。
 * 原实现是 `Object.keys(byWorkspace)`（默认展开全部工作目录），
 * 两点问题：① B10 已把 `byWorkspace` 从 Record 改成数组，`Object.keys` 会得到
 * `'0','1','2'` 这种下标，与 `:name` 完全对不上（缺陷 #5）；
 * ② 目录多时左栏会被一次性铺满，正是 F-05 要解决的问题。
 */
const defaultExpanded: string[] = [SIDEBAR_GROUP.RECENT, SIDEBAR_GROUP.PINNED, SIDEBAR_GROUP.ARCHIVED];

/** 折叠态持久化（B9 单例，key 走 `SIDEBAR_COLLAPSE_KEYS` 命名空间）。 */
const collapse = useCollapseState();

/** 当前展开的 collapse name 列表（受控，写回 localStorage）。 */
const expandedNames = computed<string[]>(() => {
  const names: string[] = [];
  if (collapse.isExpanded(SIDEBAR_COLLAPSE_KEYS.recent, false)) names.push(SIDEBAR_GROUP.RECENT);
  if (collapse.isExpanded(SIDEBAR_COLLAPSE_KEYS.pinned, false)) names.push(SIDEBAR_GROUP.PINNED);
  // SL-04：已归档分组默认展开
  if (collapse.isExpanded(SIDEBAR_COLLAPSE_KEYS.archived, false)) names.push(SIDEBAR_GROUP.ARCHIVED);
  for (const g of grouped.value.byWorkspace) {
    // 工作目录组默认收缩（defaultCollapsed = true）
    if (collapse.isExpanded(SIDEBAR_COLLAPSE_KEYS.workspace(g.key), true)) names.push(g.key);
  }
  return names;
});

/** collapse 展开变化 → 反推折叠态并落盘。 */
function onExpandedChange(names: string[]): void {
  const allKeys = [
    SIDEBAR_COLLAPSE_KEYS.recent,
    SIDEBAR_COLLAPSE_KEYS.pinned,
    SIDEBAR_COLLAPSE_KEYS.archived,
    ...grouped.value.byWorkspace.map((g) => SIDEBAR_COLLAPSE_KEYS.workspace(g.key)),
  ];
  const expandedKeys = names.map((n) => {
    if (n === SIDEBAR_GROUP.RECENT) return SIDEBAR_COLLAPSE_KEYS.recent;
    if (n === SIDEBAR_GROUP.PINNED) return SIDEBAR_COLLAPSE_KEYS.pinned;
    if (n === SIDEBAR_GROUP.ARCHIVED) return SIDEBAR_COLLAPSE_KEYS.archived;
    return SIDEBAR_COLLAPSE_KEYS.workspace(n);
  });
  collapse.syncFromExpanded(allKeys, expandedKeys);
}

/** 会话副行相对时间（F-05，取代原来的 `toLocaleString()`）。 */
function sessionSub(updatedAt: number): string {
  return timeAgo(updatedAt);
}

/**
 * 置顶切换（缺陷 #3 修复）。
 *
 * `store.togglePin` 已是「乐观更新 + PATCH + 失败回滚并**上抛**」的 async，
 * 裸调用会导致请求失败时状态静默回滚、用户毫无感知。
 * 这里必须 await + catch，且 toast 走 `errText()` 而非 `e.message`
 * （否则会把 `400 {"ok":false,...}` 原始 JSON 吐给用户，缺陷 #1）。
 */
async function onTogglePin(sessionId: string): Promise<void> {
  try {
    await store.togglePin(sessionId);
  } catch (e) {
    message.error(errText(e, '置顶失败'));
  }
}

// ── 菜单持久选中高亮（S3.5） ──
const currentPath = computed<string>(() => layout.currentPath);

/** 菜单项是否处于选中态（路由前缀匹配）。 */
function isMenuActive(path: string): boolean {
  if (path === '/') return currentPath.value === '/';
  return currentPath.value.startsWith(path);
}

function onMenuClick(route: string): void {
  if (currentPath.value === route) return;
  void router.push(route);
}

// ── 新建会话弹窗 ──
const showNewTask = ref(false);
const prefAgent = ref<string | null>(null);

function onNewTaskClick(): void {
  prefAgent.value = null;
  showNewTask.value = true;
}

async function onNewTaskConfirm(config: NewTaskConfig): Promise<void> {
  try {
    await store.createSessionWithConfig(config);
    showNewTask.value = false;
    if (router.currentRoute.value.path !== '/') {
      void router.push('/');
    }
  } catch {
    // 创建失败静默处理（store 内部已提示）
  }
}

/** 从详情页「召唤」：带入 agent 预选并打开新建会话弹窗。 */
function summonWithAgent(agentId: string): void {
  prefAgent.value = agentId;
  showNewTask.value = true;
}

defineExpose({ focusSearch, summonWithAgent });

// ── 设置进出（S3.4：整栏切换，非覆盖层） ──
function onEnterSettings(): void {
  void router.push(layout.enterSettings());
}

function onExitSettings(): void {
  void router.push(layout.exitSettings());
}

function onSelectCategory(category: string): void {
  void router.push(`/settings/${category}`);
}

// ── 会话选中：持久化 + 冷启动恢复（S3.5） ──
interface SessionSnapshot {
  lastSessionId: string;
}

function openSession(id: string): void {
  store.openSession(id);
  lsSet(LS_KEYS.session, { lastSessionId: id } satisfies SessionSnapshot);
  // P0-1: 在非会话页（如 /skills）点击左栏会话项，跳转到首页
  if (router.currentRoute.value.path !== '/') {
    void router.push('/');
  }
}

/** 冷启动自动选中最近会话：优先上次会话，其次列表首项；无会话则保持空态。 */
function restoreLastSession(): void {
  if (store.activeSessionId) return;
  const sessions = store.sessions;
  if (sessions.length === 0) return;
  const snap = lsGet<Partial<SessionSnapshot>>(LS_KEYS.session, {});
  const wanted = typeof snap.lastSessionId === 'string' ? snap.lastSessionId : '';
  const hit = sessions.find((s) => s.id === wanted);
  if (hit) store.openSession(hit.id);
}

onMounted(() => {
  restoreLastSession();
  ensureLoaded();
  // P0-6: 非 ChatView 路由（如 /skills）不会触发 ChatView.onMounted 中的 loadSessions，
  // 左栏在此兜底加载，确保刷新后会话列表可见
  store.loadSessions().catch(() => {});
});

// 会话列表可能在挂载后才由 socket 灌入，首次非空时补一次恢复
watch(
  () => store.sessions.length,
  (len, prev) => {
    if (prev === 0 && len > 0) restoreLastSession();
  }
);
</script>

<template>
  <aside class="km-sidebar">
    <!-- ══════════ 设置导航态 ══════════ -->
    <SettingsNav
      v-if="navMode === 'settings'"
      @select="onSelectCategory"
      @back="onExitSettings"
    />

    <!-- ══════════ 首页导航态 ══════════ -->
    <template v-else>
      <!-- 顶端图标栏 -->
      <div class="km-sidebar-top">
        <span class="km-sidebar-version">kmaster v1.0</span>
        <div class="km-sidebar-top-actions">
          <n-button
            quaternary
            circle
            size="small"
            title="搜索会话"
            @click="toggleSearch"
          >
            <template #icon><KIcon name="Search" :size="16" /></template>
          </n-button>
          <n-popover
            :show="filterOpen"
            trigger="click"
            placement="bottom-end"
            @update:show="(v: boolean) => (filterOpen = v)"
          >
            <template #trigger>
              <n-button
                quaternary
                circle
                size="small"
                title="筛选会话"
                :class="{ 'km-filter-on': sl.filterActive.value }"
                @click="filterOpen = !filterOpen"
              >
                <template #icon><KIcon name="ChevronDown" :size="16" /></template>
              </n-button>
            </template>
            <div class="km-filter-panel">
              <div class="km-filter-title">筛选会话</div>

              <div class="km-filter-row">
                <div class="km-filter-label">工作区</div>
                <n-select
                  size="small"
                  clearable
                  placeholder="全部工作区"
                  :value="sl.filters.value.category === '' ? null : sl.filters.value.category"
                  :options="sl.categoryOptions.value"
                  @update:value="onFilterCategory"
                />
              </div>

              <div class="km-filter-row">
                <div class="km-filter-label">时间范围</div>
                <n-select
                  size="small"
                  :value="sl.filters.value.timeRange"
                  :options="timeOptions"
                  @update:value="onFilterTime"
                />
              </div>

              <div class="km-filter-row">
                <div class="km-filter-label">Agent 角色</div>
                <n-select
                  size="small"
                  clearable
                  placeholder="全部角色"
                  :value="sl.filters.value.agentRole === '' ? null : sl.filters.value.agentRole"
                  :options="sl.agentRoleOptions.value"
                  @update:value="onFilterAgent"
                />
              </div>

              <div class="km-filter-foot">
                <span class="km-filter-count">命中 {{ sl.list.value.length }} 个会话</span>
                <n-button
                  size="tiny"
                  tertiary
                  :disabled="!sl.filterActive.value"
                  @click="onClearFilters"
                >清空过滤</n-button>
              </div>
            </div>
          </n-popover>

          <!-- P0-5: 会话下拉菜单 -->
          <n-popover
            trigger="click"
            placement="bottom-end"
          >
            <template #trigger>
              <n-button
                quaternary
                circle
                size="small"
                title="最近会话"
              >
                <template #icon><KIcon name="Message" :size="16" /></template>
              </n-button>
            </template>
            <div class="km-session-dropdown">
              <div class="km-sd-title">最近会话</div>
              <div v-if="!recentDropdownSessions.length" class="km-sd-empty">
                暂无会话
              </div>
              <div
                v-for="s in recentDropdownSessions"
                :key="s.id"
                class="km-sd-item"
                :class="{ 'km-sd-active': s.id === store.activeSessionId }"
                @click="openSession(s.id)"
              >
                <span class="km-sd-name">{{ s.title || '新会话' }}</span>
                <span class="km-sd-time">{{ sessionSub(s.updated_at) }}</span>
              </div>
            </div>
          </n-popover>
        </div>
      </div>

      <!-- 搜索输入 -->
      <div v-if="searchOpen" class="km-sidebar-search">
        <n-input
          ref="searchInputRef"
          v-model:value="sl.search.value"
          placeholder="搜索会话…"
          size="small"
          clearable
        />
      </div>

      <!-- 按钮菜单（V3：已移除「设置」按钮，下沉到底栏） -->
      <div class="km-sidebar-menu">
        <n-button type="default" secondary block size="small" @click="onNewTaskClick">
          <template #icon><KIcon name="Plus" :size="18" /></template>
          新建会话
        </n-button>
        <n-button
          block
          size="small"
          :secondary="!isMenuActive('/experts')"
          :type="isMenuActive('/experts') ? 'primary' : 'default'"
          :ghost="isMenuActive('/experts')"
          @click="onMenuClick('/experts')"
        >
          <template #icon><KIcon name="Robot" :size="18" /></template>
          专家
          <span class="km-menu-badge">{{ experts.installed }}/{{ experts.total }}</span>
        </n-button>
        <n-button
          block
          size="small"
          :secondary="!isMenuActive('/skills')"
          :type="isMenuActive('/skills') ? 'primary' : 'default'"
          :ghost="isMenuActive('/skills')"
          @click="onMenuClick('/skills')"
        >
          <template #icon><KIcon name="Puzzle" :size="18" /></template>
          技能
          <span class="km-menu-badge">{{ skills.installed }}/{{ skills.total }}</span>
        </n-button>
        <n-button
          block
          size="small"
          :secondary="!isMenuActive('/mcp')"
          :type="isMenuActive('/mcp') ? 'primary' : 'default'"
          :ghost="isMenuActive('/mcp')"
          @click="onMenuClick('/mcp')"
        >
          <template #icon><KIcon name="PlugConnected" :size="18" /></template>
          MCP
          <span class="km-menu-badge">{{ mcp.installed }}/{{ mcp.total }}</span>
        </n-button>
        <n-button
          block
          size="small"
          :secondary="!isMenuActive('/jobs')"
          :type="isMenuActive('/jobs') ? 'primary' : 'default'"
          :ghost="isMenuActive('/jobs')"
          @click="onMenuClick('/jobs')"
        >
          <template #icon><KIcon name="Clock" :size="18" /></template>
          定时任务
        </n-button>
      </div>

      <!-- SL-04：归档会话可见性开关 -->
      <div class="km-sidebar-archive-toggle">
        <n-switch
          :value="sl.showArchived.value"
          size="small"
          @update:value="sl.toggleShowArchived"
        />
        <span class="km-archive-label">显示已归档</span>
      </div>

      <!-- 会话列表区 -->
      <n-scrollbar class="km-sidebar-lists">
        <!-- 置顶会话 -->
        <div v-if="sl.getGroupedSessions.value.pinned.length" class="km-list-group">
          <div class="km-list-group-title"><KIcon name="Pinned" :size="14" /> 置顶会话</div>
          <div
            v-for="(s, idx) in sl.getGroupedSessions.value.pinned"
            :key="s.id"
            class="km-session-item"
            :class="{
              active: s.id === store.activeSessionId,
              'km-session-highlight': s.id === store.highlightedSessionId,
              'km-dragging': sl.dragIdx.value === idx,
            }"
            draggable="true"
            @click="sl.editingId.value !== s.id && openSession(s.id)"
            @contextmenu.prevent="sl.openMenu($event, s)"
            @dragstart="sl.onDragStart($event, idx)"
            @dragover="sl.onDragOver($event, idx)"
            @drop="sl.onDrop($event, idx)"
            @dragend="sl.onDragEnd"
          >
            <div class="km-session-main">
              <input
                v-if="sl.editingId.value === s.id"
                v-model="sl.editTitle.value"
                class="km-rename-input"
                @keyup.enter="sl.commitRename"
                @keyup.esc="sl.editingId.value = null"
                @click.stop
              />
              <template v-else>
                <div class="km-session-title">
                  <span v-if="agentStatusIcon(s.id)" class="km-agent-dot">{{ agentStatusIcon(s.id) }}</span>
                  {{ s.title || '新会话' }}
                </div>
                <div class="km-session-sub">{{ new Date(s.updated_at).toLocaleString() }}</div>
              </template>
            </div>
            <div class="km-session-actions" @click.stop>
              <button title="置顶" @click="store.togglePin(s.id)"><KIcon name="Pinned" :size="14" /></button>
              <button title="导出" @click="sl.doExport(s)"><KIcon name="Download" :size="14" /></button>
              <n-popconfirm @positive-click="sl.remove(s)">
                <template #trigger>
                  <button title="删除" class="danger"><KIcon name="Trash" :size="14" /></button>
                </template>
                确认删除会话「{{ s.title || '新会话' }}」？
              </n-popconfirm>
            </div>
          </div>
        </div>

        <!-- workspace 分组 -->
        <n-collapse :default-expanded-names="defaultExpanded">
          <n-collapse-item
            v-for="group in sl.getGroupedSessions.value.byWorkspace"
            :key="group.key"
            :name="group.key"
          >
            <template #header>
              <span class="km-list-group-title"><KIcon name="Folder" :size="14" /> {{ group.label }}</span>
              <span class="km-list-group-badge">{{ group.items.length }}</span>
            </template>
            <div
              v-for="s in group.items"
              :key="s.id"
              class="km-session-item"
              :class="{
                active: s.id === store.activeSessionId,
                'km-session-highlight': s.id === store.highlightedSessionId,
              }"
              @click="sl.editingId.value !== s.id && openSession(s.id)"
              @contextmenu.prevent="sl.openMenu($event, s)"
            >
              <div class="km-session-main">
                <div class="km-session-title">
                  <span v-if="agentStatusIcon(s.id)" class="km-agent-dot">{{ agentStatusIcon(s.id) }}</span>
                  {{ s.title || '新会话' }}
                </div>
                <div class="km-session-sub">{{ new Date(s.updated_at).toLocaleString() }}</div>
              </div>
              <div class="km-session-actions" @click.stop>
                <button title="置顶" @click="store.togglePin(s.id)"><KIcon name="Pinned" :size="14" /></button>
                <n-popconfirm @positive-click="sl.remove(s)">
                  <template #trigger>
                    <button title="删除" class="danger"><KIcon name="Trash" :size="14" /></button>
                  </template>
                  确认删除会话「{{ s.title }}」？
                </n-popconfirm>
              </div>
            </div>
          </n-collapse-item>

          <!-- SL-04：已归档会话分组 -->
          <n-collapse-item
            v-if="sl.showArchived.value && sl.getGroupedSessions.value.archived.length"
            :name="SIDEBAR_GROUP.ARCHIVED"
          >
            <template #header>
              <span class="km-list-group-title"><KIcon name="Archive" :size="14" /> 已归档</span>
              <span class="km-list-group-badge">{{ sl.getGroupedSessions.value.archived.length }}</span>
            </template>
            <div
              v-for="s in sl.getGroupedSessions.value.archived"
              :key="s.id"
              class="km-session-item km-archived-item"
              :class="{
                active: s.id === store.activeSessionId,
                'km-session-highlight': s.id === store.highlightedSessionId,
              }"
              @click="openSession(s.id)"
              @contextmenu.prevent="sl.openMenu($event, s)"
            >
              <div class="km-session-main">
                <div class="km-session-title">{{ s.title || '新会话' }}</div>
                <div class="km-session-sub">{{ new Date(s.updated_at).toLocaleString() }}</div>
              </div>
              <div class="km-session-actions" @click.stop>
                <button title="取消归档" @click="store.archiveSession(s.id, false)">
                  <KIcon name="Rotate" :size="14" />
                </button>
                <n-popconfirm @positive-click="sl.remove(s)">
                  <template #trigger>
                    <button title="删除" class="danger"><KIcon name="Trash" :size="14" /></button>
                  </template>
                  确认删除会话「{{ s.title || '新会话' }}」？
                </n-popconfirm>
              </div>
            </div>
          </n-collapse-item>
        </n-collapse>

        <!-- 定时任务列表 -->
        <div v-if="automations.length" class="km-list-group">
          <div class="km-list-group-title"><KIcon name="Clock" :size="14" /> 定时任务</div>
          <div
            v-for="job in automations"
            :key="job.id"
            class="km-session-item km-automation-item"
            @click="onMenuClick('/jobs')"
          >
            <div class="km-session-main">
              <div class="km-session-title">
                <span
                  class="km-agent-dot"
                  :style="{ color: job.enabled ? 'var(--km-success)' : 'var(--km-muted)' }"
                ><KIcon :name="job.enabled ? 'CircleDot' : 'Circle'" :size="12" /></span>
                {{ job.name }}
              </div>
              <div v-if="job.next_run_at" class="km-session-sub">
                下次：{{ new Date(job.next_run_at).toLocaleString() }}
              </div>
            </div>
          </div>
        </div>

        <n-empty
          v-if="!sl.list.value.length && !automations.length"
          class="km-sidebar-empty"
          :description="sl.filterActive.value ? '当前过滤条件下没有会话' : '暂无会话，点击「新建会话」开始'"
        >
          <template #extra>
            <n-button v-if="sl.filterActive.value" size="tiny" @click="onClearFilters">清空过滤</n-button>
            <n-button v-else size="tiny" type="primary" @click="onNewTaskClick">新建会话</n-button>
          </template>
        </n-empty>
      </n-scrollbar>

      <!-- 底栏（V3：设置 ⟷ 主题图标，同行两端） -->
      <div class="km-sidebar-bottom">
        <n-button quaternary size="small" title="打开设置" @click="onEnterSettings">
          <template #icon><KIcon name="Settings" :size="16" /></template>
          设置
        </n-button>
        <n-button
          quaternary
          circle
          size="small"
          :title="theme.isDark.value ? '切换亮色模式' : '切换暗色模式'"
          @click="theme.toggle()"
        >
          <template #icon><KIcon :name="theme.isDark.value ? 'Moon' : 'Sun'" :size="16" /></template>
        </n-button>
      </div>
    </template>

    <!-- 右键菜单（两态共用） -->
    <Teleport to="body">
      <div
        v-if="sl.contextMenu.value"
        class="km-context-menu"
        :style="{ left: sl.contextMenu.value.x + 'px', top: sl.contextMenu.value.y + 'px' }"
        @click.stop
      >
        <button class="km-cm-item" @click="sl.onMenuAction('rename', sl.contextMenu.value!.session)">
          <KIcon name="Pencil" :size="14" /> 重命名
        </button>
        <button class="km-cm-item" @click="sl.onMenuAction('export', sl.contextMenu.value!.session)">
          <KIcon name="Download" :size="14" /> 导出 Markdown
        </button>
        <button class="km-cm-item" @click="onBindWorkspace(sl.contextMenu.value!.session)">
          <KIcon name="Folder" :size="14" /> 绑定工作区
        </button>
        <n-popconfirm @positive-click="sl.remove(sl.contextMenu.value!.session); sl.closeMenu()">
          <template #trigger>
            <button class="km-cm-item km-cm-danger"><KIcon name="Trash" :size="14" /> 删除</button>
          </template>
          确认删除会话「{{ sl.contextMenu.value!.session.title || '新会话' }}」？
        </n-popconfirm>
      </div>
    </Teleport>

    <!-- 新建会话弹窗 -->
    <NewTaskDialog
      :show="showNewTask"
      :prefill-agent="prefAgent"
      @update:show="(v: boolean) => (showNewTask = v)"
      @confirm="onNewTaskConfirm"
      @cancel="showNewTask = false"
    />

    <!-- Web 端绑定工作区目录选择器 -->
    <DirPickerModal
      :show="wsShow"
      :initial-path="wsInitialPath"
      @select="wsResolve"
      @close="wsCancel"
    />
  </aside>
</template>

<style scoped>
.km-sidebar {
  display: flex;
  flex-direction: column;
  background: var(--km-sidebar-bg, var(--km-panel));
  border-right: 1px solid var(--km-border);
  min-width: 0;
  height: 100%;
}

/* 设置导航态下由 SettingsNav 自带边框，避免双线 */
.km-sidebar > :deep(.km-setnav) {
  flex: 1;
  min-height: 0;
  border-right: none;
}

/* ── 顶端 ── */
.km-sidebar-top {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--km-space-sm);
  padding: var(--km-space-10) var(--km-space-md);
  border-bottom: 1px solid var(--km-border);
}
.km-sidebar-version {
  font-size: var(--km-font-sm);
  opacity: 0.45;
  margin-right: auto;
}
.km-sidebar-top-actions {
  display: flex;
  gap: var(--km-space-xs);
}

/* 过滤生效时图标呈激活态 */
.km-filter-on {
  color: var(--km-accent);
  background: var(--km-user-bubble);
}

/* ── 搜索 ── */
.km-sidebar-search {
  padding: var(--km-space-sm) var(--km-space-md);
  border-bottom: 1px solid var(--km-border);
}

/* ── 菜单按钮 ── */
.km-sidebar-menu {
  display: flex;
  flex-direction: column;
  gap: var(--km-space-xs);
  padding: var(--km-space-sm);
}

/* ── 列表区 ── */
.km-sidebar-lists {
  flex: 1;
  min-height: 0;
}

.km-sidebar-empty {
  margin: var(--km-space-2xl) 0;
}

.km-list-group {
  padding: 0;
}
.km-list-group-title {
  font-size: var(--km-font-sm);
  font-weight: 600;
  opacity: 0.5;
  padding: var(--km-space-sm) var(--km-space-md) var(--km-space-xs);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.km-list-group-badge {
  font-size: var(--km-font-xs);
  opacity: 0.4;
  margin-left: var(--km-space-sm);
  background: var(--km-border);
  padding: 1px var(--km-space-6);
  border-radius: 999px;
}

/* ── 会话项 ── */
.km-session-item {
  display: flex;
  align-items: center;
  gap: var(--km-space-6);
  padding: var(--km-space-sm) var(--km-space-md);
  cursor: pointer;
  border-bottom: 1px solid transparent;
  border-left: 3px solid transparent;
  transition: background 0.15s ease;
  user-select: none;
}
.km-session-item:hover {
  background: var(--km-user-bubble);
}
.km-session-item.active {
  background: var(--km-user-bubble);
  border-left-color: var(--km-accent);
}
.km-session-item.km-dragging {
  opacity: 0.4;
}

.km-session-highlight {
  animation: km-flash 0.3s ease 2;
}

.km-session-main {
  flex: 1;
  min-width: 0;
}
.km-session-title {
  font-size: var(--km-font-13);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: flex;
  align-items: center;
  gap: var(--km-space-xs);
}
.km-session-sub {
  font-size: var(--km-font-sm);
  opacity: 0.5;
  margin-top: var(--km-space-2xs);
}
.km-agent-dot {
  font-size: var(--km-font-xs);
  flex-shrink: 0;
  line-height: 1;
}
.km-session-actions {
  display: none;
  gap: var(--km-space-2xs);
}
.km-session-item:hover .km-session-actions {
  display: flex;
}
.km-session-actions button {
  background: transparent;
  border: 1px solid var(--km-border);
  border-radius: var(--km-radius-sm);
  padding: 1px var(--km-space-xs);
  cursor: pointer;
  font-size: var(--km-font-sm);
  color: var(--km-text);
}
.km-session-actions button.danger:hover {
  background: var(--km-user-bubble);
  border-color: var(--km-danger);
  color: var(--km-danger);
}
.km-rename-input {
  width: 100%;
  background: var(--km-panel);
  color: var(--km-text);
  border: 1px solid var(--km-accent);
  border-radius: var(--km-radius-md);
  padding: var(--km-space-xs) var(--km-space-sm);
  outline: 2px solid transparent;
  font-size: var(--km-font-13);
}

.km-automation-item {
  opacity: 0.85;
}

/* ── 底栏 ── */
.km-sidebar-bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--km-space-sm) var(--km-space-md);
  border-top: 1px solid var(--km-border);
  font-size: var(--km-font-13);
  flex-shrink: 0;
}

/* ── 过滤面板 ── */
.km-filter-panel {
  padding: var(--km-space-xs);
  min-width: 230px;
  display: flex;
  flex-direction: column;
  gap: var(--km-space-10);
}
.km-filter-title {
  font-size: var(--km-font-13);
  font-weight: 600;
}
.km-filter-row {
  display: flex;
  flex-direction: column;
  gap: var(--km-space-xs);
}
.km-filter-label {
  font-size: var(--km-font-sm);
  opacity: 0.6;
}
.km-filter-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--km-space-sm);
  border-top: 1px solid var(--km-border);
  padding-top: var(--km-space-sm);
}
.km-filter-count {
  font-size: var(--km-font-sm);
  opacity: 0.55;
}

/* ── 右键菜单 ── */
.km-context-menu {
  position: fixed;
  z-index: 9999;
  background: var(--km-panel);
  border: 1px solid var(--km-border);
  border-radius: var(--km-radius-lg);
  padding: var(--km-space-xs);
  min-width: 170px;
  box-shadow: var(--km-shadow-card);
}
.km-cm-item {
  display: block;
  width: 100%;
  text-align: left;
  background: transparent;
  border: none;
  color: var(--km-text);
  font-size: var(--km-font-13);
  padding: var(--km-space-sm) var(--km-space-md);
  border-radius: var(--km-radius-md);
  cursor: pointer;
  transition: background 0.12s ease;
}
.km-cm-item:hover {
  background: var(--km-user-bubble);
}
.km-cm-danger:hover {
  background: var(--km-user-bubble);
  color: var(--km-danger);
}

@keyframes km-flash {
  0%, 100% { background: transparent; }
  50% { background: var(--km-highlight-bg, rgba(255, 215, 0, 0.3)); }
}

/* ── P0-5 会话下拉菜单 ── */
.km-session-dropdown {
  width: 260px;
  max-height: 360px;
  overflow-y: auto;
  padding: var(--km-space-xs);
}

.km-sd-title {
  font-size: var(--km-font-sm);
  font-weight: 600;
  opacity: 0.6;
  padding: var(--km-space-6) var(--km-space-sm);
  border-bottom: 1px solid var(--km-border);
  margin-bottom: var(--km-space-xs);
}

.km-sd-empty {
  font-size: var(--km-font-sm);
  opacity: 0.45;
  text-align: center;
  padding: var(--km-space-lg) 0;
}

.km-sd-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--km-space-6) var(--km-space-sm);
  border-radius: var(--km-radius-md);
  cursor: pointer;
  transition: background 0.12s ease;
}

.km-sd-item:hover {
  background: var(--km-user-bubble);
}

.km-sd-item.km-sd-active {
  background: var(--km-user-bubble);
}

.km-sd-name {
  font-size: var(--km-font-13);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
  margin-right: var(--km-space-sm);
}

.km-sd-time {
  font-size: var(--km-font-sm);
  opacity: 0.45;
  white-space: nowrap;
  flex-shrink: 0;
}

/* ── SL-04 归档开关 ── */
.km-sidebar-archive-toggle {
  display: flex;
  align-items: center;
  gap: var(--km-space-xs);
  padding: var(--km-space-6) var(--km-space-md);
  border-bottom: 1px solid var(--km-border);
}
.km-archive-label {
  font-size: var(--km-font-sm);
  opacity: 0.6;
}

/* ── SL-04 已归档会话降权 ── */
.km-archived-item {
  opacity: 0.55;
}
.km-archived-item:hover {
  opacity: 0.85;
}
.km-archived-item.active {
  opacity: 0.85;
}
</style>
