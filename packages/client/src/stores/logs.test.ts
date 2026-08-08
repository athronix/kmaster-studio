/**
 * stores/logs.test.ts —— 日志 store 单测。
 *
 * 契约对齐说明（2026-08-07 QA 修复）：
 * `logs.ts` 已由「desktop-bridge 读本地目录 + 无桥回落 mock」重构为
 * 「统一走 HTTP `GET /api/logs`」（见 logs.ts:25 `import { getLogs } from '../api/client'`
 * 与 logs.ts:201 `isMock` 注释 U-08）。本测试文件原先仍 mock `../utils/desktop-bridge`，
 * 而 store 早已不 import 该模块 —— mock 空转，请求打到真实 http 客户端，
 * node 环境下相对 URL `/api/logs` 无法解析（`Failed to parse URL from ...`），故 9 条断言全红。
 *
 * 现改为 mock `../api/client` 的 `getLogs`，并把断言对齐**现行**契约：
 *   - 数据源：HTTP，不再有目录遍历 / MAX_FILES_PER_KIND；
 *   - 无 mock 回落：`isMock` 恒 false，拉取失败只记 `error`；
 *   - `openExternal` / `openLogDir`：Web 端恒 false（logs.ts:283/288 桩实现）。
 *
 * 覆盖：HTTP 拉取与字段映射 / 排序 / 失败降级 / A2 双档解析 /
 *       4 维过滤 + 关键字 / 目录切换 / 外部打开 / 持久化往返。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useLogsStore, parseLogFile, mockEntries, defaultFilter } from './logs';
import { DEFAULT_LOG_DIR, LS_KEYS } from '../constants/layout';
import type { LogEntry as ApiLogEntry } from '../api/client';

const apiState = vi.hoisted(() => ({
  logs: [] as {
    file: string;
    line: number;
    timestamp: string | null;
    level: string;
    message: string;
    kind: string;
  }[],
  error: null as Error | null,
  lastParams: null as Record<string, unknown> | null,
  calls: 0,
}));

vi.mock('../api/client', () => ({
  getLogs: vi.fn(async (params: Record<string, unknown> = {}) => {
    apiState.calls += 1;
    apiState.lastParams = params;
    if (apiState.error) throw apiState.error;
    return { logs: apiState.logs, count: apiState.logs.length };
  }),
}));

function installMemoryStorage(): void {
  const map = new Map<string, string>();
  (globalThis as { localStorage?: Storage }).localStorage = {
    get length(): number {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
    key: (i: number) => Array.from(map.keys())[i] ?? null,
    removeItem: (k: string) => {
      map.delete(k);
    },
    setItem: (k: string, v: string) => {
      map.set(k, String(v));
    },
  };
}

/** 构造一条服务端形状的日志（`api/client.ts` 的 `LogEntry`）。 */
function apiLog(over: Partial<ApiLogEntry> = {}): ApiLogEntry {
  return {
    file: `${DEFAULT_LOG_DIR}/kmaster-server/a.log`,
    line: 1,
    timestamp: new Date().toISOString(),
    level: 'info',
    message: 'hello',
    kind: 'kmaster-server',
    ...over,
  };
}

/** 4 类来源各一条，时间从早到晚（store 应倒序排列）。 */
function fourKinds(): ApiLogEntry[] {
  const base = Date.parse('2024-05-01T10:00:00Z');
  return [
    apiLog({
      kind: 'kmaster-server',
      line: 1,
      timestamp: new Date(base).toISOString(),
      message: 'kmaster-server 已启动',
    }),
    apiLog({
      kind: 'hermes-agent',
      line: 2,
      timestamp: new Date(base + 1000).toISOString(),
      level: 'error',
      message: 'tool call failed: read_file ENOENT',
    }),
    apiLog({
      kind: 'bridge',
      line: 3,
      timestamp: new Date(base + 2000).toISOString(),
      level: 'warn',
      message: 'preload 未暴露 readTextFile',
    }),
    apiLog({
      kind: 'cron',
      line: 4,
      timestamp: new Date(base + 3000).toISOString(),
      message: '定时任务「每日简报」执行成功',
    }),
  ];
}

