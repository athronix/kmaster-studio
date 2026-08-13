<script setup lang="ts">
/**
 * DirPickerModal — Web 端目录选择器（基于 /api/fs/roots + /api/fs/list）。
 *
 * 交互模型：懒加载可展开目录树 + 单击选中。
 *   - 顶层节点 = 盘根（GET /api/fs/roots）。
 *   - 单击行 = 选中该目录（点击「选择此目录」时 emit('select') 确认）。
 *   - 单击箭头 ▶/▼ = 懒加载并展开/收起子目录（不进入下级，不导航）。
 *
 * Props:
 *   show: boolean       — 是否显示
 *   initialPath: string — 起始目录（不在白名单内则回落到首个合法根）
 *
 * Emits:
 *   select(path: string) — 用户确认选择
 *   close()              — 用户取消
 */
import { ref, watch, computed, onMounted } from 'vue';
import { NModal, NButton, NSpin } from 'naive-ui';
import { http } from '../../api/client';
import KIcon from './KIcon.vue';

const props = withDefaults(defineProps<{
  show: boolean;
  initialPath?: string;
}>(), {
  initialPath: '',
});

const emit = defineEmits<{
  select: [path: string];
  close: [];
}>();

// ── 节点模型 ──
/**
 * 树节点。
 *   name     展示名（baseName）。
 *   path     唯一键（= lowerKey(fullPath)，用于 expandedPaths/childrenCache/loadingPaths）。
 *   fullPath 绝对路径，全 `/` 分隔（用于请求 /api/fs/list 与 emit 选中路径）。
 *   isDir    恒为 true（树中仅目录）。
 */
interface FolderEntry {
  name: string;
  path: string;
  fullPath: string;
  isDir: boolean;
}

/** 服务端 /api/fs/list 响应体 */
interface FsListResponse {
  ok: boolean;
  entries: Array<{ name: string; isDirectory: boolean; isFile: boolean }>;
}

/** 服务端 /api/fs/roots 响应体 */
interface FsRootsResponse {
  ok: boolean;
  roots: string[];
}

/** DFS 扁平渲染节点 */
interface FlatNode {
  node: FolderEntry;
  depth: number;
  isExpanded: boolean;
  isLoading: boolean;
  hasChildren: boolean | null; // null = 尚未加载，未知
}

// ── 三件套状态 ──
const expandedPaths = ref<Set<string>>(new Set());
const childrenCache = ref<Map<string, FolderEntry[]>>(new Map());
const loadingPaths = ref<Set<string>>(new Set());

// ── 其它状态 ──
const loading = ref(false);     // 初始拉取盘根阶段
const error = ref('');
const selectedPath = ref('');   // 当前选中目录（真实大小写 fullPath）

/** 缓存服务端返回的白名单根（归一为全 `/` 分隔）。 */
const cachedRoots = ref<string[]>([]);
/** 回落根：cachedRoots[0]，initialPath 非法时使用。 */
const fallbackRoot = ref('');

// ── 路径工具 ──
/** 反斜杠统一为正斜杠。 */
function normalizeSlash(p: string): string {
  return p.replace(/\\/g, '/');
}

/** 取路径末段目录名；取不到末段（盘根/根）时返回空串，由调用方回退完整路径。 */
function baseName(p: string): string {
  return p.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || '';
}

/** 拼接子目录路径（全 `/` 分隔）；先去掉父目录末尾斜杠，避免盘根 `c:/` 拼出 `c://sub`。 */
function joinPath(dir: string, name: string): string {
  return dir.replace(/\/+$/, '') + '/' + name;
}

/** 去掉末尾分隔符后小写，用于大小写不敏感的匹配与键。 */
function lowerKey(p: string): string {
  return p.replace(/\\/g, '/').toLowerCase().replace(/\/+$/, '');
}

/** 判断归一后的路径是否为盘符根（如 `c:/`、`D:\`）；非 win32 环境下恒为 false。 */
function isDriveRoot(p: string): boolean {
  return /^[A-Z]:[\\/]?$/i.test(normalizeSlash(p));
}

/** 由绝对路径构造一个树节点（path 用 lowerKey 作为唯一键）。
 *  盘符根必须保留末尾 `/`（如 `c:/`、`d:/`）：
 *  否则 `toggleExpand` 会请求 `?dir=d:` 而 Windows 下 `fs.readdirSync('d:')`
 *  读取的是该进程的 D: 盘当前目录（per-drive cwd）而非 D: 根。 */
