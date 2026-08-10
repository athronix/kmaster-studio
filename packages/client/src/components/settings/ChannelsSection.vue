<script setup lang="ts">
/**
 * ChannelsSection — 设置 → 渠道管理（T03 重写）。
 *
 * 固定 10 个平台列表（与 hermes 一致），每个平台使用 PlatformCard + SettingRow。
 * 凭据字段走内联输入（🔒 只写不回显），配置开关持久化到 localStorage。
 * API：getPlatformConfig() / savePlatformConfig()。
 *
 * Emits:
 *   open-detail(entity) — 点击展开详情面板（保留兼容）
 */
import { computed, onMounted, reactive, ref } from 'vue';
import {
  NButton,
  NInput,
  NSpin,
  NSwitch,
  useMessage,
} from 'naive-ui';
import PlatformCard from './PlatformCard.vue';
import SettingRow from './SettingRow.vue';
import { getPlatformConfig, savePlatformConfig, errText } from '../../api/client';
import type { PlatformChannelConfig, PlatformChannelType } from '../../types/chat';

// ═══════════════════════ Props + Emits ═══════════════════════

const props = withDefaults(
  defineProps<{
    search?: string;
  }>(),
  { search: '' },
);

const emit = defineEmits<{
  'open-detail': [entity: PlatformChannelConfig];
}>();

const message = useMessage();

// ═══════════════════════ 固定 10 平台定义 ═══════════════════════

interface PlatformDef {
  key: string;
  name: string;
  icon: string;
}

const PLATFORMS: PlatformDef[] = [
  {
    key: 'telegram',
    name: 'Telegram',
    icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>',
  },
  {
    key: 'discord',
    name: 'Discord',
    icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189z"/></svg>',
  },
  {
    key: 'slack',
    name: 'Slack',
    icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zm10.122 0a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V5.042zm-1.27 0a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zm0-1.27a2.527 2.527 0 0 1 2.523-2.52h6.313A2.528 2.528 0 0 1 24 18.956a2.528 2.528 0 0 1-2.522 2.523h-6.313z"/></svg>',
  },
  {
    key: 'whatsapp',
    name: 'WhatsApp',
    icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>',
  },
  {
    key: 'matrix',
    name: 'Matrix',
    icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M.632.55v22.9H2.28V24H0V0h2.28v.55zm7.043 7.26v1.157h.033c.309-.443.683-.784 1.117-1.024.433-.245.936-.365 1.5-.365.54 0 1.033.107 1.48.324.448.217.786.619 1.017 1.205.24-.376.558-.702.956-.98.398-.277.872-.414 1.424-.414.41 0 .784.065 1.122.194.34.13.629.325.87.588.241.263.428.59.56.984.132.393.198.85.198 1.368v5.89h-2.49v-4.893c0-.268-.016-.525-.048-.77a1.627 1.627 0 00-.2-.63 1.028 1.028 0 00-.392-.426 1.294 1.294 0 00-.616-.134c-.277 0-.508.05-.693.15a1.043 1.043 0 00-.43.41 1.768 1.768 0 00-.214.616 4.15 4.15 0 00-.06.74v4.937H9.29v-4.937c0-.25-.01-.498-.032-.742a1.84 1.84 0 00-.166-.638.998.998 0 00-.363-.448 1.206 1.206 0 00-.624-.154c-.26 0-.483.048-.67.144a1.055 1.055 0 00-.436.402 1.744 1.744 0 00-.227.616 4.108 4.108 0 00-.063.74v4.937H5.21V7.81zm15.693 15.64V.55H21.72V0H24v24h-2.28v-.55z"/></svg>',
  },
  {
    key: 'feishu',
    name: 'Feishu',
    icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6.59 3.41a2.25 2.25 0 0 1 3.182 0L13.5 7.14l-3.182 3.182L6.59 7.59a2.25 2.25 0 0 1 0-3.182zm5.303 5.303L15.075 5.53a2.25 2.25 0 0 1 3.182 3.182L15.075 11.894 11.893 8.713zM3.41 6.59a2.25 2.25 0 0 1 3.182 0l3.182 3.182-3.182 3.182a2.25 2.25 0 0 1-3.182-3.182L3.41 6.59zm5.303 5.303L11.894 15.075a2.25 2.25 0 0 1-3.182 3.182L5.53 15.075 8.713 11.893zm5.303-5.303L17.478 9.778a2.25 2.25 0 0 1-3.182 3.182L10.53 10.075l3.182-3.182 0 .023z"/></svg>',
  },
  {
    key: 'dingtalk',
    name: 'DingTalk',
    icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19.76 7.05c-.23-.52-.7-.9-1.26-1.02L5.35 3.2c-.77-.16-1.51.38-1.58 1.16-.22 2.55.17 5.4 1.13 7.66.97 2.29 2.52 4.11 4.45 4.82l-1.28 3.03c-.17.4.24.79.63.59l9.47-4.83c.34-.17.55-.52.55-.9v-3.12c.73-.4 1.22-1.17 1.22-2.06 0-.87-.08-1.73-.18-2.5zm-3.66 5.95-5.19 2.65.76-1.8c.12-.29-.03-.62-.33-.72-2.1-.73-3.56-3.54-3.95-6.73l9.27 2c.04.38.07.76.07 1.15 0 .45-.36.81-.81.81h-2.79c-.35 0-.63.28-.63.63s.28.63.63.63h2.97V13z"/></svg>',
  },
  {
    key: 'qqbot',
    name: 'QQBot',
    icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C7.58 2 4 5.27 4 9.31c0 2.3 1.15 4.34 2.95 5.68-.13.58-.48 1.62-1.26 2.53-.24.28-.05.72.32.73 1.72.05 3.02-.68 3.69-1.15.72.16 1.49.25 2.3.25 4.42 0 8-3.27 8-7.31S16.42 2 12 2zm-3.2 7.63c-.63 0-1.14-.55-1.14-1.23s.51-1.23 1.14-1.23 1.14.55 1.14 1.23-.51 1.23-1.14 1.23zm6.4 0c-.63 0-1.14-.55-1.14-1.23s.51-1.23 1.14-1.23 1.14.55 1.14 1.23-.51 1.23-1.14 1.23zM5.5 20.5a.5.5 0 0 1 .5-.5h12a.5.5 0 0 1 0 1H6a.5.5 0 0 1-.5-.5z"/></svg>',
  },
  {
    key: 'weixin',
    name: 'Weixin',
    icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 01.213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 00.167-.054l1.903-1.114a.864.864 0 01.717-.098 10.16 10.16 0 002.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 01-1.162 1.178A1.17 1.17 0 014.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 01-1.162 1.178 1.17 1.17 0 01-1.162-1.178c0-.651.52-1.18 1.162-1.18zm3.68 4.025c-3.694 0-6.69 2.462-6.69 5.496 0 3.034 2.996 5.496 6.69 5.496.753 0 1.477-.1 2.158-.28a.66.66 0 01.548.074l1.46.854a.25.25 0 00.127.041.224.224 0 00.221-.225c0-.055-.022-.109-.037-.162l-.298-1.131a.453.453 0 01.163-.509C21.81 18.613 22.77 16.973 22.77 15.512c0-3.034-2.996-5.496-6.69-5.496h.198zm-2.454 3.347c.491 0 .889.404.889.902a.896.896 0 01-.889.903.896.896 0 01-.889-.903c0-.498.398-.902.889-.902zm4.912 0c.491 0 .889.404.889.902a.896.896 0 01-.889.903.896.896 0 01-.889-.903c0-.498.398-.902.889-.902z"/></svg>',
  },
  {
    key: 'wecom',
    name: 'WeCom',
    icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 01.213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 00.167-.054l1.903-1.114a.864.864 0 01.717-.098 10.16 10.16 0 002.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 01-1.162 1.178A1.17 1.17 0 014.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 01-1.162 1.178 1.17 1.17 0 01-1.162-1.178c0-.651.52-1.18 1.162-1.18z"/></svg>',
  },
];

