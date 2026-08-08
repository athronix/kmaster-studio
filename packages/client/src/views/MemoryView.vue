<script setup lang="ts">
// F13 记忆管理整页：分组列表 + 搜索 + 条目编辑（NModal）+ 删除二次确认（提示已自动备份）。
// 所有网络访问经 memory store → api/client（NFR1 视图零直接网络调用）。
// V3 S2.7：顶栏改用统一 PageHeader（R-08），搜索框直接驱动 store.setQuery。
// V3 S5.7 / A4：本视图同时服务 `/memory` 独立路由与「设置 → 记忆管理」类别，
//   内嵌时（embedded=true）不渲染自带 PageHeader，搜索词由外层 title 栏透传。
import { onMounted, ref, watch } from 'vue';
import KIcon from '../components/common/KIcon.vue';
import {
  NInput, NSelect, NButton, NModal, NCard, NSpin, NTag, NPopconfirm, NAlert, useMessage,
} from 'naive-ui';
import { useMemoryStore, MEMORY_GROUP_LABELS } from '../stores/memory';
import PageHeader from '../components/layout/PageHeader.vue';
import EmptyState from '../components/common/EmptyState.vue';
import type { MemoryEntry, MemoryGroup } from '../types/chat';

const props = withDefaults(
  defineProps<{
    /** 内嵌于「设置 → 记忆管理」时为 true：不渲染自带 PageHeader */
    embedded?: boolean;
    /** 外层 title 栏透传的搜索词（内嵌模式生效，已在 PageHeader 内防抖） */
    search?: string;
  }>(),
  { embedded: false, search: '' }
);

const store = useMemoryStore();
const message = useMessage();

const GROUPS: MemoryGroup[] = ['memory', 'user'];
const groupOptions = [
  { label: '全部分组', value: '' },
  { label: MEMORY_GROUP_LABELS.memory, value: 'memory' },
  { label: MEMORY_GROUP_LABELS.user, value: 'user' },
];

const editing = ref(false);
const saving = ref(false);
const loadError = ref<string | null>(null);
/** null = 新增，非空 = 编辑既有条目 */
const editingEntry = ref<MemoryEntry | null>(null);
const formGroup = ref<MemoryGroup>('memory');
const formContent = ref('');

onMounted(() => {
  loadError.value = null;
  store.load().catch((e) => {
    loadError.value = `记忆加载失败：${String(e.message ?? e)}`;
    message.error(loadError.value!);
  });
});

/** 来自 PageHeader 搜索框（已防抖）：即时过滤记忆内容。 */
function onSearch(q: string) {
  store.setQuery(q.trim()).catch((e) => message.error(String(e.message ?? e)));
}

// 内嵌模式下搜索词来自外层 title 栏，转发到同一条 store 通路
watch(
  () => props.search,
  (q) => {
    if (props.embedded) onSearch(q ?? '');
  }
);
function onGroupChange(v: string | null) {
  store.setGroup((v || undefined) as MemoryGroup | undefined).catch((e) => message.error(String(e.message ?? e)));
}

function openCreate(group: MemoryGroup = 'memory') {
  editingEntry.value = null;
  formGroup.value = group;
  formContent.value = '';
  editing.value = true;
}
function openEdit(entry: MemoryEntry) {
  editingEntry.value = entry;
  formGroup.value = entry.group;
  formContent.value = entry.content;
  editing.value = true;
}

async function save() {
  const content = formContent.value.trim();
  if (!content) {
    message.warning('内容不能为空');
    return;
  }
  saving.value = true;
  try {
    if (editingEntry.value) {
      await store.update(editingEntry.value.id, content);
      message.success('条目已更新（写前已自动备份）');
    } else {
      await store.add(formGroup.value, content);
      message.success('条目已新增');
    }
    editing.value = false;
  } catch (e: any) {
    message.error(String(e?.message ?? e));
  } finally {
    saving.value = false;
  }
}

async function remove(entry: MemoryEntry) {
  try {
    const backup = await store.remove(entry.id);
    message.success(backup ? `已删除，备份：${backup}` : '已删除（已自动备份）');
  } catch (e: any) {
    message.error(String(e?.message ?? e));
  }
}

function fmtTime(ts: number): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString();
}
</script>

