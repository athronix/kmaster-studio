<script setup lang="ts">
/**
 * NewTaskDialog — 新建任务弹窗。
 *
 * NModal 包裹，7 项配置表单，校验 title 非空后 emit('confirm', config)。
 *
 * V3 T5 / S5.4 增量（R-16 / Q3）：
 *   ① Agent 角色下拉换成 `stores/agentRoles.selectOptions`——localStorage
 *      为唯一真源，未添加的市场专家不会出现在下拉里，增删即时生效；
 *   ② 确认时对「召唤预填但本地尚无同名角色」的情况调 `addRoleIfAbsent`
 *      补一条记录，保证会话与角色列表口径一致；
 *   ③ Provider / 模型默认值优先取 `stores/modelConfig.defaults.default`
 *      对应的模型（5 槽体系），取不到才回落 `globalSettings.default_model`。
 */
import { computed, reactive, ref, watch } from 'vue';
import {
  NModal,
  NInput,
  NSelect,
  NButton,
  NSpace,
} from 'naive-ui';
import KIcon from '../common/KIcon.vue';
import DirPickerModal from '../common/DirPickerModal.vue';
import DirPathDisplay from '../common/DirPathDisplay.vue';
import { useChatStore } from '../../stores/chat';
import { useAgentRolesStore } from '../../stores/agentRoles';
import { useModelConfigStore } from '../../stores/modelConfig';
import { useWorkspacePicker } from '../../composables/useWorkspacePicker';
import type { NewTaskConfig, SecurityMode } from '../../types/newTask';
import {
  SECURITY_MODE_OPTIONS,
  defaultNewTaskConfig,
} from '../../types/newTask';

const props = defineProps<{
  show: boolean;
  /** 预填的 agent 角色（从详情页召唤时传入） */
  prefillAgent?: string | null;
}>();

const emit = defineEmits<{
  (e: 'update:show', v: boolean): void;
  (e: 'confirm', config: NewTaskConfig): void;
  (e: 'cancel'): void;
}>();

const store = useChatStore();
const roles = useAgentRolesStore();
const modelConfig = useModelConfigStore();
const { show: wsShow, initialPath: wsInitialPath, open: wsOpen, resolve: wsResolve, cancel: wsCancel } = useWorkspacePicker();

/** 选择工作目录：桌面端系统选择器 / Web 端目录树选择器，选中后回填表单。 */
async function onPickWorkspace(): Promise<void> {
  const picked = await wsOpen(form.workspace || undefined);
  if (picked !== null) form.workspace = picked;
}

// ── 表单 ──
const form = reactive<NewTaskConfig>(defaultNewTaskConfig());

/**
 * S5.4③：默认模型解析。
 * 先看 5 槽体系的 `default` 槽 → 拿到 modelId 后反查所属供应商；
 * 槽位为空或模型已被删除时，回落到 `globalSettings.default_model`。
 */
function resolveDefaultModel(): { provider: string; model: string } {
  const slotModelId = modelConfig.defaults.default ?? '';
  if (slotModelId !== '') {
    const hit = modelConfig.allModels.find((x) => x.model.id === slotModelId);
    if (hit !== undefined) {
      return { provider: hit.provider.name, model: hit.model.name };
    }
  }
  const fallback = store.globalSettings?.default_model ?? '';
  return { provider: fallback, model: fallback };
}

/**
 * S5.4①：Agent 角色下拉 —— 唯一来源是 localStorage 里的本地角色。
 * 若召唤时预填了一个尚未添加的市场专家，临时补一条「仅本次可见」的选项，
 * 避免下拉显示空值；真正落库发生在 `onConfirm` 的 `addRoleIfAbsent`。
 */
const agentRoleOptions = computed(() => {
  const base = roles.selectOptions;
  const pre = (props.prefillAgent ?? '').trim();
  if (pre === '' || base.some((o) => o.value === pre)) return base;
  return [{ label: `${pre}（未添加）`, value: pre }, ...base];
});

