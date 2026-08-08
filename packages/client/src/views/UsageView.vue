<script setup lang="ts">
// F22 用量统计整页：三张汇总卡 + 按天 CSS 柱状趋势（零图表库，R-M4-6）+ 按天/模型/会话 Tab 明细。
import { computed, onMounted, ref } from 'vue';
import { NCard, NTabs, NTabPane, NSpin, NEmpty, NButton, NDatePicker, NAlert, useMessage } from 'naive-ui';
import { useUsageStore } from '../stores/usage';
import PageHeader from '../components/layout/PageHeader.vue';
import EmptyState from '../components/common/EmptyState.vue';
import type { UsageGroupBy, UsageStatRow } from '../types/chat';

const store = useUsageStore();
const message = useMessage();

/** 按天柱状始终展示 day 维度数据（store.daySeries），与 Tab 选择解耦 */
const dayRows = computed<UsageStatRow[]>(() => store.daySeries);
const range = ref<[number, number] | null>(null);
const loadError = ref<string | null>(null);

function fmtNum(n: number): string {
  if (!Number.isFinite(n)) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}
function fmtCost(n: number): string {
  return `$${(Number(n) || 0).toFixed(4)}`;
}
function keyLabel(row: UsageStatRow): string {
  return row.key || '未知';
}

async function reload(group: UsageGroupBy = store.groupBy) {
  loadError.value = null;
  try {
    // 明细随 Tab 维度；趋势图恒为按天序列（独立 state，互不覆盖）
    await store.load(group);
    await store.loadDaySeries();
  } catch (e: any) {
    loadError.value = `用量加载失败：${String(e?.message ?? e)}`;
    message.error(loadError.value);
  }
}

function onTabChange(v: string | number) {
  reload(String(v) as UsageGroupBy);
}

function onRangeChange(v: [number, number] | null) {
  range.value = v;
  const toDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  store.from = v ? toDate(v[0]) : '';
  store.to = v ? toDate(v[1]) : '';
  reload(store.groupBy);
}

onMounted(() => reload('day'));
</script>

<template>
  <section class="km-page">
    <PageHeader title="用量统计" :show-search="false">
      <template #actions>
        <n-date-picker
          type="daterange"
          size="small"
          clearable
          :value="range"
          @update:value="onRangeChange"
        />
        <n-button size="small" @click="reload(store.groupBy)">刷新</n-button>
      </template>
    </PageHeader>

    <n-alert
      v-if="loadError"
      type="error"
      :title="loadError"
      closable
      @close="loadError = null"
    />
    <template v-else>
    <div class="km-cards">
      <n-card size="small" class="km-card">
        <div class="km-card-label">总 Token</div>
        <div class="km-card-value">{{ fmtNum(store.totalTokens) }}</div>
        <div class="km-card-sub">
          输入 {{ fmtNum(store.totals.input_tokens) }} · 输出 {{ fmtNum(store.totals.output_tokens) }}
        </div>
      </n-card>
      <n-card size="small" class="km-card">
        <div class="km-card-label">总费用</div>
        <div class="km-card-value">{{ fmtCost(store.totals.cost) }}</div>
        <div class="km-card-sub">按 provider 报价估算</div>
      </n-card>
      <n-card size="small" class="km-card">
        <div class="km-card-label">活跃会话</div>
        <div class="km-card-value">{{ store.totals.sessions }}</div>
        <div class="km-card-sub">统计区间内产生用量的会话数</div>
      </n-card>
    </div>

    <h3 class="km-section-title">按天趋势</h3>
    <div class="km-chart">
      <n-empty v-if="!dayRows.length" size="small" description="暂无用量数据，先完成几轮对话" />
      <div v-else class="km-bars">
        <div v-for="row in dayRows" :key="row.key" class="km-bar-col">
          <span class="km-bar-value">{{ fmtNum(row.input_tokens + row.output_tokens) }}</span>
          <div
            class="km-bar"
            :style="{ height: `${store.dayBarPercent(row)}%` }"
            :title="`${row.key}: in ${row.input_tokens} / out ${row.output_tokens} / ${fmtCost(row.cost)} / ${row.runs} runs`"
          />
          <span class="km-bar-label">{{ row.key }}</span>
        </div>
      </div>
    </div>

    <h3 class="km-section-title">明细</h3>
    <n-tabs :value="store.groupBy" type="line" animated @update:value="onTabChange">
      <n-tab-pane name="day" tab="按天" />
      <n-tab-pane name="model" tab="按模型" />
      <n-tab-pane name="session" tab="按会话" />
    </n-tabs>

    <n-spin :show="store.loading">
      <div class="km-table-wrap">
        <table class="km-table">
          <thead>
            <tr>
              <th>{{ store.groupBy === 'day' ? '日期' : store.groupBy === 'model' ? '模型' : '会话' }}</th>
              <th style="width: 15%">输入 Token</th>
              <th style="width: 15%">输出 Token</th>
              <th style="width: 15%">合计</th>
              <th style="width: 13%">费用</th>
              <th style="width: 10%">Runs</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in store.rows" :key="row.key">
              <td class="km-key">{{ keyLabel(row) }}</td>
              <td>{{ row.input_tokens }}</td>
              <td>{{ row.output_tokens }}</td>
              <td><b>{{ row.input_tokens + row.output_tokens }}</b></td>
              <td>{{ fmtCost(row.cost) }}</td>
              <td>{{ row.runs }}</td>
            </tr>
          </tbody>
        </table>
        <n-empty v-if="store.isEmpty" size="small" description="该维度暂无数据" class="km-empty-block" />
      </div>
    </n-spin>
    </template>
  </section>
