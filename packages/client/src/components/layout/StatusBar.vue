<script setup lang="ts">
/**
 * StatusBar — 左栏底部三行状态条（V3 T3 / S3.2 / R-05 R-12）。
 *
 * 三行内容：
 *   ① 账户名称 + 状态灯（绿=已登录 / 灰=本地模式 / 红=服务未连接）
 *   ② bridge 连接状态 + 状态灯（Q6：V3 恒为本地模式，灰灯，不报错不阻塞）
 *   ③ 版本号 + 主题切换图标（点击即时切换，图标随之变化）
 *
 * 数据源：stores/status（`/api/health` 10s 轮询由 App.vue 统一启动）。
 * 本组件只读不写，唯一副作用是主题切换。
 */
import { computed } from 'vue';
import { NButton, NTooltip } from 'naive-ui';
import { useStatusStore } from '../../stores/status';
import { useTheme } from '../../styles/theme';

withDefaults(
  defineProps<{
    /** 紧凑模式：缩小行距与字号，供窄栏使用 */
    compact?: boolean;
  }>(),
  { compact: false }
);

const status = useStatusStore();
const theme = useTheme();

/** 状态灯色调 → CSS 变量。 */
const TONE_VAR: Record<'online' | 'local' | 'offline', string> = {
  online: 'var(--km-success)',
  local: 'var(--km-muted)',
  offline: 'var(--km-danger)',
};

/** 第一行：账户灯颜色。 */
const accountDot = computed<string>(() => TONE_VAR[status.statusTone]);

/** 第一行：账户文案。未登录时显示「本地模式 / 未登录」。 */
const accountText = computed<string>(() => {
  if (!status.serverOnline) return '服务未连接';
  if (status.loggedIn) return status.account.name;
  return status.account.name === '' ? '本地模式 / 未登录' : `本地模式 / ${status.account.name}`;
});

/** 第二行：bridge 灯颜色（Q6 恒 false → 灰）。 */
const bridgeDot = computed<string>(() =>
  status.bridgeConnected ? 'var(--km-success)' : 'var(--km-muted)'
);

/** 第二行：bridge 文案。 */
const bridgeText = computed<string>(() =>
  status.bridgeConnected ? `云端桥接 · ${status.hostLabel}` : `本地桥接 · ${status.hostLabel}`
);

/** 第三行：版本号。服务在线取后端版本，否则显示占位。 */
const versionText = computed<string>(() =>
  status.serverVersion === '' ? 'kmaster · 版本未知' : `kmaster v${status.serverVersion}`
);

/** 最近探测时间（tooltip 用）。 */
const checkedText = computed<string>(() => {
  if (status.lastCheckedAt === 0) return '尚未探测';
  return `最近探测：${new Date(status.lastCheckedAt).toLocaleTimeString()}`;
});

/** 服务详情 tooltip 文案。 */
const healthTip = computed<string>(() => {
  if (status.serverOnline) return `${checkedText.value}（服务正常）`;
  const reason = status.healthError === '' ? '无响应' : status.healthError;
  return `${checkedText.value}｜失败原因：${reason}`;
});

function onToggleTheme(): void {
  theme.toggle();
}
</script>

<template>
  <div class="km-status" :class="{ 'km-status-compact': compact }">
    <!-- ① 账户 -->
    <n-tooltip trigger="hover" placement="top">
      <template #trigger>
        <div class="km-status-row">
          <span class="km-status-dot" :style="{ background: accountDot }"></span>
          <span class="km-status-text">{{ accountText }}</span>
        </div>
      </template>
      {{ healthTip }}
    </n-tooltip>

    <!-- ② bridge -->
    <n-tooltip trigger="hover" placement="top">
      <template #trigger>
        <div class="km-status-row">
          <span class="km-status-dot" :style="{ background: bridgeDot }"></span>
          <span class="km-status-text">{{ bridgeText }}</span>
        </div>
      </template>
      本地模式下不依赖云端桥接，全部功能均可离线使用
    </n-tooltip>

    <!-- ③ 版本号 + 主题 -->
    <div class="km-status-row km-status-row-end">
      <span class="km-status-text km-status-version">{{ versionText }}</span>
      <n-button
        quaternary
        circle
        size="tiny"
        :title="theme.isDark.value ? '切换亮色模式' : '切换暗色模式'"
        @click="onToggleTheme"
      >
        <template #icon>{{ theme.isDark.value ? '🌙' : '☀️' }}</template>
      </n-button>
    </div>
  </div>
</template>

<style scoped>
.km-status {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 12px;
  border-top: 1px solid var(--km-border);
  background: var(--km-panel);
  flex-shrink: 0;
}

.km-status-compact {
  gap: 2px;
  padding: 6px 10px;
}

.km-status-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.km-status-row-end {
  justify-content: space-between;
  gap: 8px;
}

.km-status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}

.km-status-text {
  font-size: 11px;
  opacity: 0.7;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.km-status-version {
  opacity: 0.45;
}

.km-status-compact .km-status-text {
  font-size: 10px;
}
</style>
