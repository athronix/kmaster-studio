<script setup lang="ts">
/**
 * AgentTabBar — Agent 角色标签平铺栏（T04）。
 *
 * 水平平铺 Agent 标签，active 标签蓝色边框高亮，
 * hover 出现关闭按钮，多标签时支持横向滚动。
 */
import { ref } from 'vue';
import { NTag, NButton } from 'naive-ui';
import KIcon from '../common/KIcon.vue';

export interface AgentTabItem {
  id: string;
  name: string;
  color?: string;
}

const props = withDefaults(
  defineProps<{
    agents: AgentTabItem[];
    activeAgentId?: string;
  }>(),
  {
    activeAgentId: '',
  },
);

const emit = defineEmits<{
  (e: 'select', agentId: string): void;
  (e: 'close', agentId: string): void;
}>();

/** 当前 hover 的 agent id，用于控制关闭按钮显隐 */
const hoveredId = ref<string>('');

function onSelect(agentId: string): void {
  emit('select', agentId);
}

function onClose(agentId: string): void {
  emit('close', agentId);
}

function isActive(agentId: string): boolean {
  return agentId === props.activeAgentId;
}
</script>

<template>
  <div v-if="agents.length > 0" class="km-agent-tabbar">
    <div class="km-agent-tabbar-scroll">
      <n-tag
        v-for="agent in agents"
        :key="agent.id"
        class="km-agent-tab"
        :class="{
          'km-agent-tab--active': isActive(agent.id),
        }"
        :bordered="false"
        size="small"
        :closable="agents.length !== 1"
        @click="onSelect(agent.id)"
        @mouseenter="hoveredId = agent.id"
        @mouseleave="hoveredId = ''"
      >
        <span class="km-agent-tab-dot" :style="{ background: agent.color || '#60a5fa' }"></span>
        <span class="km-agent-tab-name">{{ agent.name }}</span>
        <n-button
          v-if="hoveredId === agent.id && agents.length > 1"
          class="km-agent-tab-close"
          text
          size="tiny"
          @click.stop="onClose(agent.id)"
          title="关闭"
        >
          <KIcon name="X" :size="14" />
        </n-button>
      </n-tag>
    </div>
  </div>
</template>

<style scoped>
.km-agent-tabbar {
  flex-shrink: 0;
  border-bottom: 1px solid var(--km-border);
  background: var(--km-panel);
}

.km-agent-tabbar-scroll {
  display: flex;
  gap: var(--km-space-xs);
  flex-wrap: nowrap;
  overflow-x: auto;
  padding: var(--km-space-6) var(--km-space-md);
  scrollbar-width: thin;
  scrollbar-color: var(--km-border) transparent;
}

.km-agent-tabbar-scroll::-webkit-scrollbar {
  height: 3px;
}

.km-agent-tabbar-scroll::-webkit-scrollbar-track {
  background: transparent;
}

.km-agent-tabbar-scroll::-webkit-scrollbar-thumb {
  background: var(--km-border);
  border-radius: 3px;
}

.km-agent-tab {
  display: inline-flex;
  align-items: center;
  gap: var(--km-space-xs);
  cursor: pointer;
  font-size: var(--km-font-sm);
  padding: var(--km-space-2xs) var(--km-space-sm);
  border-radius: 999px;
  border: 1px solid transparent;
  transition: border-color 0.12s ease, background 0.12s ease;
  user-select: none;
  white-space: nowrap;
  flex-shrink: 0;
}

.km-agent-tab:hover {
  background: var(--km-hover-bg);
}

.km-agent-tab--active {
  border-color: var(--km-accent);
  background: var(--km-accent-bg);
}

.km-agent-tab-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.km-agent-tab-name {
  overflow: hidden;
  text-overflow: ellipsis;
}

.km-agent-tab-close {
  margin-left: var(--km-space-2xs);
  opacity: 0.6;
  font-size: var(--km-font-base);
  line-height: 1;
  padding: 0 var(--km-space-2xs);
  min-width: auto;
  height: auto;
}

.km-agent-tab-close:hover {
  opacity: 1;
  color: var(--km-danger);
}
</style>
