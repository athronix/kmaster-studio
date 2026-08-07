#!/usr/bin/env node
/**
 * tmp-reconcile.mjs — 主理人独立对账工具（临时，验收后删除）
 *
 * 目的：用「全文宽字符集扫描」这一**更简单、显然正确的参考实现**，
 *       反证 uiux-audit.mjs 的 splitSFC 分块扫描没有漏位点。
 *       关键：本脚本刻意 **不 import 任何 uiux-audit.mjs 的实现**，
 *       也 **不复刻 splitSFC**——它整个绕过分块，直接扫全文。
 *       这才是独立验证的正确形态（差分测试：简单参考实现 vs 复杂被测实现）。
 *
 * 比对口径：仅取 det.log 中的 **emoji 类指标**两节（功能性 emoji(template) + sfcScriptEmoji），
 *          合计应为 78 + 56 = 134，与全文宽扫的 147 比对。
 *          差集必须 100% 落在「类 B 文案标点豁免」内，否则即为漏扫。
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'packages/client/src';
// 宽口径：涵盖 Emoji、箭头、几何图形、杂项符号、装饰符号、全角加号
const WIDE = /[\u{1F300}-\u{1FAFF}\u{2300}-\u{23FF}\u{25A0}-\u{25FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{2190}-\u{21FF}\u{FF0B}]/u;

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.vue')) out.push(p.replace(/\\/g, '/'));
  }
  return out;
}

// —— A. 参考实现：全文逐行扫描，不做任何 SFC 分块 ——
const wideHits = new Map(); // "file:line" -> 行内容
for (const f of walk(ROOT)) {
  const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/);
  lines.forEach((ln, i) => {
    const t = ln.trim();
    if (!t) return;
    if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') || t.startsWith('<!--')) return;
    if (WIDE.test(ln)) wideHits.set(`${f}:${i + 1}`, t);
  });
}

// —— B. 被测实现：只取 det.log 的两个 emoji 分节 ——
const det = fs.readFileSync('det.log', 'utf8').split(/\r?\n/);
const EMOJI_SECTIONS = ['功能性 emoji(template)', 'sfcScriptEmoji(.vue script)'];
const scriptHits = new Map();
let inSection = false;
for (const line of det) {
  if (/^── /.test(line)) {
    inSection = EMOJI_SECTIONS.some((s) => line.includes(s));
    continue;
  }
  if (!inSection) continue;
  const m = line.match(/(packages\/client\/src\/[^\s:]+\.vue):(\d+)/);
  if (m) scriptHits.set(`${m[1]}:${m[2]}`, line.trim());
}

const onlyWide = [...wideHits.keys()].filter((k) => !scriptHits.has(k)).sort();
const onlyScript = [...scriptHits.keys()].filter((k) => !wideHits.has(k)).sort();

console.log(`A 全文宽扫(.vue)          : ${wideHits.size}`);
console.log(`B 脚本 emoji 明细(.vue)   : ${scriptHits.size}`);
console.log(`\n【A 有 B 无】= ${onlyWide.length}（须 100% 为类 B 文案标点豁免，否则=漏扫）`);
for (const k of onlyWide) console.log(`  ${k}  ${wideHits.get(k).slice(0, 110)}`);
console.log(`\n【B 有 A 无】= ${onlyScript.length}（脚本抓到但宽扫漏掉，说明宽扫字符集更窄）`);
for (const k of onlyScript) console.log(`  ${k}  ${scriptHits.get(k).slice(0, 110)}`);
