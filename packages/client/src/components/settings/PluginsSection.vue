<script setup lang="ts">
/**
 * PluginsSection — 设置 → 插件管理（T03 卡片化重写）。
 *
 * 从 NTable 表格改为卡片列表 + 搜索 + kind 过滤 + NPagination 分页。
 * 插件来自磁盘扫描（GET /api/plugins），无"市场"概念，单模块。
 * 每页 10 卡。
 *
 * Emits:
 *   open-detail(entity) — 卡片点击，传递 PluginItem 实体给父组件渲染详情面板
 */
import { computed, onMounted, ref, watch } from 'vue';
import {
  NButton,
  NEmpty,
  NInput,
  NPagination,
  NSelect,
  NSpin,
  useMessage,
} from 'naive-ui';
import KIcon from '../common/KIcon.vue';
import PluginCard from './PluginCard.vue';
import { getPlugins } from '../../api/client';
import { errText } from '../../api/client';
import type { PluginItem } from '../../types/chat';

const props = withDefaults(
  defineProps<{
    search?: string;
  }>(),
  { search: '' },
);

const emit = defineEmits<{
  'open-detail': [entity: PluginItem];
}>();

const message = useMessage();

const loading = ref(false);
const error = ref('');
const plugins = ref<PluginItem[]>([]);

/** 搜索关键词。 */
const searchQuery = ref('');

/** kind 过滤：空串 = 全部。 */
const kindFilter = ref<string>('');

/** 分页：当前页码。 */
const page = ref(1);

/** 每页卡片数。 */
const PAGE_SIZE = 10;

const KIND_OPTIONS: { label: string; value: string }[] = [
  { label: '全部类型', value: '' },
  { label: 'Platform (平台)', value: 'platform' },
  { label: 'Backend (后端)', value: 'backend' },
  { label: 'Model Provider (模型)', value: 'model-provider' },
  { label: 'Standalone (独立)', value: 'standalone' },
  { label: 'Other (其它)', value: 'other' },
];

/** 过滤后的插件列表。 */
const filteredPlugins = computed<PluginItem[]>(() => {
  let list = plugins.value;
  const q = searchQuery.value.trim().toLowerCase();
  if (q) {
    list = list.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.label ?? '').toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q),
    );
  }
  if (kindFilter.value) {
    list = list.filter((p) => p.kind === kindFilter.value);
  }
  return list;
});

/** 分页后的插件列表。 */
const pagedPlugins = computed<PluginItem[]>(() => {
  const start = (page.value - 1) * PAGE_SIZE;
  return filteredPlugins.value.slice(start, start + PAGE_SIZE);
});

/** 总页数。 */
const totalPages = computed<number>(() => {
  return Math.max(1, Math.ceil(filteredPlugins.value.length / PAGE_SIZE));
});

/** 是否过滤无结果。 */
const noMatch = computed<boolean>(
  () =>
    !loading.value &&
    !error.value &&
    plugins.value.length > 0 &&
    filteredPlugins.value.length === 0,
);

/** 全空。 */
const trulyEmpty = computed<boolean>(
  () => !loading.value && !error.value && plugins.value.length === 0,
);

async function load(): Promise<void> {
  loading.value = true;
  error.value = '';
  try {
    plugins.value = await getPlugins();
  } catch (e: unknown) {
    error.value = errText(e, '加载插件列表失败');
  } finally {
    loading.value = false;
  }
}

function onCardClick(plugin: PluginItem): void {
  emit('open-detail', plugin);
}

/** 过滤条件变化时重置页码。 */
watch([searchQuery, kindFilter], () => {
  page.value = 1;
});

/** 外部搜索 prop 同步到内部。 */
watch(
  () => props.search,
  (v) => {
    searchQuery.value = v ?? '';
  },
);

onMounted(() => {
  void load();
});
</script>

<template>
  <div class="ps-body">
    <!-- 工具栏 -->
    <div class="ps-toolbar">
      <div class="ps-toolbar-left">
        <n-input
          v-model:value="searchQuery"
          placeholder="搜索插件…"
          clearable
          size="small"
          style="width: 220px"
        >
          <template #prefix>
            <KIcon name="Search" :size="14" />
          </template>
        </n-input>
        <n-select
          v-model:value="kindFilter"
          :options="KIND_OPTIONS"
          size="small"
          style="width: 160px"
        />
      </div>
      <div class="ps-toolbar-right">
        <span v-if="!trulyEmpty && !error" class="ps-count">
          {{ filteredPlugins.length }} 个插件
        </span>
        <n-button size="small" tertiary :loading="loading" @click="load">
          <template #icon><KIcon name="Refresh" :size="14" /></template>
          刷新
        </n-button>
      </div>
    </div>

    <!-- 加载态 -->
    <n-spin :show="loading">
      <div class="ps-content">
        <!-- 错误态 -->
        <n-empty v-if="error" description="加载失败">
          <template #extra>
            <p class="ps-error-text">{{ error }}</p>
            <n-button size="small" @click="load">重试</n-button>
          </template>
        </n-empty>

        <!-- 全空 -->
        <n-empty v-else-if="trulyEmpty" description="未发现任何插件">
          <template #extra>
            <p class="ps-hint">当前 hermes 实例没有可用的插件，请检查 plugins 目录。</p>
          </template>
        </n-empty>

        <!-- 过滤无结果 -->
        <n-empty v-else-if="noMatch" description="无匹配插件">
          <template #extra>
            <n-button size="small" @click="searchQuery = ''; kindFilter = ''">
              清除过滤条件
            </n-button>
          </template>
        </n-empty>

        <!-- 卡片网格 + 分页 -->
        <template v-else>
          <div class="ps-grid">
            <PluginCard
              v-for="plugin in pagedPlugins"
              :key="plugin.id"
              :plugin="plugin"
              @click="onCardClick"
            />
          </div>

          <div v-if="totalPages > 1" class="ps-pagination">
            <n-pagination
              v-model:page="page"
              :page-count="totalPages"
              :page-size="PAGE_SIZE"
              size="small"
            />
          </div>
        </template>
      </div>
    </n-spin>
  </div>
</template>

<style scoped>
.ps-body {
  display: flex;
  flex-direction: column;
  gap: var(--km-space-md);
}

.ps-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--km-space-md);
}

.ps-toolbar-left,
.ps-toolbar-right {
  display: flex;
  align-items: center;
  gap: var(--km-space-sm);
}

.ps-count {
  font-size: var(--km-font-xs);
  color: var(--km-text);
  opacity: 0.5;
}

.ps-content {
  min-height: 200px;
}

.ps-error-text {
  margin: 0 0 var(--km-space-sm);
  font-size: var(--km-font-xs);
  opacity: 0.65;
  max-width: 360px;
  word-break: break-word;
}

.ps-hint {
  margin: 0;
  font-size: var(--km-font-xs);
  opacity: 0.55;
}

.ps-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 320px), 1fr));
  gap: var(--km-space-10);
}

.ps-pagination {
  display: flex;
  justify-content: center;
  padding-top: var(--km-space-md);
}
</style>
