<script setup lang="ts">
/**
 * ChannelsSection — 设置 → 渠道管理（ST-08 / T05-02）。
 *
 * 渠道 CRUD + 凭据写入（🔒 只写不回显）。
 * 数据来自 `GET /api/config/platform`，写操作走 `PUT /api/config/platform`。
 *
 * Emits:
 *   open-detail(entity) — 行点击，传递 PlatformChannelConfig 实体给父组件渲染详情面板
 */
import { computed, onMounted, ref } from 'vue';
import {
  NButton,
  NEmpty,
  NInput,
  NModal,
  NPopconfirm,
  NSelect,
  NSpin,
  NSwitch,
  NTag,
  useMessage,
} from 'naive-ui';
import KIcon from '../common/KIcon.vue';
import { getPlatformConfig, savePlatformConfig, errText } from '../../api/client';
import type { PlatformChannelConfig, PlatformChannelType, PlatformConfigResponse } from '../../types/chat';

const props = withDefaults(
  defineProps<{
    search?: string;
  }>(),
  { search: '' },
);

const emit = defineEmits<{
  'open-detail': [entity: PlatformChannelConfig];
}>();

const message = useMessage();

const loading = ref(false);
const error = ref('');
const channels = ref<PlatformChannelConfig[]>([]);
const availableTypes = ref<PlatformChannelType[]>([]);
const saving = ref(false);

/** 搜索关键词。 */
const searchQuery = ref('');

/** 新增渠道弹窗状态。 */
const showAddModal = ref(false);

/** 新增渠道表单。 */
const newChannelForm = ref<{
  type: PlatformChannelType | null;
  id: string;
  label: string;
}>({
  type: null,
  id: '',
  label: '',
});

/** 编辑凭据弹窗状态（per-channel）。 */
const editingCredential = ref<{
  channelId: string;
  key: string;
  value: string;
} | null>(null);

const TYPE_OPTIONS = computed(() =>
  availableTypes.value.map((t) => ({ label: t, value: t })),
);

/** 过滤后的渠道列表。 */
const filteredChannels = computed<PlatformChannelConfig[]>(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return channels.value;
  return channels.value.filter(
    (c) =>
      c.type.toLowerCase().includes(q) ||
      c.id.toLowerCase().includes(q) ||
      (c.label ?? '').toLowerCase().includes(q),
  );
});

const noMatch = computed<boolean>(
  () => !loading.value && !error.value && channels.value.length > 0 && filteredChannels.value.length === 0,
);

const trulyEmpty = computed<boolean>(
  () => !loading.value && !error.value && channels.value.length === 0,
);

async function load(): Promise<void> {
  loading.value = true;
  error.value = '';
  try {
    const res: PlatformConfigResponse = await getPlatformConfig();
    channels.value = res.channels ?? [];
    availableTypes.value = res.availableTypes ?? [];
  } catch (e: unknown) {
    error.value = errText(e, '加载渠道列表失败');
  } finally {
    loading.value = false;
  }
}

/** 切换启用/禁用开关。 */
async function toggleEnabled(channel: PlatformChannelConfig, value: boolean): Promise<void> {
  const idx = channels.value.findIndex((c) => c.id === channel.id);
  if (idx < 0) return;
  const updated = { ...channel, enabled: value };
  const next = [...channels.value];
  next[idx] = updated;
  try {
    const res = await savePlatformConfig(next);
    channels.value = res.channels ?? next;
    if (res.ok) message.success(value ? '渠道已启用' : '渠道已禁用');
  } catch (e: unknown) {
    message.error(errText(e, '更新失败'));
  }
}

