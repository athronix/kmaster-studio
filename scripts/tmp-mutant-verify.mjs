#!/usr/bin/env node
/**
 * verify-scan-coverage.mjs — 独立差分验证器（T3a-4 重写）
 *
 * ══════ 为什么 T3a-3 版本必须推倒重来 ══════
 * T3a-3 我把本脚本改成 `import { splitSFC, coverageMissedInVue } from './uiux-audit.mjs'`，
 * 理由是「单一事实源、杜绝双实现漂移」。这个理由本身没错，但用错了地方——
 * 结果是：**用 uiux-audit 的 splitSFC 去检查 uiux-audit 的 splitSFC 有没有漏扫**。
 * 无论 splitSFC 对错，两边算出的「覆盖行集合」永远逐位相同，差集恒为 ∅，脚本永远 exit 0。
 * 这不是验证，是同义反复；exit 0 的含金量为零。（主理人 T3a-4 定性：原则性倒退。）
 *
 * ══════ 正确形态：差分测试（differential testing）══════
 * 用一个**更简单、简单到显然正确**的参考实现（oracle），独立算出同一个答案，再比对。
 *   oracle：对 .vue **逐行全文扫描**，完全不存在「块」这个概念 —— 因此在原理上不可能
 *           「漏掉块外的行」。它可能多抓（style 块、行尾注释），但**绝不会少抓**。
 *   被测：uiux-audit 的 audit() 输出的 emoji 明细（经 splitSFC 分块后的结果）。
 *   判定：oracle \ 被测 的每一条，要么落在下方**具名豁免清单**（逐条带理由），
 *         要么就是漏扫 → exit 1。
 *
 * 【import 边界】—— 这条线必须划清楚，否则又滑回自证循环：
 *   ✅ 可以 import `EMOJI_RE`：它是**判据**（"什么算图标字符"），两边必须同一把尺子，
 *      否则差集里全是口径噪声。判据共享不构成循环——oracle 的独立性在于**扫描方式**。
 *   ✅ 可以 import `audit`：它是**被测对象本身**，调用被测对象天经地义。
 *   ❌ 绝不 import 也绝不复刻 `splitSFC` / `coverageMissedInVue`：它们是**被测实现**。
 *      oracle 整个绕过分块，不需要它们。
 *
 * ══════ 双闸门 ══════
 *   闸门一（覆盖率）：oracle \ audit 的非豁免差集 = 0，否则 exit 1。
 *   闸门二（码位白名单）：代码库出现任何**普查表之外**的非 ASCII 码位即 exit 1。
 *      这是 T3a-4 的根治机制——EMOJI_RE 扩类五轮全靠人肉抽样发现漏网字符（●○→☰⛶→↻↺→▲▼→＋✓←↓），
 *      本质是「未知集合」追不上。有了白名单闸门，新字符一进代码库就自动暴露，
 *      强制人工判 A/B/C 并回写 docs/audit/uiux-charset-census-2026-08-07.md，补丁循环就此终结。
 *
 * 用法：
 *   node scripts/verify-scan-coverage.mjs          # 双闸门全量验证
 *   node scripts/verify-scan-coverage.mjs --diff   # 附完整差集明细（含已豁免项）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EMOJI_RE, audit } from './tmp-mutant-audit.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC_ROOT = path.join(REPO_ROOT, 'packages', 'client', 'src');
const CENSUS_DOC = 'docs/audit/uiux-charset-census-2026-08-07.md';
const rel = (p) => path.relative(REPO_ROOT, p).split(path.sep).join('/');
const showDiff = process.argv.includes('--diff');

// ══════════════════ 码位白名单（来源：T3a-4 非 ASCII 穷尽普查，123 个码位）══════════════════
// 分类语义：A=真图标(计入 EMOJI_RE) / B=文案标点(豁免) / C=注释制表数学符号(扫描阶段排除)
// 任何不在此表的非 ASCII 非汉字码位出现 → 闸门二 exit 1。改动此表必须同步 CENSUS_DOC。
const CENSUS_A = 'ℹ←↓↗↪↻⊗⋯⌨⏰⏳⏸⏹▲▶▸▼▾◉○●◐☀☰♻⚙⚠⛔⛶✅✍✎✏✓✕✨❓⧉×＋\u200d\ufe0f';
const CENSUS_A_EMOJI = // U+1F3xx–U+1F9xx 段，42 个
  '🌐🌙🎛🎨🎯👋👤💬💭💼📁📂📄📊📋📌📖📜📝📡📥📦🔄🔌🔍🔐🔒🔧🔬🔴🔽🗑🚫🛒🛠🛡🤖🧑🧠🧩🧪🧰';
const CENSUS_B = '§·–—…↑→①②③④⑤⑥⑦　、。「」【】！（），：；？｜';
const CENSUS_C = '∪≈≠≥─└├═⟷\ufffd';
const CENSUS = new Map();
for (const [cls, s] of [['A', CENSUS_A + CENSUS_A_EMOJI], ['B', CENSUS_B], ['C', CENSUS_C]])
  for (const ch of s) CENSUS.set(ch.codePointAt(0), cls);

const isHan = (cp) =>
  (cp >= 0x4e00 && cp <= 0x9fff) || (cp >= 0x3400 && cp <= 0x4dbf) || (cp >= 0xf900 && cp <= 0xfaff);

// ══════════════════ 具名豁免清单 ══════════════════
// oracle 比 audit 多抓的位点，只允许出现在这里，且必须逐条写明「为什么 audit 不算它是违规」。
// 禁止用通配规则批量豁免——每一条都要能被独立复核。
const EXEMPT = [
  {
    id: 'E1-style-block',
    reason:
      'emoji 位于 <style> 块（CSS content 等），不属于 audit 的 emoji 口径（只统计 template/script）。' +
      'oracle 无块概念故会抓到，属预期噪声。',
    match: (site, ctx) => ctx.inStyleBlockByBrace(site),
  },
  {
    id: 'E2-trailing-comment',
    reason:
      'emoji 仅出现在**行尾内联注释**中（如 `foo(); // ✅ 说明`）。audit 走 stripComments 精确剥离，' +
      '判为 C 类不计违规；oracle 只排除「行首注释」故会抓到。C 类不计入违规是既定口径。',
    match: (site, ctx) => ctx.emojiOnlyInTrailingComment(site),
  },
  {
    id: 'E3-multiline-comment-body',
    reason:
      'emoji 位于多行注释（HTML <!-- --> 或 JS /* */）的**中间行**，该行行首不是注释标记，' +
      'oracle 的行首启发识别不了。audit 用整段正则剥离，判为 C 类。',
    match: (site, ctx) => ctx.inMultilineComment(site),
  },
];

