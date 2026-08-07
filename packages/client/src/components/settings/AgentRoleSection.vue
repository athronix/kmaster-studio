<script setup lang="ts">
/**
 * T08：AgentRoleSection — Agent 角色管理页。
 *
 * 数据源变更：从 localStorage → GET /api/agents?source=installed。
 *
 * 新增：
 *   - 显示 source 标签（内置 / 自建 / 市场）
 *   - 内置角色卡片：不可编辑/删除，可禁用
 *   - 自建角色卡片：可编辑/删除
 *   - 从市场添加按钮 → 连到 ExpertPickerPanel
 */
import { computed, onMounted } from 'vue';
import {
  NButton,
  NDropdown,
  NEmpty,
  NPopconfirm,
  NTag,
  NSpin,
  NSwitch,
  useMessage,
} from 'naive-ui';
import { useAgentRolesStore } from '../../stores/agentRoles';
import { useChatStore } from '../../stores/chat';
import type { AgentRole } from '../../types/settings';

const props = withDefaults(
  defineProps<{
    /** 由 SettingsView 的 PageHeader 透传的搜索关键字 */
    search?: string;
  }>(),
  { search: '' }
);

const emit = defineEmits<{
  (e: 'open-detail', roleId: string): void;
  (e: 'open-picker'): void;
}>();

const rolesStore = useAgentRolesStore();
const chat = useChatStore();
const toast = useMessage();

/** T08：挂载时从 API 加载 */
onMounted(() => {
  if (!rolesStore.loaded && !rolesStore.loading) {
    void rolesStore.loadRoles();
  }
});

/** 【＋】下拉的两个入口（R-14①）。 */
const ADD_OPTIONS = [
  { key: 'manual', label: '✍️ 手动添加' },
  { key: 'market', label: '🛒 从市场添加' },
];

/** 搜索过滤后的角色列表（名称 / 简介 / 专长 / 技能 / 标签全字段匹配）。 */
const visibleRoles = computed<AgentRole[]>(() => {
  const q = props.search.trim().toLowerCase();
  if (q === '') return rolesStore.roles;
  return rolesStore.roles.filter((r) => {
    const hay = [r.name, r.desc, ...r.specialties, ...r.skills, ...r.mcp, ...r.tags]
      .join(' ')
      .toLowerCase();
    return hay.includes(q);
  });
});

/** 当前正在右栏编辑的角色 id（用于卡片高亮）。 */
const editingId = computed<string>(() =>
  chat.rightPanelMode === 'agent-role' ? chat.editingRoleId : ''
);

/** 是否处于「搜索无结果」态（区别于「一个角色都没有」）。 */
const emptyBySearch = computed<boolean>(
  () => rolesStore.count > 0 && visibleRoles.value.length === 0
);

/** T08：角色来源标签信息 */
function sourceInfo(role: AgentRole): { label: string; type: 'success' | 'info' | 'warning' | 'default' } {
  switch (role.source) {
    case 'builtin': return { label: '内置', type: 'info' };
    case 'user': return { label: '自建', type: 'success' };
    case 'market': return { label: '市场', type: 'warning' };
    case 'manual': return { label: '手动', type: 'default' };
    default: return { label: role.source, type: 'default' };
  }
}

/** T08：内置角色不可编辑/删除 */
function isBuiltin(role: AgentRole): boolean {
  return role.source === 'builtin';
}

function onAddSelect(key: string): void {
  if (key === 'manual') {
    chat.openAgentRole('');
    emit('open-detail', '');
    return;
  }
  chat.openExpertPicker();
  emit('open-picker');
}

function onEdit(role: AgentRole): void {
  // 内置角色不可编辑（可禁用）
  if (isBuiltin(role)) return;
  chat.openAgentRole(role.id);
  emit('open-detail', role.id);
}

async function onDelete(role: AgentRole): Promise<void> {
  if (isBuiltin(role)) {
    toast.warning('内置角色不可删除，可选择禁用');
    return;
  }
  const ok = await rolesStore.remove(role.id);
  if (!ok) {
    toast.error('删除失败：角色不存在或不可删除');
    return;
  }
  if (chat.rightPanelMode === 'agent-role' && chat.editingRoleId === role.id) {
    chat.closeDetail();
  }
  toast.success(`已删除角色「${role.name}」`);
}

/** T08：禁用/启用内置角色 */
function onToggleDisabled(role: AgentRole, value: boolean): void {
  const ok = rolesStore.setDisabled(role.id, value);
  if (!ok) {
    toast.error('操作失败');
    return;
  }
  toast.success(value ? `已禁用角色「${role.name}」` : `已启用角色「${role.name}」`);
}

/** 卡片的「专长 & 技能」摘要行。 */
function summaryOf(role: AgentRole): string {
  const parts: string[] = [];
  if (role.specialties.length > 0) parts.push(`专长：${role.specialties.join('、')}`);
  if (role.skills.length > 0) parts.push(`技能：${role.skills.join('、')}`);
  if (role.mcp.length > 0) parts.push(`MCP：${role.mcp.join('、')}`);
  return parts.length === 0 ? '尚未配置专长与技能' : parts.join('　·　');
}
</script>

