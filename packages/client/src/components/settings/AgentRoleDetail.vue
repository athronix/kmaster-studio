<script setup lang="ts">
/**
 * AgentRoleDetail — Agent 角色详情编辑面板（V3 T4 / R-14）。
 *
 * 承载在右栏（RightPanelMode = 'agent-role'）。
 * roleId 为空串表示「新建角色」；非空则加载既有角色进入编辑态。
 *
 * 7 类配置项：名称 / 简介 / Agent.md / 技能 / MCP / 标签 / 样例 Prompt
 * （另含头像与专长两项辅助字段，均随同一份表单保存）。
 *
 * 保存走 stores/agentRoles 的 add / update，落盘到 `km.v3.agentRoles`。
 */
import { computed, ref, watch } from 'vue';
import {
  NButton,
  NDynamicTags,
  NEmpty,
  NInput,
  NSpace,
  NTag,
  useMessage,
} from 'naive-ui';
import { useAgentRolesStore } from '../../stores/agentRoles';
import type { AgentRole, RoleSource } from '../../types/settings';

/** T08：source 标签辅助 */
function sourceTagLabel(source: RoleSource): string {
  switch (source) {
    case 'builtin': return '内置';
    case 'user': return '自建';
    case 'manual': return '手动';
    case 'market': return '市场';
    default: return source;
  }
}
function sourceTagType(source: RoleSource): 'info' | 'success' | 'warning' | 'default' {
  switch (source) {
    case 'builtin': return 'info';
    case 'user': return 'success';
    case 'market': return 'warning';
    case 'manual': return 'default';
    default: return 'default';
  }
}

const props = defineProps<{
  /** 角色 id；空串表示新建 */
  roleId: string;
}>();

const emit = defineEmits<{
  (e: 'save', role: AgentRole): void;
  (e: 'cancel'): void;
}>();

const roles = useAgentRolesStore();
const toast = useMessage();

/** 表单模型（与 store 解耦，取消即丢弃） */
const form = ref<{
  name: string;
  avatar: string;
  desc: string;
  specialties: string[];
  agentMd: string;
  skills: string[];
  mcp: string[];
  tags: string[];
  samplePrompts: string[];
}>(emptyForm());

const nameError = ref<string>('');
const saving = ref<boolean>(false);

/** 是否为新建态 */
const isNew = computed<boolean>(() => props.roleId === '');

/** 当前编辑的角色（编辑态下存在；新建态为 null） */
const current = computed<AgentRole | null>(() =>
  props.roleId === '' ? null : roles.getById(props.roleId)
);

/** 编辑态但角色已被删除 → 展示空态 */
const missing = computed<boolean>(() => props.roleId !== '' && current.value === null);

/** 标题文案 */
const headline = computed<string>(() =>
  isNew.value ? '新建 Agent 角色' : `编辑：${current.value?.name || '未命名角色'}`
);

function emptyForm() {
  return {
    name: '',
    avatar: 'Robot',
    desc: '',
    specialties: [] as string[],
    agentMd: '',
    skills: [] as string[],
    mcp: [] as string[],
    tags: [] as string[],
    samplePrompts: [] as string[],
  };
}

/** 把 store 里的角色灌进表单 */
function loadForm(): void {
  nameError.value = '';
  const role = current.value;
  if (role === null) {
    form.value = emptyForm();
    return;
  }
  form.value = {
    name: role.name,
    avatar: role.avatar,
    desc: role.desc,
    specialties: [...role.specialties],
    agentMd: role.agentMd,
    skills: [...role.skills],
    mcp: [...role.mcp],
    tags: [...role.tags],
    samplePrompts: [...role.samplePrompts],
  };
}

watch(
  () => props.roleId,
  () => {
    loadForm();
  },
  { immediate: true }
);

/** 名称校验：非空 + 不与其他角色重名 */
function validate(): boolean {
  const name = form.value.name.trim();
  if (name === '') {
    nameError.value = '角色名称不能为空';
    return false;
  }
  const key = name.toLowerCase();
  const conflict = roles.roles.some(
    (r) => r.id !== props.roleId && r.name.trim().toLowerCase() === key
  );
  if (conflict) {
    nameError.value = '已存在同名角色，请换一个名称';
    return false;
  }
  nameError.value = '';
  return true;
}

/** 保存：新建走 add，编辑走 update */
async function onSave(): Promise<void> {
  if (!validate()) return;
  saving.value = true;
  try {
    const patch: Partial<AgentRole> = {
      name: form.value.name.trim(),
      avatar: form.value.avatar.trim() === '' ? 'Robot' : form.value.avatar.trim(),
      desc: form.value.desc.trim(),
      specialties: [...form.value.specialties],
      agentMd: form.value.agentMd,
      skills: [...form.value.skills],
      mcp: [...form.value.mcp],
      tags: [...form.value.tags],
      samplePrompts: [...form.value.samplePrompts],
    };
    const saved = isNew.value ? await roles.add(patch) : roles.update(props.roleId, patch);
    if (saved === null) {
      toast.error('保存失败：角色不存在，可能已被删除');
      return;
    }
    toast.success(isNew.value ? `已创建角色「${saved.name}」` : '已保存');
    emit('save', saved);
  } finally {
    saving.value = false;
  }
}

function onCancel(): void {
  loadForm();
  emit('cancel');
}

/** 用当前基础信息生成 Agent.md 初稿（覆盖前提示） */
function generateAgentMd(): void {
  const md = roles.buildAgentMd(
    form.value.name.trim() === '' ? '未命名角色' : form.value.name.trim(),
    form.value.desc.trim(),
    form.value.specialties.join('、'),
    form.value.specialties,
    form.value.samplePrompts
  );
  form.value.agentMd = md;
  toast.success('已根据基础信息生成 Agent.md 初稿');
}
</script>

