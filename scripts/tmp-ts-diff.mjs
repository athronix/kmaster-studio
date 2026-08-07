#!/usr/bin/env node
/** 临时：定位 .ts 侧 62 vs 61 的那 1 条差值（主理人独立核算，验收后删除） */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'packages/client/src';
const RE = /[\p{Extended_Pictographic}●○▾✕☰⛶✍✎▸↪⏹⏳⏸⏯↗◐◉⌨✏↻↺▲▶▼◀◂▴]/u;

function walk(d, o = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p, o);
    else if (/\.(ts|scss)$/.test(e.name) && !/\.test\.ts$/.test(e.name)) o.push(p.replace(/\\/g, '/'));
  }
  return o;
}

const mine = new Map();
for (const f of walk(ROOT)) {
  fs.readFileSync(f, 'utf8').split(/\r?\n/).forEach((ln, i) => {
    const t = ln.trim();
    if (!t) return;
    if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return;
    if (RE.test(ln)) mine.set(f + ':' + (i + 1), t);
  });
}

// 从 det.log 抽 tsEmoji 分节
const det = fs.readFileSync('det.log', 'utf8').split(/\r?\n/);
const theirs = new Set();
let inSec = false;
for (const line of det) {
  if (/^── /.test(line)) { inSec = line.includes('tsEmoji'); continue; }
  if (!inSec) continue;
  const m = line.match(/(packages\/client\/src\/[^\s:]+):(\d+)/);
  if (m) theirs.add(m[1] + ':' + m[2]);
}

console.log('主理人 oracle : ' + mine.size);
console.log('脚本 tsEmoji  : ' + theirs.size);
const onlyMine = [...mine.keys()].filter((k) => !theirs.has(k));
const onlyTheirs = [...theirs].filter((k) => !mine.has(k));
console.log('\n【oracle 有 · 脚本无】= ' + onlyMine.length);
onlyMine.forEach((k) => console.log('  ' + k + '\n      ' + mine.get(k).slice(0, 140)));
console.log('\n【脚本有 · oracle 无】= ' + onlyTheirs.length);
onlyTheirs.forEach((k) => console.log('  ' + k));
