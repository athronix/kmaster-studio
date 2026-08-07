// F22 用量统计 store：GET /api/usage/stats?group=day|model|session（sqlite GROUP BY 聚合）。
// 图表为零依赖 CSS 柱状（R-M4-6），本 store 只负责数据与派生比例。
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { getUsageStats } from '../api/client';
import type { UsageGroupBy, UsageStatRow, UsageTotals } from '../types/chat';

const EMPTY_TOTALS: UsageTotals = { input_tokens: 0, output_tokens: 0, cost: 0, sessions: 0 };

export const useUsageStore = defineStore('usage', () => {
  const rows = ref<UsageStatRow[]>([]);
  /** 按天序列（趋势图专用，与 Tab 选中的维度解耦） */
  const daySeries = ref<UsageStatRow[]>([]);
  const totals = ref<UsageTotals>({ ...EMPTY_TOTALS });
  const groupBy = ref<UsageGroupBy>('day');
  const from = ref<string>('');
  const to = ref<string>('');
  const loading = ref(false);
  const error = ref<string>('');

  /** 总 token（输入 + 输出），汇总卡用。 */
  const totalTokens = computed(() => totals.value.input_tokens + totals.value.output_tokens);
  /** 单行最大 token，用于 CSS 柱状高度归一。 */
  const maxRowTokens = computed(() =>
    rows.value.reduce((m, r) => Math.max(m, r.input_tokens + r.output_tokens), 0)
  );
  const isEmpty = computed(() => rows.value.length === 0);

  /** 归一化柱高（0-100），零数据时返回 0，避免除零。 */
  function barPercent(row: UsageStatRow): number {
    const max = maxRowTokens.value;
    if (max <= 0) return 0;
    return Math.round(((row.input_tokens + row.output_tokens) / max) * 100);
  }

  async function load(
    group: UsageGroupBy = groupBy.value,
    rangeFrom?: string,
    rangeTo?: string
  ): Promise<UsageStatRow[]> {
    loading.value = true;
    error.value = '';
    groupBy.value = group;
    if (rangeFrom !== undefined) from.value = rangeFrom;
    if (rangeTo !== undefined) to.value = rangeTo;
    try {
      const res = await getUsageStats(group, from.value || undefined, to.value || undefined);
      rows.value = res.rows ?? [];
      totals.value = res.totals ?? { ...EMPTY_TOTALS };
      return rows.value;
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  /** 单独拉取按天序列（趋势图），不影响当前 Tab 的 rows/groupBy。 */
  async function loadDaySeries(): Promise<UsageStatRow[]> {
    const res = await getUsageStats('day', from.value || undefined, to.value || undefined);
    daySeries.value = res.rows ?? [];
    return daySeries.value;
  }

  /** 按天序列的柱高归一（0-100），供 CSS 柱状图使用。 */
  function dayBarPercent(row: UsageStatRow): number {
    const max = daySeries.value.reduce((m, r) => Math.max(m, r.input_tokens + r.output_tokens), 0);
    if (max <= 0) return 0;
    return Math.max(2, Math.round(((row.input_tokens + row.output_tokens) / max) * 100));
  }

  function reset() {
    rows.value = [];
    daySeries.value = [];
    totals.value = { ...EMPTY_TOTALS };
    error.value = '';
  }

  return {
    rows, daySeries, totals, groupBy, from, to, loading, error,
    totalTokens, maxRowTokens, isEmpty,
    barPercent, dayBarPercent, load, loadDaySeries, reset,
  };
});