/** 新增渠道。 */
async function onAddChannel(): Promise<void> {
  const form = newChannelForm.value;
  if (!form.type || form.id.trim() === '') {
    message.warning('渠道类型和 ID 不能为空');
    return;
  }
  const trimmedId = form.id.trim();
  if (channels.value.some((c) => c.id === trimmedId)) {
    message.error(`渠道 ID「${trimmedId}」已存在，请更换`);
    return;
  }
  const newChannel: PlatformChannelConfig = {
    id: trimmedId,
    type: form.type,
    enabled: true,
    label: form.label.trim() || undefined,
  };
  const next = [...channels.value, newChannel];
  saving.value = true;
  try {
    const res = await savePlatformConfig(next);
    channels.value = res.channels ?? next;
    showAddModal.value = false;
    newChannelForm.value = { type: null, id: '', label: '' };
    message.success('渠道已新增');
  } catch (e: unknown) {
    message.error(errText(e, '新增失败'));
  } finally {
    saving.value = false;
  }
}

/** 删除渠道。 */
async function onDeleteChannel(channel: PlatformChannelConfig): Promise<void> {
  const next = channels.value.filter((c) => c.id !== channel.id);
  saving.value = true;
  try {
    const res = await savePlatformConfig(next);
    channels.value = res.channels ?? next;
    message.success(`渠道「${channel.label || channel.id}」已删除`);
  } catch (e: unknown) {
    message.error(errText(e, '删除失败'));
  } finally {
    saving.value = false;
  }
}

/** 打开凭据编辑弹窗。 */
function startEditCredential(channel: PlatformChannelConfig, key: string): void {
  editingCredential.value = { channelId: channel.id, key, value: '' };
}

/** 保存凭据。 */
async function saveCredential(): Promise<void> {
  const edit = editingCredential.value;
  if (!edit || edit.value.trim() === '') {
    message.warning('请输入凭据值');
    return;
  }
  const idx = channels.value.findIndex((c) => c.id === edit.channelId);
  if (idx < 0) return;
  const channel = channels.value[idx];
  const updated: PlatformChannelConfig = {
    ...channel,
    credentials: { [edit.key]: edit.value },
  };
  const next = [...channels.value];
  next[idx] = updated;
  saving.value = true;
  try {
    const res = await savePlatformConfig(next);
    channels.value = res.channels ?? next;
    editingCredential.value = null;
    message.success('凭据已保存');
  } catch (e: unknown) {
    message.error(errText(e, '保存失败'));
  } finally {
    saving.value = false;
  }
}

/** 清除某条凭据。 */
async function clearCredential(channel: PlatformChannelConfig, key: string): Promise<void> {
  const idx = channels.value.findIndex((c) => c.id === channel.id);
  if (idx < 0) return;
  const updated: PlatformChannelConfig = {
    ...channel,
    credentials: { [key]: '' },
  };
  const next = [...channels.value];
  next[idx] = updated;
  saving.value = true;
  try {
    const res = await savePlatformConfig(next);
    channels.value = res.channels ?? next;
    message.success('凭据已清除');
  } catch (e: unknown) {
    message.error(errText(e, '清除失败'));
  } finally {
    saving.value = false;
  }
}

function onCardClick(channel: PlatformChannelConfig): void {
  emit('open-detail', channel);
}

onMounted(() => {
  void load();
});
</script>