// ═══════════════════════ State ═══════════════════════

const loading = ref(false);
const error = ref('');

/** 服务端返回的渠道列表，按 type 索引。 */
const channelMap = ref<Record<string, PlatformChannelConfig>>({});

/** 本地凭据编辑草稿：key = 平台名，value = { 凭据键: 值 }。 */
const credentialDrafts = reactive<Record<string, Record<string, string>>>({});

/** 配置开关草稿（持久化到 localStorage）：key = 平台名，value = { 配置键: 值 }。 */
const configDrafts = reactive<Record<string, Record<string, string>>>({});

/** 凭据草稿是否有修改标记。 */
const touchedCredentials = reactive<Record<string, boolean>>({});

/** 配置开关是否有修改标记。 */
const touchedConfig = reactive<Record<string, boolean>>({});

const saving = reactive<Record<string, boolean>>({});
const clearing = reactive<Record<string, boolean>>({});

const LS_CONFIG_KEY = 'km.v3.platformConfig';

// ═══════════════════════ Helpers ═══════════════════════

function cloneObj<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj ?? {}));
}

function isEmptyObj(obj: Record<string, unknown> | undefined): boolean {
  if (!obj) return true;
  return Object.keys(obj).length === 0;
}

function getChannel(type: string): PlatformChannelConfig | undefined {
  return channelMap.value[type];
}

/** 构造传给 PlatformCard 的 credentials 对象（仅凭据部分，不含 cfg_ 前缀）。 */
function cardCredentials(platformKey: string): Record<string, any> {
  const ch = getChannel(platformKey);
  if (!ch) return {};
  const creds: Record<string, any> = {};
  for (const key of (ch.configuredKeys ?? [])) {
    creds[key] = ch.maskedKeys?.[key] ?? '***';
  }
  // 合并本地草稿中已填写的凭据
  const draft = credentialDrafts[platformKey];
  if (draft) {
    for (const [k, v] of Object.entries(draft)) {
      if (v) creds[k] = v;
    }
  }
  // Matrix 特殊：构造 extra 子对象
  if (platformKey === 'matrix') {
    const extra: Record<string, any> = {};
    if (creds.homeserver) extra.homeserver = creds.homeserver;
    if (creds.user_id) extra.user_id = creds.user_id;
    if (creds.password) extra.password = creds.password;
    if (!isEmptyObj(extra)) creds.extra = extra;
  }
  return creds;
}

/** 构造传给 PlatformCard 的 config 对象。 */
function cardConfig(platformKey: string): Record<string, any> {
  return { ...configDrafts[platformKey] };
}

/** 凭据是否有修改。 */
function hasCredentialChanges(platformKey: string): boolean {
  return !!touchedCredentials[platformKey];
}

/** 配置是否有修改。 */
function hasConfigChanges(platformKey: string): boolean {
  return !!touchedConfig[platformKey];
}

