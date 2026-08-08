<script setup lang="ts">
/**
 * RightPanel — 右栏统一外壳（R-10，设计 §1.5 职责边界）。
 *
 * ```
 * RightPanel.vue（外壳）
 * ├── title 栏：RIGHT_PANEL_TITLE[mode] + ⛶ 全屏 + ✕ 关闭
 * └── 内容槽（v-if mode 分派）
 *     ├── output                → OutputPanel.vue
 *     ├── expert|team|skill|mcp → ExpertDetail / TeamDetail / SkillDetail / McpDetail
 *     ├── job-artifact          → 内联渲染（AgentMarkdown / <pre> + 截断条 + 外部打开）
 *     ├── agent-role            → AgentRoleDetail.vue（T4 接入）
 *     └── expert-picker         → ExpertPickerPanel.vue（T4 接入）
 * ```
 *
 * 契约（设计 §7.1）：`mode` 与 `title` 均从 `stores/chat` + `RIGHT_PANEL_TITLE` 读取，
 * **不接受外部 props**；宽度/折叠由 shell 轨道负责，本组件只管内容与全屏。
 *
 * R-36：9 态之间用 `v-show`/常驻 DOM 的地方保持不卸载，滚动位置与标签状态天然保留。
 */
import { computed, ref } from 'vue';
import { NButton, NEmpty, NSpin } from 'naive-ui';
import KIcon from '../common/KIcon.vue';
import { useChatStore } from '../../stores/chat';
import { useLayoutStore } from '../../stores/layout';
import { INTERACTION, RIGHT_PANEL_TITLE } from '../../constants/layout';
import { openPath } from '../../utils/desktop-bridge';
import OutputPanel from '../chat/OutputPanel.vue';
import AgentMarkdown from '../chat/AgentMarkdown.vue';
import ExpertDetail from '../market/ExpertDetail.vue';
import TeamDetail from '../market/TeamDetail.vue';
import SkillDetail from '../market/SkillDetail.vue';
import McpDetail from '../market/McpDetail.vue';
import AgentRoleDetail from '../settings/AgentRoleDetail.vue';
import ExpertPickerPanel from '../settings/ExpertPickerPanel.vue';
import NewTaskDialog from '../dialog/NewTaskDialog.vue';
import type { NewTaskConfig } from '../../types/newTask';
import type { Expert, ExpertTeam, McpServer, Skill } from '../../types/market';

const store = useChatStore();
const layout = useLayoutStore();

/** 当前内容态（唯一真源在 chat store）。 */
const mode = computed(() => store.rightPanelMode);

/** title 栏文案（查表，不做二次类型推断）。 */
const title = computed<string>(() => RIGHT_PANEL_TITLE[mode.value] ?? '');

/** 是否有内容（`hidden` 时轨道宽 0，内部不渲染）。 */
const visible = computed<boolean>(() => mode.value !== 'hidden');

/** 市场实体详情载荷（4 态共用一个 entity）。 */
const detailEntity = computed(() => store.detailEntity);

// ── 定时任务产物（Q8）──
const jobArtifact = computed(() => store.jobArtifact);

/** 产物文件名后缀判定是否按 Markdown 渲染。 */
const jobArtifactIsMarkdown = computed<boolean>(() => {
  const file = jobArtifact.value?.run.file ?? '';
  return /\.(md|markdown)$/i.test(file);
});

/** 正文：读到全文优先，读不到回落列表行摘要（A2 三档回落的最后一档）。 */
const jobArtifactText = computed<string>(() => {
  const ref_ = jobArtifact.value;
  if (!ref_) return '';
  return ref_.content || ref_.run.excerpt || '';
});

/** 是否达到 1MB 读取上限（超出已被 bridge 截断）。 */
const jobArtifactTruncated = computed<boolean>(
  () => (jobArtifact.value?.content.length ?? 0) >= INTERACTION.maxFileBytes
);

/** 用系统默认应用打开产物文件；Web 端静默无效果（bridge 返回 false）。 */
const openingExternal = ref<boolean>(false);

async function openJobArtifactExternal(): Promise<void> {
  const file = jobArtifact.value?.run.file;
  if (!file) return;
  openingExternal.value = true;
  try {
    await openPath(file);
  } finally {
    openingExternal.value = false;
  }
}

