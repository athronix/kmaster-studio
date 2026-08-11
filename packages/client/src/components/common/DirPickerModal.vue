<script setup lang="ts">
/**
 * DirPickerModal — Web 端目录选择器（基于 /api/fs/list）。
 *
 * 桌面端有 pickFolder() 原生对话框时优先使用；
 * Web 端（hasFileSystemBridge() === false）用本组件。
 *
 * Props:
 *   show: boolean            — 是否显示
 *   initialPath: string      — 起始目录（默认用户主目录）
 *
 * Emits:
 *   select(path: string)     — 用户确认选择
 *   close()                  — 用户取消
 */
import { ref, watch, computed, nextTick, onMounted } from 'vue';
import { NModal, NButton, NSpace, NText, NSpin, NScrollbar } from 'naive-ui';
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

// ── 状态 ──
const loading = ref(false);
const currentDir = ref('');
const entries = ref<Array<{ name: string; isDirectory: boolean }>>([]);
const error = ref('');

// ── 键盘导航 ──
/** 当前高亮的列表项索引：-1 无选中，0 = ".."（如存在），1..N = entries */
const activeIndex = ref<number>(-1);

/** 列表项总数（含 ".."） */
const itemCount = computed(() => entries.value.length + (hasParentRow.value ? 1 : 0));

/** 将 activeIndex 映射到实际条目索引（跳过 ".." 偏移） */
function entryIndexFromActive(): number {
  return hasParentRow.value ? activeIndex.value - 1 : activeIndex.value;
}

/** 拼接子目录路径；先去掉父目录末尾斜杠，避免盘根 `c:/` 拼出 `c://sub`。 */
function joinPath(dir: string, name: string): string {
  return dir.replace(/\/+$/, '') + '/' + name;
}

/** 单击目录行：同步高亮索引（衔接键盘上下键）并进入该目录（REQ 1：单击即进入）。 */
function onDirClick(idx: number): void {
  const entry = entries.value[idx];
  if (!entry) return;
  activeIndex.value = idx + (hasParentRow.value ? 1 : 0);
  void navigate(joinPath(currentDir.value, entry.name));
}

/** Enter 键：进入目录或上级 */
function onDirKeyEnter(): void {
  if (activeIndex.value < 0) return;
  if (hasParentRow.value && activeIndex.value === 0) {
    navigateUp();
  } else {
    const idx = entryIndexFromActive();
    const entry = entries.value[idx];
    if (entry) {
      void navigate(joinPath(currentDir.value, entry.name));
    }
  }
}

/** ↑ 键：上移 */
function onDirKeyUp(): void {
  if (itemCount.value === 0) return;
  activeIndex.value = activeIndex.value <= 0 ? itemCount.value - 1 : activeIndex.value - 1;
}

/** ↓ 键：下移 */
function onDirKeyDown(): void {
  if (itemCount.value === 0) return;
  activeIndex.value = activeIndex.value >= itemCount.value - 1 ? 0 : activeIndex.value + 1;
}

/** 聚焦当前高亮项 */
function focusActiveItem(): void {
  void nextTick(() => {
    const el = document.querySelector('.km-dir-item--active') as HTMLElement | null;
    el?.focus();
  });
}

// 起始目录：Web 端不再依赖浏览器里不存在的 process.env.*，
// 而是从服务端白名单根（GET /api/fs/roots）取得，保证落在 isAllowed 之内。
const fallbackRoot = ref('');
/** 缓存服务端返回的白名单根，供 navigateUp 判断「..」是否越出合法根。 */
let cachedRoots: string[] = [];

/** 获取服务端允许访问的目录根；失败返回空数组。 */
async function loadRoots(): Promise<string[]> {
  try {
    const data = await http<{ ok: boolean; roots: string[] }>('/api/fs/roots');
    cachedRoots = data.roots ?? [];
    return cachedRoots;
  } catch {
    cachedRoots = [];
    return [];
  }
}

/**
 * 判断给定目录是否仍落在某个白名单根之下。
 * 与服务端 isAllowed 语义对齐（用 '/' 归一，避免 win/posix 分隔符差异）。
 * 两侧都去掉末尾分隔符，避免盘根 `c:/` + '/' = `c://` 导致子路径匹配失效。
 * 缓存为空（尚未拿到 roots）时放行，交由服务端判 403。
 */
function isWithinRoots(dir: string): boolean {
  if (cachedRoots.length === 0) return true;
  const d = dir.replace(/\\/g, '/').toLowerCase().replace(/\/+$/, '');
  return cachedRoots.some(r => {
    const root = r.replace(/\\/g, '/').toLowerCase().replace(/\/+$/, '');
    return d === root || d.startsWith(root + '/');
  });
}

