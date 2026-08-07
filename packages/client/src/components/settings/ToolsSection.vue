<script setup lang="ts">
/**
 * ToolsSection — 设置页 Tools 管理分组（UI 重设计 T07）。
 *
 * Tools 列表 + 权限 toggle。
 */
import { ref } from 'vue';
import { NCard, NButton, NSwitch, NTag } from 'naive-ui';

interface ToolItem {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  category: string;
}

const tools = ref<ToolItem[]>([
  { id: 'tool-read', name: 'Read', description: '读取文件内容', enabled: true, category: 'file' },
  { id: 'tool-write', name: 'Write', description: '写入/创建文件', enabled: true, category: 'file' },
  { id: 'tool-edit', name: 'Edit', description: '编辑现有文件', enabled: true, category: 'file' },
  { id: 'tool-bash', name: 'Bash', description: '执行 Shell 命令', enabled: true, category: 'shell' },
  { id: 'tool-grep', name: 'Grep', description: '搜索文件内容', enabled: true, category: 'search' },
  { id: 'tool-glob', name: 'Glob', description: '文件名模式匹配', enabled: true, category: 'search' },
  { id: 'tool-web', name: 'WebFetch', description: '获取网页内容', enabled: false, category: 'network' },
  { id: 'tool-web-search', name: 'WebSearch', description: '网络搜索', enabled: false, category: 'network' },
]);

function toggleTool(id: string, enabled: boolean) {
  const t = tools.value.find((x) => x.id === id);
  if (t) t.enabled = enabled;
}
</script>

<template>
  <div class="km-tools">
    <div class="km-section-actions">
      <n-button size="small" type="primary" disabled>新增工具</n-button>
    </div>

    <div class="km-tools-list">
      <div
        v-for="tool in tools"
        :key="tool.id"
        class="km-tool-row"
      >
        <div class="km-tool-info">
          <div class="km-tool-name">{{ tool.name }}</div>
          <div class="km-tool-desc">{{ tool.description }}</div>
        </div>
        <div class="km-tool-meta">
          <n-tag size="tiny" :bordered="false">{{ tool.category }}</n-tag>
        </div>
        <n-switch
          :value="tool.enabled"
          size="small"
          @update:value="(v: boolean) => toggleTool(tool.id, v)"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.km-tools { padding: 0; }
.km-section-actions { margin-bottom: var(--km-space-lg); }
.km-tools-list { display: flex; flex-direction: column; gap: var(--km-space-6); }
.km-tool-row {
  display: flex;
  align-items: center;
  gap: var(--km-space-md);
  padding: var(--km-space-sm) var(--km-space-md);
  background: var(--km-bg);
  border: 1px solid var(--km-border);
  border-radius: var(--km-radius-lg);
}
.km-tool-info { flex: 1; min-width: 0; }
.km-tool-name { font-weight: 600; font-size: var(--km-font-sm); }
.km-tool-desc { font-size: var(--km-font-xs); opacity: 0.55; margin-top: 1px; }
.km-tool-meta { flex-shrink: 0; }
</style>
