<script setup lang="ts">
/**
 * McpDetail — MCP 详情组件。
 *
 * 右栏 detail 模式渲染：名称 + 英文名 + 来源 + 能力简介 +
 * 应用场景 + 样例 Prompts + 部署 JSON + 标签 +
 * tools/resources/prompts 卡片 + 部署/卸载 + test 按钮。
 */
import { ref } from 'vue';
import { NButton, NTag, NText, NCode, NCard, NModal, NSpace, useMessage } from 'naive-ui';
import SchemaDialog from '../dialog/SchemaDialog.vue';
import type { McpServer, ToolSchema, ResourceSchema, PromptSchema } from '../../types/market';

const props = defineProps<{
  mcp: McpServer;
}>();

const emit = defineEmits<{
  (e: 'toggleDeploy', mcp: McpServer): void;
  (e: 'test', mcp: McpServer): void;
}>();

const toast = useMessage();

// ── 部署结果弹窗 ──
const deployResultModal = ref(false);
const deployResultText = ref('');

function onToggleDeploy(): void {
  if (props.mcp.deployed) {
    deployResultText.value = `MCP 服务器「${props.mcp.name}」已成功卸载。`;
  } else {
    deployResultText.value = `MCP 服务器「${props.mcp.name}」部署成功！配置已生效。`;
  }
  deployResultModal.value = true;
  emit('toggleDeploy', props.mcp);
}

// ── Test ──
function onTest(): void {
  if (!props.mcp.deployed) return;
  toast.success(`MCP「${props.mcp.name}」测试连接成功！`);
  emit('test', props.mcp);
}

// ── Schema 弹窗（V3 T5 / S5.2：换用统一的 SchemaDialog，支持一键复制）──
const schemaModal = ref(false);
const schemaTitle = ref('');
const schemaPayload = ref<ToolSchema | ResourceSchema | PromptSchema | null>(null);

function onSchemaClick(
  kind: string,
  item: ToolSchema | ResourceSchema | PromptSchema,
): void {
  // tool / prompt 用 name 标题，resource 用 uri 标题
  let label = '';
  if ('name' in item && typeof item.name === 'string') label = item.name;
  else if ('uri' in item && typeof item.uri === 'string') label = item.uri;
  schemaTitle.value = label === '' ? kind : `${kind}: ${label}`;
  schemaPayload.value = item;
  schemaModal.value = true;
}

// JSON 复制
function copyJson(): void {
  navigator.clipboard.writeText(props.mcp.deployJson);
  toast.success('已复制部署 JSON');
}
</script>