/** 任一有修改。 */
function hasUnsavedChanges(platformKey: string): boolean {
  return hasCredentialChanges(platformKey) || hasConfigChanges(platformKey);
}

/** 是否有已存储的凭据（用于「清除凭据」按钮禁用判断）。 */
function hasStoredCredentials(platformKey: string): boolean {
  const ch = getChannel(platformKey);
  if (!ch) return false;
  return (ch.configuredKeys?.length ?? 0) > 0;
}

// ═══════════════════════ Config 持久化 ═══════════════════════

function loadConfigDrafts(): void {
  try {
    const raw = localStorage.getItem(LS_CONFIG_KEY);
    const parsed: Record<string, Record<string, string>> = raw ? JSON.parse(raw) : {};
    for (const p of PLATFORMS) {
      configDrafts[p.key] = cloneObj(parsed[p.key] ?? {});
      touchedConfig[p.key] = false;
    }
  } catch {
    for (const p of PLATFORMS) {
      configDrafts[p.key] = {};
      touchedConfig[p.key] = false;
    }
  }
}

function saveConfigDraftsToStorage(): void {
  const out: Record<string, Record<string, string>> = {};
  for (const p of PLATFORMS) {
    if (configDrafts[p.key] && !isEmptyObj(configDrafts[p.key])) {
      out[p.key] = { ...configDrafts[p.key] };
    }
  }
  localStorage.setItem(LS_CONFIG_KEY, JSON.stringify(out));
}

// ═══════════════════════ API ═══════════════════════

async function load(): Promise<void> {
  loading.value = true;
  error.value = '';
  try {
    const res = await getPlatformConfig();
    const map: Record<string, PlatformChannelConfig> = {};
    for (const ch of res.channels ?? []) {
      map[ch.type] = ch;
    }
    channelMap.value = map;

    // 初始化凭据草稿（空值，因为 GET 不回显明文）
    for (const p of PLATFORMS) {
      if (!credentialDrafts[p.key] || !touchedCredentials[p.key]) {
        credentialDrafts[p.key] = {};
        touchedCredentials[p.key] = false;
      }
    }
  } catch (e: unknown) {
    error.value = errText(e, '加载渠道列表失败');
  } finally {
    loading.value = false;
  }
}

/**
 * 构造全量渠道数组用于 PUT。
 * 只包含有凭据或配置开关的平台。
 */
function buildAllChannels(): PlatformChannelConfig[] {
  const result: PlatformChannelConfig[] = [];
  for (const p of PLATFORMS) {
    const existing = getChannel(p.key);
    const creds: Record<string, string> = {};

    // 保留已有的凭据键（留空表示不修改）
    if (existing?.configuredKeys) {
      for (const k of existing.configuredKeys) {
        creds[k] = '';
      }
    }
    // 合并本地草稿
    const draft = credentialDrafts[p.key];
    if (draft) {
      for (const [k, v] of Object.entries(draft)) {
        creds[k] = v;
      }
    }
    // 合并配置开关（用 cfg: 前缀）
    const cfgDraft = configDrafts[p.key];
    if (cfgDraft) {
      for (const [k, v] of Object.entries(cfgDraft)) {
        creds[`cfg:${k}`] = v;
      }
    }

    result.push({
      id: existing?.id ?? p.key,
      type: p.key as PlatformChannelType,
      enabled: existing?.enabled ?? true,
      ...(!isEmptyObj(creds) ? { credentials: creds } : {}),
    });
  }
  return result;
}

async function savePlatform(platformKey: string): Promise<void> {
  saving[platformKey] = true;
  try {
    const allChannels = buildAllChannels();
    const res = await savePlatformConfig(allChannels);

    // 更新本地状态
    const map: Record<string, PlatformChannelConfig> = {};
    for (const ch of res.channels ?? allChannels) {
      map[ch.type] = ch;
    }
    channelMap.value = map;

    // 保存配置开关到 localStorage
    saveConfigDraftsToStorage();

    // 清除草稿
    credentialDrafts[platformKey] = {};
    touchedCredentials[platformKey] = false;
    touchedConfig[platformKey] = false;

    message.success('保存成功');
  } catch (e: unknown) {
    message.error(errText(e, '保存失败'));
  } finally {
    saving[platformKey] = false;
  }
}

async function clearCredentials(platformKey: string): Promise<void> {
  clearing[platformKey] = true;
  try {
    const existing = getChannel(platformKey);
    const allChannels: PlatformChannelConfig[] = [];

    // 保留其他平台不变
    for (const p of PLATFORMS) {
      if (p.key === platformKey) {
        // 清除凭据：所有 configuredKeys 设为空串（表示删除）
        const creds: Record<string, string> = {};
        if (existing?.configuredKeys) {
          for (const k of existing.configuredKeys) {
            creds[k] = '';
          }
        }
        // 也清除 cfg: 前缀的配置
        const cfgDraft = configDrafts[platformKey];
        if (cfgDraft) {
          for (const k of Object.keys(cfgDraft)) {
            creds[`cfg:${k}`] = '';
          }
        }
        allChannels.push({
          id: existing?.id ?? p.key,
          type: p.key as PlatformChannelType,
          enabled: existing?.enabled ?? true,
          ...(!isEmptyObj(creds) ? { credentials: creds } : {}),
        });
      } else {
        const ch = getChannel(p.key);
        if (ch) allChannels.push({ ...ch });
        else {
          allChannels.push({
            id: p.key,
            type: p.key as PlatformChannelType,
            enabled: true,
          });
        }
      }
    }

    const res = await savePlatformConfig(allChannels);
    const map: Record<string, PlatformChannelConfig> = {};
    for (const ch of res.channels ?? allChannels) {
      map[ch.type] = ch;
    }
    channelMap.value = map;

    // 清除本地草稿和配置
    credentialDrafts[platformKey] = {};
    touchedCredentials[platformKey] = false;
    configDrafts[platformKey] = {};
    touchedConfig[platformKey] = false;
    saveConfigDraftsToStorage();

    message.success('凭据已清除');
  } catch (e: unknown) {
    message.error(errText(e, '清除失败'));
  } finally {
    clearing[platformKey] = false;
  }
}

