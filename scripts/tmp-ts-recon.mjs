#!/usr/bin/env node
/** 临时：.ts/.scss 侧口径对账（主理人独立核算，验收后删除） */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'packages/client/src';
const RE = /[\p{Extended_Pictographic}●○▾✕☰⛶✍✎▸↪⏹⏳⏸⏯↗◐◉⌨✏↻↺▲▶▼◀◂▴]/u;
const WIDE = /[\u{1F300}-\u{1FAFF}\u{2300}-\u{23FF}\u{25A0}-\u{25FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2190}-\u{21FF}\u{FF0B}]/u;

function walk(d, o = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) walk(p, o);
    else if (/\.(ts|scss)$/.test(e.name) && !/\.test\.ts$/.test(e.name)) o.push(p.replace(/\\/g, '/'));
  }
  return o;
}

const a = [];
const b = [];
for (const f of walk(ROOT)) {
  fs.readFileSync(f, 'utf8').split(/\r?\n/).forEach((ln, i) => {
    const t = ln.trim();
    if (!t) return;
    if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return;
    if (RE.test(ln)) a.push([f + ':' + (i + 1), t]);
    if (WIDE.test(ln)) b.push([f + ':' + (i + 1), t]);
  });
}

const ak = new Set(a.map((x) => x[0]));
const bk = new Set(b.map((x) => x[0]));
const onlyWide = b.filter((x) => !ak.has(x[0]));
const onlyRe = a.filter((x) => !bk.has(x[0]));

console.log('EMOJI_RE 口径(.ts/.scss): ' + a.length);
console.log('宽扫口径(.ts/.scss)     : ' + b.length);
console.log('\n【宽扫有 · EMOJI_RE 无】= ' + onlyWide.length);
onlyWide.forEach((x) => console.log('  ' + x[0] + '  ' + x[1].slice(0, 100)));
console.log('\n【EMOJI_RE 有 · 宽扫无】= ' + onlyRe.length);
onlyRe.forEach((x) => console.log('  ' + x[0] + '  ' + x[1].slice(0, 100)));