<template>
  <div class="ard">
    <n-empty
      v-if="missing"
      class="ard-missing"
      description="该角色已被删除"
    >
      <template #extra>
        <n-button size="small" @click="onCancel">返回列表</n-button>
      </template>
    </n-empty>

    <template v-else>
      <div class="ard-head">
        <span class="ard-avatar">{{ form.avatar || 'Robot' }}</span>
        <div class="ard-headline">{{ headline }}</div>
        <n-tag v-if="current" size="tiny" :bordered="false" :type="sourceTagType(current.source)">
          {{ sourceTagLabel(current.source) }}
        </n-tag>
      </div>

      <div class="ard-body">
        <!-- ① 名称 -->
        <div class="ard-row">
          <div class="ard-label">角色名称 <span class="ard-req">*</span></div>
          <n-input
            v-model:value="form.name"
            placeholder="例如：前端架构评审官"
            :status="nameError === '' ? undefined : 'error'"
            @update:value="nameError = ''"
          />
          <div v-if="nameError !== ''" class="ard-error">{{ nameError }}</div>
        </div>

        <!-- 头像 -->
        <div class="ard-row">
          <div class="ard-label">头像 Emoji</div>
          <n-input v-model:value="form.avatar" placeholder="Robot" maxlength="32" style="max-width: 180px" />
          <div class="ard-hint">KIcon 图标名（如 Robot/Brain/Puzzle），用于列表与下拉的视觉标识</div>
        </div>

        <!-- ② 简介 -->
        <div class="ard-row">
          <div class="ard-label">简介</div>
          <n-input
            v-model:value="form.desc"
            type="textarea"
            :autosize="{ minRows: 2, maxRows: 4 }"
            placeholder="一句话说明这个角色擅长什么、什么时候召唤它"
          />
        </div>

        <!-- 专长 -->
        <div class="ard-row">
          <div class="ard-label">专长领域</div>
          <n-dynamic-tags v-model:value="form.specialties" :max="12" />
          <div class="ard-hint">回车添加，最多 12 项；会写入 Agent.md 的「适用场景」</div>
        </div>

        <!-- ③ Agent.md -->
        <div class="ard-row">
          <div class="ard-label ard-label-inline">
            <span>Agent.md</span>
            <n-button size="tiny" tertiary @click="generateAgentMd">生成初稿</n-button>
          </div>
          <n-input
            v-model:value="form.agentMd"
            type="textarea"
            :autosize="{ minRows: 8, maxRows: 20 }"
            placeholder="# 角色名&#10;&#10;角色的系统提示词，Markdown 格式…"
            class="ard-mono"
          />
          <div class="ard-hint">该内容作为召唤此角色时注入的系统提示词</div>
        </div>

        <!-- ④ 技能 -->
        <div class="ard-row">
          <div class="ard-label">绑定技能</div>
          <n-dynamic-tags v-model:value="form.skills" :max="20" />
          <div class="ard-hint">填写技能名称，召唤时自动启用</div>
        </div>

        <!-- ⑤ MCP -->
        <div class="ard-row">
          <div class="ard-label">绑定 MCP</div>
          <n-dynamic-tags v-model:value="form.mcp" :max="20" />
          <div class="ard-hint">填写 MCP 服务器名称，召唤时自动挂载</div>
        </div>

        <!-- ⑥ 标签 -->
        <div class="ard-row">
          <div class="ard-label">标签</div>
          <n-dynamic-tags v-model:value="form.tags" :max="12" />
        </div>

        <!-- ⑦ 样例 Prompt -->
        <div class="ard-row">
          <div class="ard-label">样例 Prompt</div>
          <n-dynamic-tags v-model:value="form.samplePrompts" :max="10" />
          <div class="ard-hint">新建会话时可一键填入的示例问题</div>
        </div>
      </div>

      <div class="ard-foot">
        <n-space justify="end">
          <n-button size="small" @click="onCancel">取消</n-button>
          <n-button size="small" type="primary" :loading="saving" @click="onSave">保存</n-button>
        </n-space>
      </div>
    </template>
  </div>
</template>

<style scoped>
.ard {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.ard-missing {
  margin: 40px auto;
}

.ard-head {
  display: flex;
  align-items: center;
  gap: var(--km-space-sm);
  padding: var(--km-space-md) var(--km-space-14);
  border-bottom: 1px solid var(--km-border);
  flex-shrink: 0;
}

.ard-avatar {
  font-size: var(--km-font-22);
  line-height: 1;
}

.ard-headline {
  flex: 1;
  min-width: 0;
  font-size: var(--km-font-base);
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ard-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
 padding: var(--km-space-14);
  display: flex;
  flex-direction: column;
  gap: var(--km-space-lg);
}

.ard-row {
  display: flex;
  flex-direction: column;
  gap: var(--km-space-6);
}

.ard-label {
  font-size: var(--km-font-sm);
  font-weight: 600;
}

.ard-label-inline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--km-space-sm);
}

.ard-req {
  color: var(--km-danger, #e88);
}

.ard-hint {
  font-size: var(--km-font-xs);
  opacity: 0.55;
  line-height: 1.6;
}

.ard-error {
  font-size: var(--km-font-xs);
  color: var(--km-danger, #e88);
}

.ard-mono :deep(textarea) {
  font-family: var(--km-mono, ui-monospace, monospace);
  font-size: var(--km-font-sm);
  line-height: 1.7;
}

.ard-foot {
  flex-shrink: 0;
  padding: var(--km-space-10) var(--km-space-14);
  border-top: 1px solid var(--km-border);
  background: var(--km-panel);
}
</style>
