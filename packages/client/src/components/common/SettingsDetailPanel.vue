<script setup lang="ts">
/**
 * SettingsDetailPanel — 设置详情右栏（T02 新建 / T05-04 增强）。
 *
 * T05-04 增强：双模块卡片布局
 *   - 上卡片：资源信息（icon / name / installed / description / tags）
 *   - 下卡片：元数据详情（按 entityType 动态渲染）
 *     - expert: specialties / sample prompts
 *     - skill: 版本 / 来源 / 分类
 *     - mcp: command / transport / tools 数量
 *     - plugin: kind / status / requiresEnv / providesTools
 *     - channel: type / credentials 状态
 *
 * 操作按钮区保持不变（entityType 驱动）。
 */
import { NTag, NButton, NText, NDivider } from 'naive-ui';
import type { ResourceItem } from '../../types/market';
import type { PluginItem, PlatformChannelConfig } from '../../types/chat';

type DetailItem = ResourceItem | PluginItem | PlatformChannelConfig;

const props = defineProps<{
  item: DetailItem | null;
  entityType: 'expert' | 'skill' | 'mcp' | 'plugin' | 'channel';
}>();

const emit = defineEmits<{
  install: [id: string];
  uninstall: [id: string];
  summon: [id: string];
}>();

/** 是否为 market 实体（expert/skill/mcp）。 */
function isMarketItem(item: DetailItem): item is ResourceItem {
  return 'installed' in item && 'source' in item;
}

/** 是否为插件实体。 */
function isPluginItem(item: DetailItem): item is PluginItem {
  return 'effectiveStatus' in item && 'kind' in item && 'providesTools' in item;
}

/** 是否为渠道实体。 */
function isChannelItem(item: DetailItem): item is PlatformChannelConfig {
  return 'type' in item && 'enabled' in item && ('availableTypes' in item || 'configuredKeys' in item);
}

/** 获取展示名。 */
function displayName(item: DetailItem): string {
  if (isMarketItem(item)) return item.name;
  if (isPluginItem(item)) return item.label || item.name;
  if (isChannelItem(item)) return item.label || item.id;
  return '';
}

/** 获取图标文本（用于 emoji 图标）。 */
function displayIcon(item: DetailItem): string {
  if (isPluginItem(item)) return '🔌';
  if (isChannelItem(item)) return '📡';
  return '📦';
}

/** 获取简介。 */
function displayDesc(item: DetailItem): string {
  if (isMarketItem(item)) return item.description;
  if (isPluginItem(item)) return item.description;
  if (isChannelItem(item)) return '';
  return '';
}

/** 获取标签列表。 */
function displayTags(item: DetailItem): string[] {
  if (isMarketItem(item)) {
    const tags = [...item.tags];
    if (item.category) tags.unshift(item.category);
    return tags.slice(0, 10);
  }
  if (isPluginItem(item)) {
    const tags: string[] = [];
    if (item.kind) tags.push(item.kind);
    if (item.source) tags.push(item.source);
    return tags;
  }
  if (isChannelItem(item)) {
    return [item.type];
  }
  return [];
}

/** 已安装状态。 */
function isInstalled(item: DetailItem): boolean {
  if (isMarketItem(item)) return item.installed;
  if (isPluginItem(item)) return item.effectiveStatus === 'enabled';
  if (isChannelItem(item)) return item.enabled;
  return false;
}

/** 插件状态标签。 */
function pluginStatusTag(status: string): { label: string; type: 'success' | 'warning' | 'default' } {
  switch (status) {
    case 'enabled': return { label: '已启用', type: 'success' };
    case 'needs_config': return { label: '需配置', type: 'warning' };
    default: return { label: '已禁用', type: 'default' };
  }
}

/** 渠道类型中文名。 */
function channelTypeLabel(type: string): string {
  const map: Record<string, string> = {
    telegram: 'Telegram', discord: 'Discord', slack: 'Slack',
    whatsapp: 'WhatsApp', matrix: 'Matrix', wecom: '企业微信',
    feishu: '飞书', dingtalk: '钉钉', qqbot: 'QQ 机器人',
    teams: 'Teams', email: 'Email', line: 'LINE', sms: 'SMS',
    irc: 'IRC', mattermost: 'Mattermost', google_chat: 'Google Chat',
    homeassistant: 'Home Assistant', ntfy: 'ntfy', photon: 'Photon',
    simplex: 'Simplex', raft: 'Raft', other: '其它',
  };
  return map[type] ?? type;
}

