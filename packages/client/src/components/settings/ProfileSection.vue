<script setup lang="ts">
/**
 * ProfileSection — 设置 → 账号（V3 T4 / S4.6，覆盖 R-28 / Q6）。
 *
 * Q6 决议：V3 为纯本地模式，不存在云端账号体系。
 * 因此本页的唯一真源是 `localStorage['km.v3.profile']`（stores/status.account）：
 *   ① 账号名称 / 邮箱 / 简介 可编辑保存；
 *   ② 密码重置为「旧密码 → 新密码 → 确认新密码」三段式表单，
 *      做完整字段级校验后走 status.resetPassword（本地模式返回模拟成功），
 *      结果用 ResultDialog 展示，不做静默失败也不留占位。
 */
import { computed, onMounted, ref } from 'vue';
import {
  NButton,
  NInput,
  NPopconfirm,
  NSpace,
  NTag,
  useMessage,
} from 'naive-ui';
import { useStatusStore } from '../../stores/status';
import ResultDialog from '../dialog/ResultDialog.vue';
import { emptyResultDialog, type ResultDialogState } from '../../types/settings';

const status = useStatusStore();
const toast = useMessage();

// ── 基础信息表单 ──
const form = ref<{ name: string; email: string; bio: string }>({ name: '', email: '', bio: '' });
const errors = ref<{ name: string; email: string }>({ name: '', email: '' });
const saving = ref<boolean>(false);

// ── 密码重置表单 ──
const pwd = ref<{ oldPwd: string; newPwd: string; confirmPwd: string }>({
  oldPwd: '',
  newPwd: '',
  confirmPwd: '',
});
const pwdErrors = ref<{ oldPwd: string; newPwd: string; confirmPwd: string }>({
  oldPwd: '',
  newPwd: '',
  confirmPwd: '',
});
const resetting = ref<boolean>(false);

// ── 结果弹窗 ──
const result = ref<ResultDialogState>(emptyResultDialog());

onMounted(() => {
  status.hydrate();
  syncForm();
});

function syncForm(): void {
  form.value = {
    name: status.account.name,
    email: status.account.email,
    bio: status.account.bio,
  };
  errors.value = { name: '', email: '' };
}

const updatedText = computed<string>(() =>
  status.account.updatedAt === 0 ? '尚未保存过' : new Date(status.account.updatedAt).toLocaleString()
);

const dirty = computed<boolean>(
  () =>
    form.value.name !== status.account.name ||
    form.value.email !== status.account.email ||
    form.value.bio !== status.account.bio
);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** 基础信息字段级校验 */
function validateProfile(): boolean {
  let ok = true;
  errors.value = { name: '', email: '' };
  if (form.value.name.trim() === '') {
    errors.value.name = '账号名称不能为空';
    ok = false;
  }
  const email = form.value.email.trim();
  if (email !== '' && !EMAIL_RE.test(email)) {
    errors.value.email = '邮箱格式不正确';
    ok = false;
  }
  return ok;
}

function onSave(): void {
  if (!validateProfile()) return;
  saving.value = true;
  try {
    status.saveAccount({
      name: form.value.name.trim(),
      email: form.value.email.trim(),
      bio: form.value.bio.trim(),
    });
    syncForm();
    toast.success('账号信息已保存');
  } finally {
    saving.value = false;
  }
}

function onRevert(): void {
  syncForm();
  toast.success('已还原为已保存的内容');
}

function onClear(): void {
  status.clearAccount();
  syncForm();
  toast.success('本地账号信息已清空');
}

