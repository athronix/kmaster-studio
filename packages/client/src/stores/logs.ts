/**
 * stores/logs.ts —— 日志聚合（设计 §3.1 LogsStore + Q1 决策 + 开放事项 A2）。
 *
 * Q1 决策：桌面端经 `desktop-bridge` L3 能力读 4 个日志目录；
 *          Web 端 / 老版桌面壳没有该能力 → 直接落 mock 数据并置 `isMock=true`，
 *          UI 顶部显示「演示数据」提示，功能不残缺。
 * A2 决策：默认根目录 `~/.kmaster/logs`，先按 JSON Lines 解析，失败再走正则兜底。
 *
 * 4 维过滤（时间 / 会话 / 种类 / 级别）+ 关键字，全部在前端内存里做。
 */
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import {
  DEFAULT_LOG_DIR,
  INTERACTION,
  LOG_KIND_OPTIONS,
  LS_KEYS,
  TIME_RANGE_MS,
  lsGet,
  lsSet,
  shortId,
  type LogKind,
  type LogLevel,
} from '../constants/layout';
import { getLogs, type LogEntry as ApiLogEntry } from '../api/client';
import type { LogEntry, LogFilter, LogsSnapshot } from '../types/settings';

/** 日志种类 → 子目录名（A2：`<logDir>/<子目录>/*.log`）。 */
const KIND_DIR: Record<LogKind, string> = {
  'hermes-agent': 'hermes-agent',
  bridge: 'bridge',
  'kmaster-server': 'kmaster-server',
  cron: 'cron',
};

/** 单次加载的文件数上限，防止目录里堆了几百个历史日志把 UI 拖死。 */
const MAX_FILES_PER_KIND = 5;

/** 默认过滤条件（不过滤）。 */
export function defaultFilter(): LogFilter {
  return { time: 'all', sessionId: '', kind: 'all', level: 'all', q: '' };
}

/** JSON Lines 单行的宽松形状。 */
interface RawLogLine {
  ts?: number | string;
  time?: number | string;
  timestamp?: number | string;
  level?: string;
  lvl?: string;
  msg?: string;
  message?: string;
  session_id?: string;
  sessionId?: string;
}

/** 把任意时间表示归一成毫秒时间戳；解析失败返回 0。 */
function toMillis(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) {
    // 10 位当秒，13 位当毫秒
    return v < 1e11 ? Math.round(v * 1000) : Math.round(v);
  }
  if (typeof v === 'string' && v !== '') {
    const parsed = Date.parse(v);
    if (!Number.isNaN(parsed)) return parsed;
    const num = Number(v);
    if (Number.isFinite(num)) return num < 1e11 ? Math.round(num * 1000) : Math.round(num);
  }
  return 0;
}

/** 归一日志级别；未知一律 info。 */
function toLevel(v: unknown): LogLevel {
  const s = String(v ?? '').toLowerCase();
  if (s.startsWith('err') || s === 'fatal' || s === 'critical') return 'error';
  if (s.startsWith('warn')) return 'warning';
  return 'info';
}

/** 从纯文本行里正则兜底提取时间与级别（A2 第二档解析）。 */
const TEXT_LINE_RE =
  /^\s*\[?(?<ts>\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:[.,]\d+)?(?:Z|[+-]\d{2}:?\d{2})?)\]?\s*[-|]?\s*\[?(?<level>[A-Za-z]+)\]?\s*[-|:]?\s*(?<msg>.*)$/;

/** 截断摘要，避免超长单行撑爆列表。 */
function summarize(text: string): string {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.length > 160 ? `${oneLine.slice(0, 160)}…` : oneLine;
}

/**
 * A2：解析单个日志文件内容。
 * 逐行先尝试 JSON Lines，失败再走正则；两者都不匹配则整行当 info 摘要。
 */
export function parseLogFile(kind: LogKind, file: string, content: string): LogEntry[] {
  const out: LogEntry[] = [];
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '') continue;

    // 第一档：JSON Lines
    if (trimmed.startsWith('{')) {
      try {
        const raw = JSON.parse(trimmed) as RawLogLine;
        const msg = raw.msg ?? raw.message ?? trimmed;
        out.push({
          id: shortId('log'),
          ts: toMillis(raw.ts ?? raw.time ?? raw.timestamp),
          kind,
          level: toLevel(raw.level ?? raw.lvl),
          summary: summarize(msg),
          content: trimmed,
          file,
          sessionId: raw.session_id ?? raw.sessionId ?? '',
        });
        continue;
      } catch {
        // 落到正则兜底
      }
    }

    // 第二档：正则
    const m = TEXT_LINE_RE.exec(trimmed);
    if (m && m.groups) {
      out.push({
        id: shortId('log'),
        ts: toMillis(m.groups.ts),
        kind,
        level: toLevel(m.groups.level),
        summary: summarize(m.groups.msg || trimmed),
        content: trimmed,
        file,
        sessionId: '',
      });
      continue;
    }

    // 第三档：整行兜底
    out.push({
      id: shortId('log'),
      ts: 0,
      kind,
      level: 'info',
      summary: summarize(trimmed),
      content: trimmed,
      file,
      sessionId: '',
    });
  }
  return out;
}