/** 抽屉打开时的初始化：先取服务端根，再决定起始目录。 */
async function initPicker(): Promise<void> {
  const roots = await loadRoots();
  fallbackRoot.value = roots[0] ?? '';

  if (!fallbackRoot.value) {
    // 服务端无可用根（HOME / HERMES_HOME 均未配置），给出友好提示
    error.value = '服务器未配置可访问的目录根（HOME / HERMES_HOME）';
    activeIndex.value = -1;
    return;
  }

  if (props.initialPath) {
    await navigate(props.initialPath);
    if (error.value) {
      // initialPath 不在白名单内，回落到合法根
      await navigate(fallbackRoot.value);
    }
  } else {
    await navigate(fallbackRoot.value);
  }

  activeIndex.value = itemCount.value > 0 ? 0 : -1;
  focusActiveItem();
}

// ── 导航 ──
const pathParts = computed(() => {
  const parts = currentDir.value.replace(/\\/g, '/').split('/').filter(Boolean);
  return parts;
});

/** 当前目录是否为 Windows 盘根（`c:` / `c:/`）——盘根之上无上级，需隐藏「..」。 */
const isDriveRoot = computed(() => /^[A-Z]:\/?$/i.test(currentDir.value));

/** 是否渲染「..」上级行；盘根处不渲染（键盘索引也随之不计入）。 */
const hasParentRow = computed(() => pathParts.value.length > 0 && !isDriveRoot.value);

/**
 * 面包屑。
 * Windows：`pathParts[0]` 形如 `c:`（含冒号），单独作为可点击的顶层盘根面包屑
 * （path 保留末尾斜杠 `c:/`，因为 `c:` 在 Windows 语义里是「C 盘当前目录」而非盘根）。
 * POSIX：以 `/` 作为顶层面包屑。
 */
const breadcrumbs = computed(() => {
  const parts = pathParts.value;
  const items: Array<{ name: string; path: string }> = [];
  const hasDrive = parts.length > 0 && /^[A-Z]:$/i.test(parts[0]);
  let accumulated = '';
  let startIdx = 0;
  if (hasDrive) {
    accumulated = parts[0] + '/';
    items.push({ name: parts[0], path: accumulated });
    startIdx = 1;
  } else if (currentDir.value.startsWith('/')) {
    items.push({ name: '/', path: '/' });
  }
  for (let i = startIdx; i < parts.length; i++) {
    accumulated = accumulated === ''
      ? '/' + parts[i]
      : accumulated.replace(/\/+$/, '') + '/' + parts[i];
    items.push({ name: parts[i], path: accumulated });
  }
  return items;
});

/** 取路径末段目录名；盘根等取不到末段时返回空串，由调用方回退完整路径。 */
function baseName(p: string): string {
  return p.replace(/[\\/]+$/, '').split(/[\\/]/).pop() || '';
}

/** 「当前路径」行的展示文本：目录名优先，取不到则回退完整路径（REQ 3a）。 */
const currentDirLabel = computed(() => {
  if (currentDir.value === '') return '—';
  return baseName(currentDir.value) || currentDir.value;
});

// ── 加载目录 ──
async function loadDir(dir: string): Promise<void> {
  loading.value = true;
  error.value = '';
  try {
    const data = await http<{ ok: boolean; entries: Array<{ name: string; isDirectory: boolean; isFile: boolean }> }>(
      `/api/fs/list?dir=${encodeURIComponent(dir)}`
    );
    if (data.ok) {
      // 只显示目录 + 排序
      entries.value = (data.entries ?? [])
        .filter(e => e.isDirectory && !e.name.startsWith('.') && !e.name.startsWith('$'))
        .sort((a, b) => a.name.localeCompare(b.name));
    } else {
      entries.value = [];
      error.value = '无法列出此目录';
    }
  } catch (e: unknown) {
    error.value = `加载失败：${e instanceof Error ? e.message : String(e)}`;
    entries.value = [];
  } finally {
    loading.value = false;
  }
}

async function navigate(dir: string): Promise<void> {
  let norm = dir.replace(/\\/g, '/');
  // 盘根（c: / c:/）与 POSIX 根（/）保留末尾斜杠，便于服务端 isAllowed / readdir 正确解析。
  if (/^[A-Z]:\/?$/i.test(norm)) norm = norm.replace(/\/?$/, '/');
  else if (norm === '/') norm = '/';
  else norm = norm.replace(/\/+$/, '');
  currentDir.value = norm;
  await loadDir(currentDir.value);
}

function navigateUp(): void {
  if (!hasParentRow.value) return; // 盘根 / 顶层目录无上级，避免越出合法根
  let parent = currentDir.value.replace(/\\/g, '/').replace(/\/[^/]+$/, '');
  if (parent === '' && currentDir.value.startsWith('/')) {
    // POSIX：/home → '' 时回退到文件系统根 '/'
    parent = '/';
  }
  if (parent && parent !== currentDir.value) {
    // 不能越出合法根：试图跳出白名单根时直接停留，避免 403 空树
    if (!isWithinRoots(parent)) return;
    if (/^[A-Z]:$/i.test(parent)) {
      void navigate(parent + '/');
    } else {
      void navigate(parent);
    }
  }
}

// ── 选择 ──
function onSelectFolder(): void {
  emit('select', currentDir.value);
}

function onClose(): void {
  emit('close');
}