/** 密码字段级校验 */
function validatePassword(): boolean {
  let ok = true;
  pwdErrors.value = { oldPwd: '', newPwd: '', confirmPwd: '' };
  if (pwd.value.oldPwd === '') {
    pwdErrors.value.oldPwd = '请输入当前密码';
    ok = false;
  }
  if (pwd.value.newPwd === '') {
    pwdErrors.value.newPwd = '请输入新密码';
    ok = false;
  } else if (pwd.value.newPwd.length < 8) {
    pwdErrors.value.newPwd = '新密码至少 8 位';
    ok = false;
  } else if (pwd.value.newPwd === pwd.value.oldPwd) {
    pwdErrors.value.newPwd = '新密码不能与当前密码相同';
    ok = false;
  }
  if (pwd.value.confirmPwd === '') {
    pwdErrors.value.confirmPwd = '请再次输入新密码';
    ok = false;
  } else if (pwd.value.confirmPwd !== pwd.value.newPwd) {
    pwdErrors.value.confirmPwd = '两次输入的新密码不一致';
    ok = false;
  }
  return ok;
}

function onResetPassword(): void {
  if (!validatePassword()) return;
  resetting.value = true;
  try {
    const res = status.resetPassword(form.value.email.trim());
    result.value = {
      show: true,
      variant: res.ok ? 'success' : 'warning',
      title: res.ok ? '密码已重置' : '无法重置密码',
      message: res.message,
      detail: res.ok
        ? '当前版本为纯本地模式，密码体系由后续的云端账号能力提供；此处的重置为模拟结果，不会向任何服务器发送请求。'
        : '',
      durationMs: 0,
    };
    if (res.ok) pwd.value = { oldPwd: '', newPwd: '', confirmPwd: '' };
  } finally {
    resetting.value = false;
  }
}
</script>

