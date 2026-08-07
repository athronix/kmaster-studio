<script setup lang="ts">
/**
 * MemberDetailDialog — 专家 / 专家团详情弹窗（V3 T5 / S5.2 / N22 / R-13② R-14③）。
 *
 * 承载来源：
 *   - RightPanel（expert-picker 态）点卡片 inspect → 本弹窗（带添加/移除操作）；
 *   - 市场专家团详情页点成员 → 本弹窗（纯详情，不带操作）。
 *
 * 设计约束：本组件是**纯展示组件**，不直接写 `stores/agentRoles`。
 * 「是否已添加」由 `added` 决定，添加/移除只 `emit`，由持有去重口径的父组件
 * （`ExpertPickerPanel`）统一落库并提示，避免同一次点击被两处重复写入。
 */
import { computed } from 'vue';
import { NButton, NEmpty, NPopconfirm, NTag, NText } from 'naive-ui';
import type { EntityDef, Expert, ExpertTeam } from '../../types/market';
import { isExpert, isExpertTeam } from '../../types/market';

const props = withDefaults(
  defineProps<{
    /** 弹窗显隐 */
    show: boolean;
    /** 待展示的市场实体（专家或专家团）；null 时展示空态 */
    entity: EntityDef | null;
    /** 该实体是否已被添加为本地角色（由父组件按同名口径判定） */
    added?: boolean;
    /** 是否展示「添加为角色 / 移除角色」操作（专家团成员纯详情场景传 false） */
    showAction?: boolean;
  }>(),
  { show: false, entity: null, added: false, showAction: false }
);

const emit = defineEmits<{
  (e: 'update:show', v: boolean): void;
  (e: 'add', entity: EntityDef): void;
  (e: 'remove', entity: EntityDef): void;
}>();

/** 是否为专家团。 */
const isTeam = computed<boolean>(() => props.entity !== null && isExpertTeam(props.entity));

/** 专家团成员（仅专家团有）。 */
const members = computed<Expert[]>(() =>
  props.entity !== null && isExpertTeam(props.entity)
    ? (props.entity as ExpertTeam).members
    : []
);

/** 团队能力描述（仅专家团有）。 */
const skillDesc = computed<string>(() =>
  props.entity !== null && isExpertTeam(props.entity)
    ? (props.entity as ExpertTeam).skillDesc
    : ''
);

/** 专家专长（仅专家有）。 */
const expertise = computed<string>(() =>
  props.entity !== null && isExpert(props.entity)
    ? (props.entity as Expert).expertise
    : ''
);

function onAdd(): void {
  if (props.entity === null || props.added) return;
  emit('add', props.entity);
}

function onRemove(): void {
  if (props.entity === null || !props.added) return;
  emit('remove', props.entity);
}

function onClose(): void {
  emit('update:show', false);
}
</script>