function makeNode(fullPath: string): FolderEntry {
  const norm = normalizeSlash(fullPath);
  if (isDriveRoot(norm)) {
    const withSlash = `${norm[0].toUpperCase()}:/`;
    return { name: withSlash, path: lowerKey(withSlash), fullPath: withSlash, isDir: true };
  }
  const stripped = norm.replace(/\/+$/, '') || norm;
  return {
    name: baseName(stripped) || stripped,
    path: lowerKey(stripped),
    fullPath: stripped,
    isDir: true,
  };
}

/** 判断给定目录是否落在某个白名单根之下（与服务端 isAllowed 语义对齐）。 */
function isWithinRoots(dir: string): boolean {
  if (cachedRoots.value.length === 0) return true;
  const d = lowerKey(dir);
  return cachedRoots.value.some(r => {
    const root = lowerKey(r);
    return d === root || d.startsWith(root + '/');
  });
}

/** 获取服务端允许访问的目录根；失败返回空数组。 */
async function loadRoots(): Promise<string[]> {
  try {
    const data = await http<FsRootsResponse>('/api/fs/roots');
    cachedRoots.value = (data.roots ?? []).map(normalizeSlash);
    return cachedRoots.value;
  } catch {
    cachedRoots.value = [];
    return [];
  }
}

// ── 顶层盘根节点（depth-0，可展开）──
// 只渲染盘符根（c:/、d:/），其余白名单根（HERMES_HOME、用户主目录等）保留在
// cachedRoots 供 isWithinRoots 校验，但不在顶层展示。非 win32 无盘符根时回退展示全部。
const rootNodes = computed<FolderEntry[]>(() => {
  const drives = cachedRoots.value.filter(r => isDriveRoot(r));
  if (drives.length > 0) {
    return drives.map(r => makeNode(r));
  }
  return cachedRoots.value.map(r => makeNode(r));
});

// ── 懒加载展开 ──
async function toggleExpand(node: FolderEntry): Promise<void> {
  if (expandedPaths.value.has(node.path)) {
    expandedPaths.value.delete(node.path);
    expandedPaths.value = new Set(expandedPaths.value);
    return;
  }

  expandedPaths.value.add(node.path);
  expandedPaths.value = new Set(expandedPaths.value);

  if (!childrenCache.value.has(node.path)) {
    loadingPaths.value.add(node.path);
    loadingPaths.value = new Set(loadingPaths.value);
    try {
      const data = await http<FsListResponse>(`/api/fs/list?dir=${encodeURIComponent(node.fullPath)}`);
      const children: FolderEntry[] = (data.entries ?? [])
        .filter(e => e.isDirectory && !e.name.startsWith('.') && !e.name.startsWith('$'))
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(e => {
          const fullPath = joinPath(node.fullPath, e.name);
          return { name: e.name, path: lowerKey(fullPath), fullPath, isDir: true };
        });
      childrenCache.value.set(node.path, children);
    } catch (e: unknown) {
      // 加载失败：缓存空列表避免重复请求，并记录错误文案
      childrenCache.value.set(node.path, []);
      error.value = `加载失败：${e instanceof Error ? e.message : String(e)}`;
    } finally {
      loadingPaths.value.delete(node.path);
      loadingPaths.value = new Set(loadingPaths.value);
      childrenCache.value = new Map(childrenCache.value);
    }
  }
}

/** 确保某路径已展开且其子目录已加载（用于 initialPath 自动展开祖先）。 */
async function ensureExpanded(path: string): Promise<void> {
  const key = lowerKey(path);
  if (expandedPaths.value.has(key) && childrenCache.value.has(key)) return;
  if (!childrenCache.value.has(key)) {
    await toggleExpand(makeNode(path));
  } else if (!expandedPaths.value.has(key)) {
    expandedPaths.value.add(key);
    expandedPaths.value = new Set(expandedPaths.value);
  }
}

// ── 选中（单击 = 选中，不进入下级）──
function selectFolder(node: FolderEntry): void {
  selectedPath.value = node.fullPath;
}

