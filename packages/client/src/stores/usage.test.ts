// M4/T14 单测：usage store（F22 / AC7）
// 覆盖：加载 day/model/session 三维度、totals 自洽性、派生比例（barPercent / dayBarPercent）、
//       按天序列（loadDaySeries）与归一、reset 复位、错误路径的 loading 复位。
// api/client 全量 mock：用一个内存假后端按 group 返回确定的聚合行。
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useUsageStore } from './usage';
import type { UsageGroupBy, UsageStatRow, UsageTotals } from '../types/chat';

/** vi.mock 工厂在模块顶层被提升，共享状态必须经 vi.hoisted 创建。 */
const backend = vi.hoisted(() => {
  const dayRows: UsageStatRow[] = [
    { key: '2026-01-01', input_tokens: 100, output_tokens: 200, cost: 0.001, runs: 2 },
    { key: '2026-01-02', input_tokens: 300, output_tokens: 100, cost: 0.002, runs: 4 },
  ];
  const modelRows: UsageStatRow[] = [
    { key: 'gpt-4o', input_tokens: 400, output_tokens: 300, cost: 0.003, runs: 5 },
  ];
  const sessionRows: UsageStatRow[] = [
    { key: 'sess-1', input_tokens: 250, output_tokens: 150, cost: 0.0015, runs: 3 },
    { key: 'sess-2', input_tokens: 150, output_tokens: 150, cost: 0.001, runs: 2 },
  ];
  const totals: UsageTotals = { input_tokens: 1200, output_tokens: 900, cost: 0.0085, sessions: 7 };
  const state = {
    dayRows, modelRows, sessionRows, totals,
    /** 置真时下一次 getUsageStats 抛网络错误 */
    nextLoadFails: false,
    /** 记录最近一次入参，断言 group/from/to 透传 */
    lastQuery: null as null | { group: UsageGroupBy; from?: string; to?: string },
  };
  return { state };
});

vi.mock('../api/client', () => {
  const { state } = backend;
  return {
    getUsageStats: vi.fn(async (group: UsageGroupBy = 'day', from?: string, to?: string) => {
      state.lastQuery = { group, from, to };
      if (state.nextLoadFails) {
        state.nextLoadFails = false;
        throw new Error('500 stats_failed');
      }
      const rows =
        group === 'model' ? state.modelRows
          : group === 'session' ? state.sessionRows
            : state.dayRows;
      return {
        group,
        rows: rows.map((r) => ({ ...r })),
        totals: { ...state.totals },
      };
    }),
  };
});

beforeEach(() => {
  setActivePinia(createPinia());
  backend.state.nextLoadFails = false;
  backend.state.lastQuery = null;
});

