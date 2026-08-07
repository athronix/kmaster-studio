<script setup lang="ts">
/**
 * TeamDetail — 专家团详情组件。
 *
 * 右栏 detail 模式渲染：同 ExpertDetail + 团队成员卡片 list
 * （点击 → MemberDetailDialog 弹出成员纯详情，无召唤/添加按钮）。
 *
 * V3 T5 / S5.2：成员弹窗由内联 NModal + ExpertDetail 换成统一的
 * `components/dialog/MemberDetailDialog.vue`（N22），与
 * `ExpertPickerPanel` 共用一套详情呈现，避免两处样式漂移。
 */
import { ref } from 'vue';
import { NButton, NTag, NText, NCode, NCard } from 'naive-ui';
import MemberDetailDialog from '../dialog/MemberDetailDialog.vue';
import type { ExpertTeam, Expert } from '../../types/market';

const props = defineProps<{
  team: ExpertTeam;
}>();

const emit = defineEmits<{
  (e: 'summon', agentId: string): void;
}>();

function onSummon(): void {
  emit('summon', props.team.id);
}

// ── 成员详情弹窗 ──
const memberModalShow = ref(false);
const selectedMember = ref<Expert | null>(null);

function onMemberClick(member: Expert): void {
  selectedMember.value = member;
  memberModalShow.value = true;
}
</script>

<template>
  <div class="km-detail">
    <!-- 标题行 -->
    <div class="km-detail-header">
      <span class="km-detail-icon">{{ team.icon }}</span>
      <h3 class="km-detail-name">{{ team.name }}</h3>
      <n-button type="primary" size="small" @click="onSummon">召唤</n-button>
    </div>

    <!-- 技能描述 -->
    <div class="km-detail-section">
      <div class="km-detail-label">技能描述</div>
      <n-text class="km-detail-text">{{ team.skillDesc }}</n-text>
    </div>

    <!-- 简介 -->
    <div class="km-detail-section">
      <div class="km-detail-label">简介</div>
      <n-text depth="2" class="km-detail-text">{{ team.description }}</n-text>
    </div>

    <!-- 应用场景 -->
    <div class="km-detail-section">
      <div class="km-detail-label">应用场景</div>
      <ul class="km-detail-list">
        <li v-for="sc in team.scenarios" :key="sc">{{ sc }}</li>
      </ul>
    </div>

    <!-- 样例 Prompts -->
    <div class="km-detail-section">
      <div class="km-detail-label">使用样例</div>
      <div
        v-for="(prompt, idx) in team.samplePrompts"
        :key="idx"
        class="km-detail-prompt-card"
      >
        <n-code :code="prompt" language="text" />
      </div>
    </div>

    <!-- 团队成员 -->
    <div class="km-detail-section">
      <div class="km-detail-label">团队成员（{{ team.members.length }}）</div>
      <div class="km-detail-members">
        <n-card
          v-for="member in team.members"
          :key="member.id"
          size="small"
          class="km-member-card"
          hoverable
          @click="onMemberClick(member)"
        >
          <div class="km-member-card-inner">
            <span class="km-member-icon">{{ member.icon }}</span>
            <div>
              <div class="km-member-name">{{ member.name }}</div>
              <div class="km-member-expertise">{{ member.expertise.slice(0, 40) }}...</div>
            </div>
          </div>
        </n-card>
      </div>
    </div>

    <!-- 标签 -->
    <div class="km-detail-section">
      <div class="km-detail-label">标签</div>
      <div class="km-detail-tags">
        <n-tag
          v-for="tag in team.tags"
          :key="tag"
          size="small"
          :bordered="false"
        >
          {{ tag }}
        </n-tag>
      </div>
    </div>

    <!-- 成员详情弹窗（纯查看：不显示添加/移除操作区） -->
    <MemberDetailDialog v-model:show="memberModalShow" :entity="selectedMember" />
  </div>
</template>

<style scoped>
.km-detail {
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.km-detail-header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.km-detail-icon {
  font-size: 36px;
  flex-shrink: 0;
}

.km-detail-name {
  flex: 1;
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  min-width: 0;
}

.km-detail-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.km-detail-label {
  font-size: 11px;
  font-weight: 600;
  opacity: 0.55;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.km-detail-text {
  font-size: 13px;
  line-height: 1.6;
}

.km-detail-list {
  margin: 0;
  padding-left: 18px;
  font-size: 13px;
  line-height: 1.7;
  opacity: 0.85;
}

.km-detail-prompt-card {
  margin-bottom: 6px;
}

.km-detail-members {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.km-member-card {
  cursor: pointer;
}

.km-member-card-inner {
  display: flex;
  align-items: center;
  gap: 10px;
}

.km-member-icon {
  font-size: 24px;
  flex-shrink: 0;
}

.km-member-name {
  font-size: 13px;
  font-weight: 600;
}

.km-member-expertise {
  font-size: 11px;
  opacity: 0.55;
}

.km-detail-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
</style>
