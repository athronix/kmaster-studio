/**
 * utils/time.ts —— 相对时间与时长格式化（B1）。
 *
 * 用途：左栏会话副行、定时任务下次运行时间、运行详情耗时。
 * 数据源：`Session.updated_at`（number 毫秒）、`CronJob.next_run_at`（本地时间字符串）、
 *         `CronRun.run_time`（`YYYY-MM-DD HH:mm:ss` 本地串）、`CronRun.duration_ms`（number）。
 * 对应需求：F-05 / F-09 / F-10。
 *
 * ⚠️ 零第三方依赖（设计 §1.2）：只需 5 档中文文案，引 dayjs 不划算。
 */

/** 一秒 / 一分 / 一小时 / 一天的毫秒数。 */
const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

/** 两位补零。 */
function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/**
 * 把多种时间表示解析为毫秒时间戳。
 *
 * 支持三类入参（F27：两个调用方类型不同，必须都兼容）：
 *   - `number`：已是毫秒时间戳，原样返回；
 *   - `'YYYY-MM-DD HH:mm:ss'`：**本地时间字符串**（`CronRun.run_time` / `CronJob.next_run_at`，
 *     U6 裁定：不是 ISO，直接 `new Date(str)` 在部分浏览器会按 UTC 解析导致时区偏移，
 *     故先把空格替换为 `T` 交给本地时间解析）；
 *   - 其他字符串：交给 `Date` 兜底解析（ISO 等）。
 *
 * @returns 毫秒时间戳；无法解析返回 `NaN`
 */
export function toTimestamp(input: number | string | null | undefined): number {
  if (input === null || input === undefined || input === '') return Number.NaN;
  if (typeof input === 'number') return Number.isFinite(input) ? input : Number.NaN;

  const text = String(input).trim();
  if (text === '') return Number.NaN;

  // 纯数字串（如 '1754450000000'）按时间戳处理
  if (/^\d+$/.test(text)) {
    const n = Number(text);
    return Number.isFinite(n) ? n : Number.NaN;
  }

  // 'YYYY-MM-DD HH:mm:ss' → 'YYYY-MM-DDTHH:mm:ss'（本地时区解析，U6）
  const normalized = /^\d{4}-\d{2}-\d{2}[ T]/.test(text) ? text.replace(' ', 'T') : text;
  const ts = new Date(normalized).getTime();
  return Number.isFinite(ts) ? ts : Number.NaN;
}

/** 格式化为 `YYYY-MM-DD` 绝对日期。 */
export function formatDate(input: number | string | null | undefined): string {
  const ts = toTimestamp(input);
  if (Number.isNaN(ts)) return '—';
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** 格式化为 `YYYY-MM-DD HH:mm:ss` 绝对时间。 */
export function formatDateTime(input: number | string | null | undefined): string {
  const ts = toTimestamp(input);
  if (Number.isNaN(ts)) return '—';
  const d = new Date(ts);
  return (
    `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ` +
    `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
  );
}

/**
 * 相对时间文案（B1 核心）。
 *
 * 档位（过去时间）：
 *   `<60s` → 刚刚；`<60min` → N 分钟前；`<24h` → N 小时前；`<7d` → N 天前；`≥7d` → `YYYY-MM-DD`
 *
 * 未来时间（`CronJob.next_run_at` 场景，F25/v1.1 新增分支）：
 *   `<60s` → 即将；`<60min` → N 分钟后；`<24h` → N 小时后；`<7d` → N 天后；`≥7d` → `YYYY-MM-DD`
 *
 * @param input 毫秒时间戳 / 本地时间字符串（签名必须兼容两者，见 F27）
 * @param now 参照时刻，便于单测注入
 * @returns 相对时间文案；无法解析返回 `'—'`
 */
export function timeAgo(input: number | string | null | undefined, now: number = Date.now()): string {
  const ts = toTimestamp(input);
  if (Number.isNaN(ts)) return '—';

  const diff = now - ts;
  const future = diff < 0;
  const abs = Math.abs(diff);

  // ≥7 天一律显示绝对日期（过去未来同规则）
  if (abs >= WEEK) return formatDate(ts);

  if (abs < MINUTE) return future ? '即将' : '刚刚';
  if (abs < HOUR) {
    const n = Math.floor(abs / MINUTE);
    return future ? `${n} 分钟后` : `${n} 分钟前`;
  }
  if (abs < DAY) {
    const n = Math.floor(abs / HOUR);
    return future ? `${n} 小时后` : `${n} 小时前`;
  }
  const n = Math.floor(abs / DAY);
  return future ? `${n} 天后` : `${n} 天前`;
}

/**
 * 时长格式化（运行详情「耗时」用）。
 *
 * 档位：`<1s → '<1秒'`、`'12秒'`、`'3分12秒'`、`'1小时3分'`。
 *
 * @param ms 毫秒；`undefined`/`null`/非有限数/负数一律返回 `'—'`
 *   （§7.1：后端解析不到该字段时会**省略 key**，前端在此收敛为「—」）
 */
export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '—';
  if (!Number.isFinite(ms) || ms < 0) return '—';
  if (ms < SECOND) return '<1秒';

  const totalSeconds = Math.floor(ms / SECOND);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) return `${hours}小时${minutes}分`;
  if (minutes > 0) return `${minutes}分${seconds}秒`;
  return `${seconds}秒`;
}

/**
 * 判断时间是否落在最近 N 小时内（Recent 并集算法第 ③ 步用）。
 *
 * @param input 毫秒时间戳 / 时间字符串
 * @param hours 小时数
 * @param now 参照时刻，便于单测注入
 * @returns 无法解析或超出窗口返回 `false`；未来时间视为「在窗口内」
 */
export function isWithinHours(
  input: number | string | null | undefined,
  hours: number,
  now: number = Date.now()
): boolean {
  const ts = toTimestamp(input);
  if (Number.isNaN(ts)) return false;
  if (!Number.isFinite(hours) || hours <= 0) return false;
  return ts >= now - hours * HOUR;
}