<template>
  <div class="km-detail">
    <!-- 标题行 -->
    <div class="km-detail-header">
      <span class="km-detail-icon">{{ mcp.icon }}</span>
      <div class="km-detail-title-group">
        <h3 class="km-detail-name">{{ mcp.name }}</h3>
        <n-text depth="3" class="km-detail-english">{{ mcp.englishName }}</n-text>
      </div>
      <n-space :size="4">
        <n-button
          :type="mcp.deployed ? 'error' : 'primary'"
          size="small"
          @click="onToggleDeploy"
        >
          {{ mcp.deployed ? '卸载' : '部署' }}
        </n-button>
        <n-button
          size="small"
          :disabled="!mcp.deployed"
          @click="onTest"
        >
          测试
        </n-button>
      </n-space>
    </div>

    <!-- 来源 -->
    <div class="km-detail-section">
      <div class="km-detail-label">来源</div>
      <n-text depth="2" class="km-detail-text">{{ mcp.source }}</n-text>
    </div>

    <!-- 简介 -->
    <div class="km-detail-section">
      <div class="km-detail-label">简介</div>
      <n-text depth="2" class="km-detail-text">{{ mcp.description }}</n-text>
    </div>

    <!-- 能力简介 -->
    <div class="km-detail-section">
      <div class="km-detail-label">能力简介</div>
      <div class="km-detail-caps">
        <n-card size="small" title="Tools" class="km-cap-card">
          <ul v-if="mcp.capabilities.tools.length" class="km-detail-list">
            <li v-for="t in mcp.capabilities.tools" :key="t">{{ t }}</li>
          </ul>
          <n-text v-else depth="3">无</n-text>
        </n-card>
        <n-card size="small" title="Resources" class="km-cap-card">
          <ul v-if="mcp.capabilities.resources.length" class="km-detail-list">
            <li v-for="r in mcp.capabilities.resources" :key="r">{{ r }}</li>
          </ul>
          <n-text v-else depth="3">无</n-text>
        </n-card>
        <n-card size="small" title="Prompts" class="km-cap-card">
          <ul v-if="mcp.capabilities.prompts.length" class="km-detail-list">
            <li v-for="p in mcp.capabilities.prompts" :key="p">{{ p }}</li>
          </ul>
          <n-text v-else depth="3">无</n-text>
        </n-card>
      </div>
    </div>

    <!-- 应用场景 -->
    <div class="km-detail-section">
      <div class="km-detail-label">应用场景</div>
      <ul class="km-detail-list">
        <li v-for="sc in mcp.scenarios" :key="sc">{{ sc }}</li>
      </ul>
    </div>

    <!-- 样例 Prompts -->
    <div class="km-detail-section">
      <div class="km-detail-label">使用样例</div>
      <div
        v-for="(prompt, idx) in mcp.samplePrompts"
        :key="idx"
        class="km-detail-prompt-card"
      >
        <n-code :code="prompt" language="text" />
      </div>
    </div>

    <!-- 部署 JSON -->
    <div class="km-detail-section">
      <div class="km-detail-label">
        部署 JSON
        <n-button size="tiny" quaternary @click="copyJson">复制</n-button>
      </div>
      <n-code :code="mcp.deployJson" language="json" />
    </div>

    <!-- Tools / Resources / Prompts 卡片 -->
    <div class="km-detail-section">
      <div class="km-detail-label">Tools / Resources / Prompts</div>
      <div class="km-detail-schemas">
        <n-card
          v-for="ts in (mcp.toolSchemas ?? [])"
          :key="ts.name"
          size="small"
          hoverable
          class="km-schema-card"
          @click="onSchemaClick('Tool', ts)"
        >
          <div class="km-schema-name">🔧 {{ ts.name }}</div>
          <div class="km-schema-desc">{{ ts.description }}</div>
        </n-card>
        <n-card
          v-for="rs in (mcp.resourceSchemas ?? [])"
          :key="rs.uri"
          size="small"
          hoverable
          class="km-schema-card"
          @click="onSchemaClick('Resource', rs)"
        >
          <div class="km-schema-name">📦 {{ rs.name }}</div>
          <div class="km-schema-desc">{{ rs.description }}</div>
        </n-card>
        <n-card
          v-for="ps in (mcp.promptSchemas ?? [])"
          :key="ps.name"
          size="small"
          hoverable
          class="km-schema-card"
          @click="onSchemaClick('Prompt', ps)"
        >
          <div class="km-schema-name">💬 {{ ps.name }}</div>
          <div class="km-schema-desc">{{ ps.description }}</div>
        </n-card>
        <n-text v-if="!mcp.toolSchemas?.length && !mcp.resourceSchemas?.length && !mcp.promptSchemas?.length" depth="3">暂无 Schema 定义</n-text>
      </div>
    </div>

    <!-- 标签 -->
    <div class="km-detail-section">
      <div class="km-detail-label">标签</div>
      <div class="km-detail-tags">
        <n-tag
          v-for="tag in mcp.tags"
          :key="tag"
          size="small"
          :bordered="false"
        >
          {{ tag }}
        </n-tag>
      </div>
    </div>

    <!-- 部署结果弹窗 -->
    <n-modal
      v-model:show="deployResultModal"
      preset="card"
      title="操作结果"
      :style="{ width: '380px' }"
    >
      <n-text>{{ deployResultText }}</n-text>
    </n-modal>

    <!-- Schema 弹窗（N23） -->
    <SchemaDialog
      v-model:show="schemaModal"
      :title="schemaTitle"
      :schema="schemaPayload ? ({ ...schemaPayload } as Record<string, unknown>) : null"
    />
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
  display: flex;
  align-items: center;
  gap: 4px;
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

.km-detail-caps {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.km-cap-card {
  --n-padding-top: 8px;
  --n-padding-bottom: 8px;
}

.km-detail-schemas {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.km-schema-card {
  cursor: pointer;
}

.km-schema-name {
  font-size: 13px;
  font-weight: 600;
}

.km-schema-desc {
  font-size: 11px;
  opacity: 0.6;
  margin-top: 2px;
}

.km-detail-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
</style>