<template>
  <n-modal
    :show="show"
    preset="card"
    :title="entity ? entity.name : '成员详情'"
    :style="{ width: '520px', maxWidth: '92vw' }"
    :mask-closable="true"
    @update:show="(v: boolean) => emit('update:show', v)"
  >
    <div class="km-md">
      <n-empty v-if="entity === null" description="没有可展示的成员" />

      <template v-else>
        <div class="km-md-head">
          <span class="km-md-icon">{{ entity.icon || 'User' }}</span>
          <div class="km-md-name">
            {{ entity.name }}
            <n-tag v-if="isTeam" size="tiny" :bordered="false" type="info">专家团</n-tag>
            <n-tag v-else size="tiny" :bordered="false">专家</n-tag>
          </div>
          <n-text depth="3" class="km-md-en">{{ entity.tags.join(' / ') }}</n-text>
        </div>

        <div class="km-md-section">
          <div class="km-md-label">简介</div>
          <n-text depth="2" class="km-md-text">{{ entity.description }}</n-text>
        </div>

        <div v-if="expertise !== ''" class="km-md-section">
          <div class="km-md-label">专长</div>
          <n-text depth="2" class="km-md-text">{{ expertise }}</n-text>
        </div>

        <div v-if="skillDesc !== ''" class="km-md-section">
          <div class="km-md-label">团队能力</div>
          <n-text depth="2" class="km-md-text">{{ skillDesc }}</n-text>
        </div>

        <div v-if="entity.scenarios.length" class="km-md-section">
          <div class="km-md-label">适用场景</div>
          <ul class="km-md-list">
            <li v-for="(s, i) in entity.scenarios" :key="i">{{ s }}</li>
          </ul>
        </div>

        <div v-if="members.length" class="km-md-section">
          <div class="km-md-label">成员（{{ members.length }}）</div>
          <div class="km-md-members">
            <div v-for="m in members" :key="m.id" class="km-md-member">
              <span class="km-md-member-icon">{{ m.icon }}</span>
              <div class="km-md-member-info">
                <div class="km-md-member-name">{{ m.name }}</div>
                <div class="km-md-member-exp">{{ m.expertise }}</div>
              </div>
            </div>
          </div>
        </div>

        <div v-if="entity.samplePrompts.length" class="km-md-section">
          <div class="km-md-label">样例 Prompt</div>
          <div
            v-for="(p, i) in entity.samplePrompts"
            :key="i"
            class="km-md-prompt"
          >
            {{ p }}
          </div>
        </div>

        <div v-if="entity.tags.length" class="km-md-section">
          <div class="km-md-label">标签</div>
          <div class="km-md-tags">
            <n-tag
              v-for="tag in entity.tags"
              :key="tag"
              size="small"
              :bordered="false"
            >{{ tag }}</n-tag>
          </div>
        </div>
      </template>
    </div>

    <template #footer>
      <div class="km-md-foot">
        <n-button size="small" @click="onClose">关闭</n-button>
        <template v-if="showAction && entity !== null">
          <n-popconfirm v-if="added" @positive-click="onRemove">
            <template #trigger>
              <n-button size="small" type="error" ghost>移除角色</n-button>
            </template>
            移除后本地角色「{{ entity.name }}」及其自定义配置将被删除，确认移除？
          </n-popconfirm>
          <n-button v-else size="small" type="primary" @click="onAdd">添加为角色</n-button>
        </template>
      </div>
    </template>
  </n-modal>
</template>

<style scoped>
.km-md {
  display: flex;
  flex-direction: column;
  gap: var(--km-space-14);
  min-height: 80px;
}

.km-md-head {
  display: flex;
  align-items: center;
  gap: var(--km-space-10);
  flex-wrap: wrap;
}

.km-md-icon {
  font-size: var(--km-font-3xl);
  line-height: 1;
  flex-shrink: 0;
}

.km-md-name {
  display: flex;
  align-items: center;
  gap: var(--km-space-6);
  font-size: var(--km-font-base);
  font-weight: 700;
}

.km-md-en {
  font-size: var(--km-font-xs);
  width: 100%;
  flex-basis: 100%;
}

.km-md-section {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.km-md-label {
  font-size: var(--km-font-xs);
  font-weight: 600;
  opacity: 0.55;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.km-md-text {
  font-size: var(--km-font-sm);
  line-height: 1.6;
}

.km-md-list {
  margin: 0;
  padding-left: var(--km-space-18);
  font-size: var(--km-font-sm);
  line-height: 1.7;
  opacity: 0.85;
}

.km-md-members {
  display: flex;
  flex-direction: column;
  gap: var(--km-space-sm);
}

.km-md-member {
  display: flex;
  align-items: center;
  gap: var(--km-space-sm);
  padding: var(--km-space-6) var(--km-space-sm);
  border: 1px solid var(--km-border);
  border-radius: var(--km-radius-lg);
  background: var(--km-panel);
}

.km-md-member-icon {
  font-size: var(--km-font-2xl);
  line-height: 1;
  flex-shrink: 0;
}

.km-md-member-info {
  min-width: 0;
}

.km-md-member-name {
  font-size: var(--km-font-sm);
  font-weight: 600;
}

.km-md-member-exp {
  font-size: var(--km-font-xs);
  opacity: 0.6;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.km-md-prompt {
  font-size: var(--km-font-sm);
  line-height: 1.6;
  padding: var(--km-space-6) var(--km-space-10);
  border-left: 3px solid var(--km-border);
  background: var(--km-bg);
  border-radius: 0 var(--km-radius-md) var(--km-radius-md) 0;
  opacity: 0.85;
}

.km-md-tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--km-space-6);
}

.km-md-foot {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: var(--km-space-sm);
}
</style>
