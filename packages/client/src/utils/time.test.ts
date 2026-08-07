/**
 * utils/time 单测（B2）。
 *
 * 覆盖设计验收要求的 9 个边界：0 / 59s / 60s / 59min / 60min / 23h / 24h / 6d / 7d，
 * 外加跨年绝对格式、未来时间分支（F25）、`YYYY-MM-DD HH:mm:ss` 本地串解析（U6）。
 */
import { describe, it, expect } from 'vitest';
import { timeAgo, formatDuration, isWithinHours, toTimestamp, formatDate, formatDateTime } from './time';

/** 固定参照时刻：2026-08-06 12:00:00 本地时间。 */
const NOW = new Date(2026, 7, 6, 12, 0, 0).getTime();

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe('timeAgo —— 9 个档位边界', () => {
  it('① 0 秒 → 刚刚', () => {
    expect(timeAgo(NOW, NOW)).toBe('刚刚');
  });

  it('② 59 秒 → 刚刚（仍在 <60s 档）', () => {
    expect(timeAgo(NOW - 59 * SECOND, NOW)).toBe('刚刚');
  });

  it('③ 60 秒 → 1 分钟前（跨档）', () => {
    expect(timeAgo(NOW - 60 * SECOND, NOW)).toBe('1 分钟前');
  });

  it('④ 59 分钟 → 59 分钟前', () => {
    expect(timeAgo(NOW - 59 * MINUTE, NOW)).toBe('59 分钟前');
  });

  it('⑤ 60 分钟 → 1 小时前（跨档）', () => {
    expect(timeAgo(NOW - 60 * MINUTE, NOW)).toBe('1 小时前');
  });

  it('⑥ 23 小时 → 23 小时前', () => {
    expect(timeAgo(NOW - 23 * HOUR, NOW)).toBe('23 小时前');
  });

  it('⑦ 24 小时 → 1 天前（跨档）', () => {
    expect(timeAgo(NOW - 24 * HOUR, NOW)).toBe('1 天前');
  });

  it('⑧ 6 天 → 6 天前', () => {
    expect(timeAgo(NOW - 6 * DAY, NOW)).toBe('6 天前');
  });

  it('⑨ 7 天 → 绝对日期 YYYY-MM-DD（跨档）', () => {
    // NOW - 7d = 2026-07-30
    expect(timeAgo(NOW - 7 * DAY, NOW)).toBe('2026-07-30');
  });
});

describe('timeAgo —— 绝对格式与跨年', () => {
  it('跨年时间显示 YYYY-MM-DD，年份正确回退', () => {
    const lastYear = new Date(2025, 11, 25, 8, 30, 0).getTime();
    expect(timeAgo(lastYear, NOW)).toBe('2025-12-25');
  });

  it('月/日补零到两位', () => {
    const early = new Date(2026, 0, 3, 0, 0, 0).getTime();
    expect(timeAgo(early, NOW)).toBe('2026-01-03');
  });
});

describe('timeAgo —— 未来时间分支（F25：CronJob.next_run_at）', () => {
  it('30 秒后 → 即将', () => {
    expect(timeAgo(NOW + 30 * SECOND, NOW)).toBe('即将');
  });

  it('5 分钟后 → 5 分钟后', () => {
    expect(timeAgo(NOW + 5 * MINUTE, NOW)).toBe('5 分钟后');
  });

  it('2 小时后 → 2 小时后', () => {
    expect(timeAgo(NOW + 2 * HOUR, NOW)).toBe('2 小时后');
  });

  it('3 天后 → 3 天后', () => {
    expect(timeAgo(NOW + 3 * DAY, NOW)).toBe('3 天后');
  });

  it('10 天后 → 绝对日期（超 7 天不再用相对文案）', () => {
    expect(timeAgo(NOW + 10 * DAY, NOW)).toBe('2026-08-16');
  });
});