// ── Agent 角色配置（R-14 / R-15）──
/** 正在编辑的角色 id；空串 = 新建草稿。 */
const editingRoleId = computed<string>(() => store.editingRoleId);

/** 保存后停留在右栏（切到该角色的编辑态），便于连续微调。 */
function onRoleSaved(role: { id: string }): void {
  store.openAgentRole(role.id);
}

/** 取消：关闭右栏回到列表。 */
function onRoleCancel(): void {
  store.closeDetail();
}

// ── 从市场添加角色（R-15）──
// 「查看」→ MemberDetailDialog 由 ExpertPickerPanel 自己挂载（它持有「是否已添加」
// 与添加/移除口径），此处不再重复挂一份，避免同一次点击叠两层同内容弹窗。
// 添加/移除同样在面板内部完成落库 + toast，右栏保持当前态不动。

// ── title 栏操作 ──
function onToggleFullscreen(): void {
  layout.toggleFullscreen();
}

function onClose(): void {
  layout.rightFullscreen = false;
  store.closeDetail();
}

// ── 详情页「召唤」→ NewTaskDialog（从 OutputPanel 上移，右栏唯一入口）──
const summonShow = ref<boolean>(false);
const summonAgent = ref<string | null>(null);

function onSummon(agentId?: string): void {
  summonAgent.value = agentId ?? null;
  summonShow.value = true;
}

async function onSummonConfirm(config: NewTaskConfig): Promise<void> {
  try {
    await store.createSessionWithConfig(config);
    summonShow.value = false;
  } catch {
    // store 内部已记录错误，此处静默避免二次弹窗
  }
}
</script>

<template>
  <aside
    class="km-right"
    :class="{ 'km-right-fullscreen': layout.rightFullscreen && layout.rightVisible }"
  >
    <template v-if="visible">
      <!-- title 栏：内容态名称 + ⛶ + ✕ -->
      <div class="km-right-head">
        <span class="km-right-title">{{ title }}</span>
        <div class="km-right-head-actions">
          <n-button
            quaternary
            circle
            size="tiny"
            :title="layout.rightFullscreen ? '退出全屏（Ctrl+Shift+Enter）' : '全屏（Ctrl+Shift+Enter）'"
            @click="onToggleFullscreen"
          >
            <template #icon><KIcon name="Maximize" :size="16" /></template>
          </n-button>
          <n-button quaternary circle size="tiny" title="关闭右栏" @click="onClose">
            <template #icon><KIcon name="X" :size="16" /></template>
          </n-button>
        </div>
      </div>

      <!-- 内容槽 -->
      <div class="km-right-body">
        <!-- 会话产物多标签（常驻，切走不卸载 → R-36 保留标签与滚动） -->
        <OutputPanel v-show="mode === 'output'" />

        <!-- 市场实体详情 -->
        <div v-if="mode === 'expert' && detailEntity" class="km-right-scroll">
          <ExpertDetail :expert="(detailEntity as Expert)" @summon="onSummon" />
        </div>
        <div v-else-if="mode === 'team' && detailEntity" class="km-right-scroll">
          <TeamDetail :team="(detailEntity as ExpertTeam)" @summon="onSummon" />
        </div>
        <div v-else-if="mode === 'skill' && detailEntity" class="km-right-scroll">
          <SkillDetail :skill="(detailEntity as Skill)" />
        </div>
        <div v-else-if="mode === 'mcp' && detailEntity" class="km-right-scroll">
          <McpDetail :mcp="(detailEntity as McpServer)" />
        </div>

        <!-- 定时任务产物（Q8） -->
        <div v-else-if="mode === 'job-artifact'" class="km-right-scroll">
          <template v-if="jobArtifact">
            <div class="km-job-meta">
              <div class="km-job-name">{{ jobArtifact.run.job_name }}</div>
              <div class="km-job-sub">
                {{ jobArtifact.run.run_time }} · {{ jobArtifact.run.status }} · {{ jobArtifact.run.mode }}
              </div>
              <div class="km-job-file" :title="jobArtifact.run.file">{{ jobArtifact.run.file }}</div>
              <n-button size="tiny" :loading="openingExternal" @click="openJobArtifactExternal">
                在外部应用打开
              </n-button>
            </div>

            <n-spin :show="jobArtifact.loading">
              <div v-if="jobArtifact.error" class="km-job-error">
                产物读取失败：{{ jobArtifact.error }}（下方回落展示列表摘要）
              </div>
              <div v-if="jobArtifactTruncated" class="km-job-truncated">
                内容超过 1 MB，已截断展示。完整内容请用「在外部应用打开」查看。
              </div>

              <AgentMarkdown v-if="jobArtifactIsMarkdown && jobArtifactText" :source="jobArtifactText" />
              <pre v-else-if="jobArtifactText" class="km-job-text">{{ jobArtifactText }}</pre>
              <n-empty
                v-else-if="!jobArtifact.loading"
                size="small"
                description="该次运行没有产物内容"
              />
            </n-spin>
          </template>
          <n-empty v-else size="small" description="请在定时任务列表中点击一次运行记录" />
        </div>

        <!-- Agent 角色配置（R-14：7 类可配置项） -->
        <div v-else-if="mode === 'agent-role'" class="km-right-scroll">
          <AgentRoleDetail
            :key="editingRoleId || '__new__'"
            :role-id="editingRoleId"
            @save="onRoleSaved"
            @cancel="onRoleCancel"
          />
        </div>

        <!-- 从市场添加角色（R-15：右栏内展开专家列表，添加/查看均在面板内闭环） -->
        <div v-else-if="mode === 'expert-picker'" class="km-right-scroll">
          <ExpertPickerPanel />
        </div>
      </div>
    </template>

    <!-- 详情页召唤 → 新建任务 -->
    <NewTaskDialog
      :show="summonShow"
      :prefill-agent="summonAgent"
      @update:show="(v: boolean) => (summonShow = v)"
      @confirm="onSummonConfirm"
      @cancel="summonShow = false"
    />
  </aside>
