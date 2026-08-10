<script setup lang="ts">
/**
 * PluginsSection — 设置 → 插件管理（ST-07 / T05-02）。
 *
 * 只读列表，数据来自 `GET /api/plugins`（hermes 磁盘扫描）。
 * 支持搜索 + kind 过滤，三态标签（enabled/needs_config/disabled）。
 *
 * Emits:
 *   open-detail(entity) — 行点击，传递 PluginItem 实体给父组件渲染详情面板
 */
import { computed, onMounted, ref, watch } from 'vue';
import {
  NButton,
  NEmpty,
  NInput,
  NSelect,
  NSpin,
  NTag,
  NTable,
  useMessage,
} from 'naive-ui';
import KIcon from '../common/KIcon.vue';
import { getPlugins } from '../../api/client';
import { errText } from '../../api/client';
import type { PluginItem, PluginKind } from '../../types/chat';

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

/** 搜索关键词（本地双向绑定 + 父组件 search prop 同步）。 */
const searchQuery = ref('');

/** kind 过滤：空串 = 全部。 */
const kindFilter = ref<string>('');

const KIND_OPTIONS: { label: string; value: string }[] = [
  { label: '全部类型', value: '' },
  { label: 'Platform (平台)', value: 'platform' },
  { label: 'Backend (后端)', value: 'backend' },
  { label: 'Model Provider (模型)', value: 'model-provider' },
  { label: 'Standalone (独立)', value: 'standalone' },
  { label: 'Other (其它)', value: 'other' },
];

const KIND_LABEL: Record<PluginKind, string> = {
  platform: 'Platform',
  backend: 'Backend',
  'model-provider': 'Model',
  standalone: '独立',
  other: '其它',
};

/** 来源标签。 */
function sourceLabel(source: string): string {
  return source === 'bundled' ? '内置' : '用户';
}

function sourceType(source: string): 'info' | 'default' {
  return source === 'bundled' ? 'info' : 'default';
}

/** 三态标签：enabled=绿 / needs_config=黄 / disabled=灰。 */
function statusTag(status: string): { label: string; type: 'success' | 'warning' | 'default' } {
  switch (status) {
    case 'enabled': return { label: '已启用', type: 'success' };
    case 'needs_config': return { label: '需配置', type: 'warning' };
    default: return { label: '已禁用', type: 'default' };
  }
}

/** 过滤后的插件列表：搜索 + kind 过滤。 */
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

/** 是否有过滤条件但没有结果。 */
const noMatch = computed<boolean>(
  () => !loading.value && !error.value && plugins.value.length > 0 && filteredPlugins.value.length === 0,
);

/** 全空：根本没有插件。 */
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

function onRowClick(row: PluginItem): void {
  emit('open-detail', row);
}

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
      <n-button size="small" tertiary :loading="loading" @click="load">
        <template #icon><KIcon name="Refresh" :size="14" /></template>
        刷新
      </n-button>
    </div>

    <!-- 加载态 -->
    <n-spin :show="loading">
      <div class="ps-content">
        <!-- 错误态 -->
        <n-empty
          v-if="error"
          description="加载失败"
        >
          <template #extra>
            <p class="ps-error-text">{{ error }}</p>
            <n-button size="small" @click="load">重试</n-button>
          </template>
        </n-empty>

        <!-- 全空 -->
        <n-empty
          v-else-if="trulyEmpty"
          description="未发现任何插件"
        >
          <template #extra>
            <p class="ps-hint">当前 hermes 实例没有可用的插件，请检查 plugins 目录。</p>
          </template>
        </n-empty>

        <!-- 过滤无结果 -->
        <n-empty
          v-else-if="noMatch"
          description="无匹配插件"
        >
          <template #extra>
            <n-button size="small" @click="searchQuery = ''; kindFilter = '';">清除过滤条件</n-button>
          </template>
        </n-empty>

        <!-- 表格 -->
        <n-table
          v-else
          :single-line="false"
          size="small"
          class="ps-table"
        >
          <thead>
            <tr>
              <th>名称</th>
              <th>类型</th>
              <th>来源</th>
              <th>状态</th>
              <th>环境要求</th>
              <th>工具数</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in filteredPlugins"
              :key="row.id"
              class="ps-row"
              @click="onRowClick(row)"
            >
              <td>
                <div class="ps-name">{{ row.label || row.name }}</div>
                <div class="ps-id">{{ row.id }}</div>
              </td>
              <td>
                <n-tag size="tiny" :bordered="false">{{ KIND_LABEL[row.kind] ?? row.kind }}</n-tag>
              </td>
              <td>
                <n-tag size="tiny" :bordered="false" :type="sourceType(row.source)">{{ sourceLabel(row.source) }}</n-tag>
              </td>
              <td>
                <n-tag size="tiny" :bordered="false" :type="statusTag(row.effectiveStatus).type">
                  {{ statusTag(row.effectiveStatus).label }}
                </n-tag>
              </td>
              <td>
                <span v-if="(row.requiresEnv?.length ?? 0) === 0" class="ps-na">—</span>
                <template v-else>
                  <n-tag
                    v-for="env in row.requiresEnv"
                    :key="env"
                    size="tiny"
                    :bordered="false"
                    :type="row.missingEnv?.includes(env) ? 'warning' : 'success'"
                    class="ps-env-tag"
                  >
                    {{ env }}
                  </n-tag>
                </template>
              </td>
              <td class="ps-num">{{ row.providesTools?.length ?? 0 }}</td>
            </tr>
          </tbody>
        </n-table>
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

.ps-toolbar-left {
  display: flex;
  align-items: center;
  gap: var(--km-space-sm);
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

.ps-table {
  width: 100%;
}

.ps-row {
  cursor: pointer;
  transition: background 0.12s ease;
}

.ps-row:hover {
  background: var(--km-hover);
}

.ps-name {
  font-weight: 500;
  font-size: var(--km-font-sm);
}

.ps-id {
  font-size: var(--km-font-xs);
  opacity: 0.45;
  font-family: var(--km-mono, ui-monospace, monospace);
  margin-top: 1px;
}

.ps-na {
  font-size: var(--km-font-xs);
  opacity: 0.4;
}

.ps-env-tag {
  margin-right: 3px;
  margin-bottom: 2px;
}

.ps-num {
  text-align: center;
  font-size: var(--km-font-sm);
}
</style>