// ── 初始路径：自动展开祖先并选中 ──
async function expandToPath(rawTarget: string): Promise<void> {
  const norm = lowerKey(rawTarget);

  // 定位所属盘根
  let root: FolderEntry | null = null;
  for (const rn of rootNodes.value) {
    if (norm === rn.path || norm.startsWith(rn.path + '/')) {
      root = rn;
      break;
    }
  }
  if (!root) return;

  // 目标即盘根：直接选中
  if (norm === root.path) {
    selectedPath.value = root.fullPath;
    return;
  }

  // 逐级展开祖先
  let parent = root;
  const segs = norm.slice(root.path.length).replace(/^\/+/, '').split('/').filter(Boolean);
  for (const seg of segs) {
    await ensureExpanded(parent.fullPath);
    const children = childrenCache.value.get(parent.path) ?? [];
    const child = children.find(c => lowerKey(c.fullPath) === lowerKey(joinPath(parent.fullPath, seg)));
    if (!child) return; // 路径实际不存在，停止展开
    parent = child;
  }
  selectedPath.value = parent.fullPath;
}

// ── 抽屉打开时的初始化 ──
async function initPicker(): Promise<void> {
  loading.value = true;
  error.value = '';
  expandedPaths.value = new Set();
  childrenCache.value = new Map();
  loadingPaths.value = new Set();
  selectedPath.value = '';
  try {
    const roots = await loadRoots();
    // 回落根默认取首个盘符根（带末尾 `/`，如 `c:/`），而非 roots[0]（可能是
    // HERMES_HOME / 用户主目录等非盘符根）。无盘符根时再退回 roots[0]。
    const firstDrive = roots.find(r => isDriveRoot(r));
    fallbackRoot.value = firstDrive ? makeNode(firstDrive).fullPath : (roots[0] ?? '');
    if (!fallbackRoot.value) {
      // 服务端无可用根（HOME / HERMES_HOME 均未配置）
      error.value = '服务器未配置可访问的目录根（HOME / HERMES_HOME）';
      return;
    }
    const target =
      props.initialPath && isWithinRoots(props.initialPath)
        ? normalizeSlash(props.initialPath).replace(/\/+$/, '') || normalizeSlash(props.initialPath)
        : fallbackRoot.value;
    await expandToPath(target);
    if (!selectedPath.value) {
      selectedPath.value = target;
    }
  } finally {
    loading.value = false;
  }
}

// ── 确认 / 取消 ──
function onSelectFolder(): void {
  if (selectedPath.value) {
    emit('select', selectedPath.value);
  }
}

function onClose(): void {
  emit('close');
}

// ── 底部「已选路径」展示：目录名优先，盘根回退完整路径 ──
const selectedDisplayName = computed<string>(() => {
  const p = selectedPath.value;
  if (!p) return '';
  const norm = lowerKey(p);
  const isRoot = cachedRoots.value.some(r => lowerKey(r) === norm);
  return isRoot ? p : baseName(p);
});

// ── DFS 扁平渲染 ──
const flatNodes = computed<FlatNode[]>(() => {
  const result: FlatNode[] = [];

  function traverse(entries: FolderEntry[], depth: number): void {
    for (const node of entries) {
      const isExpanded = expandedPaths.value.has(node.path);
      const isLoading = loadingPaths.value.has(node.path);
      const children = childrenCache.value.get(node.path);
      result.push({
        node,
        depth,
        isExpanded,
        isLoading,
        hasChildren: children ? children.length > 0 : null,
      });
      if (isExpanded && children && children.length > 0) {
        traverse(children, depth + 1);
      }
    }
  }

  traverse(rootNodes.value, 0);
  return result;
});

watch(
  () => props.show,
  async (visible) => {
    if (visible) {
      await initPicker();
    } else {
      selectedPath.value = '';
    }
  }
);

onMounted(() => {
  if (props.show) {
    void initPicker();
  }
});
</script>

