<script setup lang="ts">
// 聊天页快捷设置抽屉：只管「默认模式 / 默认模型」两项高频配置。
// M5/F21：完整设置（通用 / Provider / Profile / 技能 / MCP / 诊断）迁到 /settings 整页，
// 此处保留原有全部能力不变，仅在底部补一个跳转入口，🚫 不删任何既有功能。
import { ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { NDrawer, NDrawerContent, NButton, NSelect, useMessage } from 'naive-ui';
import KIcon from '../common/KIcon.vue';
import { useChatStore } from '../../stores/chat';
import { CHAT_MODES, type HermesMode } from '../../types/chat';

const props = defineProps<{ show: boolean }>();
const emit = defineEmits<{ 'update:show': [boolean] }>();
const store = useChatStore();
const message = useMessage();
const router = useRouter();

const modeOptions = CHAT_MODES.map((m) => ({ label: `${m.label} · ${m.desc}`, value: m.token }));
const modelOptions = () =>
  store.models.flatMap((g) => g.models.map((m) => ({ label: m.name || m.id, value: m.id })));

const localMode = ref<HermesMode>('default');
const localModel = ref<string>('');

function open() {
  store.loadGlobalSettings().catch(() => {});
  store.loadModels().catch(() => {});
  localMode.value = store.globalSettings.default_mode;
  localModel.value = store.globalSettings.default_model ?? '';
}
watch(() => props.show, (v) => { if (v) open(); }, { immediate: true });

async function save() {
  try {
    await store.setGlobalSettings(localMode.value, localModel.value);
    message.success('已保存全局默认设置');
    emit('update:show', false);
  } catch (e: any) {
    message.error(`保存失败：${e?.message ?? e}`);
  }
}

/** 跳转设置整页；先关抽屉再导航，避免遮罩残留在新页面上。 */
function openFullSettings() {
  emit('update:show', false);
  void router.push('/settings');
}
</script>

<template>
  <n-drawer :show="show" placement="right" :width="380" @update:show="(v: boolean) => emit('update:show', v)">
    <n-drawer-content title="全局设置" :native-scrollbar="false">
      <div class="set-row">
        <div class="set-label">默认模式</div>
        <n-select
          v-model:value="localMode"
          :options="modeOptions"
          placeholder="选择默认模式"
        />
        <div class="set-hint">新会话将继承此模式（Craft 最自主 / Ask 最保守）</div>
      </div>

      <div class="set-row">
        <div class="set-label">默认模型</div>
        <n-select
          v-model:value="localModel"
          :options="modelOptions()"
          filterable
          clearable
          placeholder="选择默认模型"
        />
        <div class="set-hint">留空则使用 hermes 当前激活模型</div>
      </div>

      <n-button type="primary" block @click="save">保存</n-button>

      <div class="set-more">
        <n-button text type="primary" @click="openFullSettings">更多设置 <KIcon name="ArrowRight" :size="14" /></n-button>
        <div class="set-hint">主题、API Key、Profile、技能、MCP 与诊断信息在设置整页中管理</div>
      </div>
    </n-drawer-content>
  </n-drawer>
</template>

<style scoped>
.set-row { margin-bottom: 18px; }
.set-label { font-size: 13px; font-weight: 600; margin-bottom: 6px; }
.set-hint { font-size: 11px; opacity: 0.55; margin-top: 6px; }
.set-more { margin-top: 18px; padding-top: 14px; border-top: 1px solid var(--km-border); }
</style>
