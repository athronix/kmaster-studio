<script setup lang="ts">
// F20 内置终端 · xterm 挂载面板（方案 §2.2 / §4.2）
//
// 分层纪律（方案 §7，硬约束）：
//   本组件 🚫 不得 import 'socket.io-client'，所有网络行为一律经 stores/terminal。
//   组件 → store → api → server，逐层单向。
//
// 生命周期：被 ArtifactPanel 以 v-if + keep-alive 惰性挂载 —— 不点开「终端」Tab 就不建 pty。
//   keep-alive 下切走仅 deactivate，pty 保活；真正卸载时才 closeTerm。
import { computed, onActivated, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { Terminal, type ITheme } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { useTerminalStore } from '../../stores/terminal';
import { useTheme } from '../../styles/theme';
import { TERMINAL_RESIZE_THROTTLE_MS } from '../../types/chat';
import { useChatStore } from '../../stores/chat';

/** 面板状态机：驱动「加载中 / 降级提示 / 出错重试 / 正常渲染」四种视图。 */
type PanePhase = 'idle' | 'booting' | 'ready' | 'unavailable' | 'error';

const store = useTerminalStore();
const chatStore = useChatStore();
const { isDark } = useTheme();

/** xterm 宿主容器。 */
const hostRef = ref<HTMLDivElement | null>(null);
/** xterm 实例（shallowRef：内部结构庞大，不做深度响应式代理）。 */
const xterm = shallowRef<Terminal | null>(null);
const fitAddon = shallowRef<FitAddon | null>(null);

const phase = ref<PanePhase>('idle');
const errorText = ref<string>('');
const termId = ref<string>('');

/** 非响应式资源句柄，卸载时统一回收。 */
let resizeObserver: ResizeObserver | null = null;
let resizeTimer: ReturnType<typeof setTimeout> | null = null;
let unsubscribeData: (() => void) | null = null;
const disposables: Array<{ dispose(): void }> = [];

/** 当前会话在 store 中的状态（用于渲染「会话已结束」等提示）。 */
const currentTerm = computed(() => (termId.value ? store.terms.get(termId.value) ?? null : null));
/** 会话是否已结束（退出或出错）。 */
const sessionEnded = computed(() => {
  const t = currentTerm.value;
  return !!t && (t.status === 'exited' || t.status === 'error');
});
/** 顶部状态条文案。 */
const statusText = computed(() => {
  const t = currentTerm.value;
  if (!t) return phase.value === 'booting' ? '正在启动终端…' : '';
  if (t.status === 'exited') return `会话已结束（exit ${t.exit_code ?? 0}）`;
  if (t.status === 'error') return t.error_message || '终端出错';
  return `${t.shell}  ·  ${t.cwd}  ·  pid ${t.pid}`;
});

/**
 * xterm 配色：与 styles/theme.ts 的 WorkBuddy 风调色板同源。
 * 亮/暗切换时经 watch 热更新 `terminal.options.theme`（无需重建实例）。
 */
function buildXtermTheme(dark: boolean): ITheme {
  if (dark) {
    return {
      background: '#1e1e1e',
      foreground: '#d4d4d4',
      cursor: '#3b82f6',
      cursorAccent: '#1e1e1e',
      selectionBackground: 'rgba(59, 130, 246, 0.35)',
      black: '#1e1e1e',
      red: '#f87171',
      green: '#4ade80',
      yellow: '#fbbf24',
      blue: '#60a5fa',
      magenta: '#c084fc',
      cyan: '#22d3ee',
      white: '#d4d4d4',
      brightBlack: '#6b7280',
      brightRed: '#fca5a5',
      brightGreen: '#86efac',
      brightYellow: '#fcd34d',
      brightBlue: '#93c5fd',
      brightMagenta: '#d8b4fe',
      brightCyan: '#67e8f9',
      brightWhite: '#f5f5f5',
    };
  }
  return {
    background: '#ffffff',
    foreground: '#1f1f1f',
    cursor: '#2563eb',
    cursorAccent: '#ffffff',
    selectionBackground: 'rgba(59, 130, 246, 0.25)',
    black: '#1f1f1f',
    red: '#dc2626',
    green: '#16a34a',
    yellow: '#ca8a04',
    blue: '#2563eb',
    magenta: '#9333ea',
    cyan: '#0891b2',
    white: '#e5e5e5',
    brightBlack: '#6b7280',
    brightRed: '#ef4444',
    brightGreen: '#22c55e',
    brightYellow: '#eab308',
    brightBlue: '#3b82f6',
    brightMagenta: '#a855f7',
    brightCyan: '#06b6d4',
    brightWhite: '#ffffff',
  };
}

/** 建立连接 → 建 xterm → 开 pty → 接通双向数据流。 */
async function boot(): Promise<void> {
  if (phase.value === 'booting' || phase.value === 'ready') return;
  phase.value = 'booting';
  errorText.value = '';

  await store.ensureConnected();

  // AC4：node-pty 不可用时渲染降级提示，绝不白屏
  if (!store.available) {
    phase.value = 'unavailable';
    return;
  }

  const host = hostRef.value;
  if (!host) {
    phase.value = 'error';
    errorText.value = '终端容器未就绪';
    return;
  }

  const term = new Terminal({
    fontFamily: 'Consolas, "Cascadia Mono", "Fira Code", Menlo, monospace',
    fontSize: 13,
    lineHeight: 1.2,
    cursorBlink: true,
    convertEol: false,
    scrollback: 5000,
    allowProposedApi: true,
    theme: buildXtermTheme(isDark.value),
  });
  const fit = new FitAddon();
  term.loadAddon(fit);
  term.loadAddon(new WebLinksAddon());
  term.open(host);
  safeFit(fit);

  xterm.value = term;
  fitAddon.value = fit;

  try {
    // V3/#19：把当前会话的 workspace 作为 pty 启动 cwd。
    // store.openTerm 已支持 cwd 可选，缺省时仍走服务端 Settings.terminal_cwd → server 启动 cwd 链。
    const sessionWs = chatStore.activeSessionId
      ? chatStore.sessions.find((s) => s.id === chatStore.activeSessionId)?.workspace ?? ''
      : '';
    const id = await store.openTerm(term.cols, term.rows, sessionWs || undefined);
    termId.value = id;

    // 订阅顺序无关：store 会缓冲订阅前到达的输出，冲刷时不丢 shell 首屏提示符
    unsubscribeData = store.onData(id, (data: string) => {
      term.write(data);
    });
    disposables.push(term.onData((data: string) => store.sendInput(id, data)));

    observeResize();
    phase.value = 'ready';
    term.focus();
  } catch (err) {
    phase.value = 'error';
    errorText.value = err instanceof Error ? err.message : String(err);
  }
}

/** fit() 在容器尺寸为 0（Tab 未显示）时会抛，包一层保证不冒泡。 */
function safeFit(fit: FitAddon): void {
  try {
    fit.fit();
  } catch {
    // 容器尚未布局完成，等下一次 ResizeObserver 回调即可
  }
}

/** ResizeObserver → 100ms 节流 → fit() → term.resize（方案 §4.2）。 */
function observeResize(): void {
  const host = hostRef.value;
  if (!host || resizeObserver) return;
  resizeObserver = new ResizeObserver(() => scheduleFit());
  resizeObserver.observe(host);
}

/** 尾沿节流：突发 resize 只在静默 TERMINAL_RESIZE_THROTTLE_MS 后发一帧。 */
function scheduleFit(): void {
  if (resizeTimer) clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    resizeTimer = null;
    applyFit();
  }, TERMINAL_RESIZE_THROTTLE_MS);
}

