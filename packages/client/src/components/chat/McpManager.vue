<script setup lang="ts">
import { ref, watch } from 'vue';
import { NDrawer, NDrawerContent, NButton, NInput, NEmpty, NTag, useMessage } from 'naive-ui';
import KIcon from '../common/KIcon.vue';
import { useChatStore } from '../../stores/chat';

const props = defineProps<{ show: boolean }>();
const emit = defineEmits<{ 'update:show': [boolean] }>();
const store = useChatStore();
const message = useMessage();

const name = ref('');
const command = ref('');
const argsText = ref('');   // 每行 / 空格分隔一个参数
const envText = ref('');    // 每行 KEY=VALUE

function open() {
  store.loadMcp().catch(() => {});
}
watch(() => props.show, (v) => { if (v) open(); });

function parseArgs(): string[] {
  return argsText.value
    .split(/[\n\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}
function parseEnv(): Record<string, string> | undefined {
  const lines = envText.value.split('\n').map((s) => s.trim()).filter(Boolean);
  if (!lines.length) return undefined;
  const out: Record<string, string> = {};
  for (const l of lines) {
    const idx = l.indexOf('=');
    if (idx > 0) out[l.slice(0, idx)] = l.slice(idx + 1);
  }
  return out;
}

async function add() {
  if (!name.value.trim() || !command.value.trim()) {
    message.warning('name 与 command 必填');
    return;
  }
  try {
    await store.addMcp({
      name: name.value.trim(),
      command: command.value.trim(),
      args: parseArgs(),
      env: parseEnv(),
    });
    message.success(`已添加 ${name.value.trim()}，hermes 将自动 reload`);
    name.value = ''; command.value = ''; argsText.value = ''; envText.value = '';
  } catch (e: any) {
    message.error(`添加失败：${e?.message ?? e}`);
  }
}

async function remove(name: string) {
  try {
    await store.removeMcp(name);
    message.success(`已移除 ${name}`);
  } catch (e: any) {
    message.error(`移除失败：${e?.message ?? e}`);
  }
}
</script>

<template>
  <n-drawer :show="show" placement="right" :width="440" @update:show="(v: boolean) => emit('update:show', v)">
    <n-drawer-content title="MCP 连接器" :native-scrollbar="false">
      <n-button size="small" secondary type="primary" block @click="store.loadMcp().catch(() => {})"><template #icon><KIcon name="Refresh" :size="14" /></template>重新加载列表</n-button>

      <div class="mcp-list">
        <n-empty v-if="!store.mcpServers.length" description="暂无 MCP 连接器" />
        <div v-for="s in store.mcpServers" :key="s.name" class="mcp-item">
          <div class="mcp-head">
            <span class="mcp-name">{{ s.name }}</span>
            <n-tag size="tiny" :type="s.status === 'error' ? 'error' : (s.status === 'connected' ? 'success' : 'default')">
              {{ s.status ?? 'unknown' }}
            </n-tag>
          </div>
          <div class="mcp-meta">{{ s.command }}<span v-if="s.args?.length"> {{ s.args.join(' ') }}</span></div>
          <div class="mcp-foot">
            <span v-if="typeof s.tools === 'number'" class="mcp-tools">{{ s.tools }} tools</span>
            <n-button size="small" type="error" tertiary @click="remove(s.name)">移除</n-button>
          </div>
        </div>
      </div>

      <div class="mcp-form">
        <div class="mcp-form-title">添加连接器（写入 ~/.hermes/config.yaml 的 mcp_servers）</div>
        <n-input v-model:value="name" placeholder="name（唯一标识）" size="small" />
        <n-input v-model:value="command" placeholder="command（如 npx / python）" size="small" />
        <n-input v-model:value="argsText" type="textarea" placeholder="args：每行或空格分隔一个参数" :autosize="{ minRows: 2, maxRows: 4 }" size="small" />
        <n-input v-model:value="envText" type="textarea" placeholder="env（可选）：每行 KEY=VALUE" :autosize="{ minRows: 1, maxRows: 3 }" size="small" />
        <n-button type="primary" block @click="add"><template #icon><KIcon name="Plus" :size="16" /></template>添加</n-button>
      </div>
    </n-drawer-content>
  </n-drawer>
</template>

<style scoped>
.mcp-list { display: flex; flex-direction: column; gap: var(--km-space-10); margin: var(--km-space-md) 0; }
.mcp-item { border: 1px solid var(--km-border); border-radius: var(--km-radius-lg); padding: var(--km-space-10) var(--km-space-md); background: var(--km-panel); }
.mcp-head { display: flex; align-items: center; justify-content: space-between; gap: var(--km-space-sm); }
.mcp-name { font-weight: 600; font-size: var(--km-font-base); }
.mcp-meta { font-size: var(--km-font-sm); opacity: 0.7; margin: var(--km-space-6) 0; word-break: break-all; }
.mcp-foot { display: flex; align-items: center; justify-content: space-between; }
.mcp-tools { font-size: var(--km-font-xs); opacity: 0.6; }
.mcp-form { display: flex; flex-direction: column; gap: var(--km-space-sm); border-top: 1px solid var(--km-border); padding-top: var(--km-space-md); }
.mcp-form-title { font-size: var(--km-font-sm); font-weight: 600; }
</style>
