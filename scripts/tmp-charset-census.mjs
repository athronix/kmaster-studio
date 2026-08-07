#!/usr/bin/env node
/**
 * tmp-charset-census.mjs —— 非 ASCII 码位穷尽普查（T3a-4，一次性工具，定版后删除）
 *
 * 动机：EMOJI_RE 已经扩类五轮，每轮都靠人肉抽样发现漏网字符（●○ → ☰⛶ → ↻↺ → ▲▼ → ＋✓←↓），
 *       这是典型的「补丁循环」——补丁永远追不上未知集合。根治法只有一个：
 *       **反向穷举** —— 不去猜「还有哪些图标字符」，而是把代码库里出现过的**全部非 ASCII 码位**
 *       枚举出来，逐个判定 A/B/C，判完即闭合。从此 EMOJI_RE 的每一个字符都能溯源到本表一行。
 *
 * 口径：
 *   - 扫描面与 uiux-audit.mjs 完全一致：packages/client/src 下 .vue/.ts/.scss，排除 *.test.ts
 *   - 计数单位双轨：charCount（字符出现次数）+ siteCount（file:line 位点数，与审计口径一致）
 *   - 注释识别用最朴素的行首启发（// * /* <!--），只用于辅助人工判 A/B/C，不参与筛选
 *   - CJK 汉字（U+4E00-9FFF / U+3400-4DBF）数量巨大且 100% 是文案，聚合成一行不逐码位列出
 *
 * 输出：docs/audit/_census-raw.txt（逐码位原始表，人工判定后誊写进正式普查文档）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC_ROOT = path.join(REPO_ROOT, 'packages', 'client', 'src');
const OUT = path.join(REPO_ROOT, 'docs', 'audit', '_census-raw.txt');

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === 'dist') continue;
      walk(p, out);
    } else out.push(p);
  }
  return out;
}
const rel = (p) => path.relative(REPO_ROOT, p).split(path.sep).join('/');

const isHan = (cp) =>
  (cp >= 0x4e00 && cp <= 0x9fff) || (cp >= 0x3400 && cp <= 0x4dbf) || (cp >= 0xf900 && cp <= 0xfaff);

const files = walk(SRC_ROOT).filter((f) => /\.(vue|ts|scss)$/.test(f) && !/\.test\.ts$/.test(f));

// cp -> { char, charCount, sites:Set, codeSites:Set(非注释), samples:[] , exts:Set }
const table = new Map();
let hanCharCount = 0;
const hanSites = new Set();

for (const f of files) {
  const r = rel(f);
  const ext = path.extname(f);
  const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/);
  lines.forEach((line, i) => {
    const t = line.trim();
    const isCommentish =
      t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') || t.startsWith('<!--');
    // 用 for...of 遍历，天然按码位（代理对合并为一个字符）
    for (const ch of line) {
      const cp = ch.codePointAt(0);
      if (cp < 0x80) continue;
      if (isHan(cp)) {
        hanCharCount++;
        hanSites.add(`${r}:${i + 1}`);
        continue;
      }
      let e = table.get(cp);
      if (!e) {
        e = { char: ch, charCount: 0, sites: new Set(), codeSites: new Set(), samples: [], exts: new Set() };
        table.set(cp, e);
      }
      e.charCount++;
      e.sites.add(`${r}:${i + 1}`);
      e.exts.add(ext);
      if (!isCommentish) e.codeSites.add(`${r}:${i + 1}`);
      if (e.samples.length < 4 && !e.samples.some((s) => s.startsWith(`${r}:${i + 1} `)))
        e.samples.push(`${r}:${i + 1} ${isCommentish ? '[注释]' : '[代码]'} ${t.slice(0, 96)}`);
    }
  });
}

const hex = (cp) => 'U+' + cp.toString(16).toUpperCase().padStart(4, '0');
const rows = [...table.entries()].sort((a, b) => a[0] - b[0]);

const L = [];
L.push(`扫描文件数: ${files.length}（.vue/.ts/.scss，排除 *.test.ts）`);
L.push(`非 ASCII 非汉字 码位总数: ${rows.length}`);
L.push(`CJK 汉字聚合: 字符 ${hanCharCount} 次 / ${hanSites.size} 位点（100% 文案，不逐码位列出）`);
L.push('');
L.push('码位\t字符\t字符次数\t位点数\t非注释位点数\t出现扩展名\t首个样例');
for (const [cp, e] of rows) {
  L.push(
    [
      hex(cp),
      e.char,
      e.charCount,
      e.sites.size,
      e.codeSites.size,
      [...e.exts].join('|'),
      e.samples[0] || '',
    ].join('\t'),
  );
}
L.push('');
L.push('══════════ 逐码位样例明细（每码位最多 4 条）══════════');
for (const [cp, e] of rows) {
  L.push(`\n【${hex(cp)}】 ${e.char}  字符${e.charCount}次 / 位点${e.sites.size} / 非注释位点${e.codeSites.size}`);
  e.samples.forEach((s) => L.push('   ' + s));
  if (e.sites.size <= 12) L.push('   全部位点: ' + [...e.sites].join(', '));
}

fs.writeFileSync(OUT, L.join('\n') + '\n', 'utf8');
console.log(`written ${OUT}  codepoints=${rows.length}`);