/** Web / 无桥环境下的演示数据（isMock=true 时使用）。 */
export function mockEntries(): LogEntry[] {
  const now = Date.now();
  const seed: { kind: LogKind; level: LogLevel; summary: string; offset: number }[] = [
    { kind: 'kmaster-server', level: 'info', summary: 'kmaster-server 已启动，监听 :8787', offset: 60_000 },
    { kind: 'kmaster-server', level: 'info', summary: 'GET /api/health 200 3ms', offset: 55_000 },
    { kind: 'hermes-agent', level: 'info', summary: 'run.started session=demo-1 mode=default', offset: 50_000 },
    { kind: 'hermes-agent', level: 'warning', summary: '上下文接近上限，已触发自动压缩', offset: 42_000 },
    { kind: 'hermes-agent', level: 'error', summary: 'tool call failed: read_file ENOENT', offset: 38_000 },
    { kind: 'bridge', level: 'info', summary: 'desktop bridge ready, platform=win32', offset: 30_000 },
    { kind: 'bridge', level: 'warning', summary: 'preload 未暴露 readTextFile，日志读取降级', offset: 26_000 },
    { kind: 'cron', level: 'info', summary: '定时任务「每日简报」执行成功', offset: 12_000 },
    { kind: 'cron', level: 'error', summary: '定时任务「周报汇总」执行失败：超时', offset: 8_000 },
    { kind: 'kmaster-server', level: 'info', summary: 'WS client connected id=demo-1', offset: 3_000 },
  ];
  return seed.map((s, i) => ({
    id: `mock-log-${i}`,
    ts: now - s.offset,
    kind: s.kind,
    level: s.level,
    summary: s.summary,
    content: `[${new Date(now - s.offset).toISOString()}] [${s.level.toUpperCase()}] ${s.summary}\n（演示数据：当前环境不具备本地日志读取能力）`,
    file: `${DEFAULT_LOG_DIR}/${KIND_DIR[s.kind]}/demo.log`,
    sessionId: s.kind === 'hermes-agent' ? 'demo-1' : '',
  }));
}

/** API 日志 → 本地 LogEntry（字段映射） */
function fromApi(api: ApiLogEntry): LogEntry {
  return {
    id: api.file + '-' + api.line,
    ts: api.timestamp ? Date.parse(api.timestamp) : 0,
    kind: api.kind as LogKind,
    level: api.level.toLowerCase().startsWith('err') ? 'error' : api.level.toLowerCase().startsWith('warn') ? 'warning' : 'info',
    summary: api.message.slice(0, 160),
    content: api.message,
    file: api.file,
    sessionId: '',
  };
}