function handleInstall(): void {
  if (props.item) emit('install', props.item.id || (props.item as any).name || '');
}

function handleUninstall(): void {
  if (props.item) emit('uninstall', props.item.id || (props.item as any).name || '');
}

function handleSummon(): void {
  if (props.item) emit('summon', props.item.id || (props.item as any).name || '');
}
</script>

<template>
  <div v-if="item" class="sdp-panel">
    <!-- ① 资源信息卡片 -->
    <div class="sdp-card sdp-card-info">
      <div class="sdp-icon-row">
        <span class="sdp-icon">{{ displayIcon(item) }}</span>
        <div class="sdp-name-row">
          <NText strong class="sdp-name">{{ displayName(item) }}</NText>
          <NTag v-if="isInstalled(item)" type="success" size="small">已启用</NTag>
        </div>
      </div>
      <p v-if="displayDesc(item)" class="sdp-desc">{{ displayDesc(item) }}</p>
      <div v-if="displayTags(item).length > 0" class="sdp-tags">
        <NTag
          v-for="tag in displayTags(item)"
          :key="tag"
          size="tiny"
          :bordered="false"
          type="default"
        >{{ tag }}</NTag>
      </div>
      <!-- 操作按钮 -->
      <div class="sdp-actions">
        <NButton
          v-if="isMarketItem(item) && item.installed"
          size="small"
          quaternary
          type="error"
          @click="handleUninstall"
        >卸载</NButton>
        <NButton
          v-if="isMarketItem(item)"
          size="small"
          type="primary"
          @click="handleSummon"
        >召唤</NButton>
      </div>
    </div>

    <!-- 分隔线 -->
    <NDivider style="margin: 12px 0" />

    <!-- ② 元数据详情卡片 -->
    <div class="sdp-card sdp-card-meta">
      <div class="sdp-meta-title">详情</div>

      <!-- expert -->
      <template v-if="entityType === 'expert' && isMarketItem(item)">
        <div class="sdp-meta-row">
          <span class="sdp-meta-label">来源</span>
          <NTag size="tiny" :bordered="false">{{ item.source }}</NTag>
        </div>
        <div class="sdp-meta-row">
          <span class="sdp-meta-label">分类</span>
          <span class="sdp-meta-value">{{ item.category || '—' }}</span>
        </div>
      </template>

      <!-- skill -->
      <template v-else-if="entityType === 'skill' && isMarketItem(item)">
        <div class="sdp-meta-row">
          <span class="sdp-meta-label">来源</span>
          <NTag size="tiny" :bordered="false">{{ item.source }}</NTag>
        </div>
        <div class="sdp-meta-row">
          <span class="sdp-meta-label">分类</span>
          <span class="sdp-meta-value">{{ item.category || '—' }}</span>
        </div>
      </template>

      <!-- mcp -->
      <template v-else-if="entityType === 'mcp' && isMarketItem(item)">
        <div class="sdp-meta-row">
          <span class="sdp-meta-label">来源</span>
          <NTag size="tiny" :bordered="false">{{ item.source }}</NTag>
        </div>
        <div class="sdp-meta-row">
          <span class="sdp-meta-label">分类</span>
          <span class="sdp-meta-value">{{ item.category || '—' }}</span>
        </div>
      </template>

      <!-- plugin -->
      <template v-else-if="entityType === 'plugin' && isPluginItem(item)">
        <div class="sdp-meta-row">
          <span class="sdp-meta-label">类型</span>
          <NTag size="tiny" :bordered="false">{{ item.kind }}</NTag>
        </div>
        <div class="sdp-meta-row">
          <span class="sdp-meta-label">状态</span>
          <NTag
            size="tiny"
            :bordered="false"
            :type="pluginStatusTag(item.effectiveStatus).type"
          >{{ pluginStatusTag(item.effectiveStatus).label }}</NTag>
        </div>
        <div class="sdp-meta-row">
          <span class="sdp-meta-label">来源</span>
          <NTag size="tiny" :bordered="false" :type="item.source === 'bundled' ? 'info' : 'default'">
            {{ item.source === 'bundled' ? '内置' : '用户' }}
          </NTag>
        </div>
        <div v-if="item.version" class="sdp-meta-row">
          <span class="sdp-meta-label">版本</span>
          <span class="sdp-meta-value">{{ item.version }}</span>
        </div>
        <div v-if="(item.requiresEnv?.length ?? 0) > 0" class="sdp-meta-row">
          <span class="sdp-meta-label">环境变量</span>
          <div class="sdp-meta-tags">
            <NTag
              v-for="env in item.requiresEnv"
              :key="env"
              size="tiny"
              :bordered="false"
              :type="item.missingEnv?.includes(env) ? 'warning' : 'success'"
            >{{ env }}</NTag>
          </div>
        </div>
        <div v-if="(item.providesTools?.length ?? 0) > 0" class="sdp-meta-row">
          <span class="sdp-meta-label">工具列表</span>
          <div class="sdp-meta-tags">
            <NTag
              v-for="tool in item.providesTools"
              :key="tool"
              size="tiny"
              :bordered="false"
            >{{ tool }}</NTag>
          </div>
        </div>
      </template>

      <!-- channel -->
      <template v-else-if="entityType === 'channel' && isChannelItem(item)">
        <div class="sdp-meta-row">
          <span class="sdp-meta-label">类型</span>
          <NTag size="tiny" :bordered="false">{{ channelTypeLabel(item.type) }}</NTag>
        </div>
        <div class="sdp-meta-row">
          <span class="sdp-meta-label">渠道 ID</span>
          <span class="sdp-meta-value sdp-mono">{{ item.id }}</span>
        </div>
        <div class="sdp-meta-row">
          <span class="sdp-meta-label">状态</span>
          <NTag
            size="tiny"
            :bordered="false"
            :type="item.enabled ? 'success' : 'default'"
          >{{ item.enabled ? '已启用' : '已禁用' }}</NTag>
        </div>
        <div class="sdp-meta-row">
          <span class="sdp-meta-label">凭据</span>
          <span v-if="(item.configuredKeys?.length ?? 0) > 0" class="sdp-meta-value">
            {{ item.configuredKeys!.join('、') }}
          </span>
          <span v-else class="sdp-meta-na">未配置</span>
        </div>
        <div v-if="item.maskedKeys && Object.keys(item.maskedKeys).length > 0" class="sdp-meta-row">
          <span class="sdp-meta-label">掩码</span>
          <div class="sdp-meta-tags">
            <NTag
              v-for="(masked, key) in item.maskedKeys"
              :key="key"
              size="tiny"
              :bordered="false"
            >{{ key }}: {{ masked }}</NTag>
          </div>
        </div>
      </template>
    </div>
  </div>

  <!-- 空态 -->
  <div v-else class="sdp-empty">
    <NText depth="3">点击左侧卡片查看详情</NText>
  </div>
