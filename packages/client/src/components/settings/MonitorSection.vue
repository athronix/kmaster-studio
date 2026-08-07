<script setup lang="ts">
/**
 * MonitorSection — 设置页监控分组（UI 重设计 T07）。
 *
 * 网格卡片展示：Agents / Models / Skills / MCP-Tools / Channels 用量
 * + CPU / GPU / Memory / Sessions / Workers / Services 监控卡片。
 */
import { ref } from 'vue';
import { NStatistic, NCard, NProgress, NButton } from 'naive-ui';

const stats = ref({
  agents: 3,
  models: 12,
  skills: 8,
  mcpTools: 5,
  channels: 1,
  cpu: 42,
  gpu: 78,
  memory: 65,
  sessions: 7,
  workers: 4,
  services: 3,
});

const loading = ref(false);

function refresh() {
  loading.value = true;
  setTimeout(() => {
    loading.value = false;
    // Mock: 刷新数据
    stats.value.cpu = Math.floor(Math.random() * 100);
    stats.value.memory = Math.floor(Math.random() * 100);
  }, 800);
}

function formatPercent(v: number): string {
  return `${v}%`;
}
</script>

<template>
  <div class="km-monitor">
    <div class="km-section-actions">
      <n-button size="small" @click="refresh" :loading="loading">刷新</n-button>
    </div>

    <!-- 资源用量 -->
    <div class="km-monitor-grid">
      <n-card size="small" title="Agents">
        <n-statistic label="活跃" :value="stats.agents" />
      </n-card>
      <n-card size="small" title="Models">
        <n-statistic label="已加载" :value="stats.models" />
      </n-card>
      <n-card size="small" title="Skills">
        <n-statistic label="已安装" :value="stats.skills" />
      </n-card>
      <n-card size="small" title="MCP Tools">
        <n-statistic label="可用" :value="stats.mcpTools" />
      </n-card>
      <n-card size="small" title="Channels">
        <n-statistic label="活跃" :value="stats.channels" />
      </n-card>
      <n-card size="small" title="Sessions">
        <n-statistic label="当前" :value="stats.sessions" />
      </n-card>
    </div>

    <!-- 系统监控 -->
    <div class="km-monitor-section-title">系统资源</div>
    <div class="km-monitor-grid">
      <n-card size="small" title="CPU">
        <n-progress type="line" :percentage="stats.cpu" :height="8" :show-indicator="true" indicator-placement="inside" />
      </n-card>
      <n-card size="small" title="GPU">
        <n-progress type="line" :percentage="stats.gpu" :height="8" :show-indicator="true" indicator-placement="inside" />
      </n-card>
      <n-card size="small" title="Memory">
        <n-progress type="line" :percentage="stats.memory" :height="8" :show-indicator="true" indicator-placement="inside" />
      </n-card>
      <n-card size="small" title="Workers">
        <n-statistic label="运行中" :value="stats.workers" />
      </n-card>
      <n-card size="small" title="Services">
        <n-statistic label="健康" :value="stats.services" />
      </n-card>
    </div>
  </div>
</template>

<style scoped>
.km-monitor { padding: 0; }
.km-section-actions { margin-bottom: 16px; }
.km-monitor-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
  margin-bottom: 20px;
}
.km-monitor-section-title {
  font-size: 13px;
  font-weight: 600;
  opacity: 0.55;
  margin-bottom: 12px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
</style>
