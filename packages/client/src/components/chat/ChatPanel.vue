<script setup lang="ts">
/**
 * ChatPanel — 聊天主面板（T04 适配）。
 *
 * 改造内容：
 * - 移除内联 `<header>`（已迁入 ChatView PageHeader）；
 * - 消息区 flex: 1 / min-height: 0 确保撑满；
 * - 透传 `search` prop 给 MessageList 做对话内定位。
 */
import { computed } from 'vue';
import { NSpin } from 'naive-ui';
import { useChatStore } from '../../stores/chat';
import { useI18n } from '../../composables/useI18n';
import MessageList from './MessageList.vue';
import ChatInput from './ChatInput.vue';

const props = withDefaults(
  defineProps<{
    /** 对话内搜索关键词（来自 ChatView PageHeader 搜索框，命中后滚动定位）。 */
    search?: string;
    /** 发送模式：透传到 ChatInput。 */
    sendMode?: 'interrupt' | 'steer' | 'queue';
  }>(),
  {
    search: '',
    sendMode: 'queue',
  },
);

const store = useChatStore();
const { t } = useI18n();
const sid = computed(() => store.activeSessionId);
</script>

<template>
  <main class="km-chat">
    <!-- 加载态 -->
    <n-spin v-if="!store.socketReady" class="km-chat-loading">
      <template #description>{{ t('chat.connecting') }}</template>
    </n-spin>
    <template v-else>
      <div class="km-chat-messages">
        <MessageList :search="search" :agent-filter="store.activeAgentId" />
      </div>
      <ChatInput :send-mode="sendMode" />
    </template>
  </main>
</template>

<style scoped>
.km-chat {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
  flex: 1;
}

/* 消息区：撑满剩余空间 */
.km-chat-messages {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 加载态 */
.km-chat-loading {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
