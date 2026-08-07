// 一次性：列出指定码位的全部「非注释」位点（辅助 A/B/C 人工判定）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const R = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const S = path.join(R, 'packages', 'client', 'src');
const TARGET = new Set(process.argv.slice(2).map((h) => parseInt(h, 16)));
function walk(d, o = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== 'dist') walk(p, o); }
    else o.push(p);
  }
  return o;
}
const out = [];
for (const f of walk(S).filter((f) => /\.(vue|ts|scss)$/.test(f) && !/\.test\.ts$/.test(f))) {
  const r = path.relative(R, f).split(path.sep).join('/');
  fs.readFileSync(f, 'utf8').split(/\r?\n/).forEach((line, i) => {
    const t = line.trim();
    if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') || t.startsWith('<!--')) return;
    const hit = [...line].filter((c) => TARGET.has(c.codePointAt(0)));
    if (hit.length) out.push(`${'U+' + hit[0].codePointAt(0).toString(16).toUpperCase().padStart(4, '0')} ${hit[0]}  ${r}:${i + 1}  ${t.slice(0, 100)}`);
  });
}
out.sort();
fs.writeFileSync(path.join(R, '_q.txt'), out.join('\n') + `\n共 ${out.length} 条\n`, 'utf8');
console.log(out.length);
