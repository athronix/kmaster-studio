/**
 * stores/logs.test.ts —— 日志 store 单测。
 *
 * 覆盖：Q1 无桥降级 mock / 桥可用时读 4 目录 / A2 双档解析 /
 *       4 维过滤 + 关键字 / 目录切换 / 外部打开 / 持久化往返。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useLogsStore, parseLogFile, mockEntries, defaultFilter } from './logs';
import { DEFAULT_LOG_DIR, LS_KEYS } from '../constants/layout';
import type { DirEntry } from '../utils/desktop-bridge';

const bridgeState = vi.hoisted(() => ({
  hasBridge: false,
  dirs: {} as Record<string, DirEntry[]>,
  files: {} as Record<string, string>,
  opened: [] as string[],
  listThrows: false,
}));

vi.mock('../utils/desktop-bridge', () => ({
  hasFileSystemBridge: vi.fn(() => bridgeState.hasBridge),
  listDir: vi.fn(async (path: string) => {
    if (bridgeState.listThrows) throw new Error('EACCES');
    return bridgeState.dirs[path] ?? [];
  }),
  readTextFile: vi.fn(async (path: string) => bridgeState.files[path] ?? null),
  openPath: vi.fn(async (path: string) => {
    bridgeState.opened.push(path);
    return bridgeState.hasBridge;
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

function dirEntry(dir: string, name: string, mtime: number): DirEntry {
  return { name, path: `${dir}/${name}`, isDirectory: false, size: 100, mtime };
}

describe('stores/logs', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    installMemoryStorage();
    bridgeState.hasBridge = false;
    bridgeState.dirs = {};
    bridgeState.files = {};
    bridgeState.opened = [];
    bridgeState.listThrows = false;
  });

  afterEach(() => {
    delete (globalThis as { localStorage?: Storage }).localStorage;
  });

  it('Q1：无桥环境直接落 mock 数据', async () => {
    const s = useLogsStore();
    await s.load();
    expect(s.isMock).toBe(true);
    expect(s.entries.length).toBe(mockEntries().length);
    expect(s.loading).toBe(false);
    expect(s.loadedAt).toBeGreaterThan(0);
  });

  it('mock 数据按时间倒序且覆盖 4 类来源', async () => {
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

  it('桥可用时遍历 4 个子目录读取并解析', async () => {
    bridgeState.hasBridge = true;
    const base = DEFAULT_LOG_DIR;
    bridgeState.dirs[`${base}/hermes-agent`] = [dirEntry(`${base}/hermes-agent`, 'a.log', 200)];
    bridgeState.dirs[`${base}/cron`] = [dirEntry(`${base}/cron`, 'b.log', 100)];
    bridgeState.files[`${base}/hermes-agent/a.log`] =
      '{"ts":1700000000000,"level":"error","msg":"boom","session_id":"s1"}';
    bridgeState.files[`${base}/cron/b.log`] = '2024-01-02 03:04:05 [WARN] job late';

    const s = useLogsStore();
    await s.load();
    expect(s.isMock).toBe(false);
    expect(s.entries).toHaveLength(2);
    const err = s.entries.find((e) => e.level === 'error');
    expect(err?.kind).toBe('hermes-agent');
    expect(err?.sessionId).toBe('s1');
    const warn = s.entries.find((e) => e.level === 'warning');
    expect(warn?.kind).toBe('cron');
    expect(warn?.summary).toContain('job late');
  });

  it('桥可用但目录为空时仍回落 mock', async () => {
    bridgeState.hasBridge = true;
    const s = useLogsStore();
    await s.load();
    expect(s.isMock).toBe(true);
  });

  it('读取抛错时记录原因并回落 mock，不向外抛', async () => {
    bridgeState.hasBridge = true;
    bridgeState.listThrows = true;
    const s = useLogsStore();
    await expect(s.load()).resolves.toBeUndefined();
    expect(s.error).toContain('EACCES');
    expect(s.isMock).toBe(true);
  });

  it('每类目录最多读 5 个最新文件', async () => {
    bridgeState.hasBridge = true;
    const dir = `${DEFAULT_LOG_DIR}/bridge`;
    bridgeState.dirs[dir] = Array.from({ length: 8 }, (_, i) => dirEntry(dir, `f${i}.log`, i));
    for (let i = 0; i < 8; i += 1) {
      bridgeState.files[`${dir}/f${i}.log`] = `plain line ${i}`;
    }
    const s = useLogsStore();
    await s.load();
    expect(s.entries).toHaveLength(5);
    // 取的是 mtime 最大的 5 个：f7..f3
    expect(s.entries.map((e) => e.summary).sort()).toEqual(
      ['plain line 3', 'plain line 4', 'plain line 5', 'plain line 6', 'plain line 7'].sort()
    );
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

  it('过滤：种类 / 级别 / 关键字 / 会话逐层收窄', async () => {
    const s = useLogsStore();
    await s.load(); // mock 数据
    const total = s.entries.length;
    expect(s.filteredCount).toBe(total);
    expect(s.filterActive).toBe(false);

    s.setFilter({ kind: 'cron' });
    expect(s.filteredCount).toBe(s.countByKind.cron);
    expect(s.filterActive).toBe(true);

    s.resetFilter();
    s.setFilter({ level: 'error' });
    expect(s.filtered.every((e) => e.level === 'error')).toBe(true);

    s.resetFilter();
    s.setFilter({ q: '定时任务' });
    expect(s.filteredCount).toBeGreaterThan(0);
    expect(s.filtered.every((e) => `${e.summary}${e.content}`.includes('定时任务'))).toBe(true);

    s.resetFilter();
    s.setFilter({ sessionId: 'demo-1' });
    expect(s.filtered.every((e) => e.sessionId === 'demo-1')).toBe(true);
  });

  it('时间过滤剔除过旧条目，但保留解析不出时间的条目', async () => {
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
    const s = useLogsStore();
    await s.load();
    expect(s.sessionOptions[0]).toEqual({ label: '全部会话', value: '' });
    const values = s.sessionOptions.map((o) => o.value);
    expect(new Set(values).size).toBe(values.length);
  });

  it('setLogDir 更新目录并重新加载；空串忽略', async () => {
    const s = useLogsStore();
    await s.setLogDir('  ');
    expect(s.logDir).toBe(DEFAULT_LOG_DIR);
    await s.setLogDir('/var/log/kmaster');
    expect(s.logDir).toBe('/var/log/kmaster');
    expect(s.loadedAt).toBeGreaterThan(0);
  });

  it('openExternal 空路径直接 false；有桥时透传 true', async () => {
    const s = useLogsStore();
    await expect(s.openExternal('')).resolves.toBe(false);
    bridgeState.hasBridge = true;
    await expect(s.openExternal('/tmp/a.log')).resolves.toBe(true);
    expect(bridgeState.opened).toContain('/tmp/a.log');
    await expect(s.openLogDir()).resolves.toBe(true);
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
