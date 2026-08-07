/**
 * read/logs.ts — 日志读取（U-07）
 *
 * 从 $HERMES_HOME/logs/*.log 读取扁平日志文件。
 * 支持 kind/level/since/q/limit 参数过滤。
 *
 * @module services/hermes/read/logs
 */

import path from 'node:path';
import fs from 'node:fs';
import { resolveActiveHermesHome } from '../env.js';

export interface LogEntry {
  file: string;
  line: number;
  timestamp: string | null;
  level: string;
  message: string;
  kind: string;
}

export interface LogQuery {
  kind?: string;       // 文件名前缀过滤 (e.g. "hermes", "bridge")
  level?: string;      // 级别过滤 (INFO/WARN/ERROR/DEBUG)
  since?: string;      // ISO 时间戳，只返回此时间之后的条目
  q?: string;          // 全文搜索
  limit?: number;      // 最大返回行数 (default: 200)
}

/**
 * 从日志行中提取时间戳、级别和消息。
 * 常见格式：[2026-08-05 10:00:00] [INFO] message
 */
function parseLogLine(line: string, defaultKind: string): { timestamp: string | null; level: string; message: string } {
  // 尝试匹配标准格式
  const m = line.match(/^\[?(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?)\]?\s*\[?(\w+)\]?\s*(.*)/);
  if (m) {
    return { timestamp: m[1], level: m[2].toUpperCase(), message: m[3].trim() };
  }
  // 回落：整行作为 message，级别 INFO
  return { timestamp: null, level: 'INFO', message: line.trim() };
}

/**
 * 读取 hermes 日志。
 *
 * 扫描 $HERMES_HOME/logs/*.log 扁平文件，
 * 按 kind 前缀过滤、按 since 时间戳裁剪、按 q 全文匹配，
 * 返回最近 limit 条（倒序）。
 */
export function getRealLogs(query: LogQuery = {}): LogEntry[] {
  const hermesHome = resolveActiveHermesHome();
  const logsDir = path.join(hermesHome, 'logs');

  if (!fs.existsSync(logsDir)) return [];

  const limit = query.limit ?? 200;
  const since = query.since ? new Date(query.since).getTime() : 0;

  let files: string[];
  try {
    files = fs.readdirSync(logsDir).filter(f => f.endsWith('.log'));
  } catch {
    return [];
  }

  // 按 kind 过滤
  if (query.kind) {
    files = files.filter(f => f.toLowerCase().startsWith(query.kind!.toLowerCase()));
  }

  const results: LogEntry[] = [];

  for (const file of files) {
    const kind = file.replace(/\.log$/i, '');
    let content: string;
    try {
      content = fs.readFileSync(path.join(logsDir, file), 'utf8');
    } catch {
      continue;
    }

    let lineNum = 0;
    for (const line of content.split(/\r?\n/)) {
      if (!line.trim()) continue;
      lineNum++;
      const parsed = parseLogLine(line, kind);

      // 级别过滤
      if (query.level && parsed.level !== query.level.toUpperCase()) continue;

      // 时间戳过滤
      if (since > 0 && parsed.timestamp) {
        const ts = new Date(parsed.timestamp).getTime();
        if (ts < since) continue;
      }

      // 全文过滤
      if (query.q && !line.toLowerCase().includes(query.q.toLowerCase())) continue;

      results.push({ file, line: lineNum, ...parsed, kind });
    }
  }

  // 倒序（最新在前）并限制
  results.reverse();
  return results.slice(0, limit);
}