</template>

<style scoped>
.km-right {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
  min-height: 0;
  background: var(--km-panel);
  border-left: 1px solid var(--km-border);
  overflow: hidden;
}

/* R-10③：覆盖整个窗口，再点还原（Grid 轨道保持不变） */
.km-right-fullscreen {
  position: fixed;
  inset: 0;
  z-index: 100;
  border-left: none;
  background: var(--km-bg);
}

/* ── title 栏 ── */
.km-right-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--km-space-sm);
  height: 40px;
  padding: 0 var(--km-space-sm) 0 var(--km-space-md);
  border-bottom: 1px solid var(--km-border);
  flex-shrink: 0;
}

.km-right-title {
  font-size: var(--km-font-13);
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.km-right-head-actions {
  display: flex;
  align-items: center;
  gap: var(--km-space-2xs);
  flex-shrink: 0;
}

/* ── 内容区 ── */
.km-right-body {
  flex: 1;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.km-right-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: var(--km-space-md);
}

/* ── 定时任务产物 ── */
.km-job-meta {
  display: flex;
  flex-direction: column;
  gap: var(--km-space-xs);
  align-items: flex-start;
  padding-bottom: var(--km-space-10);
  margin-bottom: var(--km-space-10);
  border-bottom: 1px solid var(--km-border);
}

.km-job-name {
  font-size: var(--km-font-md);
  font-weight: 600;
}

.km-job-sub {
  font-size: var(--km-font-sm);
  opacity: 0.6;
}

.km-job-file {
  font-size: var(--km-font-sm);
  opacity: 0.45;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.km-job-error {
  font-size: var(--km-font-sm);
  color: var(--km-danger);
  margin-bottom: var(--km-space-sm);
}

.km-job-truncated {
  font-size: var(--km-font-sm);
  color: var(--km-muted);
  border: 1px dashed var(--km-border-light);
  border-radius: var(--km-radius-md);
  padding: var(--km-space-6) var(--km-space-sm);
  margin-bottom: var(--km-space-sm);
}

.km-job-text {
  font-size: var(--km-font-sm);
  line-height: 1.7;
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
  font-family: 'SFMono-Regular', Consolas, 'Cascadia Mono', 'Fira Code', Menlo, monospace;
}

/* ── 滚动条 ── */
.km-right-scroll::-webkit-scrollbar {
  width: 6px;
}
.km-right-scroll::-webkit-scrollbar-track {
  background: transparent;
}
.km-right-scroll::-webkit-scrollbar-thumb {
  background: var(--km-border);
  border-radius: 3px;
}
.km-right-scroll::-webkit-scrollbar-thumb:hover {
  background: var(--km-muted);
}
</style>
