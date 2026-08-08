<script setup lang="ts">
/**
 * SidebarSessionItem —— 左栏单条会话行（C2）。
 *
 * 用途：会话三分组（Recent / 置顶 / 工作目录）共用的行组件。
 * 数据源：父组件下发的 `Session`；running 态由 `chatStore.agentStates` 推导后经 prop 传入。
 * 对应需求：F-04（三态）/ F-05（相对时间）/ F-06（hover 操作）/ F-07（更多下拉）/ §3.9（拖拽）。
 *
 * ## 两个易踩的点
 * 1. **三态互斥但分组非互斥**（Q8）：同一会话可同时出现在多组，故父组件的 `v-for` key
 *    必须写 `` `${groupKey}:${s.id}` ``；本组件只负责渲染，不关心自己出现了几次。
 * 2. **拖拽契约不可省**（F31 / §3.9）：存量置顶组支持拖拽排序，重构时若漏掉这四个 emit
 *    会静默丢失功能且没有任何测试会失败。仅置顶组传 `draggable=true`。
 */
import { computed } from 'vue';
import { NDropdown, NPopconfirm, NTooltip } from 'naive-ui';
import KIcon from '../common/KIcon.vue';
import { timeAgo } from '../../utils/time';
import { SESSION_ROW_STATE, type SessionRowState } from '../../constants/sidebar';
import { useI18n } from '../../composables/useI18n';
import type { Session } from '../../types/chat';

interface Props {
  session: Session;
  /** 是否为当前活动会话（active 态判据） */
  active?: boolean;
  /** 是否正在运行（running 态判据，真源 chatStore.agentStates，§7.7） */
  running?: boolean;
  /** 是否处于新建高亮闪烁 */
  highlighted?: boolean;
  /** 是否正在 inline 重命名 */
  editing?: boolean;
  /** 重命名输入框的值（父组件 v-model 透传） */
  editTitle?: string;
  /** §3.9：是否允许拖拽排序。**仅置顶组传 true** */
  draggable?: boolean;
  /** §3.9：组内索引，拖拽排序用；`draggable=false` 时可不传 */
  index?: number;
  /** §3.9：当前被拖拽的索引，用于 km-dragging 样式 */
  dragIndex?: number | null;
}

const props = withDefaults(defineProps<Props>(), {
  active: false,
  running: false,
  highlighted: false,
  editing: false,
  editTitle: '',
  draggable: false,
  index: -1,
  dragIndex: null,
});

const emit = defineEmits<{
  (e: 'select', id: string): void;
  (e: 'toggle-pin', id: string): void;
  (e: 'archive', id: string): void;
  (e: 'context-menu', payload: { event: MouseEvent; session: Session }): void;
  (e: 'action', payload: { action: SessionMoreAction; session: Session }): void;
  (e: 'update:editTitle', value: string): void;
  (e: 'commit-rename'): void;
  (e: 'cancel-rename'): void;
  // §3.9 拖拽四联（父组件转接到 useSessionList 的对应 handler）
  (e: 'drag-start', payload: { event: DragEvent; index: number }): void;
  (e: 'drag-over', payload: { event: DragEvent; index: number }): void;
  (e: 'drop', payload: { event: DragEvent; index: number }): void;
  (e: 'drag-end'): void;
}>();

/** 「更多」下拉的动作枚举。`share` 本期恒 disabled（U5/F1b 裁决）。 */
export type SessionMoreAction = 'reveal' | 'rename' | 'share' | 'delete';

const { t } = useI18n();

/**
 * 行视觉三态（F-04）。分组非互斥，但行内态**互斥**，优先级 running > active > idle。
 */
const rowState = computed<SessionRowState>(() => {
  if (props.running) return SESSION_ROW_STATE.running;
  if (props.active) return SESSION_ROW_STATE.active;
  return SESSION_ROW_STATE.idle;
});

/** 副行相对时间（F-05）。`updated_at` 是毫秒时间戳（§7.3）。 */
const subtitle = computed<string>(() => timeAgo(props.session.updated_at));

const title = computed<string>(() => props.session.title?.trim() || t('sidebar.untitledSession'));

const isPinned = computed<boolean>(() => !!props.session.pinned);

/**
 * 「更多」下拉项（F-07）。
 *
 * ⚠️ 分享项**必须** `disabled: true`：现有 ShareDialog 会生成 `#/share/:sid` 死链
 * （router 无该路由，F23），PM 已裁决本期不接线，只保留占位 + 「即将上线」提示。
 * C5 单测对此有断言，改动会导致测试失败。
 */
const moreOptions = computed(() => [
  { label: t('sidebar.menu.reveal'), key: 'reveal' satisfies SessionMoreAction, disabled: !props.session.workspace },
  { label: t('sidebar.menu.rename'), key: 'rename' satisfies SessionMoreAction },
  { label: t('sidebar.menu.shareSoon'), key: 'share' satisfies SessionMoreAction, disabled: true },
  { type: 'divider', key: 'd1' },
  { label: t('sidebar.menu.delete'), key: 'delete' satisfies SessionMoreAction, props: { style: 'color: var(--km-danger);' } },
]);

function onSelect(): void {
  if (props.editing) return;
  emit('select', props.session.id);
}

function onMoreSelect(key: string): void {
  // disabled 项 naive-ui 不会触发 select，这里再兜一层防御
  if (key === 'share') return;
  emit('action', { action: key as SessionMoreAction, session: props.session });
}