export const useLogsStore = defineStore('logs', () => {
  const entries = ref<LogEntry[]>([]);
  const filter = ref<LogFilter>(defaultFilter());
  const logDir = ref<string>(DEFAULT_LOG_DIR);
  const loading = ref<boolean>(false);
  const error = ref<string>('');
  const loadedAt = ref<number>(0);
  const isMock = ref<boolean>(false); // U-08: always false since API is real

  // ═══════════════════════ derived ═══════════════════════

  /** 过滤后的日志（时间 → 会话 → 种类 → 级别 → 关键字，逐层收窄）。 */
  const filtered = computed<LogEntry[]>(() => {
    const f = filter.value;
    const span = TIME_RANGE_MS[f.time] ?? Number.POSITIVE_INFINITY;
    const since = Number.isFinite(span) ? Date.now() - span : Number.NEGATIVE_INFINITY;
    const keyword = f.q.trim().toLowerCase();
    const sid = f.sessionId.trim();

    return entries.value.filter((e) => {
      // ts=0 表示解析不出时间，任何时间区间下都保留，避免「筛没了」
      if (e.ts !== 0 && e.ts < since) return false;
      if (sid !== '' && e.sessionId !== sid) return false;
      if (f.kind !== 'all' && e.kind !== f.kind) return false;
      if (f.level !== 'all' && e.level !== f.level) return false;
      if (keyword !== '') {
        const hay = `${e.summary}\n${e.content}`.toLowerCase();
        if (!hay.includes(keyword)) return false;
      }
      return true;
    });
  });

  /** 过滤结果条数（LogSection 头部计数）。 */
  const filteredCount = computed<number>(() => filtered.value.length);

  /** 是否有任一过滤维度处于激活状态。 */
  const filterActive = computed<boolean>(() => {
    const f = filter.value;
    return f.time !== 'all' || f.sessionId !== '' || f.kind !== 'all' || f.level !== 'all' || f.q !== '';
  });

  /** 出现过的会话 id（会话过滤下拉的数据源）。 */
  const sessionOptions = computed<{ label: string; value: string }[]>(() => {
    const ids = new Set<string>();
    for (const e of entries.value) {
      if (e.sessionId !== '') ids.add(e.sessionId);
    }
    return [{ label: '全部会话', value: '' }, ...Array.from(ids).map((id) => ({ label: id, value: id }))];
  });

  /** 按种类统计条数（顶部徽标）。 */
  const countByKind = computed<Record<LogKind, number>>(() => {
    const acc = { 'hermes-agent': 0, bridge: 0, 'kmaster-server': 0, cron: 0 } as Record<LogKind, number>;
    for (const e of entries.value) acc[e.kind] += 1;
    return acc;
  });

  // ═══════════════════════ actions ═══════════════════════

  /**
   * 加载日志。
   * 桌面端：遍历 4 个子目录，取最近修改的若干 `.log` 文件读取解析；
   * 无桥 / 读不到任何内容：落 mock 数据并置 isMock=true（不报错，功能不残缺）。
   */
  async function load(): Promise<void> {
    loading.value = true;
    error.value = '';
    try {
      const res = await getLogs({ limit: 500 });
      entries.value = res.logs.map(fromApi).sort((a, b) => b.ts - a.ts);
      loadedAt.value = Date.now();
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err);
    } finally {
      loading.value = false;
    }
  }

  /** 更换日志目录并重新加载（同时落盘）。 */
  async function setLogDir(dir: string): Promise<void> {
    const next = dir.trim();
    if (next === '') return;
    logDir.value = next;
    persist();
    await load();
  }

  /** 用系统默认应用打开日志文件；Web 端不可用。 */
  async function openExternal(_file: string): Promise<boolean> {
    return false;
  }

  /** 打开日志根目录。 */
  async function openLogDir(): Promise<boolean> {
    return false;
  }

  /** 部分更新过滤条件并落盘。 */
  function setFilter(patch: Partial<LogFilter>): void {
    filter.value = { ...filter.value, ...patch };
    persist();
  }

  /** 重置过滤条件。 */
  function resetFilter(): void {
    filter.value = defaultFilter();
    persist();
  }

  /** 拼路径 */
  function joinPath(_base: string, _sub: string): string {
    return '';
  }

  // ═══════════════════════ persistence ═══════════════════════

  /** 落盘目录与过滤条件（日志正文本身不落盘）。 */
  function persist(): void {
    lsSet(LS_KEYS.logs, { dir: logDir.value, filter: filter.value } satisfies LogsSnapshot);
  }

  /** 从 localStorage 恢复目录与过滤条件。 */
  function hydrate(): void {
    const snap = lsGet<Partial<LogsSnapshot>>(LS_KEYS.logs, {});
    logDir.value = typeof snap.dir === 'string' && snap.dir !== '' ? snap.dir : DEFAULT_LOG_DIR;
    const base = defaultFilter();
    const raw = (snap.filter ?? {}) as Partial<LogFilter>;
    filter.value = {
      time: typeof raw.time === 'string' && raw.time in TIME_RANGE_MS ? raw.time : base.time,
      sessionId: typeof raw.sessionId === 'string' ? raw.sessionId : base.sessionId,
      kind: typeof raw.kind === 'string' ? (raw.kind as LogFilter['kind']) : base.kind,
      level: typeof raw.level === 'string' ? (raw.level as LogFilter['level']) : base.level,
      q: typeof raw.q === 'string' ? raw.q : base.q,
    };
  }

  return {
    // state
    entries,
    filter,
    logDir,
    loading,
    isMock,
    error,
    loadedAt,
    // derived
    filtered,
    filteredCount,
    filterActive,
    sessionOptions,
    countByKind,
    // actions
    load,
    setLogDir,
    openExternal,
    openLogDir,
    setFilter,
    resetFilter,
    // persistence
    persist,
    hydrate,
  };
});
