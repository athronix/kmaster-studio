<script setup lang="ts">
// F21「通用」分组：主题（♻️ styles/theme.ts 的 useTheme）/ 语言 / 默认工作目录 / 日志。
// 数据来源 ♻️ GET/PUT /api/settings（M3 既有端点，M5 仅扩展字段，🚫 未新建端点）。
// 主题为「即时生效 + 后台持久化」：切换先改 UI，再写库；写失败只提示不回滚，避免视觉抖动。
// V4：界面语言切换已生效（zh-CN / en），通过 useI18n composable 驱动。
//
// V3 T4 / S4.5 增量：
//   ① 默认工作目录支持「原生目录选择器 + 文本输入兜底」（桌面端 pickFolder，Web 端手填）；
//   ② 内嵌 LogSection（R-26），点击日志行弹出 LogDetailDialog（R-27）。
import { onMounted, ref } from 'vue';
import { NSwitch, NSelect, NInput, NInputNumber, NButton, NSpin, useMessage } from 'naive-ui';
import { getSettings, putSettings } from '../../api/client';
import { useTheme } from '../../styles/theme';
import { useChatStore } from '../../stores/chat';
import { useI18n, type LocaleCode } from '../../composables/useI18n';
import { hasFileSystemBridge, pickFolder } from '../../utils/desktop-bridge';
import DirPickerModal from '../common/DirPickerModal.vue';
import LogSection from './LogSection.vue';
import LogDetailDialog from '../dialog/LogDetailDialog.vue';
import type { LogEntry } from '../../types/settings';

const theme = useTheme();
const message = useMessage();
const store = useChatStore();
const { t, locale, setLocale } = useI18n();

const LOCALE_OPTIONS = [
  { label: t('locale.zh-CN'), value: 'zh-CN' as LocaleCode },
  { label: t('locale.en'), value: 'en' as LocaleCode },
];

const loading = ref(false);
const savingCwd = ref(false);
const terminalCwd = ref('');
/** 服务端已持久化的 cwd，用于判定「有未保存改动」 */
const savedCwd = ref('');

// —— T01：发送快捷键 & 市场卡片列数 ——
const SEND_SHORTCUT_OPTIONS = [
  { label: 'Enter', value: 'Enter' },
  { label: 'Ctrl+Enter', value: 'Ctrl+Enter' },
];
const sendShortcut = ref<string>(localStorage.getItem('km_send_shortcut') || 'Enter');
const gridCols = ref<number>(Number(localStorage.getItem('km_grid_cols')) || 5);

function onSendShortcutChange(value: string): void {
  sendShortcut.value = value;
  localStorage.setItem('km_send_shortcut', value);
}

function onGridColsChange(value: number | null): void {
  const v = (value ?? 5);
  gridCols.value = v;
  localStorage.setItem('km_grid_cols', String(v));
}

/** 日志详情弹窗状态 */
const logDetailShow = ref(false);
const logDetailEntry = ref<LogEntry | null>(null);

/** 拉取一次全局设置并回填通用配置。 */
async function load(): Promise<void> {
  loading.value = true;
  try {
    const settings = await getSettings();
    if (settings.theme === 'dark' || settings.theme === 'light') {
      theme.isDark.value = settings.theme === 'dark';
    }
    // V4：从服务端恢复语言偏好，若已持久化则同步到 useI18n
    const serverLocale = settings.locale;
    if (serverLocale === 'zh-CN' || serverLocale === 'en') {
      if (serverLocale !== locale.locale) setLocale(serverLocale as LocaleCode);
    }
    terminalCwd.value = settings.terminal_cwd ?? '';
    savedCwd.value = terminalCwd.value;
  } catch (err) {
    message.error(`通用设置加载失败：${String((err as Error)?.message ?? err)}`);
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void load();
});

/** 主题切换：先改 UI（即时生效），再持久化到 settings 表（刷新后保持）。 */
async function onThemeChange(value: boolean): Promise<void> {
  theme.isDark.value = value;
  try {
    await putSettings({ theme: value ? 'dark' : 'light' });
    await store.loadGlobalSettings();
  } catch (err) {
    message.warning(`主题已切换，但持久化失败：${String((err as Error)?.message ?? err)}`);
  }
}

/** V4：语言切换生效 — 即时切换 UI 文案 + 持久化到服务端 */
async function onLocaleChange(value: LocaleCode): Promise<void> {
  setLocale(value);
  try {
    await putSettings({ locale: value });
    await store.loadGlobalSettings();
  } catch (err) {
    message.error(`语言保存失败：${String((err as Error)?.message ?? err)}`);
  }
}

