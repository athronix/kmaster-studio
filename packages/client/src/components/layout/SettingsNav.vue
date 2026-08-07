<script setup lang="ts">
/**
 * SettingsNav — 左栏「设置导航态」（V3 T3 / S3.3 / R-05 R-06）。
 *
 * 结构（从上到下）：
 *   - 标题栏「设置」
 *   - 12 个类别列表（读 constants/layout 的 SETTINGS_CATEGORIES 单一真源）
 *   - StatusBar（三行状态条，常驻底栏正上方）
 *   - 底栏【← 返回】（回到进入设置前的首页路由）
 *
 * 高亮真源：`layout.settingsCategory`（由路由派生），本组件不持独立选中态，
 * 因此 URL 直达 / 浏览器前进后退时高亮天然正确。
 */
import { computed } from 'vue';
import { NButton, NScrollbar } from 'naive-ui';
import { SETTINGS_CATEGORIES, type SettingsCategory } from '../../constants/layout';
import { useLayoutStore } from '../../stores/layout';
import StatusBar from './StatusBar.vue';

const emit = defineEmits<{
  (e: 'select', category: SettingsCategory): void;
  (e: 'back'): void;
}>();

const layout = useLayoutStore();

/** 当前高亮类别（派生自路由，只读）。 */
const active = computed<SettingsCategory>(() => layout.settingsCategory);

function onSelect(category: SettingsCategory): void {
  if (category === active.value) return;
  emit('select', category);
}

function onBack(): void {
  emit('back');
}
</script>

<template>
  <div class="km-setnav">
    <div class="km-setnav-head">
      <span class="km-setnav-title">⚙️ 设置</span>
    </div>

    <n-scrollbar class="km-setnav-list">
      <button
        v-for="cat in SETTINGS_CATEGORIES"
        :key="cat.key"
        type="button"
        class="km-setnav-item"
        :class="{ active: cat.key === active }"
        @click="onSelect(cat.key)"
      >
        <span class="km-setnav-icon">{{ cat.icon }}</span>
        <span class="km-setnav-label">{{ cat.label }}</span>
      </button>
    </n-scrollbar>

    <StatusBar />

    <div class="km-setnav-foot">
      <n-button block size="small" secondary @click="onBack">
        <template #icon>←</template>
        返回
      </n-button>
    </div>
  </div>
</template>

<style scoped>
.km-setnav {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
  background: var(--km-sidebar-bg, var(--km-panel));
  border-right: 1px solid var(--km-border);
}

.km-setnav-head {
  display: flex;
  align-items: center;
  height: 48px;
  padding: 0 12px;
  border-bottom: 1px solid var(--km-border);
  flex-shrink: 0;
}

.km-setnav-title {
  font-size: 13px;
  font-weight: 600;
}

.km-setnav-list {
  flex: 1;
  min-height: 0;
}

.km-setnav-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 9px 12px;
  background: transparent;
  border: none;
  border-left: 3px solid transparent;
  color: var(--km-text);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s ease;
}

.km-setnav-item:hover {
  background: var(--km-user-bubble);
}

/* 高亮 = 背景 + 文字色 + 加粗（S3.3 验收点②） */
.km-setnav-item.active {
  background: var(--km-user-bubble);
  border-left-color: var(--km-accent);
  color: var(--km-accent);
  font-weight: 600;
}

.km-setnav-icon {
  font-size: 14px;
  line-height: 1;
  flex-shrink: 0;
}

.km-setnav-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.km-setnav-foot {
  flex-shrink: 0;
  padding: 8px 12px;
  border-top: 1px solid var(--km-border);
}
</style>