describe('timeAgo / toTimestamp —— 入参类型兼容（F27 + U6）', () => {
  it('接受 number 毫秒时间戳（Session.updated_at）', () => {
    expect(timeAgo(NOW - 2 * HOUR, NOW)).toBe('2 小时前');
  });

  it('接受 "YYYY-MM-DD HH:mm:ss" 本地串（CronRun.run_time），按本地时区解析', () => {
    // 本地 11:00:00，相对本地 12:00:00 应为 1 小时前；若被当成 UTC 会偏移出错
    expect(timeAgo('2026-08-06 11:00:00', NOW)).toBe('1 小时前');
  });

  it('接受 ISO 串', () => {
    const iso = new Date(NOW - 3 * HOUR).toISOString();
    expect(timeAgo(iso, NOW)).toBe('3 小时前');
  });

  it('接受纯数字字符串', () => {
    expect(toTimestamp(String(NOW))).toBe(NOW);
  });

  it('null / undefined / 空串 / 乱码 → 返回 —', () => {
    expect(timeAgo(null, NOW)).toBe('—');
    expect(timeAgo(undefined, NOW)).toBe('—');
    expect(timeAgo('', NOW)).toBe('—');
    expect(timeAgo('not-a-date', NOW)).toBe('—');
  });
});

describe('formatDate / formatDateTime', () => {
  it('formatDate 输出 YYYY-MM-DD', () => {
    expect(formatDate(NOW)).toBe('2026-08-06');
  });

  it('formatDateTime 输出 YYYY-MM-DD HH:mm:ss 且补零', () => {
    const t = new Date(2026, 0, 2, 3, 4, 5).getTime();
    expect(formatDateTime(t)).toBe('2026-01-02 03:04:05');
  });

  it('无法解析返回 —', () => {
    expect(formatDate('xxx')).toBe('—');
    expect(formatDateTime(null)).toBe('—');
  });
});

describe('formatDuration —— 四档 + 缺失语义', () => {
  it('<1 秒 → <1秒', () => {
    expect(formatDuration(0)).toBe('<1秒');
    expect(formatDuration(999)).toBe('<1秒');
  });

  it('秒级 → N秒', () => {
    expect(formatDuration(12_000)).toBe('12秒');
    expect(formatDuration(59_999)).toBe('59秒');
  });

  it('分级 → N分M秒', () => {
    expect(formatDuration(3 * MINUTE + 12 * SECOND)).toBe('3分12秒');
    expect(formatDuration(60_000)).toBe('1分0秒');
  });

  it('小时级 → N小时M分', () => {
    expect(formatDuration(HOUR + 3 * MINUTE)).toBe('1小时3分');
    expect(formatDuration(2 * HOUR)).toBe('2小时0分');
  });

  it('undefined / null / 负数 / NaN → —（§7.1：后端省略 key 时的收敛）', () => {
    expect(formatDuration(undefined)).toBe('—');
    expect(formatDuration(null)).toBe('—');
    expect(formatDuration(-1)).toBe('—');
    expect(formatDuration(Number.NaN)).toBe('—');
  });
});

describe('isWithinHours —— Recent 并集第 ③ 步', () => {
  it('窗口内返回 true（含边界）', () => {
    expect(isWithinHours(NOW - 2 * HOUR, 3, NOW)).toBe(true);
    expect(isWithinHours(NOW - 3 * HOUR, 3, NOW)).toBe(true);
  });

  it('窗口外返回 false', () => {
    expect(isWithinHours(NOW - 3 * HOUR - 1, 3, NOW)).toBe(false);
    expect(isWithinHours(NOW - 10 * HOUR, 3, NOW)).toBe(false);
  });

  it('未来时间视为窗口内', () => {
    expect(isWithinHours(NOW + HOUR, 3, NOW)).toBe(true);
  });

  it('无法解析 / 非法小时数 → false', () => {
    expect(isWithinHours('bad', 3, NOW)).toBe(false);
    expect(isWithinHours(NOW, 0, NOW)).toBe(false);
    expect(isWithinHours(NOW, -1, NOW)).toBe(false);
  });
});
