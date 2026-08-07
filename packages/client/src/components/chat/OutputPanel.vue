<script setup lang="ts">
/**
 * OutputPanel — 右栏「会话产物」内容态（V3 瘦身版）。
 *
 * V3 改造（设计 §1.5 删除清单，必须删干净否则出现双 header / 双 resize）：
 * - 删 `rightWidth` / `MIN_RIGHT` / `MAX_RIGHT` / `resizeState` / `startResize`
 *   / `onMouseMoveResize` / `onMouseUpResize` / `panelStyle`
 *   / `.km-output-resize-handle` / `.km-output-fullscreen`；
 * - 删 tabs 栏的 ⛶ 按钮（上移到 `RightPanel`）；
 * - 删 `inject('outputPanelFullscreen' | 'rightPanelCollapsed')`（宽度/显隐由 shell 轨道负责）；
 * - 删 detail 分支与 NewTaskDialog（市场实体详情由 `RightPanel` 直接分派）。
 *
 * 剩余职责**只有两件**：产物多标签（R-11）+ 标签内容预览。
 * 组件本身不控制宽度、不带 header，永远铺满父容器。
 */
import { computed, ref, watch } from 'vue';
import { NButton, NInput, NScrollbar } from 'naive-ui';
import KIcon from '../common/KIcon.vue';
import { useChatStore } from '../../stores/chat';
import AgentMarkdown from './AgentMarkdown.vue';
import PlanCard from './PlanCard.vue';
import UsageBar from './UsageBar.vue';
import FileTreePane from '../preview/FileTreePane.vue';
import TerminalPane from '../preview/TerminalPane.vue';
import type { Artifact } from '../../types/chat';

const store = useChatStore();

// ── 产物数据 ──
const artifacts = computed<Artifact[]>(() => {
  const sid = store.activeSessionId;
  return sid ? ((store.artifactsBySession[sid] || []) as Artifact[]) : [];
});

/** 标签项：`__overview` 为常驻不可关闭的任务概览。 */
interface TabItem {
  id: string;
  name: string;
  kind: string;
  closable: boolean;
}

const OVERVIEW_TAB_ID = '__overview';

const tabs = ref<TabItem[]>([
  { id: OVERVIEW_TAB_ID, name: '任务概览', kind: 'overview', closable: false },
]);
const activeTabId = ref<string>(OVERVIEW_TAB_ID);

// 产物变化时补标签（R-11①②：首次新建，再次点击只激活不重复建）
watch(
  () => artifacts.value.length,
  () => {
    for (const a of artifacts.value) {
      if (!tabs.value.find((t) => t.id === a.id)) {
        tabs.value.push({ id: a.id, name: a.name, kind: a.kind, closable: true });
      }
    }
  },
  { immediate: true }
);

/** 打开（或激活）某产物标签。 */
function openTab(artifactId: string): void {
  const exists = tabs.value.find((t) => t.id === artifactId);
  if (!exists) {
    const a = artifacts.value.find((x) => x.id === artifactId);
    if (a) tabs.value.push({ id: a.id, name: a.name, kind: a.kind, closable: true });
  }
  activeTabId.value = artifactId;
}

/** 关闭标签；关闭当前标签后自动激活相邻标签（R-11④）。 */
function closeTab(tabId: string): void {
  const tab = tabs.value.find((t) => t.id === tabId);
  if (!tab || !tab.closable) return;
  const idx = tabs.value.indexOf(tab);
  tabs.value.splice(idx, 1);
  if (activeTabId.value === tabId) {
    activeTabId.value = tabs.value[Math.max(0, idx - 1)]?.id ?? OVERVIEW_TAB_ID;
  }
}

// ── 产物预览 ──
const currentArtifact = computed<Artifact | null>(() => {
  if (activeTabId.value === OVERVIEW_TAB_ID) return null;
  return artifacts.value.find((a) => a.id === activeTabId.value) ?? null;
});

const urlInput = ref<string>('');
const iframeKey = ref<number>(0);

watch(currentArtifact, (a) => {
  if (a?.kind === 'html' || a?.kind === 'svg') {
    urlInput.value = `artifact://${a.id}/${a.name}`;
  } else {
    urlInput.value = a?.name ?? '';
  }
});

function copyUrl(): void {
  if (!urlInput.value) return;
  navigator.clipboard?.writeText(urlInput.value).catch(() => {
    /* 剪贴板不可用时静默 */
  });
}

