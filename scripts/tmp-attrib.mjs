// 一次性归因：把 T3a-3 → T3a-4 的数字变化，拆成「EMOJI_RE 扩类」与「C 类口径统一」两个独立变量。
// 2×2 交叉复算，证明第 8 项（口径统一）对数字的净影响为 0（team-lead 要求的回归自证）。
// 注：本脚本是**归因分析**不是验收闸门，故允许 import splitSFC（复用被测分块以隔离变量）。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { splitSFC } from './uiux-audit.mjs';

const R = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const S = path.join(R, 'packages', 'client', 'src');
const OLD_RE = /[\p{Extended_Pictographic}●○▾✕☰⛶✍✎▸↪⏹⏳⏸⏯↗◐◉⌨✏↻↺▲▶▼◀◂▴]/gv;
const NEW_RE = /[\p{Extended_Pictographic}×←↓↗↪↺↻⊗⋯⌨▲▴▶▸▼▾◀◂◉○●◐☰⛶✍✎✏✓✕⧉＋]/gv;

function walk(d, o = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== 'dist') walk(p, o); }
    else o.push(p);
  }
  return o;
}
const blank = (s) => s.replace(/[^\n]/g, ' ');
const strip = (t, k) =>
  k === 'html'
    ? t.replace(/<!--[\s\S]*?-->/g, blank)
    : t.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/(^|[^:])\/\/[^\n]*/g, (m, p) => p + blank(m.slice(p.length)));
const DF = /\b(icon|avatar)\s*(\?\?|\|\|)\s*['"]|['"]\s*(\?\?|\|\|)\s*['"][^'"]*['"]/;

/** @param re 判据 @param newCmt true=统一口径(stripComments) false=旧口径(行首启发) */
function run(re, newCmt) {
  const fn = new Set(), sc = new Set(), ts = new Set();
  for (const f of walk(S).filter((f) => /\.(vue|ts|scss)$/.test(f) && !/\.test\.ts$/.test(f))) {
    const r = path.relative(R, f).split(path.sep).join('/');
    const raw = fs.readFileSync(f, 'utf8');
    if (f.endsWith('.vue')) {
      const b = splitSFC(raw);
      for (const blk of b.template) {
        strip(blk.text, 'html').split('\n').forEach((line, i) => {
          if (!line.match(re)) return;
          (DF.test(line) ? sc : fn).add(`${r}:${blk.startLine + i}`);
        });
      }
      for (const blk of b.script) {
        const cl = strip(blk.text, 'js').split('\n');
        blk.text.split('\n').forEach((line, i) => {
          if (!line.match(re)) return;
          const isCmt = newCmt ? !(cl[i] || '').match(re) : /^\s*(\/\/|\*|\/\*)/.test(line);
          if (!isCmt) sc.add(`${r}:${blk.startLine + i}`);
        });
      }
    } else {
      strip(raw, f.endsWith('.scss') ? 'css' : 'js').split('\n').forEach((line, i) => {
        if (line.match(re)) ts.add(`${r}:${i + 1}`);
      });
    }
  }
  return { fn, sc, ts };
}

const A = run(OLD_RE, false); // T3a-3 原状
const B = run(NEW_RE, false); // 只改判据
const C = run(OLD_RE, true);  // 只改口径
const D = run(NEW_RE, true);  // T3a-4 定版
const n = (x) => `${x.fn.size} / ${x.sc.size} / ${x.ts.size} = ${x.fn.size + x.sc.size + x.ts.size}`;

const L = [];
L.push('组合（functionalEmoji / sfcScriptEmoji / tsEmoji = 合计）');
L.push(`A 旧判据+旧口径 (T3a-3 原状) : ${n(A)}`);
L.push(`B 新判据+旧口径 (仅扩类)     : ${n(B)}`);
L.push(`C 旧判据+新口径 (仅统一口径) : ${n(C)}`);
L.push(`D 新判据+新口径 (T3a-4 定版) : ${n(D)}`);
L.push('');
L.push(`【第 8 项净影响】A→C 差异: fn ${C.fn.size - A.fn.size} / sc ${C.sc.size - A.sc.size} / ts ${C.ts.size - A.ts.size}   （team-lead 预期全 0）`);
L.push(`【扩类净影响】  A→B 差异: fn ${B.fn.size - A.fn.size} / sc ${B.sc.size - A.sc.size} / ts ${B.ts.size - A.ts.size}`);
L.push(`【交互项】      B→D 差异: fn ${D.fn.size - B.fn.size} / sc ${D.sc.size - B.sc.size} / ts ${D.ts.size - B.ts.size}`);
L.push('');
L.push('══════ 扩类新增位点逐条（D \\ A，按字符归类）══════');
const addFn = [...D.fn].filter((k) => !A.fn.has(k));
const addSc = [...D.sc].filter((k) => !A.sc.has(k));
const addTs = [...D.ts].filter((k) => !A.ts.has(k));
const srcOf = (k) => {
  const i = k.lastIndexOf(':');
  const lines = fs.readFileSync(path.join(R, k.slice(0, i)), 'utf8').split(/\r?\n/);
  return (lines[+k.slice(i + 1) - 1] || '').trim().slice(0, 88);
};
for (const [label, arr] of [['functionalEmoji', addFn], ['sfcScriptEmoji', addSc], ['tsEmoji', addTs]]) {
  L.push(`\n── ${label} 新增 ${arr.length} ──`);
  arr.sort().forEach((k) => {
    const s = srcOf(k);
    const ch = [...new Set(s.match(NEW_RE) || [])].filter((c) => !(OLD_RE.test(c) && (OLD_RE.lastIndex = 0) === 0));
    L.push(`  ${k}  [${[...new Set(s.match(NEW_RE) || [])].join('')}]  ${s}`);
    void ch;
  });
}
L.push('\n══════ 消失位点（A \\ D，应为空）══════');
[...A.fn].filter((k) => !D.fn.has(k)).forEach((k) => L.push(`  fn ${k}`));
[...A.sc].filter((k) => !D.sc.has(k)).forEach((k) => L.push(`  sc ${k}`));
[...A.ts].filter((k) => !D.ts.has(k)).forEach((k) => L.push(`  ts ${k}`));
fs.writeFileSync(path.join(R, '_attrib.txt'), L.join('\n') + '\n', 'utf8');
console.log('ok');
