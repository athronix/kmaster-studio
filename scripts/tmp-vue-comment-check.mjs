#!/usr/bin/env node
/**
 * 临时：检查 .vue <script> 块内「行尾内联注释中的 emoji」是否被误记为违规
 * 背景：uiux-audit.mjs 对 .ts 走 stripComments（剥离行尾注释），
 *       对 .vue <script> 只用 /^\s*(\/\/|\*|\/\*)/ 判行首注释 → 两套 C 类标准。
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'packages/client/src';
const RE = /[\p{Extended_Pictographic}●○▾✕☰⛶✍✎▸↪⏹⏳⏸⏯↗◐◉⌨✏↻↺▲▶▼◀◂▴]/u;

function walk(d, o = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p, o);
    else if (e.name.endsWith('.vue')) o.push(p.replace(/\\/g, '/'));
  }
  return o;
}

// 从 det.log 抽 sfcScriptEmoji 分节的位点
const det = fs.readFileSync('det.log', 'utf8').split(/\r?\n/);
const reported = new Set();
let inSec = false;
for (const line of det) {
  if (/^── /.test(line)) { inSec = line.includes('sfcScriptEmoji'); continue; }
  if (!inSec) continue;
  const m = line.match(/(packages\/client\/src\/[^\s:]+\.vue):(\d+)/);
  if (m) reported.add(m[1] + ':' + m[2]);
}

// 在源码里找：命中 EMOJI_RE 且 emoji 只出现在行尾注释之后的行
const suspects = [];
for (const f of walk(ROOT)) {
  fs.readFileSync(f, 'utf8').split(/\r?\n/).forEach((ln, i) => {
    const key = f + ':' + (i + 1);
    if (!reported.has(key)) return;
    const t = ln.trim();
    if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return; // 行首注释，脚本已排除
    const idx = ln.indexOf('//');
    if (idx < 0) return;
    const before = ln.slice(0, idx);
    const after = ln.slice(idx);
    if (!RE.test(before) && RE.test(after)) suspects.push([key, t]);
  });
}

console.log('sfcScriptEmoji 报告位点数: ' + reported.size);
console.log('其中「emoji 仅存在于行尾注释」= ' + suspects.length + '（若 >0 = 与 .ts 侧 C 类标准不一致的误报）');
suspects.forEach((s) => console.log('  ' + s[0] + '\n      ' + s[1].slice(0, 140)));