/** 默认工作目录（FR20.6）：留空表示交由后端探测用户主目录。 */
async function saveCwd(): Promise<void> {
  savingCwd.value = true;
  try {
    const settings = await putSettings({ terminal_cwd: terminalCwd.value.trim() });
    savedCwd.value = settings.terminal_cwd ?? '';
    terminalCwd.value = savedCwd.value;
    await store.loadGlobalSettings();
    message.success(t('settings.saved'));
  } catch (err) {
    message.error(`保存失败：${String((err as Error)?.message ?? err)}`);
  } finally {
    savingCwd.value = false;
  }
}

/** S4.5：桌面端调原生目录选择器；Web 端用 DirPickerModal。 */
const dirPickerShow = ref(false);

async function onPickWorkspace(): Promise<void> {
  if (hasFileSystemBridge()) {
    const picked = await pickFolder();
    if (picked === null) {
      message.warning('请在输入框中直接填写绝对路径');
      return;
    }
    terminalCwd.value = picked;
    await saveCwd();
  } else {
    dirPickerShow.value = true;
  }
}

function onDirSelected(path: string): void {
  dirPickerShow.value = false;
  terminalCwd.value = path;
  void saveCwd();
}

function onLogDetail(entry: LogEntry): void {
  logDetailEntry.value = entry;
  logDetailShow.value = true;
}
</script>

<template>
  <n-spin :show="loading">
    <div class="sec-body">
      <div class="sec-row">
        <div class="sec-label">{{ t('settings.theme') }}</div>
        <div class="sec-control">
          <n-switch :value="theme.isDark.value" @update:value="onThemeChange">
            <template #checked>{{ t('settings.themeDark') }}</template>
            <template #unchecked>{{ t('settings.themeLight') }}</template>
          </n-switch>
        </div>
        <div class="sec-hint">与左栏底部的主题按钮同源，切换即时生效并在刷新后保持</div>
      </div>

      <div class="sec-row">
        <div class="sec-label">{{ t('settings.locale') }}</div>
        <div class="sec-control">
          <n-select
            :value="locale.locale"
            :options="LOCALE_OPTIONS"
            style="max-width: 240px"
            @update:value="onLocaleChange"
          />
        </div>
        <div class="sec-hint">{{ t('settings.localeHint') }}</div>
      </div>

      <div class="sec-row">
        <div class="sec-label">发送快捷键</div>
        <div class="sec-control">
          <n-select
            :value="sendShortcut"
            :options="SEND_SHORTCUT_OPTIONS"
            style="max-width: 240px"
            @update:value="onSendShortcutChange"
          />
        </div>
        <div class="sec-hint">按下此键发送消息；选择 Ctrl+Enter 时 Enter 仅换行</div>
      </div>

      <div class="sec-row">
        <div class="sec-label">市场卡片列数</div>
        <div class="sec-control">
          <n-input-number
            :value="gridCols"
            :min="3"
            :max="8"
            :step="1"
            style="max-width: 160px"
            @update:value="onGridColsChange"
          />
        </div>
        <div class="sec-hint">调整 Agent/Skill/MCP 市场页的卡片列数（3-8），刷新后生效</div>
      </div>

      <div class="sec-row">
        <div class="sec-label">默认工作目录</div>
        <div class="sec-control sec-inline">
          <n-input
            v-model:value="terminalCwd"
            :placeholder="t('settings.cwdPlaceholder')"
            clearable
          />
          <n-button
            tertiary
            @click="onPickWorkspace"
          >选择目录…</n-button>
          <n-button
            type="primary"
            :loading="savingCwd"
            :disabled="terminalCwd.trim() === savedCwd"
            @click="saveCwd"
          >{{ t('settings.save') }}</n-button>
        </div>
        <div class="sec-hint">
          新建会话与内置终端的默认落点。桌面端可点「选择目录…」调用系统选择器，
          Web 端直接填写绝对路径即可；留空则交由后端探测用户主目录。
        </div>
      </div>

      <!-- ── 日志（R-26 / R-27） ── -->
      <div class="sec-row sec-row-block">
        <div class="sec-label">日志</div>
        <LogSection embedded :max-height="360" @open-detail="onLogDetail" />
      </div>
    </div>

    <LogDetailDialog
      v-model:show="logDetailShow"
      :entry="logDetailEntry"
    />

    <DirPickerModal
      :show="dirPickerShow"
      :initial-path="terminalCwd"
      @select="onDirSelected"
      @close="dirPickerShow = false"
    />
  </n-spin>
</template>

<style scoped>
.sec-body { display: flex; flex-direction: column; gap: var(--km-space-xl); }
.sec-row { display: flex; flex-direction: column; gap: var(--km-space-6); }
.sec-row-block { gap: var(--km-space-10); padding-top: var(--km-space-sm); border-top: 1px solid var(--km-border); }
.sec-label { font-size: var(--km-font-sm); font-weight: 600; }
.sec-control { max-width: 520px; }
.sec-inline { display: flex; gap: var(--km-space-sm); align-items: center; max-width: 640px; }
.sec-hint { font-size: var(--km-font-xs); opacity: 0.55; line-height: 1.7; }
</style>
