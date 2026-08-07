<script setup lang="ts">
/**
 * PlaceholderSection — P2 范围类别的规划占位页（V3 T3 / 设计 §1.4 注）。
 *
 * 仅供 `plugins` / `channel` 两个类别使用（不在 P0/P1 需求池内）。
 * 按 §7.5「空态」约定：`NEmpty` + 一句可操作提示，不出现占位文案，不白屏。
 */
import { NButton, NEmpty } from 'naive-ui';
import { useRouter } from 'vue-router';

withDefaults(
  defineProps<{
    /** 类别名称，由 SettingsView 查表传入 */
    label?: string;
    /** 类别图标 */
    icon?: string;
  }>(),
  { label: '该模块', icon: '🧰' }
);

const router = useRouter();

function goSkills(): void {
  void router.push('/settings/skills');
}

function goMcp(): void {
  void router.push('/settings/mcp');
}
</script>

<template>
  <div class="km-placeholder">
    <n-empty :description="`${label}尚未纳入当前版本的功能范围`">
      <template #icon>
        <span class="km-placeholder-icon">{{ icon }}</span>
      </template>
      <template #extra>
        <div class="km-placeholder-extra">
          <p class="km-placeholder-hint">
            当前版本的扩展能力集中在「Skill 管理」与「MCP 管理」两个模块，可先从这两处配置。
          </p>
          <div class="km-placeholder-actions">
            <n-button size="small" @click="goSkills">前往 Skill 管理</n-button>
            <n-button size="small" @click="goMcp">前往 MCP 管理</n-button>
          </div>
        </div>
      </template>
    </n-empty>
  </div>
</template>

<style scoped>
.km-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 64px 16px;
}

.km-placeholder-icon {
  font-size: 40px;
  line-height: 1;
}

.km-placeholder-extra {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  max-width: 420px;
}

.km-placeholder-hint {
  margin: 0;
  font-size: 12px;
  line-height: 1.7;
  opacity: 0.6;
  text-align: center;
}

.km-placeholder-actions {
  display: flex;
  gap: 8px;
}
</style>
