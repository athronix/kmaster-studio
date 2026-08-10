<script setup lang="ts">
/**
 * PlatformCard — 可折叠平台卡片（name + icon + 配置状态 + slot）。
 *
 * 从 hermes-studio PlatformCard.vue 移植，CSS 变量适配 kmaster 体系。
 * 内部只负责折叠/展开与配置状态展示；凭据输入、保存/清除按钮由父组件通过 slot 注入。
 */
import { ref, computed } from 'vue'

const props = defineProps<{
  platformKey?: string
  name: string
  icon: string
  config?: Record<string, any>
  credentials?: Record<string, any>
}>()

const expanded = ref(true)

const configured = computed(() => {
  const creds = props.credentials
  if (!creds) return false
  if (props.platformKey === 'matrix') {
    const extra = creds.extra || {}
    const homeserver = String(extra.homeserver || '').trim()
    const token = String(creds.token || '').trim()
    const userId = String(extra.user_id || '').trim()
    const password = String(extra.password || '').trim()
    return Boolean(homeserver && (token || (userId && password)))
  }
  const keys = ['token', 'api_key', 'app_id', 'client_id', 'secret', 'app_secret', 'client_secret', 'access_token', 'bot_id', 'account_id', 'enabled']
  const targets = [creds, creds.extra].filter(Boolean)
  return targets.some((obj) =>
    keys.some((key) => {
      const val = (obj as Record<string, any>)[key]
      return val !== undefined && val !== null && val !== '' && val !== false
    }),
  )
})
</script>

<template>
  <div class="pc-card" :class="{ 'pc-configured': configured }">
    <div class="pc-header" @click="expanded = !expanded">
      <div class="pc-info">
        <span class="pc-icon" v-html="icon" />
        <span class="pc-name">{{ name }}</span>
        <span class="pc-badge" :class="configured ? 'pc-badge-ok' : 'pc-badge-no'">
          {{ configured ? '已配置' : '未配置' }}
        </span>
      </div>
      <span class="pc-arrow" :class="{ 'pc-arrow-open': expanded }">&#9662;</span>
    </div>
    <div v-if="expanded" class="pc-body">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.pc-card {
  background-color: var(--km-panel);
  border: 1px solid var(--km-border);
  border-radius: var(--km-radius-lg);
  margin-bottom: 12px;
  overflow: hidden;
}

.pc-card.pc-configured {
  border-color: var(--km-success);
}

.pc-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  cursor: pointer;
  user-select: none;
}

.pc-header:hover {
  background-color: color-mix(in srgb, var(--km-text) 3%, transparent);
}

.pc-info {
  display: flex;
  align-items: center;
  gap: 10px;
}

.pc-icon {
  width: 18px;
  height: 18px;
  color: var(--km-text);
  opacity: 0.75;
  flex-shrink: 0;
}

.pc-name {
  font-size: var(--km-font-sm);
  font-weight: 500;
  color: var(--km-text);
}

.pc-badge {
  font-size: var(--km-font-xs);
  padding: 1px 8px;
  border-radius: 999px;
  border: 1px solid var(--km-border);
  color: var(--km-text);
  opacity: 0.6;
}

.pc-badge-ok {
  border-color: var(--km-success);
  color: var(--km-success);
  opacity: 1;
}

.pc-arrow {
  font-size: 12px;
  color: var(--km-text);
  opacity: 0.5;
  transition: transform 0.2s;
  transform: rotate(-90deg);
}

.pc-arrow-open {
  transform: rotate(0deg);
}

.pc-body {
  padding: 0 16px 12px;
  border-top: 1px solid var(--km-border);
}
</style>
