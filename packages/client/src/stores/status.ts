/**
 * stores/status.ts —— 左栏底部状态条 + 账号设置的数据源（设计 §3.1 StatusStore）。
 *
 * Q7 决策：轮询 `/api/health`，间隔 `INTERACTION.healthPollMs`（10s）。
 * Q6 决策：V3 暂无云端账号体系，`bridgeConnected` 恒为 false ——
 *          状态条显示灰色「本地模式」，账号设置页读写本地 profile。
 *
 * 所有网络调用一律 try/catch 吞掉，失败只改状态不抛错（状态条不该让应用崩）。
 */
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { getHealth } from '../api/client';
import { INTERACTION, LS_KEYS, lsGet, lsSet } from '../constants/layout';
import { isDesktop, platform } from '../utils/desktop-bridge';
import type { LocalProfile, PasswordResetResult } from '../types/settings';
import type { HealthInfo } from '../types/chat';

/**
 * Q6：云端 Bridge 账号体系在 V3 未接入。
 * 置为常量而非 ref，避免误以为「以后 refreshHealth 会把它点亮」。
 */
const BRIDGE_ACCOUNT_ENABLED = false;

/** 空 profile（未填写时的初始形态）。 */
function emptyProfile(): LocalProfile {
  return { name: '', email: '', bio: '', updatedAt: 0 };
}

export const useStatusStore = defineStore('status', () => {
  // ═══════════════════════ state ═══════════════════════

  /** Q6：云端桥接状态，V3 恒 false（本地模式） */
  const bridgeConnected = ref<boolean>(BRIDGE_ACCOUNT_ENABLED);
  /** 后端 `/api/health` 是否可达 */
  const serverOnline = ref<boolean>(false);
  /** 后端版本号；取不到为空串 */
  const serverVersion = ref<string>('');
  /** 最近一次 health 原始响应（供监控页展示细节） */
  const health = ref<HealthInfo | null>(null);
  /** 最近一次探测时间戳（ms），0 表示从未探测 */
  const lastCheckedAt = ref<number>(0);
  /** 最近一次探测失败原因；成功为空串 */
  const healthError = ref<string>('');
  /** 本地账号 profile（`km.v3.profile` 唯一真源） */
  const account = ref<LocalProfile>(emptyProfile());

  /** 轮询句柄（node/浏览器返回类型不同，统一收成 ReturnType） */
  let timer: ReturnType<typeof setInterval> | null = null;

  // ═══════════════════════ derived ═══════════════════════

  /** 是否处于「已登录」态。Q6 下恒 false，状态条走本地模式分支。 */
  const loggedIn = computed<boolean>(() => bridgeConnected.value && account.value.name !== '');

  /** 状态条展示文案。 */
  const statusText = computed<string>(() => {
    if (!serverOnline.value) return '服务未连接';
    return loggedIn.value ? account.value.name : '本地模式';
  });

  /** 状态条指示灯：online=绿 / local=灰 / offline=红。 */
  const statusTone = computed<'online' | 'local' | 'offline'>(() => {
    if (!serverOnline.value) return 'offline';
    return loggedIn.value ? 'online' : 'local';
  });

  /** 宿主描述：桌面端显示平台名，Web 端显示「浏览器」。 */
  const hostLabel = computed<string>(() => (isDesktop() ? platform() : '浏览器'));

  /** 本地 profile 是否已填写过。 */
  const hasProfile = computed<boolean>(() => account.value.name !== '' || account.value.email !== '');

  // ═══════════════════════ actions ═══════════════════════

  /**
   * 拉一次 `/api/health`。
   * 成功 → serverOnline=true 并刷新版本号；失败 → serverOnline=false 并记录原因（不抛错）。
   */
  async function refreshHealth(): Promise<boolean> {
    try {
      const info = await getHealth();
      health.value = info;
      serverOnline.value = info.ok === true;
      serverVersion.value = info.version ?? '';
      healthError.value = '';
      lastCheckedAt.value = Date.now();
      return serverOnline.value;
    } catch (err) {
      health.value = null;
      serverOnline.value = false;
      healthError.value = err instanceof Error ? err.message : String(err);
      lastCheckedAt.value = Date.now();
      return false;
    }
  }

  /** 启动轮询（幂等：重复调用不会叠加定时器）。立即先探一次，避免首屏空窗。 */
  function startPolling(intervalMs: number = INTERACTION.healthPollMs): void {
    stopPolling();
    void refreshHealth();
    timer = setInterval(() => {
      void refreshHealth();
    }, intervalMs);
  }

  /** 停止轮询（组件卸载 / 应用退出时调用）。 */
  function stopPolling(): void {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  }

  /** 轮询是否在跑（测试与调试用）。 */
  function isPolling(): boolean {
    return timer !== null;
  }

  /** 保存本地 profile（部分字段更新，自动打时间戳并落盘）。 */
  function saveAccount(patch: Partial<LocalProfile>): LocalProfile {
    account.value = {
      name: patch.name ?? account.value.name,
      email: patch.email ?? account.value.email,
      bio: patch.bio ?? account.value.bio,
      updatedAt: Date.now(),
    };
    persist();
    return account.value;
  }

  /** 清空本地 profile。 */
  function clearAccount(): void {
    account.value = emptyProfile();
    persist();
  }

  /**
   * Q6：重置密码为 mock 行为——本地模式下没有密码体系，
   * 统一返回成功提示，UI 用 ResultDialog 展示，不做任何网络请求。
   */
  function resetPassword(email: string): PasswordResetResult {
    const target = email.trim();
    if (target === '') {
      return { ok: false, message: '请先填写邮箱地址' };
    }
    return { ok: true, message: `重置链接已发送至 ${target}（本地模式为模拟结果）` };
  }

  // ═══════════════════════ persistence ═══════════════════════

  /** 落盘 profile（写失败静默）。 */
  function persist(): void {
    lsSet(LS_KEYS.profile, account.value);
  }

  /** 从 localStorage 恢复 profile；字段缺失时补空串。 */
  function hydrate(): void {
    const snap = lsGet<Partial<LocalProfile>>(LS_KEYS.profile, {});
    account.value = {
      name: typeof snap.name === 'string' ? snap.name : '',
      email: typeof snap.email === 'string' ? snap.email : '',
      bio: typeof snap.bio === 'string' ? snap.bio : '',
      updatedAt: typeof snap.updatedAt === 'number' ? snap.updatedAt : 0,
    };
  }

  return {
    // state
    bridgeConnected,
    serverOnline,
    serverVersion,
    health,
    lastCheckedAt,
    healthError,
    account,
    // derived
    loggedIn,
    statusText,
    statusTone,
    hostLabel,
    hasProfile,
    // actions
    refreshHealth,
    startPolling,
    stopPolling,
    isPolling,
    saveAccount,
    clearAccount,
    resetPassword,
    persist,
    hydrate,
  };
});