<template>
  <div class="pfs">
    <!-- 状态摘要 -->
    <div class="pfs-summary">
      <span class="pfs-avatar">{{ (form.name || '本').slice(0, 1) }}</span>
      <div class="pfs-summary-info">
        <div class="pfs-summary-name">
          {{ status.account.name || '未命名账号' }}
          <n-tag size="tiny" :bordered="false" :type="status.serverOnline ? 'success' : 'error'">
            {{ status.statusText }}
          </n-tag>
          <n-tag size="tiny" :bordered="false">{{ status.hostLabel }}</n-tag>
        </div>
        <div class="pfs-summary-sub">最近保存：{{ updatedText }}</div>
      </div>
    </div>

    <!-- 基础信息 -->
    <div class="pfs-block">
      <div class="pfs-block-title">基础信息</div>

      <div class="pfs-row">
        <div class="pfs-label">账号名称 <span class="pfs-req">*</span></div>
        <n-input
          v-model:value="form.name"
          placeholder="用于状态条与会话署名"
          :status="errors.name === '' ? undefined : 'error'"
          style="max-width: 360px"
          @update:value="errors.name = ''"
        />
        <div v-if="errors.name !== ''" class="pfs-error">{{ errors.name }}</div>
      </div>

      <div class="pfs-row">
        <div class="pfs-label">邮箱</div>
        <n-input
          v-model:value="form.email"
          placeholder="you@example.com"
          :status="errors.email === '' ? undefined : 'error'"
          style="max-width: 360px"
          @update:value="errors.email = ''"
        />
        <div v-if="errors.email !== ''" class="pfs-error">{{ errors.email }}</div>
        <div v-else class="pfs-hint">用于密码重置与后续云端账号绑定，留空不影响本地使用</div>
      </div>

      <div class="pfs-row">
        <div class="pfs-label">个人简介</div>
        <n-input
          v-model:value="form.bio"
          type="textarea"
          :autosize="{ minRows: 2, maxRows: 5 }"
          placeholder="一句话介绍你自己，会写入新建会话的上下文"
          style="max-width: 520px"
        />
      </div>

      <n-space>
        <n-button size="small" type="primary" :loading="saving" :disabled="!dirty" @click="onSave">
          保存
        </n-button>
        <n-button size="small" :disabled="!dirty" @click="onRevert">还原</n-button>
        <n-popconfirm @positive-click="onClear">
          <template #trigger>
            <n-button size="small" type="error" ghost>清空本地账号</n-button>
          </template>
          清空后名称 / 邮箱 / 简介都会被删除，且不可撤销。确认清空？
        </n-popconfirm>
      </n-space>
    </div>

    <!-- 密码重置 -->
    <div class="pfs-block">
      <div class="pfs-block-title">密码重置</div>
      <div class="pfs-hint pfs-hint-block">
        当前为本地模式，密码不参与任何鉴权流程；此表单用于校验流程与后续云端账号的前置准备。
      </div>

      <div class="pfs-row">
        <div class="pfs-label">当前密码</div>
        <n-input
          v-model:value="pwd.oldPwd"
          type="password"
          show-password-on="click"
          placeholder="请输入当前密码"
          :status="pwdErrors.oldPwd === '' ? undefined : 'error'"
          style="max-width: 360px"
          @update:value="pwdErrors.oldPwd = ''"
        />
        <div v-if="pwdErrors.oldPwd !== ''" class="pfs-error">{{ pwdErrors.oldPwd }}</div>
      </div>

      <div class="pfs-row">
        <div class="pfs-label">新密码</div>
        <n-input
          v-model:value="pwd.newPwd"
          type="password"
          show-password-on="click"
          placeholder="至少 8 位"
          :status="pwdErrors.newPwd === '' ? undefined : 'error'"
          style="max-width: 360px"
          @update:value="pwdErrors.newPwd = ''"
        />
        <div v-if="pwdErrors.newPwd !== ''" class="pfs-error">{{ pwdErrors.newPwd }}</div>
      </div>

      <div class="pfs-row">
        <div class="pfs-label">确认新密码</div>
        <n-input
          v-model:value="pwd.confirmPwd"
          type="password"
          show-password-on="click"
          placeholder="再次输入新密码"
          :status="pwdErrors.confirmPwd === '' ? undefined : 'error'"
          style="max-width: 360px"
          @update:value="pwdErrors.confirmPwd = ''"
        />
        <div v-if="pwdErrors.confirmPwd !== ''" class="pfs-error">{{ pwdErrors.confirmPwd }}</div>
      </div>

      <n-space>
        <n-popconfirm @positive-click="onResetPassword">
          <template #trigger>
            <n-button size="small" type="primary" :loading="resetting">重置密码</n-button>
          </template>
          重置后需要用新密码重新登录（本地模式下为模拟流程）。确认重置？
        </n-popconfirm>
      </n-space>
    </div>

    <ResultDialog
      v-model:show="result.show"
      :variant="result.variant"
      :title="result.title"
      :message="result.message"
      :detail="result.detail"
      :duration-ms="result.durationMs"
    />
  </div>
</template>

<style scoped>
.pfs {
  display: flex;
  flex-direction: column;
  gap: 22px;
}

.pfs-summary {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--km-border);
  border-radius: 10px;
  background: var(--km-panel);
}

.pfs-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--km-bg);
  border: 1px solid var(--km-border);
  font-size: 16px;
  font-weight: 700;
  flex-shrink: 0;
}

.pfs-summary-info {
  min-width: 0;
}

.pfs-summary-name {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 600;
}

.pfs-summary-sub {
  font-size: 11px;
  opacity: 0.55;
  margin-top: 2px;
}

.pfs-block {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-top: 14px;
  border-top: 1px solid var(--km-border);
}

.pfs-block-title {
  font-size: 13px;
  font-weight: 600;
}

.pfs-row {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.pfs-label {
  font-size: 12px;
  font-weight: 500;
  opacity: 0.8;
}

.pfs-req {
  color: var(--km-danger, #e88);
}

.pfs-hint {
  font-size: 11px;
  opacity: 0.55;
  line-height: 1.7;
}

.pfs-hint-block {
  max-width: 560px;
}

.pfs-error {
  font-size: 11px;
  color: var(--km-danger, #e88);
}
</style>