/** 执行 fit 并把实测 cols/rows 同步给远端 pty（store 内部会去重）。 */
function applyFit(): void {
  const term = xterm.value;
  const fit = fitAddon.value;
  if (!term || !fit) return;
  safeFit(fit);
  if (termId.value) store.resize(termId.value, term.cols, term.rows);
}

/** 出错后重试：清干净再重来一遍。 */
async function retry(): Promise<void> {
  teardown();
  phase.value = 'idle';
  await boot();
}

/** 回收全部资源：关 pty、断订阅、销毁 xterm。 */
function teardown(): void {
  if (resizeTimer) {
    clearTimeout(resizeTimer);
    resizeTimer = null;
  }
  resizeObserver?.disconnect();
  resizeObserver = null;

  unsubscribeData?.();
  unsubscribeData = null;

  for (const d of disposables.splice(0)) d.dispose();

  if (termId.value) {
    store.closeTerm(termId.value);
    store.forgetTerm(termId.value);
    termId.value = '';
  }

  xterm.value?.dispose();
  xterm.value = null;
  fitAddon.value = null;
}

// 主题跟随：亮/暗切换时热更新配色，不重建 pty
watch(isDark, (dark) => {
  const term = xterm.value;
  if (term) term.options.theme = buildXtermTheme(dark);
});

