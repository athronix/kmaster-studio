<script setup lang="ts">
// F21「诊断」分组：只读键值表 + 一键复制（自动脱敏）。
// ♻️ 数据源是扩展后的 GET /api/health（🚫 未新建诊断端点）。
// 🔒 NFR-M5-5：复制出去的文本会把绝对路径中的用户名替换为 <user>，避免贴到 issue 时泄露身份。
// ⚠️ HealthInfo 除 ok/service/ts 外全部可选，所有消费点一律 `?? ` 容错，缺字段显示「—」。
import { computed, onMounted, ref } from 'vue';
import { NButton, NSpin, NTag, useMessage } from 'naive-ui';
import { getHealth } from '../../api/client';
import type { HealthInfo } from '../../types/chat';

const message = useMessage();

const loading = ref(false);
const health = ref<HealthInfo | null>(null);
const copying = ref(false);

interface DiagRow {
  key: string;
  label: string;
  value: string;
  tone: 'plain' | 'ok' | 'warn';
}

/** 布尔值统一渲染成「是 / 否」，并给出色调用于打标。 */
function boolRow(key: string, label: string, value: boolean | undefined, warnWhenFalse = true): DiagRow {
  if (value === undefined) return { key, label, value: '—', tone: 'plain' };
  return {
    key,
    label,
    value: value ? '是' : '否',
    tone: value ? 'ok' : warnWhenFalse ? 'warn' : 'plain',
  };
}

const rows = computed<DiagRow[]>(() => {
  const h = health.value;
  if (!h) return [];
  const list: DiagRow[] = [
    { key: 'service', label: '服务', value: h.service || '—', tone: 'plain' },
    { key: 'version', label: '版本', value: h.version || '—', tone: 'plain' },
    { key: 'port', label: '端口', value: h.port !== undefined ? String(h.port) : '—', tone: 'plain' },
    boolRow('bridge_mock', 'Bridge Mock 模式', h.bridge_mock, false),
    { key: 'hermes_home', label: 'HERMES_HOME（激活）', value: h.hermes_home || '—', tone: 'plain' },
    boolRow('python_ok', 'Python 可用', h.python_ok),
    boolRow('hermes_cli_ok', 'hermes CLI 可用', h.hermes_cli_ok),
    boolRow('terminal_available', '内置终端可用（node-pty）', h.terminal_available),
  ];
  if (h.node_pty_error) {
    list.push({ key: 'node_pty_error', label: 'node-pty 失败原因', value: h.node_pty_error, tone: 'warn' });
  }
  list.push({
    key: 'db_kind',
    label: '持久层',
    value: h.db_kind ?? '—',
    tone: h.db_kind === 'sqlite' ? 'ok' : h.db_kind === 'memory' ? 'warn' : 'plain',
  });
  if (h.db_error) {
    list.push({ key: 'db_error', label: '持久层降级原因', value: h.db_error, tone: 'warn' });
  }
  list.push({
    key: 'ts',
    label: '采集时间',
    value: h.ts ? new Date(h.ts).toLocaleString() : '—',
    tone: 'plain',
  });
  return list;
});

async function load(): Promise<void> {
  loading.value = true;
  try {
    health.value = await getHealth();
  } catch (err) {
    health.value = null;
    message.error(`诊断信息加载失败：${String((err as Error)?.message ?? err)}`);
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  void load();
});

/**
 * 路径脱敏：`C:\Users\alice\…` / `/home/alice/…` / `/Users/alice/…` → `…\<user>\…`。
 * 与 server 侧 `redactUserPaths()` 同源双保险（任一侧漏掉都不会泄露）。
 */
function redactUser(text: string): string {
  return text
    .replace(/([\\/])Users([\\/])([^\\/\s]+)/gi, '$1Users$2<user>')
    .replace(/([\\/])home([\\/])([^\\/\s]+)/gi, '$1home$2<user>');
}

/** 组装可直接贴进 issue 的纯文本诊断块。 */
function buildDiagnosticsText(): string {
  const lines = rows.value.map((r) => `${r.label}: ${r.value}`);
  lines.unshift('kmaster-studio 诊断信息');
  lines.push(`UA: ${navigator.userAgent}`);
  return redactUser(lines.join('\n'));
}

/** 复制到剪贴板；Clipboard API 不可用时退回 textarea + execCommand。 */
async function copyDiagnostics(): Promise<void> {
  const text = buildDiagnosticsText();
  copying.value = true;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    message.success('诊断信息已复制（用户名已脱敏）');
  } catch (err) {
    message.error(`复制失败：${String((err as Error)?.message ?? err)}`);
  } finally {
    copying.value = false;
  }
}
</script>

<template>
  <n-spin :show="loading">
    <div class="diag-body">
      <div class="diag-toolbar">
        <n-button size="small" tertiary @click="load">刷新</n-button>
        <n-button size="small" type="primary" :loading="copying" @click="copyDiagnostics">
          复制诊断信息
        </n-button>
        <n-button size="small" tertiary disabled title="桌面端壳（T4）提供，Web 下不可用">
          打开日志目录
        </n-button>
      </div>

      <table class="diag-table">
        <tbody>
          <tr v-for="r in rows" :key="r.key">
            <td class="diag-key">{{ r.label }}</td>
            <td class="diag-val">
              <n-tag v-if="r.tone === 'ok'" size="small" type="success" :bordered="false">{{ r.value }}</n-tag>
              <n-tag v-else-if="r.tone === 'warn'" size="small" type="warning" :bordered="false">{{ r.value }}</n-tag>
              <code v-else>{{ r.value }}</code>
            </td>
          </tr>
        </tbody>
      </table>

      <div class="diag-hint">
        🔒 复制时会把绝对路径中的用户名替换为 <code>&lt;user&gt;</code>；诊断信息中从不包含任何 API Key。
      </div>
    </div>
  </n-spin>
</template>

<style scoped>
.diag-body { display: flex; flex-direction: column; gap: 12px; }
.diag-toolbar { display: flex; gap: 8px; }
.diag-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.diag-table td {
  padding: 7px 10px;
  border-bottom: 1px solid var(--km-border);
  vertical-align: middle;
}
.diag-key { width: 220px; opacity: 0.65; font-size: 12px; }
.diag-val code { font-family: var(--km-mono, ui-monospace, monospace); word-break: break-all; }
.diag-hint { font-size: 11px; opacity: 0.6; }
.diag-hint code { font-family: var(--km-mono, ui-monospace, monospace); }
</style>
