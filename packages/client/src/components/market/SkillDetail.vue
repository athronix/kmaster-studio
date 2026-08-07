<script setup lang="ts">
/**
 * SkillDetail — 技能详情组件。
 *
 * 右栏 detail 模式渲染：名称 + 英文名 + 来源 + 简介 +
 * 应用场景 + 样例 Prompts + 标签 + 安装/卸载按钮。
 */
import { ref } from 'vue';
import { NButton, NTag, NText, NCode, NModal } from 'naive-ui';
import type { Skill } from '../../types/market';

const props = defineProps<{
  skill: Skill;
}>();

const emit = defineEmits<{
  (e: 'toggleInstall', skill: Skill): void;
}>();

// ── 操作结果弹窗 ──
const resultModal = ref(false);
const resultText = ref('');

function onToggle(): void {
  if (props.skill.installed) {
    // mock 卸载
    resultText.value = `技能「${props.skill.name}」已成功卸载。`;
  } else {
    resultText.value = `技能「${props.skill.name}」安装成功！`;
  }
  resultModal.value = true;
  emit('toggleInstall', props.skill);
}

const sourceLabel: Record<string, string> = {
  marketplace: '市场',
  local: '本地',
  url: 'URL',
};

const sourceType: Record<string, 'info' | 'success' | 'warning'> = {
  marketplace: 'info',
  local: 'success',
  url: 'warning',
};
</script>

<template>
  <div class="km-detail">
    <!-- 标题行 -->
    <div class="km-detail-header">
      <span class="km-detail-icon">{{ skill.icon }}</span>
      <div class="km-detail-title-group">
        <h3 class="km-detail-name">{{ skill.name }}</h3>
        <n-text depth="3" class="km-detail-english">{{ skill.englishName }}</n-text>
      </div>
      <n-button
        :type="skill.installed ? 'error' : 'primary'"
        size="small"
        @click="onToggle"
      >
        {{ skill.installed ? '卸载' : '安装' }}
      </n-button>
    </div>

    <!-- 来源 -->
    <div class="km-detail-section">
      <div class="km-detail-label">来源</div>
      <div>
        <n-tag
          :type="sourceType[skill.source] ?? 'default'"
          size="small"
          :bordered="false"
        >
          {{ sourceLabel[skill.source] ?? skill.source }}
        </n-tag>
      </div>
    </div>

    <!-- 简介 -->
    <div class="km-detail-section">
      <div class="km-detail-label">简介</div>
      <n-text depth="2" class="km-detail-text">{{ skill.description }}</n-text>
    </div>

    <!-- 应用场景 -->
    <div class="km-detail-section">
      <div class="km-detail-label">应用场景</div>
      <ul class="km-detail-list">
        <li v-for="sc in skill.scenarios" :key="sc">{{ sc }}</li>
      </ul>
    </div>

    <!-- 样例 Prompts -->
    <div class="km-detail-section">
      <div class="km-detail-label">使用样例</div>
      <div
        v-for="(prompt, idx) in skill.samplePrompts"
        :key="idx"
        class="km-detail-prompt-card"
      >
        <n-code :code="prompt" language="text" />
      </div>
    </div>

    <!-- 标签 -->
    <div class="km-detail-section">
      <div class="km-detail-label">标签</div>
      <div class="km-detail-tags">
        <n-tag
          v-for="tag in skill.tags"
          :key="tag"
          size="small"
          :bordered="false"
        >
          {{ tag }}
        </n-tag>
      </div>
    </div>

    <!-- 操作结果弹窗 -->
    <n-modal
      v-model:show="resultModal"
      preset="card"
      title="操作结果"
      :style="{ width: '380px' }"
    >
      <n-text>{{ resultText }}</n-text>
    </n-modal>
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

.km-detail-title-group {
  flex: 1;
  min-width: 0;
}

.km-detail-name {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
}

.km-detail-english {
  font-size: 12px;
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

.km-detail-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
</style>