// 会话结束：在终端里留一行醒目提示，避免用户以为卡死
watch(sessionEnded, (ended) => {
  if (ended && xterm.value) {
    xterm.value.write('\r\n\x1b[33m[会话已结束]\x1b[0m\r\n');
  }
});

onMounted(() => {
  void boot();
});

// keep-alive 复用：切回「终端」Tab 时容器尺寸可能已变，重新 fit 一次
onActivated(() => {
  if (phase.value === 'ready') applyFit();
});

onBeforeUnmount(() => {
  teardown();
});
</script>

<template>
  <div class="km-term">
    <div v-if="statusText" class="km-term-status">{{ statusText }}</div>

    <!-- AC4：node-pty 不可用 → 降级提示，其余功能不受影响 -->
    <div v-if="phase === 'unavailable'" class="km-term-fallback">
      <div class="km-term-fallback-title">内置终端不可用</div>
      <p class="km-term-fallback-text">
        {{ store.unavailableReason || 'node-pty 未能加载，终端功能已降级。' }}
      </p>
      <p class="km-term-fallback-hint">
        其余功能不受影响。可在系统终端中手动操作，或重装依赖后重启服务再试。
      </p>
    </div>

    <div v-else-if="phase === 'error'" class="km-term-fallback">
      <div class="km-term-fallback-title">终端启动失败</div>
      <p class="km-term-fallback-text">{{ errorText }}</p>
      <button class="km-term-retry" type="button" @click="retry">重试</button>
    </div>

    <div v-else-if="phase === 'booting'" class="km-term-fallback">
      <p class="km-term-fallback-text">正在连接终端服务…</p>
    </div>

    <!-- 宿主容器常驻（v-show 而非 v-if）：xterm.open() 需要真实已布局的节点 -->
    <div v-show="phase === 'ready'" ref="hostRef" class="km-term-host"></div>

    <div v-if="sessionEnded" class="km-term-footer">
      <button class="km-term-retry" type="button" @click="retry">重新打开终端</button>
    </div>
  </div>
</template>

<style scoped>
.km-term {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 260px;
  height: 100%;
}
.km-term-status {
  font-size: 11px;
  opacity: 0.55;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.km-term-host {
  flex: 1;
  min-height: 240px;
  border: 1px solid var(--km-border);
  border-radius: 8px;
  padding: 8px;
  background: var(--km-bg);
  overflow: hidden;
}
.km-term-fallback {
  border: 1px solid var(--km-border);
  border-radius: 8px;
  padding: 14px;
  background: var(--km-bg);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.km-term-fallback-title { font-size: 13px; font-weight: 600; }
.km-term-fallback-text { font-size: 12px; margin: 0; line-height: 1.7; opacity: 0.75; }
.km-term-fallback-hint { font-size: 12px; margin: 0; line-height: 1.7; opacity: 0.55; }
.km-term-retry {
  align-self: flex-start;
  background: var(--km-panel);
  border: 1px solid var(--km-border);
  border-radius: 6px;
  padding: 5px 12px;
  font-size: 12px;
  cursor: pointer;
  color: var(--km-text);
}
.km-term-retry:hover { border-color: var(--km-accent); }
.km-term-footer { display: flex; justify-content: flex-start; }
</style>