describe('usage store — F22 用量统计（AC7）', () => {
  it('load day 填充 rows 与 groupBy，并写入 totals', async () => {
    const s = useUsageStore();
    await s.load('day');
    expect(s.groupBy).toBe('day');
    expect(s.rows).toHaveLength(2);
    expect(s.totals.input_tokens).toBe(1200);
    expect(s.totals.output_tokens).toBe(900);
    expect(s.totals.cost).toBe(0.0085);
    expect(s.totals.sessions).toBe(7);
    expect(s.loading).toBe(false);
    expect(s.error).toBe('');
  });

  it('load model / session 维度切换 groupBy 且不串维度', async () => {
    const s = useUsageStore();
    await s.load('model');
    expect(s.groupBy).toBe('model');
    expect(s.rows).toHaveLength(1);
    expect(s.rows[0].key).toBe('gpt-4o');

    await s.load('session');
    expect(s.groupBy).toBe('session');
    expect(s.rows).toHaveLength(2);
    expect(s.rows.every((r) => r.key.startsWith('sess-'))).toBe(true);
    expect(backend.state.lastQuery).toEqual({ group: 'session', from: undefined, to: undefined });
  });

  it('totalTokens 为输入 + 输出自洽合计', async () => {
    const s = useUsageStore();
    await s.load('day');
    expect(s.totalTokens).toBe(1200 + 900);
  });

  it('maxRowTokens / barPercent 按行 token 和归一（0-100，零数据返回 0）', async () => {
    const s = useUsageStore();
    await s.load('day');
    // day 行：300 + 400 → max=400
    expect(s.maxRowTokens).toBe(400);
    const [r0, r1] = s.rows;
    // 第 0 行 100+200=300 → 75%
    expect(s.barPercent(r0)).toBe(75);
    // 第 1 行 300+100=400 → 100%
    expect(s.barPercent(r1)).toBe(100);
    // 空数据不除零
    const empty = useUsageStore();
    empty.reset();
    expect(empty.barPercent({ key: 'x', input_tokens: 10, output_tokens: 10, cost: 0, runs: 1 })).toBe(0);
  });

  it('isEmpty 随 rows 变化', async () => {
    const s = useUsageStore();
    s.reset();
    expect(s.isEmpty).toBe(true);
    await s.load('day');
    expect(s.isEmpty).toBe(false);
  });

  it('loadDaySeries 单独填充 daySeries，不影响当前 Tab 的 rows/groupBy', async () => {
    const s = useUsageStore();
    await s.load('model'); // 当前 Tab 是 model
    const series = await s.loadDaySeries();
    expect(series).toHaveLength(2);
    expect(s.daySeries).toHaveLength(2);
    expect(s.groupBy).toBe('model'); // 未受影响
    expect(s.rows).toHaveLength(1); // 仍为 model 维度
  });

  it('dayBarPercent 基于 daySeries 归一并有 2% 下限', async () => {
    const s = useUsageStore();
    await s.loadDaySeries();
    // day 行：max=400，第 0 行 300 → 75%，第 1 行 400 → max(2,100)=100
    expect(s.dayBarPercent(s.daySeries[0])).toBe(75);
    expect(s.dayBarPercent(s.daySeries[1])).toBe(100);
    // 极小占比相对最大项时不低于 2%（CSS 可见性下限）
    s.daySeries = [
      { key: 'big', input_tokens: 1000, output_tokens: 1000, cost: 0, runs: 1 },
      { key: 'tiny', input_tokens: 1, output_tokens: 1, cost: 0, runs: 1 },
    ];
    expect(s.dayBarPercent(s.daySeries[0])).toBe(100);
    expect(s.dayBarPercent(s.daySeries[1])).toBe(2); // round(2/2000*100)=0 → 下限 2
    // 空序列不除零
    s.daySeries = [];
    expect(s.dayBarPercent({ key: 'x', input_tokens: 1, output_tokens: 1, cost: 0, runs: 1 })).toBe(0);
  });

  it('load 透传 from / to 范围参数', async () => {
    const s = useUsageStore();
    await s.load('day', '2026-01-01', '2026-01-31');
    expect(backend.state.lastQuery).toEqual({ group: 'day', from: '2026-01-01', to: '2026-01-31' });
  });

  it('reset 清空 rows / daySeries / totals / error', async () => {
    const s = useUsageStore();
    await s.load('day');
    await s.loadDaySeries();
    expect(s.rows.length).toBeGreaterThan(0);
    s.reset();
    expect(s.rows).toHaveLength(0);
    expect(s.daySeries).toHaveLength(0);
    expect(s.totals).toEqual({ input_tokens: 0, output_tokens: 0, cost: 0, sessions: 0 });
    expect(s.error).toBe('');
  });

  it('load 失败时记录 error 并复位 loading，rows 不被污染', async () => {
    const s = useUsageStore();
    await s.load('day'); // 先有数据
    backend.state.nextLoadFails = true;
    await expect(s.load('day')).rejects.toThrow('500 stats_failed');
    expect(s.error).toBe('500 stats_failed');
    expect(s.loading).toBe(false);
    expect(s.rows).toHaveLength(2); // 保留上一成功结果，异常不置空
  });
});