</template>

<style scoped>
.km-page { height: 100%; overflow: auto; padding: 0 var(--km-space-2xl) var(--km-space-40); }
.km-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: var(--km-space-md); margin-top: var(--km-space-lg); }
.km-card-label { font-size: var(--km-font-sm); opacity: 0.6; }
.km-card-value { font-size: var(--km-font-2xl); font-weight: 700; margin: var(--km-space-xs) 0 var(--km-space-2xs); }
.km-card-sub { font-size: var(--km-font-xs); opacity: 0.5; }
.km-section-title { font-size: var(--km-font-base); margin: var(--km-space-2xl) 0 var(--km-space-10); }
.km-chart {
  border: 1px solid var(--km-border);
  border-radius: var(--km-radius-lg);
  padding: var(--km-space-14) var(--km-space-lg) var(--km-space-sm);
  background: var(--km-panel);
}
.km-bars {
  display: flex;
  align-items: flex-end;
  gap: var(--km-space-10);
  height: 180px;
  overflow-x: auto;
}
.km-bar-col {
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  align-items: center;
  min-width: 44px;
  height: 100%;
  flex: 1;
}
.km-bar {
  width: 70%;
  min-height: 3px;
  border-radius: var(--km-radius-sm) 4px 0 0;
  background: linear-gradient(180deg, var(--km-accent), transparent);
  transition: height 0.25s ease;
}
.km-bar-value { font-size: var(--km-font-xs); opacity: 0.65; margin-bottom: var(--km-space-xs); }
.km-bar-label { font-size: var(--km-font-xs); opacity: 0.5; margin-top: var(--km-space-6); white-space: nowrap; }
.km-table-wrap { border: 1px solid var(--km-border); border-radius: var(--km-radius-lg); overflow: hidden; margin-top: var(--km-space-10); }
.km-table { width: 100%; border-collapse: collapse; font-size: var(--km-font-sm); }
.km-table th {
  text-align: left;
  padding: 9px var(--km-space-md);
  background: var(--km-panel);
  font-size: var(--km-font-sm);
  font-weight: 600;
  opacity: 0.8;
  border-bottom: 1px solid var(--km-border);
}
.km-table td { padding: var(--km-space-sm) var(--km-space-md); border-bottom: 1px solid var(--km-border); }
.km-table tr:last-child td { border-bottom: none; }
.km-key { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-size: var(--km-font-sm); }
.km-empty-block { padding: var(--km-space-28) 0; }
</style>