<template>
  <NModal
    :show="show"
    :mask-closable="true"
    @update:show="(v: boolean) => { if (!v) onClose(); }"
  >
    <div class="km-dirpicker">
      <h3>选择目录</h3>

      <!-- 目录树 -->
      <div class="km-dirpicker-tree">
        <NSpin v-if="loading" size="small" class="km-dirpicker-tree-spin" />

        <template v-else>
          <div
            v-for="node in flatNodes"
            :key="node.node.path"
            class="km-dirpicker-row"
            :class="{ 'km-dir-item--selected': selectedPath === node.node.fullPath }"
            :style="{ paddingLeft: `${12 + node.depth * 16}px` }"
            :title="node.node.fullPath"
            @click="selectFolder(node.node)"
          >
            <span
              class="km-dirpicker-expand"
              @click.stop="toggleExpand(node.node)"
            >
              <NSpin v-if="node.isLoading" size="small" />
              <template v-else>{{ node.isExpanded ? '▼' : '▶' }}</template>
            </span>
            <span class="km-dirpicker-icon"><KIcon name="Folder" :size="18" /></span>
            <span class="km-dirpicker-entry-text">{{ node.node.name }}</span>
          </div>

          <!-- 展开后无子目录的空态 -->
          <template v-for="node in flatNodes" :key="'empty-' + node.node.path">
            <div
              v-if="node.isExpanded && !node.isLoading && node.hasChildren === false"
              class="km-dirpicker-empty-row"
              :style="{ paddingLeft: `${28 + node.depth * 16}px` }"
            >
              此目录为空
            </div>
          </template>

          <div v-if="error" class="km-dirpicker-error">{{ error }}</div>
          <div
            v-else-if="flatNodes.length === 0"
            class="km-dirpicker-empty"
          >
            暂无可访问的目录根
          </div>
        </template>
      </div>

      <!-- 已选路径条 -->
      <div v-if="selectedPath" class="km-dirpicker-selected" :title="selectedPath">
        <span class="km-dirpicker-selected-label">已选路径：</span>
        <span class="km-dirpicker-selected-path">{{ selectedDisplayName }}</span>
      </div>

      <!-- 操作按钮 -->
      <div class="km-dirpicker-actions">
        <NButton size="small" @click="onClose">取消</NButton>
        <NButton type="primary" size="small" :disabled="!selectedPath" @click="onSelectFolder">
          选择此目录
        </NButton>
      </div>
    </div>
  </NModal>
</template>

<style scoped lang="scss">
/* ── 模态容器 ── */
.km-dirpicker {
  width: 480px;
  max-height: 500px;
  background: var(--km-panel);
  border-radius: var(--km-radius-lg);
  padding: var(--km-space-lg);
  display: flex;
  flex-direction: column;
}

.km-dirpicker h3 {
  margin: 0 0 12px;
  font-size: var(--km-font-16);
  font-weight: 600;
  color: var(--km-text);
}

/* ── 目录树容器 ── */
.km-dirpicker-tree {
  flex: 1;
  min-height: 0;
  max-height: 260px;
  overflow-y: auto;
  border: 1px solid var(--km-border);
  border-radius: var(--km-radius-md);
  padding: var(--km-space-6) 0;
}

.km-dirpicker-tree-spin {
  display: flex;
  justify-content: center;
  padding: 24px;
}

/* ── 行 ── */
.km-dirpicker-row {
  cursor: pointer;
  padding: var(--km-space-6) var(--km-space-10);
  display: flex;
  align-items: center;
  gap: 4px;
  border-radius: var(--km-radius-sm);
  outline: 2px solid transparent;
}

.km-dirpicker-row:hover {
  background: var(--km-hover-bg);
}

.km-dirpicker-row.km-dir-item--selected {
  background: var(--km-hover-bg);
  outline: 1px solid var(--km-accent);
}

.km-dirpicker-expand {
  width: 16px;
  font-size: 10px;
  text-align: center;
  flex-shrink: 0;
  user-select: none;
  opacity: 0.6;
  color: var(--km-muted);
}

.km-dirpicker-icon {
  font-size: var(--km-font-16);
  flex-shrink: 0;
  color: var(--km-muted);
}

.km-dirpicker-entry-text {
  margin-left: 6px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

/* ── 空态 / 错误态 ── */
.km-dirpicker-empty-row,
.km-dirpicker-empty {
  opacity: 0.5;
  padding: var(--km-space-40) var(--km-space-10);
  text-align: center;
}

.km-dirpicker-error {
  padding: var(--km-space-40) var(--km-space-10);
  text-align: center;
  color: var(--km-danger);
}

/* ── 已选路径条 ── */
.km-dirpicker-selected {
  margin-top: 12px;
  padding: var(--km-space-6) var(--km-space-10);
  background: var(--km-accent-bg);
  border: 1px solid var(--km-accent-border);
  border-radius: var(--km-radius-md);
  font-size: var(--km-font-sm);
  display: flex;
  gap: 8px;
  align-items: center;
  min-width: 0;
}

.km-dirpicker-selected-label {
  opacity: 0.6;
  flex-shrink: 0;
}

.km-dirpicker-selected-path {
  font-family: monospace;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  color: var(--km-accent);
}

/* ── 操作按钮 ── */
.km-dirpicker-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--km-space-sm);
  margin-top: 12px;
}
</style>
