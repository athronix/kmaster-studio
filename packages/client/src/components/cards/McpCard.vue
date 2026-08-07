<script setup lang="ts">
/**
 * McpCard — MCP 连接器卡片组件（T09）。
 *
 * 展示：图标/名称/描述/鉴权模式/来源标记。
 * 已部署：状态指示（运行中/已停止/错误）+ 停止/删除按钮。
 * 候选池：「一键部署」按钮。
 */
import { computed } from 'vue';
import { NCard, NButton, NTag, NText } from 'naive-ui';

export interface McpCardData {
  id: string;
  name: string;
  icon: string;
  description: string;
  tags: string[];
  source: string;
  deployed: boolean;
  command?: string;
  status?: string;
  tools?: number;
  transport?: string;
  authMode?: string;
  url?: string;
}

const props = defineProps<{
  mcp: McpCardData;
}>();

const emit = defineEmits<{
  (e: 'click', mcp: McpCardData): void;
  (e: 'deploy', mcp: McpCardData): void;
  (e: 'stop', mcp: McpCardData): void;
  (e: 'delete', mcp: McpCardData): void;
}>();

/** 来源标记色 */
const sourceColors: Record<string, {
  label: string;
  type: 'info' | 'success' | 'warning' | 'default';
}> = {
  hermes: { label: 'hermes', type: 'warning' },
  cos: { label: 'COS', type: 'info' },
  optional: { label: 'Optional', type: 'warning' },
};

const sourceInfo = computed(() => {
  const src = props.mcp.source ?? 'cos';
  return sourceColors[src] ?? { label: src, type: 'default' as const };
});

/** 状态指示 */
const statusInfo = computed<{
  label: string;
  type: 'success' | 'error' | 'warning';
  dot: string;
}>(() => {
  const status = props.mcp.status ?? 'unknown';
  const map: Record<string, { label: string; type: 'success' | 'error' | 'warning'; dot: string }> = {
    connected: { label: '运行中', type: 'success', dot: 'var(--km-status-success)' },
    running: { label: '运行中', type: 'success', dot: 'var(--km-status-success)' },
    stopped: { label: '已停止', type: 'warning', dot: 'var(--km-status-warning)' },
    error: { label: '错误', type: 'error', dot: 'var(--km-status-error)' },
    unknown: { label: '未知', type: 'warning', dot: 'var(--km-status-muted)' },
  };
  return map[status] ?? map.unknown;
});

function onClick(): void {
  emit('click', props.mcp);
}

function onDeploy(e: MouseEvent): void {
  e.stopPropagation();
  emit('deploy', props.mcp);
}

function onStop(e: MouseEvent): void {
  e.stopPropagation();
  emit('stop', props.mcp);
}

function onDelete(e: MouseEvent): void {
  e.stopPropagation();
  emit('delete', props.mcp);
}
</script>

<template>
  <n-card size="small" hoverable class="km-mcp-card" @click="onClick">
    <!-- 来源标记 -->
    <div class="km-mcp-source">
      <n-tag :type="sourceInfo.type" size="tiny" :bordered="false">
        {{ sourceInfo.label }}
      </n-tag>
    </div>

    <!-- 图标 -->
    <div class="km-mcp-icon">
      <span class="km-mcp-icon-text">{{ mcp.icon || 'PlugConnected' }}</span>
    </div>

    <!-- 名称 -->
    <n-text strong class="km-mcp-name" tag="div">
      {{ mcp.name }}
    </n-text>

    <!-- 鉴权模式 -->
    <n-text v-if="mcp.authMode" depth="3" class="km-mcp-auth" tag="div">
      {{ mcp.authMode }}
    </n-text>

    <!-- 简介（2行截断） -->
    <n-text depth="3" class="km-mcp-desc">
      {{ mcp.description }}
    </n-text>

    <!-- 操作区 -->
    <div class="km-mcp-actions" @click.stop>
      <template v-if="mcp.deployed">
        <div class="km-mcp-status">
          <span
            class="km-mcp-status-dot"
            :style="{ background: statusInfo.dot }"
          ></span>
          <n-text depth="3" style="font-size: var(--km-font-xs)">{{ statusInfo.label }}</n-text>
        </div>
        <div class="km-mcp-ops">
          <n-button size="tiny" type="warning" ghost @click="onStop">
            停止
          </n-button>
          <n-button size="tiny" type="error" ghost @click="onDelete">
            删除
          </n-button>
        </div>
      </template>
      <template v-else>
        <n-button size="tiny" type="primary" ghost @click="onDeploy">
          一键部署
        </n-button>
      </template>
    </div>
  </n-card>
</template>

<style scoped>
.km-mcp-card {
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
  height: 230px;
}

.km-mcp-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--km-shadow-card);
}

.km-mcp-source {
  position: absolute;
  top: 10px;
  left: 10px;
  z-index: 2;
}

.km-mcp-icon {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: var(--km-space-lg) 0 var(--km-space-6);
}

.km-mcp-icon-text {
  font-size: 36px;
  line-height: 1;
}

.km-mcp-name {
  text-align: center;
  font-size: var(--km-font-base);
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding: 0 var(--km-space-sm);
  max-width: 100%;
}

.km-mcp-auth {
  font-size: var(--km-font-xs);
  margin-top: var(--km-space-2xs);
}

.km-mcp-desc {
  font-size: var(--km-font-sm);
  line-height: 1.5;
  text-align: center;
  padding: var(--km-space-xs) var(--km-space-sm) 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  flex: 1;
}

.km-mcp-actions {
  padding: var(--km-space-sm) 0 var(--km-space-xs);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--km-space-xs);
}

.km-mcp-status {
  display: flex;
  align-items: center;
  gap: var(--km-space-xs);
}

.km-mcp-status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  display: inline-block;
}

.km-mcp-ops {
  display: flex;
  gap: var(--km-space-xs);
}
</style>
