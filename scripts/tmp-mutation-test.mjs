/**
 * tmp-mutation-test.mjs —— 变异测试：证明 verify-scan-coverage.mjs 的闸门① 真的有牙齿
 *
 * 差集为 0 有两种可能：(a) 真的没漏；(b) 验证是同义反复（T3a-3 的病）。
 * 区分方法只有一个：**故意注入一个已知缺陷，看闸门抓不抓得住**。
 * 抓得住 → 差集 0 是有含金量的 0；抓不住 → 又是自证循环。
 *
 * 做法：不改生产文件（team-lead 正在并发编辑），而是复制出「变异体」：
 *   tmp-mutant-audit.mjs  = uiux-audit.mjs，splitSFC 回退成 T3a-3 修复前的非贪婪配对版（已知漏 27 位点）
 *   tmp-mutant-verify.mjs = verify-scan-coverage.mjs，import 指向变异体
 * 期望：变异体 verify 报出 >0 漏扫并 exit 1。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const R = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const S = path.join(R, 'scripts');

let a = fs.readFileSync(path.join(S, 'uiux-audit.mjs'), 'utf8');
const GOOD = "  const re = /^<(template|script|style)([^>]*)>([\\s\\S]*?)^<\\/\\1>[ \\t]*\\r?$/gm;";
// 变异：回退为 T3a-3 修复前的实现（非行首锚定 + startLine+1）
const BAD =
  "  const re = /<(template|script|style)([^>]*)>([\\s\\S]*?)<\\/\\1>/g;";
if (!a.includes(GOOD)) {
  console.error('❌ 未找到目标行，splitSFC 已被改动，变异测试中止');
  process.exit(2);
}
a = a.replace(GOOD, BAD);
fs.writeFileSync(path.join(S, 'tmp-mutant-audit.mjs'), a, 'utf8');

let v = fs.readFileSync(path.join(S, 'verify-scan-coverage.mjs'), 'utf8');
// 只改真正的 import 语句行——不能用 replace(字符串)，那样会命中文档注释里的首个同名字符串
const IMP = "import { EMOJI_RE, audit } from './uiux-audit.mjs';";
if (!v.includes(IMP)) {
  console.error('❌ 未找到 verify 的 import 语句，变异测试中止');
  process.exit(2);
}
v = v.replace(IMP, "import { EMOJI_RE, audit } from './tmp-mutant-audit.mjs';");
fs.writeFileSync(path.join(S, 'tmp-mutant-verify.mjs'), v, 'utf8');
console.log('变异体已生成：tmp-mutant-audit.mjs（splitSFC 回退为非贪婪配对）+ tmp-mutant-verify.mjs（import 已改指变异体）');