function download(): void {
  const a = currentArtifact.value;
  if (!a?.content) return;
  const blob = new Blob([a.content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const el = document.createElement('a');
  el.href = url;
  el.download = a.name || 'artifact';
  document.body.appendChild(el);
  el.click();
  document.body.removeChild(el);
  URL.revokeObjectURL(url);
}

function refresh(): void {
  iframeKey.value++;
}

function openExternal(): void {
  const a = currentArtifact.value;
  if (!a?.content) return;
  const blob = new Blob([a.content], { type: 'text/html' });
  window.open(URL.createObjectURL(blob), '_blank');
}

/** code 类产物包一层围栏交给 Markdown 渲染，保留高亮。 */
function mdSource(a: Artifact): string {
  if (a.kind === 'code') return '```' + (a.language || '') + '\n' + (a.content || '') + '\n```';
  return a.content || '';
}

defineExpose({ openTab });
</script>

<template>
  <div class="km-output">
    <!-- 标签栏（⛶ 已上移到 RightPanel） -->
    <div class="km-output-tabs-bar">
      <div class="km-output-tabs">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          class="km-output-tab"
          :class="{ active: tab.id === activeTabId }"
          @click="activeTabId = tab.id"
        >
          <span class="km-output-tab-label">{{ tab.name }}</span>
          <span v-if="tab.closable" class="km-output-tab-close" @click.stop="closeTab(tab.id)"><KIcon name="X" :size="12" /></span>
        </button>
      </div>
    </div>

    <!-- 主体 -->
    <n-scrollbar class="km-output-body">
      <!-- 任务概览 -->
      <div v-if="activeTabId === '__overview'" class="km-overview">
        <div v-if="store.activeSessionId" class="km-overview-section">
          <div class="km-overview-title">任务计划</div>
          <PlanCard
            v-if="store.pendingPlans[store.activeSessionId]?.length"
            :req="store.pendingPlans[store.activeSessionId][0]"
          />
          <div v-else class="km-overview-empty">暂无任务计划</div>
        </div>

        <div class="km-overview-section">
          <div class="km-overview-title">产物列表</div>
          <div v-if="!artifacts.length" class="km-overview-empty">
            暂无产出物。发送消息后，agent 生成的文件会显示在这里。
          </div>
          <div
            v-for="a in artifacts"
            :key="a.id"
            class="km-artifact-list-item"
            @click="openTab(a.id)"
          >
            <span class="km-artifact-kind-badge">{{ a.kind }}</span>
            <span class="km-artifact-list-name">{{ a.name }}</span>
          </div>
        </div>

        <UsageBar />
      </div>

      <!-- 产物预览 -->
      <div v-else-if="currentArtifact" class="km-artifact-preview">
        <div class="km-output-toolbar">
          <n-input
            :value="urlInput"
            size="tiny"
            placeholder="产物地址"
            @keyup.enter="refresh"
            @update:value="(v: string) => (urlInput = v)"
          />
          <div class="km-output-toolbar-actions">
            <n-button quaternary circle size="tiny" title="复制" @click="copyUrl">
              <template #icon><KIcon name="Clipboard" :size="16" /></template>
            </n-button>
            <n-button quaternary circle size="tiny" title="下载" @click="download">
              <template #icon><KIcon name="Download" :size="16" /></template>
            </n-button>
            <n-button quaternary circle size="tiny" title="刷新" @click="refresh">
              <template #icon><KIcon name="Repeat" :size="16" /></template>
            </n-button>
            <n-button quaternary circle size="tiny" title="外部浏览器打开" @click="openExternal">
              <template #icon><KIcon name="World" :size="16" /></template>
            </n-button>
          </div>
        </div>

        <div class="km-output-content">
          <template v-if="currentArtifact.kind === 'html' || currentArtifact.kind === 'svg'">
            <iframe
              :key="iframeKey"
              :srcdoc="currentArtifact.content"
              sandbox="allow-scripts"
              class="km-output-iframe"
              title="产物预览"
            ></iframe>
          </template>
          <AgentMarkdown
            v-else-if="currentArtifact.kind === 'markdown' || currentArtifact.kind === 'code'"
            :source="mdSource(currentArtifact)"
          />
          <pre
            v-else-if="currentArtifact.kind === 'text' || currentArtifact.kind === 'diff'"
            class="km-output-text"
          >{{ currentArtifact.content }}</pre>
          <img
            v-else-if="currentArtifact.kind === 'image' && currentArtifact.dataUrl"
            :src="currentArtifact.dataUrl"
            class="km-output-img"
          />
          <div v-else class="km-output-unsupported">该类型暂不支持预览。</div>
        </div>
      </div>

      <!-- 文件树 Tab -->
      <div v-else-if="activeTabId === '__files'" class="km-output-files">
        <FileTreePane
          v-if="artifacts.length"
          :artifacts="artifacts"
          @select="(artifactId: string) => openTab(artifactId)"
        />
        <div v-else class="km-overview-empty">暂无文件</div>
      </div>

      <!-- 终端 Tab -->
      <div v-else-if="activeTabId === '__terminal'" class="km-output-terminal">
        <TerminalPane />
      </div>
    </n-scrollbar>
  </div>
</template>

<style scoped>
.km-output {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
  min-height: 0;
  background: var(--km-panel);
}

/* ── 标签栏 ── */
.km-output-tabs-bar {
  display: flex;
  align-items: center;
  gap: var(--km-space-xs);
  height: 40px;
  padding: 0 8px;
  border-bottom: 1px solid var(--km-border);
  flex-shrink: 0;
}

.km-output-tabs {
  display: flex;
  flex: 1;
  overflow-x: auto;
  gap: var(--km-space-2xs);
  min-width: 0;
}

.km-output-tab {
  display: flex;
  align-items: center;
  gap: var(--km-space-xs);
  padding: 6px 10px;
  border: none;
  background: transparent;
  color: var(--km-text);
  font-size: var(--km-font-sm);
  cursor: pointer;
  border-bottom: 2px solid transparent;
  white-space: nowrap;
  opacity: 0.6;
  transition: opacity 0.15s ease, border-color 0.15s ease;
}

.km-output-tab:hover {
  opacity: 0.85;
}

.km-output-tab.active {
  opacity: 1;
  border-bottom-color: var(--km-accent);
  font-weight: 500;
}

.km-output-tab-label {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.km-output-tab-close {
  font-size: var(--km-font-base);
  opacity: 0.5;
  line-height: 1;
}

.km-output-tab-close:hover {
  opacity: 1;
  color: #dc2626;
}

/* ── 主体 ── */
.km-output-body {
  flex: 1;
  min-height: 0;
}

/* ── 任务概览 ── */
.km-overview {
  padding: var(--km-space-14);
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.km-overview-section {
  display: flex;
  flex-direction: column;
  gap: var(--km-space-sm);
}

.km-overview-title {
  font-size: var(--km-font-sm);
  font-weight: 600;
  opacity: 0.55;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.km-overview-empty {
  font-size: var(--km-font-sm);
  opacity: 0.45;
  padding: 8px 0;
}

.km-artifact-list-item {
  display: flex;
  align-items: center;
  gap: var(--km-space-sm);
  padding: 6px 10px;
  background: var(--km-bg);
  border: 1px solid var(--km-border);
  border-radius: var(--km-radius-md);
  cursor: pointer;
  transition: background 0.12s ease;
}

.km-artifact-list-item:hover {
  background: rgba(59, 130, 246, 0.08);
  border-color: var(--km-accent);
}

.km-artifact-kind-badge {
  font-size: 10px;
  text-transform: uppercase;
  opacity: 0.6;
  border: 1px solid var(--km-border);
  border-radius: var(--km-radius-sm);
  padding: 1px 5px;
  flex-shrink: 0;
}

.km-artifact-list-name {
  font-size: var(--km-font-sm);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ── 产物预览 ── */
.km-artifact-preview {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: var(--km-space-10);
  gap: 10px;
}

.km-output-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.km-output-toolbar-actions {
  display: flex;
  gap: var(--km-space-2xs);
}

.km-output-content {
  flex: 1;
  min-height: 0;
  overflow: auto;
  border: 1px solid var(--km-border);
  border-radius: var(--km-radius-lg);
  padding: var(--km-space-10);
  background: var(--km-bg);
}

.km-output-iframe {
  width: 100%;
  min-height: 300px;
  border: none;
  border-radius: var(--km-radius-sm);
  background: #fff;
}

.km-output-text {
  font-size: var(--km-font-sm);
  white-space: pre-wrap;
  margin: 0;
  font-family: 'SFMono-Regular', Consolas, 'Cascadia Mono', 'Fira Code', Menlo, monospace;
}

.km-output-img {
  max-width: 100%;
  border-radius: var(--km-radius-md);
}

.km-output-unsupported {
  font-size: var(--km-font-sm);
  opacity: 0.5;
}

/* ── 文件树 ── */
.km-output-files {
  flex: 1;
  min-height: 0;
  padding: var(--km-space-sm);
}

/* ── 终端 ── */
.km-output-terminal {
  flex: 1;
  min-height: 0;
}

/* ── 自定义滚动条 ── */
.km-output-body::-webkit-scrollbar {
  width: 6px;
}
.km-output-body::-webkit-scrollbar-track {
  background: transparent;
}
.km-output-body::-webkit-scrollbar-thumb {
  background: var(--km-border);
  border-radius: 3px;
}
.km-output-body::-webkit-scrollbar-thumb:hover {
  background: var(--km-muted);
}
</style>
