/**
 * stores/status.test.ts —— 状态条 / 账号 store 单测。
 *
 * 覆盖：health 成功与失败分支 / 轮询幂等与停止 / Q6 本地模式恒定 /
 *       profile 持久化往返 / 密码重置 mock。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useStatusStore } from './status';
import { LS_KEYS } from '../constants/layout';
import type { HealthInfo } from '../types/chat';

const state = vi.hoisted(() => ({
  health: {
    ok: true,
    service: 'kmaster-server',
    ts: 1_700_000_000,
    version: '1.2.3',
  } as HealthInfo,
  shouldFail: false,
  calls: 0,
}));

vi.mock('../api/client', () => ({
  getHealth: vi.fn(async () => {
    state.calls += 1;
    if (state.shouldFail) throw new Error('ECONNREFUSED');
    return state.health;
  }),
}));

function installMemoryStorage(): void {
  const map = new Map<string, string>();
  (globalThis as { localStorage?: Storage }).localStorage = {
    get length(): number {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    removeItem: (k: string) => {
      map.delete(k);
    },
    setItem: (k: string, v: string) => {
      map.set(k, String(v));
    },
  };
}

describe('stores/status', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    installMemoryStorage();
    state.shouldFail = false;
    state.calls = 0;
    state.health = { ok: true, service: 'kmaster-server', ts: 1_700_000_000, version: '1.2.3' };
  });

  afterEach(() => {
    delete (globalThis as { localStorage?: Storage }).localStorage;
    vi.useRealTimers();
  });

  it('refreshHealth 成功时点亮 serverOnline 并记录版本号', async () => {
    const s = useStatusStore();
    const ok = await s.refreshHealth();
    expect(ok).toBe(true);
    expect(s.serverOnline).toBe(true);
    expect(s.serverVersion).toBe('1.2.3');
    expect(s.healthError).toBe('');
    expect(s.lastCheckedAt).toBeGreaterThan(0);
  });

  it('refreshHealth 失败时置离线并记录原因，不抛错', async () => {
    state.shouldFail = true;
    const s = useStatusStore();
    await expect(s.refreshHealth()).resolves.toBe(false);
    expect(s.serverOnline).toBe(false);
    expect(s.healthError).toContain('ECONNREFUSED');
    expect(s.health).toBeNull();
  });

  it('Q6：bridgeConnected 恒 false，statusTone 走本地模式', async () => {
    const s = useStatusStore();
    await s.refreshHealth();
    expect(s.bridgeConnected).toBe(false);
    expect(s.loggedIn).toBe(false);
    expect(s.statusTone).toBe('local');
    expect(s.statusText).toBe('本地模式');
  });

  it('服务不可达时 statusTone 为 offline', async () => {
    state.shouldFail = true;
    const s = useStatusStore();
    await s.refreshHealth();
    expect(s.statusTone).toBe('offline');
    expect(s.statusText).toBe('服务未连接');
  });

  it('startPolling 幂等且按间隔触发，stopPolling 后不再触发', async () => {
    vi.useFakeTimers();
    const s = useStatusStore();
    s.startPolling(1000);
    s.startPolling(1000); // 重复调用不应叠加定时器
    expect(s.isPolling()).toBe(true);
    expect(state.calls).toBe(2); // 两次 startPolling 各自立即探一次

    await vi.advanceTimersByTimeAsync(3000);
    const afterTicks = state.calls;
    expect(afterTicks).toBe(5); // 2 次立即 + 3 次 tick

    s.stopPolling();
    expect(s.isPolling()).toBe(false);
    await vi.advanceTimersByTimeAsync(5000);
    expect(state.calls).toBe(afterTicks);
  });

  it('saveAccount 部分更新并落盘，hydrate 可还原', () => {
    const s = useStatusStore();
    s.saveAccount({ name: '寇豆码' });
    expect(s.account.name).toBe('寇豆码');
    expect(s.account.updatedAt).toBeGreaterThan(0);
    s.saveAccount({ email: 'dev@example.com' });
    expect(s.account.name).toBe('寇豆码');
    expect(s.account.email).toBe('dev@example.com');
    expect(localStorage.getItem(LS_KEYS.profile)).toBeTruthy();

    setActivePinia(createPinia());
    const s2 = useStatusStore();
    s2.hydrate();
    expect(s2.account.name).toBe('寇豆码');
    expect(s2.account.email).toBe('dev@example.com');
    expect(s2.hasProfile).toBe(true);
  });

  it('hydrate 遇脏数据补空串', () => {
    localStorage.setItem(LS_KEYS.profile, JSON.stringify({ name: 42, bio: null }));
    const s = useStatusStore();
    s.hydrate();
    expect(s.account.name).toBe('');
    expect(s.account.bio).toBe('');
    expect(s.account.updatedAt).toBe(0);
    expect(s.hasProfile).toBe(false);
  });

  it('clearAccount 清空 profile', () => {
    const s = useStatusStore();
    s.saveAccount({ name: 'x', email: 'y@z.com' });
    s.clearAccount();
    expect(s.account.name).toBe('');
    expect(s.hasProfile).toBe(false);
  });

  it('resetPassword 空邮箱失败、有邮箱 mock 成功', () => {
    const s = useStatusStore();
    expect(s.resetPassword('  ').ok).toBe(false);
    const r = s.resetPassword('dev@example.com');
    expect(r.ok).toBe(true);
    expect(r.message).toContain('dev@example.com');
  });
});