// ══════════════════ walk ══════════════════
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

const allFiles = walk(SRC_ROOT).filter((f) => /\.(vue|ts|scss)$/.test(f) && !/\.test\.ts$/.test(f));
const vueFiles = allFiles.filter((f) => f.endsWith('.vue'));

// ══════════════════ 闸门二：码位白名单 ══════════════════
const unknown = new Map(); // cp -> {char, sites:[]}
for (const f of allFiles) {
  const r = rel(f);
  fs.readFileSync(f, 'utf8').split(/\r?\n/).forEach((line, i) => {
    for (const ch of line) {
      const cp = ch.codePointAt(0);
      if (cp < 0x80 || isHan(cp) || CENSUS.has(cp)) continue;
      if (!unknown.has(cp)) unknown.set(cp, { char: ch, sites: [] });
      const e = unknown.get(cp);
      if (e.sites.length < 5) e.sites.push(`${r}:${i + 1}  ${line.trim().slice(0, 90)}`);
    }
  });
}

// ══════════════════ oracle：全文逐行扫描（无块概念）══════════════════
// 每个文件预计算三类上下文，供豁免清单判定使用。全部基于「原始文本 + 朴素规则」，
// 不使用 splitSFC——style 区间用 /^<style/ … /^<\/style>/ 的**行号区间**判定，
// 这是行级扫描的自然产物，不是分块解析（不产生 block.text，也不参与 emoji 归属判定）。
const oracle = new Map(); // "file:line" -> {src, chars}
const ctxByFile = new Map();

for (const f of vueFiles) {
  const r = rel(f);
  const raw = fs.readFileSync(f, 'utf8');
  const lines = raw.split(/\r?\n/);

  // (a) style 行号区间
  const styleRanges = [];
  let styleOpen = -1;
  lines.forEach((ln, i) => {
    if (styleOpen < 0 && /^<style[\s>]/.test(ln)) styleOpen = i + 1;
    else if (styleOpen >= 0 && /^<\/style>/.test(ln)) {
      styleRanges.push([styleOpen, i + 1]);
      styleOpen = -1;
    }
  });

  // (b) 多行注释所覆盖的行号集合（HTML + JS 块注释，整段正则）
  const commentLines = new Set();
  for (const re of [/<!--[\s\S]*?-->/g, /\/\*[\s\S]*?\*\//g]) {
    let m;
    while ((m = re.exec(raw))) {
      const start = raw.slice(0, m.index).split('\n').length;
      const span = m[0].split('\n').length;
      for (let k = 0; k < span; k++) commentLines.add(start + k);
    }
  }

  // (c) 行尾内联注释：剥离后是否仍残留 emoji
  const blank = (s) => s.replace(/[^\n]/g, ' ');
  const stripped = raw
    .replace(/<!--[\s\S]*?-->/g, blank)
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/(^|[^:])\/\/[^\n]*/g, (mm, p1) => p1 + blank(mm.slice(p1.length)))
    .split('\n');

  ctxByFile.set(r, {
    inStyleBlockByBrace: (site) => styleRanges.some(([a, b]) => site.line >= a && site.line <= b),
    inMultilineComment: (site) => commentLines.has(site.line),
    emojiOnlyInTrailingComment: (site) => !(stripped[site.line - 1] || '').match(EMOJI_RE),
  });

  lines.forEach((line, i) => {
    const t = line.trim();
    if (!t) return;
    if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') || t.startsWith('<!--')) return;
    const hits = line.match(EMOJI_RE);
    if (hits) oracle.set(`${r}:${i + 1}`, { src: t.slice(0, 96), chars: [...new Set(hits)].join('') });
  });
}

