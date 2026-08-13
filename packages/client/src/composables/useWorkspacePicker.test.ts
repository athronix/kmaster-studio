/**
 * 独立回归用例：useWorkspacePicker 行为验证。
 * 通过 mock `../utils/desktop-bridge` 的 `isDesktop` / `pickFolder`，
 * 独立拟定预期，验证桌面端 / Web 端目录选择器的契约行为。
 * 若实现损坏（Web 端 open 不返回 promise、cancel 不 resolve、桌面端误弹 Modal 等），此处断言必报警。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useWorkspacePicker } from './useWorkspacePicker';
import { isDesktop, pickFolder } from '../utils/desktop-bridge';

vi.mock('../utils/desktop-bridge', () => ({
  isDesktop: vi.fn(),
  pickFolder: vi.fn(),
}));

const mockedIsDesktop = vi.mocked(isDesktop);
const mockedPickFolder = vi.mocked(pickFolder);

/** 微任务冲刷：让 await 之后的 .then 回调有机会执行完。 */
async function flush(): Promise<void> {
  await Promise.resolve();
}

describe('useWorkspacePicker — 桌面端（isDesktop=true）', () => {
  beforeEach(() => {
    mockedIsDesktop.mockReturnValue(true);
    mockedPickFolder.mockReset();
  });

  it('pickFolder 返回路径时，open() 解析为该路径，且不弹 Modal', async () => {
    mockedPickFolder.mockResolvedValue('/some/dir');
    const picker = useWorkspacePicker();
    const result = await picker.open();
    expect(result).toBe('/some/dir');
    // 桌面端不应出现 Modal 状态
    expect(picker.show.value).toBe(false);
    expect(picker.initialPath.value).toBe('');
  });

  it('pickFolder 返回 null（取消）时，open() 解析为 null，且不弹 Modal', async () => {
    mockedPickFolder.mockResolvedValue(null);
    const picker = useWorkspacePicker();
    const result = await picker.open('/start');
    expect(result).toBeNull();
    // 关键契约：桌面端绝不弹 Modal
    expect(picker.show.value).toBe(false);
  });
});

describe('useWorkspacePicker — Web 端（isDesktop=false）', () => {
  beforeEach(() => {
    mockedIsDesktop.mockReturnValue(false);
    mockedPickFolder.mockReset();
  });

  it('open(initial) 弹 Modal、设置 initialPath、且 promise 保持未决', async () => {
    const picker = useWorkspacePicker();
    const p = picker.open('/start');
    expect(picker.show.value).toBe(true);
    expect(picker.initialPath.value).toBe('/start');
    // open 必须返回一个 promise 对象
    expect(p).toBeInstanceOf(Promise);
    // 此时 promise 尚未被兑现
    const early = await Promise.race([p, Promise.resolve('PENDING')]);
    expect(early).toBe('PENDING');
  });

  it('resolve(path) 兑现 promise 为路径并关闭 Modal', async () => {
    const picker = useWorkspacePicker();
    const p = picker.open('/start');
    picker.resolve('/chosen');
    const result = await p;
    expect(result).toBe('/chosen');
    expect(picker.show.value).toBe(false);
  });

  it('open() 后 cancel() 解析为 null', async () => {
    const picker = useWorkspacePicker();
    const p = picker.open();
    picker.cancel();
    const result = await p;
    expect(result).toBeNull();
    expect(picker.show.value).toBe(false);
  });

  it('防重复 resolve：连续 resolve 两次，promise 只兑现一次', async () => {
    const picker = useWorkspacePicker();
    const p = picker.open('/x');
    let count = 0;
    p.then(() => {
      count++;
    });
    picker.resolve('/a');
    picker.resolve('/b'); // 第二次应为 no-op（resolver 已置 null）
    const value = await p;
    await flush();
    expect(value).toBe('/a'); // 以第一次兑现为准
    expect(count).toBe(1); // 不会二次兑现
  });

  it('resolve 后再次 open 又能正常弹窗（状态可复用）', async () => {
    const picker = useWorkspacePicker();
    const p1 = picker.open('/first');
    picker.resolve('/first-chosen');
    expect(await p1).toBe('/first-chosen');
    expect(picker.show.value).toBe(false);

    const p2 = picker.open('/second');
    expect(picker.show.value).toBe(true);
    expect(picker.initialPath.value).toBe('/second');
    picker.cancel();
    expect(await p2).toBeNull();
  });
});