<template>
  <div class="cs-body">
    <!-- 工具栏 -->
    <div class="cs-toolbar">
      <div class="cs-toolbar-left">
        <n-input
          v-model:value="searchQuery"
          placeholder="搜索渠道…"
          clearable
          size="small"
          style="width: 220px"
        >
          <template #prefix>
            <KIcon name="Search" :size="14" />
          </template>
        </n-input>
      </div>
      <div class="cs-toolbar-right">
        <n-button size="small" @click="showAddModal = true">
          <template #icon><KIcon name="Plus" :size="14" /></template>
          新增渠道
        </n-button>
        <n-button size="small" tertiary :loading="loading" @click="load">
          <template #icon><KIcon name="Refresh" :size="14" /></template>
        </n-button>
      </div>
    </div>

    <!-- 加载态 -->
    <n-spin :show="loading || saving">
      <div class="cs-content">
        <!-- 错误态 -->
        <n-empty
          v-if="error"
          description="加载失败"
        >
          <template #extra>
            <p class="cs-error-text">{{ error }}</p>
            <n-button size="small" @click="load">重试</n-button>
          </template>
        </n-empty>

        <!-- 全空 -->
        <n-empty
          v-else-if="trulyEmpty"
          description="暂无已配置的渠道，点击上方按钮新增"
        >
          <template #extra>
            <n-button size="small" type="primary" @click="showAddModal = true">新增第一个渠道</n-button>
          </template>
        </n-empty>

        <!-- 过滤无结果 -->
        <n-empty
          v-else-if="noMatch"
          description="无匹配渠道"
        >
          <template #extra>
            <n-button size="small" @click="searchQuery = ''">清除搜索</n-button>
          </template>
        </n-empty>

        <!-- 渠道卡片列表 -->
        <div v-else class="cs-list">
          <div
            v-for="channel in filteredChannels"
            :key="channel.id"
            class="cs-card"
            @click="onCardClick(channel)"
          >
            <div class="cs-card-main">
              <div class="cs-card-header">
                <span class="cs-card-name">{{ channel.label || channel.id }}</span>
                <n-tag size="tiny" :bordered="false" type="info">{{ channel.type }}</n-tag>
                <n-switch
                  :value="channel.enabled"
                  size="small"
                  @click.stop
                  @update:value="(v: boolean) => toggleEnabled(channel, v)"
                />
              </div>
              <div class="cs-card-id">{{ channel.id }}</div>
              <div v-if="(channel.configuredKeys?.length ?? 0) > 0" class="cs-card-keys">
                <n-tag
                  v-for="key in channel.configuredKeys"
                  :key="key"
                  size="tiny"
                  :bordered="false"
                  type="success"
                  class="cs-key-tag"
                  @click.stop
                >
                  {{ key }}
                  <span v-if="channel.maskedKeys?.[key]" class="cs-masked">
                    · {{ channel.maskedKeys[key] }}
                  </span>
                </n-tag>
              </div>
              <div v-else class="cs-no-keys">未配置凭据</div>
            </div>
            <div class="cs-card-ops" @click.stop>
              <n-button
                v-for="key in (channel.configuredKeys ?? [])"
                :key="'edit-' + key"
                size="tiny"
                tertiary
                @click="startEditCredential(channel, key)"
              >编辑 {{ key }}</n-button>
              <n-popconfirm @positive-click="onDeleteChannel(channel)">
                <template #trigger>
                  <n-button size="tiny" quaternary type="error">删除</n-button>
                </template>
                确认删除渠道「{{ channel.label || channel.id }}」？
              </n-popconfirm>
            </div>
          </div>
        </div>
      </div>
    </n-spin>

    <!-- 新增渠道弹窗 -->
    <n-modal
      v-model:show="showAddModal"
      preset="card"
      title="新增渠道"
      style="width: 420px"
      :mask-closable="false"
      @positive-click="onAddChannel"
      @negative-click="showAddModal = false"
    >
      <div class="cs-modal-body">
        <div class="cs-modal-field">
          <label class="cs-modal-label">渠道类型</label>
          <n-select
            v-model:value="newChannelForm.type"
            :options="TYPE_OPTIONS"
            placeholder="选择渠道类型"
            filterable
          />
        </div>
        <div class="cs-modal-field">
          <label class="cs-modal-label">渠道 ID</label>
          <n-input
            v-model:value="newChannelForm.id"
            placeholder="输入唯一标识，如 my-telegram-bot"
          />
        </div>
        <div class="cs-modal-field">
          <label class="cs-modal-label">展示名 <span class="cs-optional">（可选）</span></label>
          <n-input
            v-model:value="newChannelForm.label"
            placeholder="渠道展示名称"
          />
        </div>
      </div>
    </n-modal>

    <!-- 凭据编辑弹窗 -->
    <n-modal
      v-model:show="!!editingCredential"
      preset="card"
      title="编辑凭据"
      style="width: 420px"
      :mask-closable="false"
      @positive-click="saveCredential"
      @negative-click="editingCredential = null"
    >
      <div class="cs-modal-body">
        <p class="cs-modal-desc">
          正在编辑渠道 <b>{{ editingCredential?.channelId }}</b> 的
          <code>{{ editingCredential?.key }}</code> 凭据
        </p>
        <div class="cs-modal-field">
          <label class="cs-modal-label">凭据值</label>
          <n-input
            v-model:value="editingCredential!.value"
            type="password"
            show-password-on="click"
            placeholder="输入凭据（🔒 保存后不再回显）"
          />
        </div>
        <div v-if="editingCredential" class="cs-modal-actions">
          <n-popconfirm
            @positive-click="clearCredential(
              channels.find((c) => c.id === editingCredential!.channelId)!,
              editingCredential!.key
            ); editingCredential = null"
          >
            <template #trigger>
              <n-button size="small" quaternary type="error" :loading="saving">清除该凭据</n-button>
            </template>
            确认清除此项凭据？
          </n-popconfirm>
        </div>
      </div>
    </n-modal>
  </div>