// 打开弹窗时重置表单并回填默认值
watch(
  () => [props.show, store.globalSettings, props.prefillAgent, modelConfig.defaults.default] as const,
  ([show, , prefAgent]) => {
    if (show) {
      const def = defaultNewTaskConfig();
      const resolved = resolveDefaultModel();
      def.provider = resolved.provider;
      def.model = resolved.model;
      if (prefAgent) def.agent = prefAgent;
      Object.assign(form, def);
      skillRows.value = [1];
      mcpRows.value = [1];
      form.skills = [];
      form.mcpServers = [];
    }
  },
  { immediate: true }
);

// ── Provider 选项 ──
const providerOptions = computed(() =>
  (store.models ?? []).map((g) => ({
    label: g.label ?? g.provider,
    value: g.provider,
  }))
);

// ── Model 选项（联动 provider）──
const modelOptions = computed(() => {
  const pv = form.provider;
  if (!pv) return [];
  const group = (store.models ?? []).find((g) => g.provider === pv);
  if (!group) return [];
  return (group.models ?? []).map((m) => ({
    label: m.name ?? m.id,
    value: m.id,
  }));
});

// ── Skills 动态行 ──
const skillRows = ref<number[]>([1]);
function addSkillRow(): void {
  const nextId = (skillRows.value[skillRows.value.length - 1] ?? 0) + 1;
  skillRows.value.push(nextId);
}
function removeSkillRow(idx: number): void {
  if (skillRows.value.length <= 1) return;
  skillRows.value.splice(idx, 1);
  form.skills.splice(idx, 1);
}

const skillOptions = computed(() =>
  (store.skills ?? []).map((s) => ({
    label: s.name,
    value: s.name,
  }))
);

// ── MCP 动态行 ──
const mcpRows = ref<number[]>([1]);
function addMcpRow(): void {
  const nextId = (mcpRows.value[mcpRows.value.length - 1] ?? 0) + 1;
  mcpRows.value.push(nextId);
}
function removeMcpRow(idx: number): void {
  if (mcpRows.value.length <= 1) return;
  mcpRows.value.splice(idx, 1);
  form.mcpServers.splice(idx, 1);
}

const mcpOptions = computed(() =>
  (store.mcpServers ?? []).map((s) => ({
    label: s.name,
    value: s.name,
  }))
);

// ── 校验 ──
const canConfirm = computed(() => form.title.trim().length > 0);

function onConfirm(): void {
  if (!canConfirm.value) return;
  // S5.4②：召唤预填的市场专家若本地还没有同名角色，补一条再提交
  const agent = (form.agent ?? '').trim();
  if (agent !== '') roles.addRoleIfAbsent({ name: agent, source: 'market' });
  // 过滤空 skill/mcp
  const config: NewTaskConfig = {
    ...form,
    agent,
    skills: form.skills.filter(Boolean),
    mcpServers: form.mcpServers.filter(Boolean),
    title: form.title.trim(),
  };
  emit('confirm', config);
  emit('update:show', false);
}

function onCancel(): void {
  emit('cancel');
  emit('update:show', false);
}
</script>

