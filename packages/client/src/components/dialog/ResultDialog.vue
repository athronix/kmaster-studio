<script setup lang="ts">
/**
 * ResultDialog — 通用结果弹窗（V3 T5 / S5.1 / R-13③⑤⑥ R-23）。
 *
 * 四合一：技能安装/卸载、MCP 部署/测试、连通性测试、错误告警，靠 `variant` 区分配色与图标。
 * 宽度自适应内容（`max-width: 92vw`），含耗时与错误详情槽位。
 *
 * 用法：
 * ```vue
 * <ResultDialog
 *   v-model:show="show"
 *   variant="success"
 *   title="连通性测试通过"
 *   message="拉取到 42 个模型"
 *   :duration-ms="836"
 *   detail="GET https://api.openai.com/v1/models → 200"
 * />
 * ```
 */
import { computed } from 'vue';
import { NButton, NModal } from 'naive-ui';

/** 结果类型。 */
export type ResultVariant = 'success' | 'error' | 'warning' | 'info';

const props = withDefaults(
  defineProps<{
    show: boolean;
    variant?: ResultVariant;
    title?: string;
    /** 主文案（一句话结论） */
    message?: string;
    /** 详情正文（错误栈 / 响应片段），等宽字体展示，可滚动 */
    detail?: string;
    /** 耗时（毫秒）；<=0 时不展示 */
    durationMs?: number;
    /** 主按钮文案 */
    primaryLabel?: string;
    /** 是否显示「关闭」次按钮 */
    showClose?: boolean;
  }>(),
  {
    variant: 'info',
    title: '',
    message: '',
    detail: '',
    durationMs: 0,
    primaryLabel: '知道了',
    showClose: false,
  }
);

const emit = defineEmits<{
  (e: 'update:show', v: boolean): void;
  (e: 'primary'): void;
}>();

/** 各 variant 的图标 / 标题兜底 / 主色。 */
const VARIANT_META: Record<ResultVariant, { icon: string; title: string; color: string }> = {
  success: { icon: 'CircleCheck', title: '操作成功', color: 'var(--km-success)' },
  error: { icon: 'CircleX', title: '操作失败', color: 'var(--km-danger)' },
  warning: { icon: 'AlertTriangle', title: '请注意', color: 'var(--km-warning)' },
  info: { icon: 'InfoCircle', title: '提示', color: 'var(--km-accent)' },
};

const meta = computed(() => VARIANT_META[props.variant]);

/** 最终标题：外部传入优先，否则按 variant 兜底。 */
const resolvedTitle = computed<string>(() => (props.title === '' ? meta.value.title : props.title));

/** 耗时展示文案；<1s 显示毫秒，否则显示秒。 */
const durationText = computed<string>(() => {
  if (props.durationMs <= 0) return '';
  if (props.durationMs < 1000) return `耗时 ${props.durationMs} ms`;
  return `耗时 ${(props.durationMs / 1000).toFixed(2)} s`;
});

function close(): void {
  emit('update:show', false);
}

function onPrimary(): void {
  emit('primary');
  close();
}
</script>

<template>
  <n-modal
    :show="show"
    preset="card"
    class="km-result"
    :title="resolvedTitle"
    :bordered="false"
    size="small"
    :mask-closable="true"
    :auto-focus="false"
    @update:show="(v: boolean) => emit('update:show', v)"
  >
    <template #header>
      <div class="km-result-head">
        <span class="km-result-icon">{{ meta.icon }}</span>
        <span class="km-result-title" :style="{ color: meta.color }">{{ resolvedTitle }}</span>
      </div>
    </template>

    <div class="km-result-body">
      <p v-if="message !== ''" class="km-result-message">{{ message }}</p>

      <div v-if="durationText !== ''" class="km-result-meta">{{ durationText }}</div>

      <pre v-if="detail !== ''" class="km-result-detail">{{ detail }}</pre>

      <slot />
    </div>

    <template #footer>
      <div class="km-result-foot">
        <n-button v-if="showClose" size="small" @click="close">关闭</n-button>
        <n-button
          size="small"
          type="primary"
          :ghost="variant === 'error'"
          @click="onPrimary"
        >{{ primaryLabel }}</n-button>
      </div>
    </template>
  </n-modal>
</template>

<style scoped>
.km-result {
  width: max-content;
  min-width: 360px;
  max-width: 92vw;
}

.km-result-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.km-result-icon {
  font-size: 16px;
  line-height: 1;
}

.km-result-title {
  font-size: 14px;
  font-weight: 600;
}

.km-result-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-width: 720px;
}

.km-result-message {
  margin: 0;
  font-size: 13px;
  line-height: 1.7;
  word-break: break-word;
}

.km-result-meta {
  font-size: 11px;
  opacity: 0.55;
}

.km-result-detail {
  margin: 0;
  padding: 10px 12px;
  border: 1px solid var(--km-border);
  border-radius: 8px;
  background: var(--km-user-bubble);
  font-family: var(--km-mono, ui-monospace, monospace);
  font-size: 11px;
  line-height: 1.7;
  max-height: 260px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-all;
}

.km-result-foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