// ═══════════════════════ Draft mutations ═══════════════════════

function setCredential(platformKey: string, key: string, value: string): void {
  if (!credentialDrafts[platformKey]) {
    credentialDrafts[platformKey] = {};
  }
  credentialDrafts[platformKey][key] = value;
  touchedCredentials[platformKey] = true;
}

function setConfig(platformKey: string, key: string, value: string): void {
  if (!configDrafts[platformKey]) {
    configDrafts[platformKey] = {};
  }
  configDrafts[platformKey][key] = value;
  touchedConfig[platformKey] = true;
}

function getCredentialDraft(platformKey: string, key: string, fallback: string = ''): string {
  return credentialDrafts[platformKey]?.[key] ?? fallback;
}

function getConfigDraft(platformKey: string, key: string, fallback: string = ''): string {
  return configDrafts[platformKey]?.[key] ?? fallback;
}

function getConfigBool(platformKey: string, key: string, fallback: boolean = false): boolean {
  const v = configDrafts[platformKey]?.[key];
  if (v === undefined || v === null) return fallback;
  return v === 'true';
}

// ═══════════════════════ Lifecycle ═══════════════════════

onMounted(() => {
  loadConfigDrafts();
  void load();
});

// ═══════════════════════ Search ═══════════════════════

const filteredPlatforms = computed<PlatformDef[]>(() => {
  const q = (props.search ?? '').trim().toLowerCase();
  if (!q) return PLATFORMS;
  return PLATFORMS.filter(
    (p) => p.key.toLowerCase().includes(q) || p.name.toLowerCase().includes(q),
  );
});
</script>