<template>
  <n-modal
    :show="show"
    preset="card"
    title="新建任务"
    :style="{ width: '520px' }"
    :mask-closable="true"
    @update:show="(v: boolean) => emit('update:show', v)"
    @close="onCancel"
  >
    <div class="ntd-form">
      <!-- ① title -->
      <div class="ntd-field">
        <label class="ntd-label">任务标题</label>
        <n-input
          v-model:value="form.title"
          placeholder="输入任务标题"
          clearable
        />
      </div>

      <!-- ② Agent 角色（R-16：唯一来源为本地角色列表） -->
      <div class="ntd-field">
        <label class="ntd-label">Agent 角色</label>
        <n-select
          v-model:value="form.agent"
          :options="agentRoleOptions"
          placeholder="选择 Agent（可在「设置 → Agent 角色管理」中新增）"
          clearable
          filterable
        />
      </div>

      <!-- ③ Provider + 模型（两列） -->
      <div class="ntd-row">
        <div class="ntd-field ntd-half">
          <label class="ntd-label">Provider</label>
          <n-select
            v-model:value="form.provider"
            :options="providerOptions"
            placeholder="选择 Provider"
            clearable
          />
        </div>
        <div class="ntd-field ntd-half">
          <label class="ntd-label">模型</label>
          <n-select
            v-model:value="form.model"
            :options="modelOptions"
            placeholder="选择模型"
            clearable
          />
        </div>
      </div>

      <!-- ④ Skills -->
      <div class="ntd-field">
        <label class="ntd-label">Skills</label>
        <div
          v-for="(rowId, idx) in skillRows"
          :key="'sk-' + rowId"
          class="ntd-dynamic-row"
        >
          <n-select
            v-model:value="form.skills[idx]"
            :options="skillOptions"
            placeholder="选择技能"
            clearable
            class="ntd-dynamic-select"
          />
          <n-button
            v-if="skillRows.length > 1"
            size="tiny"
            quaternary
            type="error"
            @click="removeSkillRow(idx)"
          >
            <KIcon name="X" :size="14" />
          </n-button>
        </div>
        <n-button size="tiny" quaternary @click="addSkillRow">
          + 添加技能
        </n-button>
      </div>

      <!-- ⑤ MCP Servers -->
      <div class="ntd-field">
        <label class="ntd-label">MCP Servers</label>
        <div
          v-for="(rowId, idx) in mcpRows"
          :key="'mcp-' + rowId"
          class="ntd-dynamic-row"
        >
          <n-select
            v-model:value="form.mcpServers[idx]"
            :options="mcpOptions"
            placeholder="选择 MCP 服务器"
            clearable
            class="ntd-dynamic-select"
          />
          <n-button
            v-if="mcpRows.length > 1"
            size="tiny"
            quaternary
            type="error"
            @click="removeMcpRow(idx)"
          >
            <KIcon name="X" :size="14" />
          </n-button>
        </div>
        <n-button size="tiny" quaternary @click="addMcpRow">
          + 添加 MCP
        </n-button>
      </div>

      <!-- ⑥ 安全模式 -->
      <div class="ntd-field">
        <label class="ntd-label">安全模式</label>
        <n-select
          v-model:value="form.securityMode"
          :options="SECURITY_MODE_OPTIONS"
        />
      </div>

      <!-- ⑦ Workspace -->
      <div class="ntd-field">
        <label class="ntd-label">Workspace</label>
        <div class="ntd-dir-row">
          <DirPathDisplay :path="form.workspace" placeholder="未选择工作目录" class="ntd-dir-text" />
          <n-button size="small" tertiary @click="onPickWorkspace">选择目录…</n-button>
        </div>
        <span class="ntd-hint">桌面端调用系统选择器，Web 端用目录树选择，不支持手动粘贴路径。</span>
      </div>
    </div>

    <!-- 底部按钮 -->
    <template #footer>
      <n-space justify="end">
        <n-button @click="onCancel">取消</n-button>
        <n-button
          type="primary"
          :disabled="!canConfirm"
          @click="onConfirm"
        >
          确定
        </n-button>
      </n-space>
    </template>

    <DirPickerModal
      :show="wsShow"
      :initial-path="wsInitialPath"
      @select="wsResolve"
      @close="wsCancel"
    />
  </n-modal>
</template>

<style scoped>
.ntd-form {
  display: flex;
  flex-direction: column;
  gap: var(--km-space-14);
}

.ntd-field {
  display: flex;
  flex-direction: column;
  gap: var(--km-space-xs);
}

.ntd-label {
  font-size: var(--km-font-sm);
  font-weight: 600;
  opacity: 0.7;
}

.ntd-row {
  display: flex;
  gap: var(--km-space-md);
}

.ntd-half {
  flex: 1;
  min-width: 0;
}

.ntd-dynamic-row {
  display: flex;
  align-items: center;
  gap: var(--km-space-xs);
  margin-bottom: var(--km-space-xs);
}

.ntd-dynamic-select {
  flex: 1;
  min-width: 0;
}

.ntd-dir-row {
  display: flex;
  align-items: center;
  gap: var(--km-space-sm);
}

.ntd-dir-row :deep(.ntd-dir-text) {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: var(--km-space-6) var(--km-space-8);
  background: var(--km-bg);
  border: 1px solid var(--km-border);
  border-radius: var(--km-radius-sm);
  font-size: var(--km-font-sm);
  opacity: 0.85;
}

.ntd-hint {
  font-size: var(--km-font-xs);
  opacity: 0.55;
  line-height: 1.6;
}
</style>