</template>

<style scoped>
.cs-body {
  display: flex;
  flex-direction: column;
  gap: var(--km-space-md);
}

.cs-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--km-space-md);
}

.cs-toolbar-left,
.cs-toolbar-right {
  display: flex;
  align-items: center;
  gap: var(--km-space-sm);
}

.cs-content {
  min-height: 200px;
}

.cs-error-text {
  margin: 0 0 var(--km-space-sm);
  font-size: var(--km-font-xs);
  opacity: 0.65;
  max-width: 360px;
  word-break: break-word;
}

.cs-list {
  display: flex;
  flex-direction: column;
  gap: var(--km-space-10);
}

.cs-card {
  display: flex;
  align-items: flex-start;
  gap: var(--km-space-md);
  padding: var(--km-space-10) var(--km-space-md);
  border: 1px solid var(--km-border);
  border-radius: var(--km-radius-lg);
  background: var(--km-panel);
  cursor: pointer;
  transition: background 0.12s ease;
}

.cs-card:hover {
  background: var(--km-hover);
}

.cs-card-main {
  flex: 1;
  min-width: 0;
}

.cs-card-header {
  display: flex;
  align-items: center;
  gap: var(--km-space-6);
  flex-wrap: wrap;
}

.cs-card-name {
  font-weight: 600;
  font-size: var(--km-font-sm);
}

.cs-card-id {
  font-size: var(--km-font-xs);
  opacity: 0.45;
  font-family: var(--km-mono, ui-monospace, monospace);
  margin-top: 2px;
}

.cs-card-keys {
  display: flex;
  flex-wrap: wrap;
  gap: var(--km-space-xs);
  margin-top: var(--km-space-sm);
}

.cs-key-tag {
  cursor: default;
}

.cs-masked {
  opacity: 0.7;
}

.cs-no-keys {
  font-size: var(--km-font-xs);
  opacity: 0.4;
  margin-top: var(--km-space-sm);
}

.cs-card-ops {
  display: flex;
  flex-direction: column;
  gap: var(--km-space-xs);
  flex-shrink: 0;
}

/* Modal */
.cs-modal-body {
  display: flex;
  flex-direction: column;
  gap: var(--km-space-md);
}

.cs-modal-field {
  display: flex;
  flex-direction: column;
  gap: var(--km-space-xs);
}

.cs-modal-label {
  font-size: var(--km-font-sm);
  font-weight: 500;
}

.cs-optional {
  font-weight: 400;
  opacity: 0.5;
  font-size: var(--km-font-xs);
}

.cs-modal-desc {
  margin: 0;
  font-size: var(--km-font-sm);
}

.cs-modal-desc code {
  font-family: var(--km-mono, ui-monospace, monospace);
}

.cs-modal-actions {
  padding-top: var(--km-space-sm);
  border-top: 1px solid var(--km-border);
}
</style>
