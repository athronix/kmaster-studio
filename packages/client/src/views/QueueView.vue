<script setup lang="ts">
// F17 队列整页：与聊天页 QueueTray 共用 chat store 的 queueBySession 数据源。
// 语义（R-M4-5）：server 重启不自动续发；冲刷入口 = 本页/托盘「立即发送」或该会话下次 run 结束后的自然出队。
import { computed, onMounted, ref } from 'vue';
import { NButton, NSpin, NTag, NPopconfirm, NAlert, useMessage } from 'naive-ui';
import { useRouter } from 'vue-router';
import { useChatStore } from '../stores/chat';
import PageHeader from '../components/layout/PageHeader.vue';
import EmptyState from '../components/common/EmptyState.vue';
import type { QueueItem } from '../types/chat';

const store = useChatStore();
const router = useRouter();
const message = useMessage();
const loading = ref(false);
const loadError = ref<string | null>(null);

interface SessionGroup {
  session_id: string;
  title: string;
  items: QueueItem[];
}

const groups = computed<SessionGroup[]>(() =>
  Object.entries(store.queueBySession)
    .filter(([, items]) => items.length > 0)
    .map(([session_id, items]) => ({
      session_id,
      title: store.sessions.find((s) => s.id === session_id)?.title || session_id,
      items: [...items].sort((a, b) => a.position - b.position),
    }))
);
const total = computed(() => store.queuedTotal);

async function reload() {
  loading.value = true;
  loadError.value = null;
  try {
    await Promise.allSettled([store.loadQueue(), store.loadSessions()]);
  } catch (e: any) {
    loadError.value = String(e?.message ?? e);
  } finally {
    loading.value = false;
  }
}

async function remove(item: QueueItem) {
  try {
    await store.removeQueueItem(item.id);
    message.success('已移除排队消息');
  } catch (e: any) {
    message.error(String(e?.message ?? e));
  }
}

async function sendNow(item: QueueItem) {
  try {
    const res = await store.sendQueueItemNow(item.id);
    if (res.started) message.success(res.note);
    else message.warning(res.note);
  } catch (e: any) {
    message.error(String(e?.message ?? e));
  }
}

function openSession(sid: string) {
  store.openSession(sid).catch(() => {});
  router.push('/');
}

function fmt(ts: number): string {
  return ts ? new Date(ts).toLocaleString() : '—';
}

onMounted(reload);
</script>

<template>
  <section class="km-page">
    <PageHeader title="队列" :show-search="false">
      <template #actions>
        <n-tag :bordered="false" type="info">待发送 {{ total }}</n-tag>
        <n-button size="small" @click="reload">刷新</n-button>
      </template>
    </PageHeader>

    <n-spin :show="loading">
      <n-alert
        v-if="loadError"
        type="error"
        :title="loadError"
        closable
        @close="loadError = null"
      />
      <EmptyState
        v-if="!groups.length"
        icon="Clock"
        title="队列为空"
        description="暂无待处理的定时任务"
      />
      <div v-for="g in groups" :key="g.session_id" class="km-qgroup">
        <h3 class="km-qgroup-title">
          <span class="km-qgroup-name">{{ g.title }}</span>
          <n-tag size="tiny" :bordered="false">{{ g.items.length }} 条</n-tag>
          <n-button size="tiny" tertiary @click="openSession(g.session_id)">打开会话</n-button>
        </h3>
        <ol class="km-qlist">
          <li v-for="item in g.items" :key="item.id" class="km-qitem">
            <span class="km-qpos">#{{ item.position }}</span>
            <div class="km-qbody">
              <p class="km-qmsg">{{ item.message }}</p>
              <span class="km-qmeta">
                {{ fmt(item.created_at) }}
                <template v-if="item.model"> · 模型 {{ item.model }}</template>
                <template v-if="item.mode"> · 模式 {{ item.mode }}</template>
              </span>
            </div>
            <div class="km-qactions">
              <n-button size="tiny" type="primary" tertiary @click="sendNow(item)">立即发送</n-button>
              <n-popconfirm @positive-click="remove(item)">
                <template #trigger>
                  <n-button size="tiny" tertiary type="error">删除</n-button>
                </template>
                确认移除这条排队消息？
              </n-popconfirm>
            </div>
          </li>
        </ol>
      </div>
    </n-spin>
  </section>
</template>

<style scoped>
.km-page { height: 100%; overflow: auto; padding: 0 var(--km-space-2xl) var(--km-space-40); }
.km-qgroup { margin-bottom: 22px; }
.km-qgroup-title { display: flex; align-items: center; gap: var(--km-space-sm); font-size: var(--km-font-sm); margin: 0 0 var(--km-space-sm); }
.km-qgroup-name { font-weight: 600; }
.km-qlist { list-style: none; margin: 0; padding: 0; border: 1px solid var(--km-border); border-radius: var(--km-radius-lg); overflow: hidden; }
.km-qitem {
  display: flex;
  gap: var(--km-space-md);
  align-items: flex-start;
  padding: var(--km-space-10) var(--km-space-14);
  border-bottom: 1px solid var(--km-border);
}
.km-qitem:last-child { border-bottom: none; }
.km-qpos { font-size: var(--km-font-xs); opacity: 0.45; min-width: 26px; padding-top: var(--km-space-2xs); }
.km-qbody { flex: 1; min-width: 0; }
.km-qmsg { margin: 0; font-size: var(--km-font-sm); line-height: 1.6; white-space: pre-wrap; word-break: break-word; }
.km-qmeta { font-size: var(--km-font-xs); opacity: 0.45; }
.km-qactions { display: flex; gap: var(--km-space-6); flex: 0 0 auto; }
</style>
