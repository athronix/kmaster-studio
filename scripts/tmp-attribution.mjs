/**
 * tmp-attribution.mjs —— 195 → 新数 的逐位点归因（一次性）
 * 对同一份代码库分别用「T3a-3 旧 EMOJI_RE」与「T3a-4 定版 EMOJI_RE」计算位点集，输出差集。
 * 目的：新增的每一个位点都要能说清是哪个字符带进来的，不允许「数字涨了但说不清」。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EMOJI_RE } from './uiux-audit.mjs';

const R = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const S = path.join(R, 'packages', 'client', 'src');
const OLD = /[\p{Extended_Pictographic}●○▾✕☰⛶✍✎▸↪⏹⏳⏸⏯↗◐◉⌨✏↻↺▲▶▼◀◂▴]/v;
const NEW = new RegExp(EMOJI_RE.source, 'v');
const NEW_G = new RegExp(EMOJI_RE.source, 'gv');

function walk(d, o = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== 'dist') walk(p, o); }
    else o.push(p);
  }
  return o;
}
const blank = (s) => s.replace(/[^\n]/g, ' ');
const strip = (t) =>
  t.replace(/<!--[\s\S]*?-->/g, blank)
   .replace(/\/\*[\s\S]*?\*\//g, blank)
   .replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + blank(m.slice(p.length)));

// 用「全文 oracle」口径统计（与 verify 同源，独立于 splitSFC），比对 OLD / NEW 两把判据尺子
const rows = [];
for (const f of walk(S).filter((f) => /\.(vue|ts|scss)$/.test(f) && !/\.test\.ts$/.test(f))) {
  const r = path.relative(R, f).split(path.sep).join('/');
  const raw = fs.readFileSync(f, 'utf8');
  const cleaned = strip(raw).split('\n');
  raw.split(/\r?\n/).forEach((line, i) => {
    const code = cleaned[i] || '';           // 剥离全部注释后的纯代码
    if (!code.trim()) return;
    const oldHit = OLD.test(code);
    const newHit = NEW.test(code);
    if (oldHit === newHit) return;
    const chars = [...new Set(code.match(NEW_G) || [])].join('');
    rows.push({ site: `${r}:${i + 1}`, chars, ext: path.extname(f), src: line.trim().slice(0, 88) });
  });
}
const byChar = new Map();
for (const x of rows) for (const c of x.chars) if (!OLD.test(c)) byChar.set(c, (byChar.get(c) || 0) + 1);

const L = [`【T3a-3 旧判据 → T3a-4 定版判据】净增位点：${rows.length}`, ''];
L.push('按新增字符归因（同一位点可能由多个新字符带入，故各字符计数之和 ≥ 位点数）：');
for (const [c, n] of [...byChar].sort((a, b) => b[1] - a[1]))
  L.push(`  ${c}  U+${c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}   ${n} 位点`);
L.push('', '逐位点明细：');
for (const x of rows.sort((a, b) => a.site.localeCompare(b.site)))
  L.push(`  ${x.chars.padEnd(4)} ${x.site}  ${x.src}`);
const byExt = {};
for (const x of rows) byExt[x.ext] = (byExt[x.ext] || 0) + 1;
L.push('', '按扩展名：' + JSON.stringify(byExt));
fs.writeFileSync(path.join(R, '_attr.txt'), L.join('\n') + '\n', 'utf8');
console.log('ok', rows.length);