function onDragStart(event: DragEvent): void {
  if (!props.draggable) return;
  emit('drag-start', { event, index: props.index });
}
function onDragOver(event: DragEvent): void {
  if (!props.draggable) return;
  emit('drag-over', { event, index: props.index });
}
function onDrop(event: DragEvent): void {
  if (!props.draggable) return;
  emit('drop', { event, index: props.index });
}
function onDragEnd(): void {
  if (!props.draggable) return;
  emit('drag-end');
}
</script>

<template>
  <div
    class="km-session-item"
    :class="[
      `km-state-${rowState}`,
      {
        'km-session-highlight': highlighted,
        'km-dragging': draggable && dragIndex === index,
      },
    ]"
    :draggable="draggable"
    @click="onSelect"
    @contextmenu.prevent="emit('context-menu', { event: $event, session })"
    @dragstart="onDragStart"
    @dragover="onDragOver"
    @drop="onDrop"
    @dragend="onDragEnd"
  >
    <!-- F-04：running 脉冲点（仅 running 态渲染，active 用左侧色条区分） -->
    <span v-if="rowState === 'running'" class="km-run-dot" :title="t('sidebar.state.running')" />

    <div class="km-session-main">
      <input
        v-if="editing"
        class="km-rename-input"
        :value="editTitle"
        @input="emit('update:editTitle', ($event.target as HTMLInputElement).value)"
        @keyup.enter="emit('commit-rename')"
        @keyup.esc="emit('cancel-rename')"
        @blur="emit('commit-rename')"
        @click.stop
      />
      <template v-else>
        <div class="km-session-title">{{ title }}</div>
        <!-- F-05：相对时间取代原来的 toLocaleString() -->
        <div class="km-session-sub">{{ subtitle }}</div>
      </template>
    </div>

    <!-- F-06：hover 显置顶 / 归档两个 icon-btn -->
    <div v-if="!editing" class="km-session-actions" @click.stop>
      <n-tooltip trigger="hover" :delay="400">
        <template #trigger>
          <button
            class="km-icon-btn"
            :class="{ 'km-on': isPinned }"
            :aria-label="isPinned ? t('sidebar.action.unpin') : t('sidebar.action.pin')"
            @click="emit('toggle-pin', session.id)"
          ><KIcon name="Pinned" :size="14" /></button>
        </template>
        {{ isPinned ? t('sidebar.action.unpin') : t('sidebar.action.pin') }}
      </n-tooltip>

      <n-popconfirm @positive-click="emit('archive', session.id)">
        <template #trigger>
          <button class="km-icon-btn" :aria-label="t('sidebar.action.archive')"><KIcon name="Archive" :size="16" /></button>
        </template>
        {{ t('sidebar.confirm.archive') }}
      </n-popconfirm>

      <!-- F-07：更多下拉 -->
      <n-dropdown
        trigger="click"
        :options="moreOptions"
        placement="bottom-end"
        @select="onMoreSelect"
      >
        <button class="km-icon-btn" :aria-label="t('sidebar.action.more')"><KIcon name="Dots" :size="16" /></button>
      </n-dropdown>
    </div>
  </div>
</template>

<style scoped>
.km-session-item {
  display: flex;
  align-items: center;
  gap: var(--km-space-6);
  padding: var(--km-space-sm) var(--km-space-md);
  cursor: pointer;
  border-left: 3px solid transparent;
  transition: background 0.15s ease;
  user-select: none;
}
.km-session-item:hover {
  background: var(--km-user-bubble);
}

/* ── F-04 三态 ── */
.km-state-active {
  background: var(--km-user-bubble);
  border-left-color: var(--km-accent);
}
.km-state-active .km-session-title {
  font-weight: 600;
}
.km-state-running .km-session-title {
  color: var(--km-accent);
}
.km-state-idle {
  /* 默认态，无额外样式 */
}

.km-run-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--km-accent);
  flex-shrink: 0;
  animation: km-pulse 1.2s ease-in-out infinite;
}

.km-dragging {
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
  font-size: var(--km-font-sm);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.km-session-sub {
  font-size: var(--km-font-xs);
  opacity: 0.5;
  margin-top: var(--km-space-2xs);
}

.km-session-actions {
  display: none;
  gap: var(--km-space-2xs);
  flex-shrink: 0;
}
.km-session-item:hover .km-session-actions {
  display: flex;
}
.km-icon-btn {
  background: transparent;
  border: 1px solid var(--km-border);
  border-radius: var(--km-radius-sm);
  padding: 1px var(--km-space-xs);
  cursor: pointer;
  font-size: var(--km-font-xs);
  color: var(--km-text);
  line-height: 1.4;
}
.km-icon-btn:hover {
  background: var(--km-panel);
}
.km-icon-btn.km-on {
  border-color: var(--km-accent);
  color: var(--km-accent);
}

.km-rename-input {
  width: 100%;
  background: var(--km-panel);
  color: var(--km-text);
  border: 1px solid var(--km-accent);
  border-radius: var(--km-radius-md);
  padding: var(--km-space-xs) var(--km-space-sm);
  outline: 2px solid transparent;
  font-size: var(--km-font-sm);
}

@keyframes km-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.35; transform: scale(0.75); }
}
@keyframes km-flash {
  0%, 100% { background: transparent; }
  50% { background: var(--km-highlight-bg, rgba(255, 215, 0, 0.3)); }
}
</style>
