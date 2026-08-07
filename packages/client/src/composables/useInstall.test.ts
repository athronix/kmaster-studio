/**
 * useInstall 单测（T01）。
 *
 * 验收项：
 *   ① install 调用对应 API（expert → installAgent, skill → installSkill）
 *   ② uninstall 调用对应 API
 *   ③ summon 先安装再 createSessionWithConfig 再 router.push
 *   ④ isInstalling 互斥锁 —— 同时只能有一个操作
 *   ⑤ 非 expert 类型调用 summon 抛错
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ⚠️ mock 必须在 import 被测模块之前声明（vi.mock 会被提升）
const mockInstallAgent = vi.fn();
const mockUninstallAgent = vi.fn();
const mockInstallSkill = vi.fn();
const mockUninstallSkill = vi.fn();
const mockCreateSessionWithConfig = vi.fn();
const mockRouterPush = vi.fn();

vi.mock('../api/client', () => ({
  installAgent: (...args: unknown[]) => mockInstallAgent(...args),
  uninstallAgent: (...args: unknown[]) => mockUninstallAgent(...args),
  installSkill: (...args: unknown[]) => mockInstallSkill(...args),
  uninstallSkill: (...args: unknown[]) => mockUninstallSkill(...args),
}));

vi.mock('../stores/chat', () => ({
  useChatStore: () => ({
    createSessionWithConfig: mockCreateSessionWithConfig,
  }),
}));

vi.mock('vue-router', () => ({
  useRouter: () => ({
    push: mockRouterPush,
  }),
}));

import { useInstall, type EntityKind } from './useInstall';

describe('useInstall', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // 默认都成功
    mockInstallAgent.mockResolvedValue({ ok: true, agentId: 'a1', message: 'ok' });
    mockUninstallAgent.mockResolvedValue({ ok: true, message: 'ok' });
    mockInstallSkill.mockResolvedValue({ ok: true });
    mockUninstallSkill.mockResolvedValue({ ok: true });
    mockCreateSessionWithConfig.mockResolvedValue('sid-1');
    mockRouterPush.mockResolvedValue(undefined);
  });

  // ──── ① install ────
  it('① expert install → 调用 installAgent', async () => {
    const { install } = useInstall('expert');
    await install('test-agent');

    expect(mockInstallAgent).toHaveBeenCalledWith('test-agent');
    expect(mockInstallSkill).not.toHaveBeenCalled();
  });

  it('① skill install → 调用 installSkill', async () => {
    const { install } = useInstall('skill');
    await install('test-skill');

    expect(mockInstallSkill).toHaveBeenCalledWith('test-skill');
    expect(mockInstallAgent).not.toHaveBeenCalled();
  });

  it('① mcp install → 抛错', async () => {
    const { install } = useInstall('mcp');
    await expect(install('test-mcp')).rejects.toThrow('MCP 安装请使用 postMcp');
  });

  // ──── ② uninstall ────
  it('② expert uninstall → 调用 uninstallAgent', async () => {
    const { uninstall } = useInstall('expert');
    await uninstall('test-agent');

    expect(mockUninstallAgent).toHaveBeenCalledWith('test-agent');
  });

  it('② skill uninstall → 调用 uninstallSkill', async () => {
    const { uninstall } = useInstall('skill');
    await uninstall('test-skill');

    expect(mockUninstallSkill).toHaveBeenCalledWith('test-skill');
  });

  // ──── ③ summon ────
  it('③ summon expert：先安装 → 建会话 → 跳转首页', async () => {
    const { summon } = useInstall('expert');
    await summon('my-agent');

    expect(mockInstallAgent).toHaveBeenCalledWith('my-agent');
    expect(mockCreateSessionWithConfig).toHaveBeenCalledWith({ agent: 'my-agent' });
    expect(mockRouterPush).toHaveBeenCalledWith('/');
  });

  it('③ summon skill → 抛错', async () => {
    const { summon } = useInstall('skill');
    await expect(summon('test')).rejects.toThrow('summon 仅支持 expert 类型');
  });

  it('③ summon mcp → 抛错', async () => {
    const { summon } = useInstall('mcp');
    await expect(summon('test')).rejects.toThrow('summon 仅支持 expert 类型');
  });

  // ──── ④ 互斥锁 ────
  it('④ isInstalling 互斥锁：同时只有一个操作', async () => {
    // 让 installAgent 延迟完成
    let resolveInstall: (v: unknown) => void = () => {};
    mockInstallAgent.mockReturnValue(new Promise((r) => { resolveInstall = r; }));

    const { install, isInstalling } = useInstall('expert');

    // 启动第一个安装
    const p1 = install('agent-1');
    expect(isInstalling.value).toBe(true);

    // 第二个安装应被拒绝
    await expect(install('agent-2')).rejects.toThrow('已有操作正在进行中');

    // 完成第一个
    resolveInstall({ ok: true, agentId: 'a1', message: 'ok' });
    await p1;
    expect(isInstalling.value).toBe(false);
  });

  it('④ 操作失败后锁释放', async () => {
    mockInstallAgent.mockRejectedValue(new Error('安装失败'));

    const { install, isInstalling } = useInstall('expert');

    await expect(install('agent-1')).rejects.toThrow('安装失败');
    expect(isInstalling.value).toBe(false);

    // 锁已释放，下一个操作可以执行
    mockInstallAgent.mockResolvedValue({ ok: true, agentId: 'a2', message: 'ok' });
    await install('agent-2');
    expect(mockInstallAgent).toHaveBeenCalledTimes(2);
  });

  // ──── ⑤ 边界：install API 抛出异常正确传递 ────
  it('⑤ install API 异常透传', async () => {
    mockInstallAgent.mockRejectedValue(new Error('网络超时'));

    const { install } = useInstall('expert');
    await expect(install('x')).rejects.toThrow('网络超时');
  });

  it('⑤ uninstall API 异常透传', async () => {
    mockUninstallAgent.mockRejectedValue(new Error('卸载失败'));

    const { uninstall } = useInstall('expert');
    await expect(uninstall('x')).rejects.toThrow('卸载失败');
  });

  // ──── ⑥ 每个 useInstall 实例独立 isInstalling ────
  it('⑥ 不同实例 isInstalling 独立', async () => {
    let resolveA: (v: unknown) => void = () => {};
    mockInstallAgent.mockReturnValue(new Promise((r) => { resolveA = r; }));

    const a = useInstall('expert');
    const b = useInstall('skill');

    const pa = a.install('agent-a');
    expect(a.isInstalling.value).toBe(true);
    expect(b.isInstalling.value).toBe(false);

    // b 可以独立操作
    await b.install('skill-b');
    expect(mockInstallSkill).toHaveBeenCalledWith('skill-b');

    resolveA({ ok: true, agentId: 'a1', message: 'ok' });
    await pa;
  });
});