<template>
  <div class="cs-body">
    <!-- 加载态 -->
    <n-spin :show="loading">
      <div class="cs-content">
        <!-- 错误态 -->
        <div v-if="error" class="cs-error">
          <p class="cs-error-text">{{ error }}</p>
          <n-button size="small" @click="load">重试</n-button>
        </div>

        <!-- 平台卡片列表 -->
        <template v-else>
          <PlatformCard
            v-for="p in filteredPlatforms"
            :key="p.key"
            :platform-key="p.key"
            :name="p.name"
            :icon="p.icon"
            :config="cardConfig(p.key)"
            :credentials="cardCredentials(p.key)"
          >
            <!-- ═══════ Telegram ═══════ -->
            <template v-if="p.key === 'telegram'">
              <SettingRow label="Bot Token" hint="从 @BotFather 获取">
                <NInput
                  :value="getCredentialDraft('telegram', 'token')"
                  :loading="saving.telegram"
                  type="password"
                  show-password-on="click"
                  clearable
                  size="small"
                  style="width: 280px"
                  placeholder="123456:ABC-DEF..."
                  @update:value="(v: string) => setCredential('telegram', 'token', v)"
                />
              </SettingRow>
              <SettingRow label="代理 URL" hint="可选，格式如 socks5://127.0.0.1:7890">
                <NInput
                  :value="getCredentialDraft('telegram', 'proxy')"
                  :loading="saving.telegram"
                  clearable
                  size="small"
                  style="width: 280px"
                  placeholder="socks5://127.0.0.1:7890"
                  @update:value="(v: string) => setCredential('telegram', 'proxy', v)"
                />
              </SettingRow>
              <SettingRow label="需要 @提及" hint="仅在群组中被 @ 时响应">
                <NSwitch
                  :value="getConfigBool('telegram', 'require_mention')"
                  :loading="saving.telegram"
                  @update:value="(v: boolean) => setConfig('telegram', 'require_mention', String(v))"
                />
              </SettingRow>
              <SettingRow label="消息回应" hint="在回复前先发送 Reaction 表情">
                <NSwitch
                  :value="getConfigBool('telegram', 'reactions', true)"
                  :loading="saving.telegram"
                  @update:value="(v: boolean) => setConfig('telegram', 'reactions', String(v))"
                />
              </SettingRow>
              <SettingRow label="自由回复会话" hint="无需 @提及即自动回复的 chat_id 列表，逗号分隔">
                <NInput
                  :value="getConfigDraft('telegram', 'free_response_chats')"
                  :loading="saving.telegram"
                  size="small"
                  style="width: 280px"
                  placeholder="chat_id1,chat_id2"
                  @update:value="(v: string) => setConfig('telegram', 'free_response_chats', v)"
                />
              </SettingRow>
              <SettingRow label="提及匹配模式" hint="触发 @响应的模式列表，逗号分隔">
                <NInput
                  :value="getConfigDraft('telegram', 'mention_patterns')"
                  :loading="saving.telegram"
                  size="small"
                  style="width: 280px"
                  placeholder="pattern1, pattern2"
                  @update:value="(v: string) => setConfig('telegram', 'mention_patterns', v)"
                />
              </SettingRow>
            </template>

            <!-- ═══════ Discord ═══════ -->
            <template v-if="p.key === 'discord'">
              <SettingRow label="Bot Token" hint="从 Discord Developer Portal 获取">
                <NInput
                  :value="getCredentialDraft('discord', 'token')"
                  :loading="saving.discord"
                  type="password"
                  show-password-on="click"
                  clearable
                  size="small"
                  style="width: 280px"
                  placeholder="Bot token..."
                  @update:value="(v: string) => setCredential('discord', 'token', v)"
                />
              </SettingRow>
              <SettingRow label="代理 URL" hint="可选，格式如 socks5://127.0.0.1:7890">
                <NInput
                  :value="getCredentialDraft('discord', 'proxy')"
                  :loading="saving.discord"
                  clearable
                  size="small"
                  style="width: 280px"
                  placeholder="socks5://127.0.0.1:7890"
                  @update:value="(v: string) => setCredential('discord', 'proxy', v)"
                />
              </SettingRow>
              <SettingRow label="需要 @提及" hint="仅在频道中被 @ 时响应">
                <NSwitch
                  :value="getConfigBool('discord', 'require_mention')"
                  :loading="saving.discord"
                  @update:value="(v: boolean) => setConfig('discord', 'require_mention', String(v))"
                />
              </SettingRow>
              <SettingRow label="自动创建线程" hint="在对话中自动创建讨论线程">
                <NSwitch
                  :value="getConfigBool('discord', 'auto_thread', true)"
                  :loading="saving.discord"
                  @update:value="(v: boolean) => setConfig('discord', 'auto_thread', String(v))"
                />
              </SettingRow>
              <SettingRow label="消息回应" hint="在回复前先发送 Reaction 表情">
                <NSwitch
                  :value="getConfigBool('discord', 'reactions', true)"
                  :loading="saving.discord"
                  @update:value="(v: boolean) => setConfig('discord', 'reactions', String(v))"
                />
              </SettingRow>
              <SettingRow label="自由回复频道" hint="无需 @提及即自动回复的频道 ID，逗号分隔">
                <NInput
                  :value="getConfigDraft('discord', 'free_response_channels')"
                  :loading="saving.discord"
                  size="small"
                  style="width: 280px"
                  placeholder="channel_id1,channel_id2"
                  @update:value="(v: string) => setConfig('discord', 'free_response_channels', v)"
                />
              </SettingRow>
              <SettingRow label="允许的频道" hint="机器人可响应的频道白名单，留空表示全部">
                <NInput
                  :value="getConfigDraft('discord', 'allowed_channels')"
                  :loading="saving.discord"
                  size="small"
                  style="width: 280px"
                  placeholder="channel_id1,channel_id2"
                  @update:value="(v: string) => setConfig('discord', 'allowed_channels', v)"
                />
              </SettingRow>
              <SettingRow label="忽略的频道" hint="机器人不响应的频道黑名单">
                <NInput
                  :value="getConfigDraft('discord', 'ignored_channels')"
                  :loading="saving.discord"
                  size="small"
                  style="width: 280px"
                  placeholder="channel_id1,channel_id2"
                  @update:value="(v: string) => setConfig('discord', 'ignored_channels', v)"
                />
              </SettingRow>
              <SettingRow label="不创建线程的频道" hint="在这些频道中不自动创建线程">
                <NInput
                  :value="getConfigDraft('discord', 'no_thread_channels')"
                  :loading="saving.discord"
                  size="small"
                  style="width: 280px"
                  placeholder="channel_id1,channel_id2"
                  @update:value="(v: string) => setConfig('discord', 'no_thread_channels', v)"
                />
              </SettingRow>
            </template>

            <!-- ═══════ Slack ═══════ -->
            <template v-if="p.key === 'slack'">
              <SettingRow label="Bot Token" hint="格式 xoxb-...">
                <NInput
                  :value="getCredentialDraft('slack', 'token')"
                  :loading="saving.slack"
                  type="password"
                  show-password-on="click"
                  clearable
                  size="small"
                  style="width: 280px"
                  placeholder="xoxb-..."
                  @update:value="(v: string) => setCredential('slack', 'token', v)"
                />
              </SettingRow>
              <SettingRow label="需要 @提及" hint="仅在频道中被 @ 时响应">
                <NSwitch
                  :value="getConfigBool('slack', 'require_mention')"
                  :loading="saving.slack"
                  @update:value="(v: boolean) => setConfig('slack', 'require_mention', String(v))"
                />
              </SettingRow>
              <SettingRow label="允许机器人互聊" hint="允许响应其他机器人的消息">
                <NSwitch
                  :value="getConfigBool('slack', 'allow_bots')"
                  :loading="saving.slack"
                  @update:value="(v: boolean) => setConfig('slack', 'allow_bots', String(v))"
                />
              </SettingRow>
              <SettingRow label="自由回复频道" hint="无需 @提及即自动回复的频道 ID，逗号分隔">
                <NInput
                  :value="getConfigDraft('slack', 'free_response_channels')"
                  :loading="saving.slack"
                  size="small"
                  style="width: 280px"
                  placeholder="channel_id1,channel_id2"
                  @update:value="(v: string) => setConfig('slack', 'free_response_channels', v)"
                />
              </SettingRow>
            </template>

            <!-- ═══════ WhatsApp ═══════ -->
            <template v-if="p.key === 'whatsapp'">
              <SettingRow label="启用 WhatsApp" hint="开启/关闭 WhatsApp 渠道">
                <NSwitch
                  :value="getConfigBool('whatsapp', 'enabled')"
                  :loading="saving.whatsapp"
                  @update:value="(v: boolean) => setConfig('whatsapp', 'enabled', String(v))"
                />
              </SettingRow>
              <SettingRow label="需要 @提及" hint="仅在群组中被 @ 时响应">
                <NSwitch
                  :value="getConfigBool('whatsapp', 'require_mention')"
                  :loading="saving.whatsapp"
                  @update:value="(v: boolean) => setConfig('whatsapp', 'require_mention', String(v))"
                />
              </SettingRow>
              <SettingRow label="自由回复会话" hint="无需 @提及即自动回复的 chat_id 列表，逗号分隔">
                <NInput
                  :value="getConfigDraft('whatsapp', 'free_response_chats')"
                  :loading="saving.whatsapp"
                  size="small"
                  style="width: 280px"
                  placeholder="chat_id1,chat_id2"
                  @update:value="(v: string) => setConfig('whatsapp', 'free_response_chats', v)"
                />
              </SettingRow>
              <SettingRow label="提及匹配模式" hint="触发 @响应的模式列表，逗号分隔">
                <NInput
                  :value="getConfigDraft('whatsapp', 'mention_patterns')"
                  :loading="saving.whatsapp"
                  size="small"
                  style="width: 280px"
                  placeholder="pattern1, pattern2"
                  @update:value="(v: string) => setConfig('whatsapp', 'mention_patterns', v)"
                />
              </SettingRow>
            </template>

            <!-- ═══════ Matrix ═══════ -->
            <template v-if="p.key === 'matrix'">
              <SettingRow label="Access Token" hint="从 Matrix 客户端获取">
                <NInput
                  :value="getCredentialDraft('matrix', 'token')"
                  :loading="saving.matrix"
                  type="password"
                  show-password-on="click"
                  clearable
                  size="small"
                  style="width: 280px"
                  placeholder="syt_..."
                  @update:value="(v: string) => setCredential('matrix', 'token', v)"
                />
              </SettingRow>
              <SettingRow label="User ID" hint="格式 @username:example.org">
                <NInput
                  :value="getCredentialDraft('matrix', 'user_id')"
                  :loading="saving.matrix"
                  clearable
                  size="small"
                  style="width: 280px"
                  placeholder="@hermes:example.org"
                  @update:value="(v: string) => setCredential('matrix', 'user_id', v)"
                />
              </SettingRow>
              <SettingRow label="密码" hint="Matrix 账号密码（与 Token 二选一）">
                <NInput
                  :value="getCredentialDraft('matrix', 'password')"
                  :loading="saving.matrix"
                  type="password"
                  show-password-on="click"
                  clearable
                  size="small"
                  style="width: 280px"
                  placeholder="Matrix password"
                  @update:value="(v: string) => setCredential('matrix', 'password', v)"
                />
              </SettingRow>
              <SettingRow label="Homeserver" hint="Matrix 服务器地址">
                <NInput
                  :value="getCredentialDraft('matrix', 'homeserver')"
                  :loading="saving.matrix"
                  clearable
                  size="small"
                  style="width: 280px"
                  placeholder="https://matrix.org"
                  @update:value="(v: string) => setCredential('matrix', 'homeserver', v)"
                />
              </SettingRow>
              <SettingRow label="代理 URL" hint="可选，格式如 socks5://127.0.0.1:7890">
                <NInput
                  :value="getCredentialDraft('matrix', 'proxy')"
                  :loading="saving.matrix"
                  clearable
                  size="small"
                  style="width: 280px"
                  placeholder="socks5://127.0.0.1:7890"
                  @update:value="(v: string) => setCredential('matrix', 'proxy', v)"
                />
              </SettingRow>
              <SettingRow label="需要 @提及" hint="仅在房间中被 @ 时响应">
                <NSwitch
                  :value="getConfigBool('matrix', 'require_mention')"
                  :loading="saving.matrix"
                  @update:value="(v: boolean) => setConfig('matrix', 'require_mention', String(v))"
                />
              </SettingRow>
              <SettingRow label="自动创建线程" hint="在对话中自动创建讨论线程">
                <NSwitch
                  :value="getConfigBool('matrix', 'auto_thread', true)"
                  :loading="saving.matrix"
                  @update:value="(v: boolean) => setConfig('matrix', 'auto_thread', String(v))"
                />
              </SettingRow>
              <SettingRow label="DM 提及线程" hint="在私聊中创建提及线程">
                <NSwitch
                  :value="getConfigBool('matrix', 'dm_mention_threads')"
                  :loading="saving.matrix"
                  @update:value="(v: boolean) => setConfig('matrix', 'dm_mention_threads', String(v))"
                />
              </SettingRow>
              <SettingRow label="自由回复房间" hint="无需 @提及即自动回复的房间 ID，逗号分隔">
                <NInput
                  :value="getConfigDraft('matrix', 'free_response_rooms')"
                  :loading="saving.matrix"
                  size="small"
                  style="width: 280px"
                  placeholder="room_id1,room_id2"
                  @update:value="(v: string) => setConfig('matrix', 'free_response_rooms', v)"
                />
              </SettingRow>
            </template>

            <!-- ═══════ Feishu ═══════ -->
            <template v-if="p.key === 'feishu'">
              <SettingRow label="App ID" hint="从飞书开放平台获取">
                <NInput
                  :value="getCredentialDraft('feishu', 'app_id')"
                  :loading="saving.feishu"
                  clearable
                  size="small"
                  style="width: 280px"
                  placeholder="cli_..."
                  @update:value="(v: string) => setCredential('feishu', 'app_id', v)"
                />
              </SettingRow>
              <SettingRow label="App Secret" hint="飞书应用密钥">
                <NInput
                  :value="getCredentialDraft('feishu', 'app_secret')"
                  :loading="saving.feishu"
                  type="password"
                  show-password-on="click"
                  clearable
                  size="small"
                  style="width: 280px"
                  placeholder="App Secret"
                  @update:value="(v: string) => setCredential('feishu', 'app_secret', v)"
                />
              </SettingRow>
              <SettingRow label="Encrypt Key" hint="消息加密密钥（可选）">
                <NInput
                  :value="getCredentialDraft('feishu', 'encrypt_key')"
                  :loading="saving.feishu"
                  type="password"
                  show-password-on="click"
                  clearable
                  size="small"
                  style="width: 280px"
                  placeholder="Encrypt Key"
                  @update:value="(v: string) => setCredential('feishu', 'encrypt_key', v)"
                />
              </SettingRow>
              <SettingRow label="Verification Token" hint="事件订阅验证 Token（可选）">
                <NInput
                  :value="getCredentialDraft('feishu', 'verification_token')"
                  :loading="saving.feishu"
                  type="password"
                  show-password-on="click"
                  clearable
                  size="small"
                  style="width: 280px"
                  placeholder="Verification Token"
                  @update:value="(v: string) => setCredential('feishu', 'verification_token', v)"
                />
              </SettingRow>
              <SettingRow label="需要 @提及" hint="仅在群组中被 @ 时响应">
                <NSwitch
                  :value="getConfigBool('feishu', 'require_mention')"
                  :loading="saving.feishu"
                  @update:value="(v: boolean) => setConfig('feishu', 'require_mention', String(v))"
                />
              </SettingRow>
              <SettingRow label="自由回复会话" hint="无需 @提及即自动回复的 chat_id 列表，逗号分隔">
                <NInput
                  :value="getConfigDraft('feishu', 'free_response_chats')"
                  :loading="saving.feishu"
                  size="small"
                  style="width: 280px"
                  placeholder="chat_id1,chat_id2"
                  @update:value="(v: string) => setConfig('feishu', 'free_response_chats', v)"
                />
              </SettingRow>
            </template>

            <!-- ═══════ DingTalk ═══════ -->
            <template v-if="p.key === 'dingtalk'">
              <SettingRow label="Client ID" hint="从钉钉开放平台获取">
                <NInput
                  :value="getCredentialDraft('dingtalk', 'client_id')"
                  :loading="saving.dingtalk"
                  clearable
                  size="small"
                  style="width: 280px"
                  placeholder="Client ID"
                  @update:value="(v: string) => setCredential('dingtalk', 'client_id', v)"
                />
              </SettingRow>
              <SettingRow label="Client Secret" hint="钉钉应用密钥">
                <NInput
                  :value="getCredentialDraft('dingtalk', 'client_secret')"
                  :loading="saving.dingtalk"
                  type="password"
                  show-password-on="click"
                  clearable
                  size="small"
                  style="width: 280px"
                  placeholder="Client Secret"
                  @update:value="(v: string) => setCredential('dingtalk', 'client_secret', v)"
                />
              </SettingRow>
              <SettingRow label="卡片模板 ID" hint="AI Card Template ID（可选）">
                <NInput
                  :value="getCredentialDraft('dingtalk', 'card_template_id')"
                  :loading="saving.dingtalk"
                  clearable
                  size="small"
                  style="width: 280px"
                  placeholder="AI Card Template ID"
                  @update:value="(v: string) => setCredential('dingtalk', 'card_template_id', v)"
                />
              </SettingRow>
              <SettingRow label="允许所有用户" hint="是否允许所有用户与机器人对话">
                <NSwitch
                  :value="getConfigBool('dingtalk', 'allow_all_users')"
                  :loading="saving.dingtalk"
                  @update:value="(v: boolean) => setConfig('dingtalk', 'allow_all_users', String(v))"
                />
              </SettingRow>
              <SettingRow label="允许的用户" hint="允许的用户 ID 列表，逗号分隔（allow_all_users 为 false 时生效）">
                <NInput
                  :value="getConfigDraft('dingtalk', 'allowed_users')"
                  :loading="saving.dingtalk"
                  clearable
                  size="small"
                  style="width: 280px"
                  placeholder="user_id1,user_id2"
                  @update:value="(v: string) => setConfig('dingtalk', 'allowed_users', v)"
                />
              </SettingRow>
              <SettingRow label="需要 @提及" hint="仅在群组中被 @ 时响应">
                <NSwitch
                  :value="getConfigBool('dingtalk', 'require_mention')"
                  :loading="saving.dingtalk"
                  @update:value="(v: boolean) => setConfig('dingtalk', 'require_mention', String(v))"
                />
              </SettingRow>
              <SettingRow label="自由回复会话" hint="无需 @提及即自动回复的 chat_id 列表，逗号分隔">
                <NInput
                  :value="getConfigDraft('dingtalk', 'free_response_chats')"
                  :loading="saving.dingtalk"
                  size="small"
                  style="width: 280px"
                  placeholder="chat_id1,chat_id2"
                  @update:value="(v: string) => setConfig('dingtalk', 'free_response_chats', v)"
                />
              </SettingRow>
            </template>

            <!-- ═══════ QQBot ═══════ -->
            <template v-if="p.key === 'qqbot'">
              <SettingRow label="App ID" hint="从 QQ 开放平台获取">
                <NInput
                  :value="getCredentialDraft('qqbot', 'app_id')"
                  :loading="saving.qqbot"
                  clearable
                  size="small"
                  style="width: 280px"
                  placeholder="App ID"
                  @update:value="(v: string) => setCredential('qqbot', 'app_id', v)"
                />
              </SettingRow>
              <SettingRow label="App Secret" hint="QQ 应用密钥">
                <NInput
                  :value="getCredentialDraft('qqbot', 'client_secret')"
                  :loading="saving.qqbot"
                  type="password"
                  show-password-on="click"
                  clearable
                  size="small"
                  style="width: 280px"
                  placeholder="App Secret"
                  @update:value="(v: string) => setCredential('qqbot', 'client_secret', v)"
                />
              </SettingRow>
              <SettingRow label="允许的用户" hint="允许的用户 OpenID 列表，逗号分隔">
                <NInput
                  :value="getConfigDraft('qqbot', 'allowed_users')"
                  :loading="saving.qqbot"
                  clearable
                  size="small"
                  style="width: 280px"
                  placeholder="openid1,openid2"
                  @update:value="(v: string) => setConfig('qqbot', 'allowed_users', v)"
                />
              </SettingRow>
              <SettingRow label="允许所有用户" hint="是否允许所有用户与机器人对话">
                <NSwitch
                  :value="getConfigBool('qqbot', 'allow_all_users')"
                  :loading="saving.qqbot"
                  @update:value="(v: boolean) => setConfig('qqbot', 'allow_all_users', String(v))"
                />
              </SettingRow>
              <SettingRow label="Markdown 支持" hint="启用 QQ Markdown 消息格式">
                <NSwitch
                  :value="getConfigBool('qqbot', 'markdown_support', true)"
                  :loading="saving.qqbot"
                  @update:value="(v: boolean) => setConfig('qqbot', 'markdown_support', String(v))"
                />
              </SettingRow>
            </template>

            <!-- ═══════ Weixin ═══════ -->
            <template v-if="p.key === 'weixin'">
              <SettingRow label="Token" hint="微信公众号 Token">
                <NInput
                  :value="getCredentialDraft('weixin', 'token')"
                  :loading="saving.weixin"
                  type="password"
                  show-password-on="click"
                  clearable
                  size="small"
                  style="width: 280px"
                  placeholder="Token"
                  @update:value="(v: string) => setCredential('weixin', 'token', v)"
                />
              </SettingRow>
              <SettingRow label="Account ID" hint="微信公众号原始 ID">
                <NInput
                  :value="getCredentialDraft('weixin', 'account_id')"
                  :loading="saving.weixin"
                  clearable
                  size="small"
                  style="width: 280px"
                  placeholder="Account ID"
                  @update:value="(v: string) => setCredential('weixin', 'account_id', v)"
                />
              </SettingRow>
            </template>

            <!-- ═══════ WeCom ═══════ -->
            <template v-if="p.key === 'wecom'">
              <SettingRow label="Bot ID" hint="企业微信机器人 ID">
                <NInput
                  :value="getCredentialDraft('wecom', 'bot_id')"
                  :loading="saving.wecom"
                  clearable
                  size="small"
                  style="width: 280px"
                  placeholder="Bot ID"
                  @update:value="(v: string) => setCredential('wecom', 'bot_id', v)"
                />
              </SettingRow>
              <SettingRow label="Secret" hint="企业微信机器人 Secret">
                <NInput
                  :value="getCredentialDraft('wecom', 'secret')"
                  :loading="saving.wecom"
                  type="password"
                  show-password-on="click"
                  clearable
                  size="small"
                  style="width: 280px"
                  placeholder="Secret"
                  @update:value="(v: string) => setCredential('wecom', 'secret', v)"
                />
              </SettingRow>
            </template>

            <!-- ═══════ 操作按钮 ═══════ -->
            <div class="cs-actions">
              <n-button
                type="error"
                quaternary
                size="small"
                :loading="!!clearing[p.key]"
                :disabled="!!saving[p.key] || !!clearing[p.key] || !hasStoredCredentials(p.key)"
                @click="clearCredentials(p.key)"
              >
                清除凭据
              </n-button>
              <n-button
                type="primary"
                size="small"
                :loading="!!saving[p.key]"
                :disabled="!hasUnsavedChanges(p.key)"
                @click="savePlatform(p.key)"
              >
                保存
              </n-button>
            </div>
          </PlatformCard>
        </template>
      </div>
    </n-spin>
  </div>
</template>

<style scoped>
.cs-body {
  display: flex;
  flex-direction: column;
}

.cs-content {
  min-height: 200px;
}

.cs-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--km-space-sm);
  padding: var(--km-space-xl) 0;
}

.cs-error-text {
  margin: 0;
  font-size: var(--km-font-xs);
  opacity: 0.65;
  max-width: 360px;
  word-break: break-word;
  text-align: center;
}

.cs-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--km-border);
}
</style>