// ══════════════════ 被测：audit() 的 .vue emoji 明细 ══════════════════
const res = audit();
const tested = new Set();
for (const k of ['functionalEmoji', 'sfcScriptEmoji'])
  for (const item of res.metrics[k].items) {
    const m = item.match(/^(packages\/client\/src\/[^\s:]+\.vue):(\d+)/);
    if (m) tested.add(`${m[1]}:${m[2]}`);
  }

// ══════════════════ 差集 ══════════════════
const onlyOracle = [...oracle.keys()].filter((k) => !tested.has(k)).sort();
const onlyTested = [...tested].filter((k) => !oracle.has(k)).sort();

const exempted = [];
const leaks = [];
for (const k of onlyOracle) {
  const [file, lnStr] = [k.slice(0, k.lastIndexOf(':')), k.slice(k.lastIndexOf(':') + 1)];
  const site = { file, line: +lnStr };
  const ctx = ctxByFile.get(file);
  const hit = EXEMPT.find((e) => ctx && e.match(site, ctx));
  (hit ? exempted : leaks).push({ k, hit, ...oracle.get(k) });
}

// ══════════════════ 报告 ══════════════════
console.log('\n══════ 独立差分验证（oracle=全文逐行扫描，绕过 splitSFC）══════');
console.log(`扫描 ${allFiles.length} 文件（${vueFiles.length} 个 .vue）`);
console.log(`A  oracle 全文扫描位点(.vue) : ${oracle.size}`);
console.log(`B  audit  分块扫描位点(.vue) : ${tested.size}`);
console.log(`   ├ 已具名豁免              : ${exempted.length}`);
console.log(`   ├ 疑似漏扫(A\\B 非豁免)    : ${leaks.length}`);
console.log(`   └ B 有 A 无               : ${onlyTested.length}`);

const byId = new Map();
for (const e of exempted) byId.set(e.hit.id, (byId.get(e.hit.id) || 0) + 1);
for (const e of EXEMPT)
  console.log(`豁免 ${e.id.padEnd(26)} ${String(byId.get(e.id) || 0).padStart(3)} 条  ${e.reason.slice(0, 52)}…`);

if (showDiff) {
  console.log('\n── 已豁免明细 ──');
  for (const e of exempted) console.log(`   [${e.hit.id}] ${e.k}  ${e.chars}  ${e.src.slice(0, 70)}`);
  if (onlyTested.length) {
    console.log('\n── B 有 A 无明细 ──');
    onlyTested.forEach((k) => console.log(`   ${k}`));
  }
}

let failed = false;

if (leaks.length) {
  console.error(`\n❌ 闸门一失败：${leaks.length} 个位点 oracle 抓到、audit 漏掉，且无具名豁免。`);
  console.error('   说明 splitSFC 分块仍有截断，本次所有 emoji 类指标偏低，基线与回归闸门均不可信。');
  leaks.forEach((x) => console.error(`   ${x.k}  ${x.chars}  ${x.src}`));
  failed = true;
}
if (onlyTested.length) {
  console.error(`\n❌ 闸门一失败（反向）：${onlyTested.length} 个位点 audit 计入、oracle 未抓到。`);
  console.error('   oracle 只多不少，出现反向差集说明两侧判据口径已分叉，须人工核对。');
  onlyTested.forEach((k) => console.error(`   ${k}`));
  failed = true;
}
if (unknown.size) {
  console.error(`\n❌ 闸门二失败：检出 ${unknown.size} 个普查表之外的非 ASCII 码位。`);
  console.error(`   请人工判定 A/B/C，回写 ${CENSUS_DOC}，并同步本脚本 CENSUS_* 常量；`);
  console.error('   若判为 A 类真图标，还须同步 uiux-audit.mjs 的 EMOJI_RE。');
  for (const [cp, v] of [...unknown].sort((a, b) => a[0] - b[0])) {
    console.error(`   U+${cp.toString(16).toUpperCase().padStart(4, '0')}  ${v.char}`);
    v.sites.forEach((s) => console.error(`      ${s}`));
  }
  failed = true;
}

if (failed) process.exit(1);
console.log(`\n✅ 闸门一通过：oracle 与 audit 差集已 100% 具名豁免，无漏扫。`);
console.log(`✅ 闸门二通过：全部非 ASCII 码位均在普查表 ${CENSUS.size} 项白名单内。`);
process.exit(0);