// ── 抽屉打开时初始化 ──
watch(
  () => props.show,
  async (visible) => {
    if (visible) {
      await initPicker();
    } else {
      activeIndex.value = -1;
    }
  }
);

// ── 挂载后自动聚焦第一个目录项（show 在挂载时即已为真时同步初始化）──
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

      <!-- 面包屑 -->
      <NSpace :size="2" class="km-dirpicker-breadcrumbs">
        <template v-for="(item, idx) in breadcrumbs" :key="idx">
          <span v-if="idx > 0" class="km-dirpicker-sep">/</span>
          <NButton text size="tiny" @click="navigate(item.path)">{{ item.name }}</NButton>
        </template>
      </NSpace>

      <!-- 目录列表 -->
      <div class="km-dirpicker-list-wrap">
        <NSpin :show="loading" class="km-dirpicker-spin">
          <NScrollbar v-if="!loading || entries.length" class="km-dirpicker-scrollbar">
            <!-- 上级目录（盘根处隐藏：已无上级） -->
            <div
              v-if="hasParentRow"
              class="km-dirpicker-row km-dirpicker-row-parent"
              :class="{ 'km-dir-item--active': activeIndex === 0 }"
              tabindex="0"
              @click="navigateUp"
              @keydown.enter.prevent="onDirKeyEnter"
              @keydown.up.prevent="onDirKeyUp"
              @keydown.down.prevent="onDirKeyDown"
            >
              <span class="km-dirpicker-icon"><KIcon name="FolderOpen" :size="18" /></span>
              <NText depth="2" class="km-dirpicker-entry-text">..</NText>
            </div>

            <div
              v-for="(entry, idx) in entries"
              :key="entry.name"
              class="km-dirpicker-row"
              :class="{ 'km-dir-item--active': activeIndex === idx + (hasParentRow ? 1 : 0) }"
              tabindex="0"
              :title="entry.name"
              @click="onDirClick(idx)"
              @keydown.enter.prevent="onDirKeyEnter"
              @keydown.up.prevent="onDirKeyUp"
              @keydown.down.prevent="onDirKeyDown"
            >
              <span class="km-dirpicker-icon"><KIcon name="Folder" :size="18" /></span>
              <NText class="km-dirpicker-entry-text">{{ entry.name }}</NText>
            </div>

            <div v-if="entries.length === 0 && !loading && !error" class="km-dirpicker-empty">
              <NText depth="3">此目录为空</NText>
            </div>

            <div v-if="error" class="km-dirpicker-error">
              <NText depth="3">{{ error }}</NText>
            </div>
          </NScrollbar>
        </NSpin>
      </div>

      <!-- 当前路径：显示目录名，悬停显示完整路径（REQ 3a） -->
      <NText depth="3" class="km-dirpicker-path" :title="currentDir">{{ currentDirLabel }}</NText>

      <!-- 操作按钮 -->
      <div class="km-dirpicker-actions">
        <NButton size="small" @click="onClose">取消</NButton>
        <NButton type="primary" size="small" @click="onSelectFolder">选择此目录</NButton>
      </div>
    </div>
  </NModal>
</template>

<style scoped>
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
}

/* ── 面包屑 ── */
.km-dirpicker-breadcrumbs {
  margin-bottom: var(--km-space-md);
  flex-wrap: wrap;
}

.km-dirpicker-sep {
  opacity: 0.4;
}

/* ── 目录列表容器 ── */
.km-dirpicker-list-wrap {
  flex: 1;
  min-height: 200px;
  border: 1px solid var(--km-border);
  border-radius: var(--km-radius-md);
  overflow: hidden;
}

.km-dirpicker-spin {
  height: 100%;
}

.km-dirpicker-scrollbar {
  max-height: 260px;
}

/* ── 行 ── */
.km-dirpicker-row {
  cursor: pointer;
  padding: var(--km-space-6) var(--km-space-10);
  display: flex;
  align-items: center;
  outline: 2px solid transparent;
}

.km-dirpicker-row:focus-visible {
  outline: 2px solid var(--km-accent);
  outline-offset: -2px;
  border-radius: var(--km-radius-sm);
}

.km-dir-item--active {
  background: var(--km-hover-bg);
}

.km-dirpicker-row-parent {
  border-bottom: 1px solid var(--km-border);
}

.km-dirpicker-icon {
  font-size: var(--km-font-16);
}

.km-dirpicker-entry-text {
  margin-left: 8px;
}

/* ── 空态 ── */
.km-dirpicker-empty {
  padding: var(--km-space-40) var(--km-space-10);
  text-align: center;
}

/* ── 错误态 ── */
.km-dirpicker-error {
  padding: var(--km-space-40) var(--km-space-10);
  text-align: center;
  color: var(--km-danger, #d03050);
}

/* ── 当前路径 ── */
.km-dirpicker-path {
  font-size: var(--km-font-sm);
  margin: 8px 0;
  word-break: break-all;
}

/* ── 操作按钮 ── */
.km-dirpicker-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--km-space-sm);
}
</style>
