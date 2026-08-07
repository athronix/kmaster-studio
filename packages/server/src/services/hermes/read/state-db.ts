/**
 * read/state-db.ts — state.db 只读连接器（U-19 C2 核心）
 *
 * 以 readonly: true 打开 hermes state.db，PRAGMA query_only=1 双重保险。
 * 连接池：短 TTL（30s 空闲回收），每次请求 open → query → close。
 * 🚫 绝不对 hermes 数据写入。
 *
 * @module services/hermes/read/state-db
 */

import path from 'node:path';
import Database from 'better-sqlite3';
import { resolveActiveHermesHome } from '../env.js';

// ── 连接池 ──────────────────────────────────────────────────────────────

let _db: Database.Database | null = null;
let _dbOpenTs = 0;
const POOL_IDLE_TTL_MS = 30_000; // 30s 空闲后回收

/** 获取或创建只读 state.db 连接 */
function getDb(): Database.Database {
  if (_db && Date.now() - _dbOpenTs < POOL_IDLE_TTL_MS) {
    _dbOpenTs = Date.now();
    return _db;
  }
  closeDb();
  const hermesHome = resolveActiveHermesHome();
  const dbPath = path.join(hermesHome, 'state.db');
  _db = new Database(dbPath, { readonly: true });
  _db.pragma('query_only = 1');
  _dbOpenTs = Date.now();
  return _db;
}

/** 关闭连接 */
function closeDb(): void {
  if (_db) {
    try { _db.close(); } catch {}
    _db = null;
  }
}

// ── 查询封装 ────────────────────────────────────────────────────────────

export interface StateSession {
  id: string;
  title: string | null;
  archived: number;
  pinned: number;
  cwd: string | null;
  profile_name: string | null;
  started_at: number | null;
  ended_at: number | null;
  message_count: number;
  model: string | null;
  source: string | null;
}

export interface StateMessage {
  id: number;
  session_id: string;
  role: string;
  content: string | null;
  timestamp: number | null;
  token_count: number | null;
  finish_reason: string | null;
  tool_calls: string | null;
  tool_name: string | null;
  reasoning_content: string | null;
}

/**
 * 从 state.db 读取会话列表（U-19 C2 真源切换）。
 *
 * 字段映射（state.db → kmaster API）：
 *   id          → id
 *   title       → title
 *   archived    → archived (0/1)
 *   pinned      → pinned
 *   cwd         → workspace
 *   profile     → profile
 *   created_at  → created_at
 *   updated_at  → updated_at
 */
export function querySessions(): StateSession[] {
  try {
    const db = getDb();
    const rows = db.prepare(`
      SELECT
        s.id,
        s.title,
        COALESCE(s.archived, 0) AS archived,
        COALESCE(s.pinned, 0) AS pinned,
        s.cwd,
        s.profile_name,
        s.started_at,
        s.ended_at,
        (SELECT COUNT(*) FROM messages m WHERE m.session_id = s.id) AS message_count,
        s.model,
        s.source
      FROM sessions s
      ORDER BY COALESCE(s.ended_at, s.started_at) DESC
    `).all() as StateSession[];
    return rows;
  } catch {
    return [];
  }
}

/**
 * 获取单个会话的消息。
 */
export function querySessionMessages(sessionId: string): StateMessage[] {
  try {
    const db = getDb();
    const rows = db.prepare(`
      SELECT id, session_id, role, content, timestamp, token_count, finish_reason,
             tool_calls, tool_name, reasoning_content
      FROM messages
      WHERE session_id = ?
        AND active = 1
        AND compacted = 0
      ORDER BY timestamp ASC
    `).all(sessionId) as StateMessage[];
    return rows;
  } catch {
    return [];
  }
}

/**
 * 获取会话总数。
 */
export function sessionCount(): number {
  try {
    const db = getDb();
    const row = db.prepare('SELECT COUNT(*) AS cnt FROM sessions').get() as { cnt: number };
    return row?.cnt ?? 0;
  } catch {
    return 0;
  }
}

/**
 * 进程退出时关闭连接。
 */
export function closeStateDb(): void {
  closeDb();
}

// ── T07：模型用量查询 ────────────────────────────────────────────────────

/**
 * 从 state.db 查询近 7 天各模型的用量。
 *
 * 读取 session_model_usage 表，按 model 聚合 calls + tokens。
 *
 * @returns model → { calls: number, tokens: number } 映射
 */
export function queryModelUsage(): Record<string, { calls: number; tokens: number }> {
  try {
    const db = getDb();
    const nowSec = Date.now() / 1000;
    const since = nowSec - 7 * 24 * 60 * 60;
    const rows = db.prepare(`
      SELECT
        model,
        SUM(api_call_count) AS calls,
        COALESCE(SUM(input_tokens), 0) + COALESCE(SUM(output_tokens), 0) AS tokens
      FROM session_model_usage
      WHERE last_seen >= ?
      GROUP BY model
      ORDER BY calls DESC
    `).all(since) as Array<{ model: string; calls: number; tokens: number }>;

    const usage: Record<string, { calls: number; tokens: number }> = {};
    for (const row of rows) {
      if (row.model) {
        usage[row.model] = { calls: row.calls, tokens: row.tokens };
      }
    }
    return usage;
  } catch {
    // session_model_usage 表可能不存在（旧版 hermes）→ 返回空
    return {};
  }
}

// 注册退出清理
if (typeof process !== 'undefined') {
  process.on('exit', () => closeDb());
}
