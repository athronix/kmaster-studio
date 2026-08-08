<script setup lang="ts">
/**
 * ExpertDetail — 专家详情组件。
 *
 * 右栏 detail 模式渲染：名称 + 专长描述 + 应用场景 +
 * 样例 Prompts + 分类标签 + 右上角"召唤"按钮。
 */
import { NButton, NTag, NText, NCode } from 'naive-ui';
import type { Expert } from '../../types/market';

const props = defineProps<{
  expert: Expert;
}>();

const emit = defineEmits<{
  (e: 'summon', agentId: string): void;
}>();

function onSummon(): void {
  emit('summon', props.expert.id);
}
</script>

<template>
  <div class="km-detail">
    <!-- 标题行 -->
    <div class="km-detail-header">
      <span class="km-detail-icon">{{ expert.icon }}</span>
      <h3 class="km-detail-name">{{ expert.name }}</h3>
      <n-button type="primary" size="small" @click="onSummon">召唤</n-button>
    </div>

    <!-- 专长描述 -->
    <div class="km-detail-section">
      <div class="km-detail-label">专长描述</div>
      <n-text class="km-detail-text">{{ expert.expertise }}</n-text>
    </div>

    <!-- 简介 -->
    <div class="km-detail-section">
      <div class="km-detail-label">简介</div>
      <n-text depth="2" class="km-detail-text">{{ expert.description }}</n-text>
    </div>

    <!-- ���用场景 -->
    <div class="km-detail-section">
      <div class="km-detail-label">应用场景</div>
      <ul class="km-detail-list">
        <li v-for="sc in expert.scenarios" :key="sc">{{ sc }}</li>
      </ul>
    </div>

    <!-- 样例 Prompts -->
    <div class="km-detail-section">
      <div class="km-detail-label">使用样例</div>
      <div
        v-for="(prompt, idx) in expert.samplePrompts"
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
          v-for="tag in expert.tags"
          :key="tag"
          size="small"
          :bordered="false"
        >
          {{ tag }}
        </n-tag>
      </div>
    </div>
  </div>
</template>

<style scoped>
.km-detail {
 padding: var(--km-space-14);
  display: flex;
  flex-direction: column;
  gap: var(--km-space-lg);
}

.km-detail-header {
  display: flex;
  align-items: center;
  gap: var(--km-space-10);
}

.km-detail-icon {
  font-size: var(--km-font-3xl);
  flex-shrink: 0;
}

.km-detail-name {
  flex: 1;
  margin: 0;
  font-size: var(--km-font-xl);
  font-weight: 700;
  min-width: 0;
}

.km-detail-section {
  display: flex;
  flex-direction: column;
  gap: var(--km-space-6);
}

.km-detail-label {
  font-size: var(--km-font-xs);
  font-weight: 600;
  opacity: 0.55;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.km-detail-text {
  font-size: var(--km-font-sm);
  line-height: 1.6;
}

.km-detail-list {
  margin: 0;
  padding-left: var(--km-space-18);
  font-size: var(--km-font-sm);
  line-height: 1.7;
  opacity: 0.85;
}

.km-detail-prompt-card {
  margin-bottom: var(--km-space-6);
}

.km-detail-tags {
  display: flex;
  flex-wrap: wrap;
  gap: var(--km-space-6);
}
</style>
