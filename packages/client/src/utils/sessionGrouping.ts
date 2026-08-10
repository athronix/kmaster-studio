/**
 * sessionGrouping — 会话分组纯函数模块（SL-01）。
 *
 * 从 `useSessionList.ts` 提取闭包私有函数，下沉为可独立导入/单测的纯函数。
 * 全部函数遵循：入参决定出参，零副作用，零 Vue 响应式依赖。
 *
 * 对应需求：SL-01（主）、SL-02（辅：pinned 函数化）。
 */

import type { Session } from '../types/chat';
import type { WorkspaceGroup, GroupedSessions } from '../composables/useSessionList';
import { workspaceKeyOf, UNBOUND_WORKSPACE_LABEL } from '../composables/useSessionList';
import {
  RECENT_DEFAULTS,
  RECENT_HARD_CAP,
  UNBOUND_WORKSPACE_KEY,
  WORKSPACE_SORT,
} from '../constants/sidebar';
import { isWithinHours } from './time';

/**
 * Recent 并集算法（§3.5 规范实现）：`running ∪ 前 maxCount 条 ∪ withinHours 小时内活跃`。
 *
 * ⚠️ 刻意依赖 JS `Map.set()` 对已存在 key **不改变插入顺序**的语义：
 * running 先入 Map 故稳定居首，其余按 `updated_at` 倒序。单测已锁死此行为。
 *
 * 纯函数：入参决定出参，零副作用。
 */
export function computeRecent(
  all: Session[],
  running: Set<string>,
  now: number = Date.now(),
): Session[] {
  const sorted = [...all]
    .filter((s) => !s.archived)
    .sort((a, b) => b.updated_at - a.updated_at);

  const bucket = new Map<string, Session>();
  // ① running（最高优先级，先入 Map 保证排最前）
  for (const s of sorted) if (running.has(s.id)) bucket.set(s.id, s);
  // ② 倒序前 maxCount 条
  for (const s of sorted.slice(0, RECENT_DEFAULTS.maxCount)) bucket.set(s.id, s);
  // ③ withinHours 小时内活跃
  for (const s of sorted) {
    if (isWithinHours(s.updated_at, RECENT_DEFAULTS.withinHours, now)) bucket.set(s.id, s);
  }
  return [...bucket.values()].slice(0, RECENT_HARD_CAP);
}

/**
 * 工作区分组（§3.5b 规范实现）。
 *
 * 组间：目录名字典序**升序**，未绑定组恒置最末（U7 / PM 裁决，不可改成按活跃度）。
 * 组内：`updated_at` 倒序。
 *
 * 纯函数：入参决定出参，零副作用。
 */
export function computeByWorkspace(all: Session[]): WorkspaceGroup[] {
  const map = new Map<string, Session[]>();
  for (const s of all) {
    if (s.archived) continue; // ✅ 归档过滤（B10-③ / F30）
    // ⚠️ 这里【没有】跳过 pinned 的分支 —— 置顶会话必须同时出现在工作区组（Q8 非互斥）。
    const key = workspaceKeyOf(s);
    const arr = map.get(key);
    if (arr) arr.push(s);
    else map.set(key, [s]);
  }
  return [...map.entries()]
    .sort(([a], [b]) => WORKSPACE_SORT.compareGroup(a, b))
    .map(([key, items]) => ({
      key,
      // 未绑定组展示中文文案，但 key 保持英文字面量不变（F24：它是落库值）
      label: key === UNBOUND_WORKSPACE_KEY ? UNBOUND_WORKSPACE_LABEL : key,
      items: [...items].sort(WORKSPACE_SORT.compareSession),
    }));
}

/**
 * 置顶会话列表：过滤 pinned=true 且未归档，按 updated_at 倒序。
 *
 * 🔴 B10-②：`pinned` 判据是 `s.pinned`（服务端字段），不读本地 Set。
 *
 * 纯函数：入参决定出参，零副作用。
 */
export function computePinned(all: Session[]): Session[] {
  return all.filter((s) => !s.archived && !!s.pinned).sort(WORKSPACE_SORT.compareSession);
}

/**
 * 三分组聚合：一次调用产出 `{ recent, pinned, byWorkspace, archived }`。
 *
 * 内部依次调用三个纯函数，排序顺序为置顶优先 + updated_at 倒序。
 * `archived` 字段由调用方预先筛好传入，本函数不筛选已归档会话。
 *
 * 🔴 Q8 **非互斥**：同一会话可同时出现在 recent、pinned、某工作区组里。
 */
export function getGroupedSessions(
  all: Session[],
  running: Set<string>,
  now?: number,
): GroupedSessions {
  return {
    recent: computeRecent(all, running, now),
    pinned: computePinned(all),
    byWorkspace: computeByWorkspace(all),
    archived: [],
  };
}