</template>

<style scoped>
.sdp-panel {
  padding: var(--km-space-lg);
}

/* ① 资源信息卡片 */
.sdp-card-info {
  padding-bottom: 0;
}

.sdp-icon-row {
  display: flex;
  align-items: flex-start;
  gap: var(--km-space-sm);
}

.sdp-icon {
  font-size: 32px;
  line-height: 1;
  flex-shrink: 0;
}

.sdp-name-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--km-space-6);
  flex: 1;
  min-width: 0;
}

.sdp-name {
  font-size: var(--km-font-18);
}

.sdp-desc {
  margin: var(--km-space-sm) 0;
  color: var(--n-text-color-2);
  font-size: var(--km-font-sm);
  line-height: 1.6;
}

.sdp-tags {
  margin-top: var(--km-space-sm);
  display: flex;
  flex-wrap: wrap;
  gap: var(--km-space-xs);
}

.sdp-actions {
  margin: var(--km-space-md) 0 0;
  display: flex;
  gap: var(--km-space-sm);
}

/* ② 元数据卡片 */
.sdp-card-meta {
  display: flex;
  flex-direction: column;
  gap: var(--km-space-10);
}

.sdp-meta-title {
  font-size: var(--km-font-sm);
  font-weight: 600;
  opacity: 0.8;
}

.sdp-meta-row {
  display: flex;
  align-items: flex-start;
  gap: var(--km-space-sm);
}

.sdp-meta-label {
  font-size: var(--km-font-xs);
  opacity: 0.55;
  min-width: 56px;
  flex-shrink: 0;
  padding-top: 1px;
}

.sdp-meta-value {
  font-size: var(--km-font-sm);
}

.sdp-meta-na {
  font-size: var(--km-font-sm);
  opacity: 0.4;
}

.sdp-mono {
  font-family: var(--km-mono, ui-monospace, monospace);
  font-size: var(--km-font-xs);
  word-break: break-all;
}

.sdp-meta-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
}

.sdp-empty {
  padding: var(--km-space-xl);
  text-align: center;
}
</style>