describe('stores/logs', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    installMemoryStorage();
    apiState.logs = [];
    apiState.error = null;
    apiState.lastParams = null;
    apiState.calls = 0;
  });

  afterEach(() => {
    delete (globalThis as { localStorage?: Storage }).localStorage;
  });

  it('load 经 /api/logs 拉取并落地（isMock 恒 false）', async () => {
    apiState.logs = fourKinds();
    const s = useLogsStore();
    await s.load();
    expect(s.entries).toHaveLength(4);
    expect(s.loading).toBe(false);
    expect(s.error).toBe('');
    expect(s.loadedAt).toBeGreaterThan(0);
    // U-08：数据源已是真实 API，不再有演示数据回落
    expect(s.isMock).toBe(false);
  });

  it('结果按时间倒序且覆盖 4 类来源', async () => {
    apiState.logs = fourKinds();
    const s = useLogsStore();
    await s.load();
    for (let i = 1; i < s.entries.length; i += 1) {
      expect(s.entries[i - 1].ts).toBeGreaterThanOrEqual(s.entries[i].ts);
    }
    expect(s.countByKind['hermes-agent']).toBeGreaterThan(0);
    expect(s.countByKind.bridge).toBeGreaterThan(0);
    expect(s.countByKind['kmaster-server']).toBeGreaterThan(0);
    expect(s.countByKind.cron).toBeGreaterThan(0);
  });

  it('字段映射：kind / level 归一 / ts / id / file', async () => {
    apiState.logs = [
      apiLog({
        kind: 'hermes-agent',
        file: '/logs/hermes-agent/a.log',
        line: 7,
        level: 'ERROR',
        message: 'boom',
        timestamp: '2024-05-01T10:00:00Z',
      }),
      apiLog({
        kind: 'cron',
        file: '/logs/cron/b.log',
        line: 8,
        level: 'warning',
        message: 'job late',
        timestamp: null,
      }),
    ];
    const s = useLogsStore();
    await s.load();

    const err = s.entries.find((e) => e.level === 'error');
    expect(err?.kind).toBe('hermes-agent');
    expect(err?.id).toBe('/logs/hermes-agent/a.log-7');
    expect(err?.file).toBe('/logs/hermes-agent/a.log');
    expect(err?.ts).toBe(Date.parse('2024-05-01T10:00:00Z'));

    const warn = s.entries.find((e) => e.level === 'warning');
    expect(warn?.kind).toBe('cron');
    expect(warn?.summary).toContain('job late');
    // timestamp 为 null → ts 归零（时间过滤下仍会被保留）
    expect(warn?.ts).toBe(0);
  });

  it('空响应时条目清空且不报错', async () => {
    apiState.logs = [];
    const s = useLogsStore();
    await s.load();
    expect(s.entries).toEqual([]);
    expect(s.error).toBe('');
    expect(s.isMock).toBe(false);
  });

  it('拉取抛错时记录原因，不向外抛', async () => {
    apiState.error = new Error('EACCES');
    const s = useLogsStore();
    await expect(s.load()).resolves.toBeUndefined();
    expect(s.error).toContain('EACCES');
    expect(s.loading).toBe(false);
  });

  it('load 以 limit=500 约束单次拉取量', async () => {
    const s = useLogsStore();
    await s.load();
    expect(apiState.calls).toBe(1);
    expect(apiState.lastParams).toMatchObject({ limit: 500 });
  });

  it('A2：parseLogFile 三档解析（JSON / 正则 / 整行兜底）', () => {
    const content = [
      '{"time":"2024-05-01T10:00:00Z","level":"warn","message":"json line"}',
      '2024-05-01 11:00:00 [ERROR] regex line',
      '一行没有任何结构的日志',
      '',
      '{坏掉的 json',
    ].join('\n');
    const list = parseLogFile('bridge', '/tmp/x.log', content);
    expect(list).toHaveLength(4);
    expect(list[0].level).toBe('warning');
    expect(list[0].summary).toBe('json line');
    expect(list[0].ts).toBeGreaterThan(0);
    expect(list[1].level).toBe('error');
    expect(list[1].summary).toBe('regex line');
    expect(list[2].level).toBe('info');
    expect(list[2].ts).toBe(0);
    expect(list[3].summary).toContain('坏掉的 json');
  });

  it('parseLogFile 支持秒级时间戳', () => {
    const list = parseLogFile('cron', '/tmp/y.log', '{"ts":1700000000,"level":"info","msg":"sec"}');
    expect(list[0].ts).toBe(1_700_000_000_000);
  });

  it('mockEntries 仍产出合法演示数据（导出保留，store 已不再使用）', () => {
    const list = mockEntries();
    expect(list.length).toBeGreaterThan(0);
    for (const e of list) {
      expect(e.id).not.toBe('');
      expect(e.ts).toBeGreaterThan(0);
      expect(['info', 'warning', 'error']).toContain(e.level);
    }
  });

  it('过滤：种类 / 级别 / 关键字 / 会话逐层收窄', async () => {
    apiState.logs = fourKinds();
    const s = useLogsStore();
    await s.load();
    const total = s.entries.length;
    expect(s.filteredCount).toBe(total);
    expect(s.filterActive).toBe(false);

    s.setFilter({ kind: 'cron' });
    expect(s.filteredCount).toBe(s.countByKind.cron);
    expect(s.filterActive).toBe(true);

    s.resetFilter();
    s.setFilter({ level: 'error' });
    expect(s.filteredCount).toBeGreaterThan(0);
    expect(s.filtered.every((e) => e.level === 'error')).toBe(true);

    s.resetFilter();
    s.setFilter({ q: '定时任务' });
    expect(s.filteredCount).toBeGreaterThan(0);
    expect(s.filtered.every((e) => `${e.summary}${e.content}`.includes('定时任务'))).toBe(true);

    // 会话维度：API 映射恒置 sessionId=''，故直接构造带会话的条目验证收窄
    s.resetFilter();
    s.entries = [
      { ...s.entries[0], id: 'a', sessionId: 'demo-1' },
      { ...s.entries[1], id: 'b', sessionId: 'other' },
    ];
    s.setFilter({ sessionId: 'demo-1' });
    expect(s.filtered.map((e) => e.id)).toEqual(['a']);
  });

  it('时间过滤剔除过旧条目，但保留解析不出时间的条目', async () => {
    apiState.logs = fourKinds();
    const s = useLogsStore();
    await s.load();
    s.entries = [
      { ...s.entries[0], id: 'old', ts: Date.now() - 10 * 24 * 3600 * 1000 },
      { ...s.entries[0], id: 'fresh', ts: Date.now() - 1000 },
      { ...s.entries[0], id: 'unknown-ts', ts: 0 },
    ];
    s.setFilter({ time: '24h' });
    const ids = s.filtered.map((e) => e.id);
    expect(ids).toContain('fresh');
    expect(ids).toContain('unknown-ts');
    expect(ids).not.toContain('old');
  });

  it('sessionOptions 去重并带「全部会话」', async () => {
    apiState.logs = fourKinds();
    const s = useLogsStore();
    await s.load();
    s.entries = [
      { ...s.entries[0], id: 'a', sessionId: 'demo-1' },
      { ...s.entries[1], id: 'b', sessionId: 'demo-1' },
      { ...s.entries[2], id: 'c', sessionId: '' },
    ];
    expect(s.sessionOptions[0]).toEqual({ label: '全部会话', value: '' });
    const values = s.sessionOptions.map((o) => o.value);
    expect(new Set(values).size).toBe(values.length);
    expect(values).toContain('demo-1');
  });

  it('setLogDir 更新目录并重新加载；空串忽略', async () => {
    const s = useLogsStore();
    await s.setLogDir('  ');
    expect(s.logDir).toBe(DEFAULT_LOG_DIR);
    await s.setLogDir('/var/log/kmaster');
    expect(s.logDir).toBe('/var/log/kmaster');
    expect(s.loadedAt).toBeGreaterThan(0);
  });

  it('openExternal / openLogDir 在 Web 端恒为 false', async () => {
    const s = useLogsStore();
    await expect(s.openExternal('')).resolves.toBe(false);
    // logs.ts:283/288 目前为 Web 端桩实现，任何路径都不打开外部程序
    await expect(s.openExternal('/tmp/a.log')).resolves.toBe(false);
    await expect(s.openLogDir()).resolves.toBe(false);
  });

  it('persist / hydrate 往返一致', async () => {
    const s = useLogsStore();
    await s.setLogDir('/custom/logs');
    s.setFilter({ kind: 'bridge', level: 'error', q: 'boom' });
    expect(localStorage.getItem(LS_KEYS.logs)).toBeTruthy();

    setActivePinia(createPinia());
    const s2 = useLogsStore();
    s2.hydrate();
    expect(s2.logDir).toBe('/custom/logs');
    expect(s2.filter.kind).toBe('bridge');
    expect(s2.filter.level).toBe('error');
    expect(s2.filter.q).toBe('boom');
  });

  it('hydrate 遇脏数据回落默认过滤', () => {
    localStorage.setItem(LS_KEYS.logs, JSON.stringify({ dir: 123, filter: { time: 'nope', q: 5 } }));
    const s = useLogsStore();
    s.hydrate();
    expect(s.logDir).toBe(DEFAULT_LOG_DIR);
    expect(s.filter.time).toBe(defaultFilter().time);
    expect(s.filter.q).toBe('');
  });
});
