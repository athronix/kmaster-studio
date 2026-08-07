<script setup lang="ts">
/**
 * ExpertPickerPanel — 「从市场添加角色」选择面板（V3 T4 / R-15）。
 *
 * 承载在右栏（RightPanelMode = 'expert-picker'）。
 * 列出市场里的专家 / 专家团，支持搜索、添加为本地 Agent 角色、移除已添加项。
 *
 * 添加走 stores/agentRoles.fromMarketExpert(entity) → add(draft)，
 * 已添加判定基于「同名角色是否存在」，与 addRoleIfAbsent 的去重口径一致。
 */
import { computed, ref } from 'vue';
import { NButton, NEmpty, NInput, NPopconfirm, NTag, useMessage } from 'naive-ui';
import { useAgentRolesStore } from '../../stores/agentRoles';
import { type EntityDef } from '../../types/market';
import { INTERACTION } from '../../constants/layout';
import MemberDetailDialog from '../dialog/MemberDetailDialog.vue';

const emit = defineEmits<{
  (e: 'add', entity: EntityDef): void;
  (e: 'remove', roleId: string): void;
  (e: 'inspect', entity: EntityDef): void;
}>();

const roles = useAgentRolesStore();
const toast = useMessage();

/** 市场候选池（T04/U-13：hermes 暂无专家概念） */
const pool = computed<EntityDef[]>(() => []);

const keyword = ref<string>('');
const debounced = ref<string>('');
let timer: ReturnType<typeof setTimeout> | null = null;

/** 搜索防抖 300ms（§7.5） */
function onSearch(value: string): void {
  keyword.value = value;
  if (timer !== null) clearTimeout(timer);
  timer = setTimeout(() => {
    debounced.value = value;
  }, INTERACTION.searchDebounceMs);
}

const filtered = computed<EntityDef[]>(() => {
  const q = debounced.value.trim().toLowerCase();
  if (q === '') return pool.value;
  return pool.value.filter((e) => {
    const hay = `${e.name} ${e.description} ${e.tags.join(' ')}`.toLowerCase();
    return hay.includes(q);
  });
});

/** 已添加角色 id（按名称匹配）；未添加返回空串 */
function addedRoleId(entity: EntityDef): string {
  const key = entity.name.trim().toLowerCase();
  const hit = roles.roles.find((r) => r.name.trim().toLowerCase() === key);
  return hit === undefined ? '' : hit.id;
}

function isAdded(entity: EntityDef): boolean {
  return addedRoleId(entity) !== '';
}

async function onAdd(entity: EntityDef): Promise<void> {
  if (isAdded(entity)) {
    toast.warning(`「${entity.name}」已在角色列表中`);
    return;
  }
  const draft = roles.fromMarketExpert(entity);
  const saved = await roles.add(draft);
  toast.success(`已添加角色「${saved.name}」`);
  emit('add', entity);
}

async function onRemove(entity: EntityDef): Promise<void> {
  const id = addedRoleId(entity);
  if (id === '') return;
  await roles.remove(id);
  toast.success(`已移除角色「${entity.name}」`);
  emit('remove', id);
}

// ── 卡片主体点击 → MemberDetailDialog（设计 §4.2 第 15~20 步）──
const detailShow = ref<boolean>(false);
const detailEntity = ref<EntityDef | null>(null);

/** 弹窗内的「已添加」状态需随 store 变化实时更新，故用 computed 派生而非快照。 */
const detailAdded = computed<boolean>(() =>
  detailEntity.value === null ? false : isAdded(detailEntity.value)
);

function onInspect(entity: EntityDef): void {
  detailEntity.value = entity;
  detailShow.value = true;
  emit('inspect', entity);
}

/** 卡片副标题：专家显示专长，专家团显示成员数 */
function subtitleOf(entity: EntityDef): string {
  if (entity.entityType === 'expertTeam') {
    const members = (entity as { members?: unknown[] }).members ?? [];
    return `专家团 · ${members.length} 名成员`;
  }
  return '专家';
}
</script>

<template>
  <div class="epp">
    <div class="epp-head">
      <n-input
        :value="keyword"
        placeholder="搜索专家 / 专家团…"
        clearable
        size="small"
        @update:value="onSearch"
      />
      <div class="epp-count">共 {{ filtered.length }} 项 · 已添加 {{ roles.count }} 个角色</div>
    </div>

    <div class="epp-list">
      <n-empty
        v-if="!filtered.length"
        class="epp-empty"
        description="没有匹配的专家"
      >
        <template #extra>
          <n-button size="small" @click="onSearch('')">清空搜索</n-button>
        </template>
      </n-empty>

      <div
        v-for="entity in filtered"
        :key="entity.id"
        class="epp-item"
        :class="{ added: isAdded(entity) }"
        @click="onInspect(entity)"
      >
        <div class="epp-icon">{{ entity.icon || '🧑‍💼' }}</div>
        <div class="epp-info">
          <div class="epp-name">
            {{ entity.name }}
            <n-tag v-if="isAdded(entity)" size="tiny" type="success" :bordered="false">已添加</n-tag>
          </div>
          <div class="epp-sub">{{ subtitleOf(entity) }}</div>
          <div class="epp-desc">{{ entity.description }}</div>
          <div v-if="entity.tags.length" class="epp-tags">
            <n-tag
              v-for="tag in entity.tags.slice(0, 3)"
              :key="tag"
              size="tiny"
              :bordered="false"
            >{{ tag }}</n-tag>
          </div>
        </div>
        <div class="epp-ops" @click.stop>
          <n-popconfirm v-if="isAdded(entity)" @positive-click="onRemove(entity)">
            <template #trigger>
              <n-button size="tiny" type="error" ghost>移除</n-button>
            </template>
            移除后本地角色「{{ entity.name }}」及其自定义配置将被删除，确认移除？
          </n-popconfirm>
          <n-button v-else size="tiny" type="primary" ghost @click="onAdd(entity)">添加</n-button>
        </div>
      </div>
    </div>

    <!-- 卡片主体点击 → 成员/专家详情弹窗（可直接添加/移除） -->
    <MemberDetailDialog
      v-model:show="detailShow"
      :entity="detailEntity"
      :added="detailAdded"
      show-action
      @add="onAdd"
      @remove="onRemove"
    />
  </div>
</template>

<style scoped>
.epp {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.epp-head {
  flex-shrink: 0;
  padding: 12px 14px 8px;
  border-bottom: 1px solid var(--km-border);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.epp-count {
  font-size: 11px;
  opacity: 0.55;
}

.epp-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 10px 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.epp-empty {
  margin: 40px auto;
}

.epp-item {
  display: flex;
  gap: 10px;
  padding: 10px;
  border: 1px solid var(--km-border);
  border-radius: 8px;
  background: var(--km-panel);
  cursor: pointer;
  transition: border-color 0.15s ease, transform 0.12s ease;
}

.epp-item:hover {
  border-color: var(--km-accent);
  transform: translateY(-1px);
}

.epp-item.added {
  background: var(--km-bg);
}

.epp-icon {
  font-size: 24px;
  line-height: 1.2;
  flex-shrink: 0;
}

.epp-info {
  flex: 1;
  min-width: 0;
}

.epp-name {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
}

.epp-sub {
  font-size: 11px;
  opacity: 0.5;
  margin-top: 1px;
}

.epp-desc {
  font-size: 12px;
  opacity: 0.7;
  line-height: 1.5;
  margin-top: 4px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.epp-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 6px;
}

.epp-ops {
  flex-shrink: 0;
  display: flex;
  align-items: flex-start;
}
</style>