<template>
  <div class="ars">
    <!-- 加载态 -->
    <n-spin v-if="rolesStore.loading" class="ars-loading" />

    <!-- 顶栏 -->
    <div class="ars-head">
      <div class="ars-title">
        Agent 角色配置
        <span class="ars-count">{{ rolesStore.count }} 个角色</span>
      </div>
      <n-dropdown
        trigger="click"
        :options="ADD_OPTIONS.map((o) => ({ key: o.key, label: o.label }))"
        @select="onAddSelect"
      >
        <n-button size="small" type="primary">
          ＋
          <span class="ars-caret">▾</span>
        </n-button>
      </n-dropdown>
    </div>

    <!-- 错误态 -->
    <div v-if="rolesStore.error" class="ars-error">
      ⚠️ 加载失败：{{ rolesStore.error }}
      <n-button size="small" tertiary @click="rolesStore.loadRoles()">重试</n-button>
    </div>

    <!-- 空态 -->
    <n-empty
      v-if="!rolesStore.loading && visibleRoles.length === 0"
      class="ars-empty"
      :description="emptyBySearch ? '没有匹配的角色，换个关键字试试' : '还没有 Agent 角色，先添加一个吧'"
    >
      <template #extra>
        <n-dropdown
          v-if="!emptyBySearch"
          trigger="click"
          :options="ADD_OPTIONS.map((o) => ({ key: o.key, label: o.label }))"
          @select="onAddSelect"
        >
          <n-button size="small" type="primary">添加角色</n-button>
        </n-dropdown>
      </template>
    </n-empty>

    <!-- 卡片列表 -->
    <div v-if="!rolesStore.loading && visibleRoles.length > 0" class="ars-grid">
      <div
        v-for="role in visibleRoles"
        :key="role.id"
        class="ars-card"
        :class="{
          active: role.id === editingId,
          disabled: role.disabled,
          builtin: isBuiltin(role),
        }"
        @click="onEdit(role)"
      >
        <div class="ars-card-head">
          <span class="ars-card-avatar">{{ role.avatar }}</span>
          <div class="ars-card-name" :title="role.name">{{ role.name || '未命名角色' }}</div>
          <n-tag
            v-if="role.disabled"
            size="tiny"
            :bordered="false"
            type="error"
          >已禁用</n-tag>
          <n-tag
            size="tiny"
            :bordered="false"
            :type="sourceInfo(role).type"
          >{{ sourceInfo(role).label }}</n-tag>
          <div class="ars-card-ops" @click.stop>
            <!-- 内置角色：禁用开关 + 不可编辑/删除 -->
            <template v-if="isBuiltin(role)">
              <n-popconfirm
                @positive-click="onToggleDisabled(role, !role.disabled)"
              >
                <template #trigger>
                  <button class="ars-op" :class="{ 'ars-op-danger': !role.disabled }" :title="role.disabled ? '启用' : '禁用'">
                    {{ role.disabled ? '○' : '⊗' }}
                  </button>
                </template>
                {{ role.disabled ? `确认启用内置角色「${role.name}」？` : `确认禁用内置角色「${role.name}」？禁用后该角色不会出现在角色选择列表中。` }}
              </n-popconfirm>
            </template>
            <template v-else>
              <button class="ars-op" title="编辑角色配置" @click="onEdit(role)">✎</button>
              <n-popconfirm @positive-click="onDelete(role)">
                <template #trigger>
                  <button class="ars-op ars-op-danger" title="从系统中删除">🗑</button>
                </template>
                确认从系统中删除角色「{{ role.name || '未命名角色' }}」？该操作不可撤销。
              </n-popconfirm>
            </template>
          </div>
        </div>

        <div class="ars-card-desc">{{ role.desc || '暂无简介' }}</div>
        <div class="ars-card-summary">{{ summaryOf(role) }}</div>

        <div v-if="role.tags.length" class="ars-card-tags">
          <n-tag v-for="tag in role.tags" :key="tag" size="tiny" :bordered="false">{{ tag }}</n-tag>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ars {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.ars-loading {
  display: flex;
  justify-content: center;
  padding: 48px 0;
}

.ars-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.ars-title {
  display: flex;
  align-items: baseline;
  gap: 10px;
  font-size: 14px;
  font-weight: 600;
}

.ars-count {
  font-size: 11px;
  font-weight: 400;
  opacity: 0.5;
}

.ars-caret {
  margin-left: 2px;
  font-size: 10px;
}

.ars-error {
  font-size: 13px;
  color: var(--km-danger);
  display: flex;
  align-items: center;
  gap: 12px;
}

.ars-empty {
  margin: 48px 0;
}

.ars-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 12px;
}

.ars-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px;
  border: 1px solid var(--km-border);
  border-radius: 10px;
  background: var(--km-panel);
  cursor: pointer;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.ars-card:hover {
  border-color: var(--km-accent);
}

.ars-card.active {
  border-color: var(--km-accent);
  box-shadow: inset 0 0 0 1px var(--km-accent);
}

.ars-card.builtin {
  cursor: default;
  background: var(--km-bg);
}

.ars-card.disabled {
  opacity: 0.55;
}

.ars-card.builtin:hover {
  border-color: var(--km-border);
}

.ars-card-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ars-card-avatar {
  font-size: 20px;
  line-height: 1;
  flex-shrink: 0;
}

.ars-card-name {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ars-card-ops {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.ars-op {
  background: transparent;
  border: 1px solid var(--km-border);
  border-radius: 4px;
  color: var(--km-text);
  cursor: pointer;
  font-size: 11px;
  line-height: 1;
  padding: 3px 5px;
  transition: border-color 0.15s ease, color 0.15s ease;
}

.ars-op:hover {
  border-color: var(--km-accent);
  color: var(--km-accent);
}

.ars-op-danger:hover {
  border-color: var(--km-danger);
  color: var(--km-danger);
}

.ars-card-desc {
  font-size: 12px;
  line-height: 1.6;
  opacity: 0.75;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.ars-card-summary {
  font-size: 11px;
  line-height: 1.6;
  opacity: 0.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.ars-card-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 2px;
}
</style>