<template>
  <div class="km-memory-page">
    <PageHeader
      v-if="!embedded"
      title="记忆管理"
      search-placeholder="搜索记忆内容…"
      @search="onSearch"
    >
      <template #actions>
        <n-button type="primary" @click="openCreate('memory')"><template #icon><KIcon name="Plus" :size="16" /></template>新增条目</n-button>
      </template>
    </PageHeader>

    <section class="km-memory-body">
      <n-alert
        v-if="loadError"
        type="error"
        :title="loadError"
        closable
        @close="loadError = null"
      />
      <template v-else>
      <header class="km-memory-intro">
        <p class="km-page-sub">
          直接读写 hermes 的 <code>memories/MEMORY.md</code> 与 <code>USER.md</code>（<code>§</code> 分隔条目）。
          所有写操作前自动备份，可从 <code>~/.kmaster-studio/backups/memory/</code> 回滚。
        </p>
        <!-- 内嵌「设置 → 记忆管理」：标题与搜索由外壳 PageHeader 提供，主操作在此补齐 -->
        <n-button v-if="embedded" type="primary" @click="openCreate('memory')"><template #icon><KIcon name="Plus" :size="16" /></template>新增条目</n-button>
      </header>

      <div class="km-toolbar">
        <n-select
          class="km-group-filter"
          :value="store.group ?? ''"
          :options="groupOptions"
          @update:value="onGroupChange"
        />
        <span class="km-count">共 {{ store.total }} 条</span>
      </div>

      <n-spin :show="store.loading">
        <div class="km-groups">
          <section v-for="g in GROUPS" :key="g" class="km-group">
            <h3 class="km-group-title">
              {{ MEMORY_GROUP_LABELS[g] }}
              <n-tag size="small" :bordered="false">{{ store.groups[g].length }}</n-tag>
              <n-button size="tiny" tertiary @click="openCreate(g)"><template #icon><KIcon name="Plus" :size="14" /></template></n-button>
            </h3>
            <EmptyState v-if="!store.groups[g].length" icon="Database" title="暂无记忆" />
            <n-card
              v-for="entry in store.groups[g]"
              :key="entry.id"
              class="km-entry"
              size="small"
              :bordered="true"
            >
              <p class="km-entry-content">{{ entry.content }}</p>
              <div class="km-entry-foot">
                <span class="km-entry-meta">#{{ entry.index + 1 }} · {{ entry.id }} · {{ fmtTime(entry.updated_at) }}</span>
                <span class="km-entry-actions">
                  <n-button size="tiny" tertiary @click="openEdit(entry)">编辑</n-button>
                  <n-popconfirm @positive-click="remove(entry)">
                    <template #trigger>
                      <n-button size="tiny" tertiary type="error">删除</n-button>
                    </template>
                    确认删除该条目？删除前会自动备份原文件，可回滚。
                  </n-popconfirm>
                </span>
              </div>
            </n-card>
          </section>
        </div>
      </n-spin>

      <n-modal
        v-model:show="editing"
        preset="card"
        class="km-modal"
        :title="editingEntry ? '编辑记忆条目' : '新增记忆条目'"
      >
        <div class="km-form">
          <n-select
            v-if="!editingEntry"
            v-model:value="formGroup"
            :options="[
              { label: MEMORY_GROUP_LABELS.memory, value: 'memory' },
              { label: MEMORY_GROUP_LABELS.user, value: 'user' },
            ]"
          />
          <n-input
            v-model:value="formContent"
            type="textarea"
            :autosize="{ minRows: 6, maxRows: 16 }"
            placeholder="一条记忆的完整正文（保存后写回 Markdown，以 § 分隔）"
          />
          <p class="km-form-hint">保存将执行：取锁 → 备份原文件 → 原子写回。内容变更后条目 id 会随之变化。</p>
        </div>
        <template #footer>
          <div class="km-form-foot">
            <n-button @click="editing = false">取消</n-button>
            <n-button type="primary" :loading="saving" @click="save">保存</n-button>
          </div>
        </template>
      </n-modal>
      </template>
    </section>
  </div>
</template>

<style scoped>
.km-memory-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
  flex: 1;
}
.km-memory-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: var(--km-space-20) var(--km-space-xl) var(--km-space-40);
}
.km-memory-intro { display: flex; justify-content: space-between; align-items: flex-start; gap: var(--km-space-lg); }
.km-page-sub { margin: 0 0 14px; font-size: var(--km-font-sm); opacity: 0.6; line-height: 1.7; max-width: 720px; }
.km-page-sub code { background: rgba(127, 127, 127, 0.16); padding: 1px var(--km-space-xs); border-radius: var(--km-radius-sm); }
.km-toolbar { display: flex; gap: var(--km-space-sm); align-items: center; margin-bottom: 16px; flex-wrap: wrap; }
.km-group-filter { width: 200px; }
.km-count { font-size: var(--km-font-sm); opacity: 0.55; }
.km-groups { display: grid; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); gap: var(--km-space-xl); }
.km-group-title {
  display: flex;
  align-items: center;
  gap: var(--km-space-sm);
  font-size: var(--km-font-sm);
  margin: 0 0 10px;
  opacity: 0.85;
}
.km-entry { margin-bottom: 10px; }
.km-entry-content { margin: 0 0 8px; white-space: pre-wrap; line-height: 1.7; font-size: var(--km-font-sm); }
.km-entry-foot { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
.km-entry-meta { font-size: var(--km-font-xs); opacity: 0.45; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.km-entry-actions { display: flex; gap: var(--km-space-6); flex: 0 0 auto; }
.km-modal { width: 640px; max-width: 92vw; }
.km-form { display: flex; flex-direction: column; gap: 10px; }
.km-form-hint { margin: 0; font-size: var(--km-font-xs); opacity: 0.5; }
.km-form-foot { display: flex; justify-content: flex-end; gap: var(--km-space-sm); }
</style>
