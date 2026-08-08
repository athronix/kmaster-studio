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
const itemCount = computed(() => entries.value.length + (pathParts.value.length > 0 ? 1 : 0));

/** 将 activeIndex 映射到实际条目索引（跳过 ".." 偏移） */
function entryIndexFromActive(): number {
  return pathParts.value.length > 0 ? activeIndex.value - 1 : activeIndex.value;
}

/** Enter 键：进入目录或上级 */
function onDirKeyEnter(): void {
  if (activeIndex.value < 0) return;
  if (pathParts.value.length > 0 && activeIndex.value === 0) {
    navigateUp();
  } else {
    const idx = entryIndexFromActive();
    const entry = entries.value[idx];
    if (entry) {
      void navigate(currentDir.value + '/' + entry.name);
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

// 起始路径：props.initialPath → C 盘根 → 用户主目录
const defaultStart = (() => {
  if (props.initialPath) return props.initialPath.replace(/\\/g, '/');
  // 尝试常见起点
  const home = (() => {
    try { return process.env.HOME || process.env.USERPROFILE || 'C:/Users'; }
    catch { return 'C:/Users'; }
  })();
  return home.replace(/\\/g, '/');
})();

// ── 导航 ──
const pathParts = computed(() => {
  const parts = currentDir.value.replace(/\\/g, '/').split('/').filter(Boolean);
  return parts;
});

const breadcrumbs = computed(() => {
  const parts = pathParts.value;
  const items: Array<{ name: string; path: string }> = [];
  if (currentDir.value.startsWith('/')) {
    items.push({ name: '/', path: '/' });
  }
  let accumulated = currentDir.value.match(/^[A-Z]:/) ? currentDir.value.slice(0, 3) : '';
  if (!accumulated && items.length === 0 && pathParts.value.length > 0) {
    // Windows drive letter
    if (/^[A-Z]$/i.test(parts[0])) {
      accumulated = parts[0] + ':/';
      items.push({ name: accumulated, path: accumulated });
    }
  }
  // Remaining parts
  const startIdx = accumulated ? 1 : 0;
  for (let i = startIdx; i < parts.length; i++) {
    // Build path
    if (accumulated) {
      accumulated = accumulated.replace(/\/$/, '') + '/' + parts[i];
    } else {
      accumulated = '/' + parts[i];
    }
    items.push({ name: parts[i], path: accumulated });
  }
  return items;
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
  currentDir.value = dir.replace(/\\/g, '/').replace(/\/$/, '');
  await loadDir(currentDir.value);
}

function navigateUp(): void {
  const parent = currentDir.value.replace(/\\/g, '/').replace(/\/[^/]+$/, '');
  if (parent && parent !== currentDir.value) {
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
      await navigate(defaultStart);
      activeIndex.value = itemCount.value > 0 ? 0 : -1;
      focusActiveItem();
    } else {
      activeIndex.value = -1;
    }
  }
);

// ── 挂载后自动聚焦第一个目录项 ──
onMounted(() => {
  if (props.show && itemCount.value > 0) {
    activeIndex.value = 0;
    focusActiveItem();
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
            <!-- 上级目录 -->
            <div
              v-if="pathParts.length > 0"
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
              :class="{ 'km-dir-item--active': activeIndex === idx + (pathParts.length > 0 ? 1 : 0) }"
              tabindex="0"
              @dblclick="navigate(currentDir + '/' + entry.name)"
              @keydown.enter.prevent="onDirKeyEnter"
              @keydown.up.prevent="onDirKeyUp"
              @keydown.down.prevent="onDirKeyDown"
            >
              <span class="km-dirpicker-icon"><KIcon name="Folder" :size="18" /></span>
              <NText class="km-dirpicker-entry-text">{{ entry.name }}</NText>
            </div>

            <div v-if="entries.length === 0 && !loading" class="km-dirpicker-empty">
              <NText depth="3">此目录为空</NText>
            </div>
          </NScrollbar>
        </NSpin>
      </div>

      <!-- 当前路径 -->
      <NText depth="3" class="km-dirpicker-path">{{ currentDir || '—' }}</NText>

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
