// UI/UX 体系合规度量脚本（T2.5 · 反虚高验收机制）
//
// 背景：历轮 UI 改造都因「口径过窄」宣称清零，实则遗留上百处。本脚本把验收固化为
//       一条命令、一组可复算的数字，杜绝主观「我觉得改完了」。
//
// 用法：
//   node scripts/uiux-audit.mjs                    # 控制台表格
//   node scripts/uiux-audit.mjs --json             # 机器可读 JSON
//   node scripts/uiux-audit.mjs --details          # 附完整 file:line 明细
//   node scripts/uiux-audit.mjs --metric ghostTokens   # 只看单项
//   node scripts/uiux-audit.mjs --write-baseline   # 写入基线快照
//   node scripts/uiux-audit.mjs --fail-on-regression   # 指标变差则 exit 1（CI/验收用）
//
// 设计要点（为什么不是一句 grep）：
//   1. Vue SFC 分块解析：template / script / style / 注释 分开统计，避免把注释里的
//      emoji、说明文字里的色值算进「渲染缺陷」——这是旧口径最大的失真来源。
//   2. Token 定义源同时识别 CSS 与 JS：stores/layout.ts 的 cssVars 对象、
//      setProperty('--km-x') 都算合法定义，避免把运行时注入误判为「幽灵 Token」。
//   3. 幽灵 Token 分两个子类：无 fallback（真渲染 bug）/ 有 fallback（主题永久失效），
//      后者更隐蔽——历次改造都因「已经写了 var() 就算合规」而放过。
//   4. 豁免清单显式化，每条写明理由，禁止无理由豁免。
//
// 契约基准：docs/audit/ui-ux-current-state-v2-2026-08-07.md
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC_ROOT = path.join(REPO_ROOT, 'packages', 'client', 'src');
const TOKEN_FILE = path.join(SRC_ROOT, 'styles', 'variables.scss');
const BASELINE_FILE = path.join(REPO_ROOT, 'docs', 'audit', 'uiux-metrics-baseline.json');

// ══════════════════ 豁免清单（每条必须写明理由）══════════════════
const EXEMPTIONS = {
  hardcodedHex: [
    {
      match: (rel) => rel.endsWith('styles/variables.scss'),
      reason: 'Token 定义源本身，原始色值是其职责所在',
    },
    {
      match: (rel) => rel.endsWith('components/preview/TerminalPane.vue'),
      reason: 'ANSI 终端标准 16 色调色板，由 xterm 规范固定，不可主题化',
    },
    {
      match: (rel) => rel.endsWith('styles/theme.ts'),
      reason: 'Naive UI themeOverrides 需要字面量色值，无法消费 CSS 变量（已单列为 Y2 技术债）',
    },
  ],
  hardcodedRgba: [
    {
      match: (rel) => rel.endsWith('styles/variables.scss'),
      reason: 'Token 定义源本身',
    },
    {
      match: (rel) => rel.endsWith('components/preview/TerminalPane.vue'),
      reason: 'ANSI 终端调色板配套的选区/光标半透明色',
    },
    {
      match: (rel) => rel.endsWith('styles/theme.ts'),
      reason: 'Naive UI themeOverrides 字面量要求',
    },
  ],
  // 数据兜底 emoji（如 `entity.icon || '🤖'`）：仍会渲染到界面，归并到 sfcScriptEmoji 违规指标（非豁免）
  emojiAsDataFallback:
    /\b(icon|avatar)\s*(\?\?|\|\|)\s*['"]|['"]\s*(\?\?|\|\|)\s*['"][^'"]*['"]/,
};

// 视为「页面」的目录，用于 missingStates 判定
const VIEWS_DIR = path.join(SRC_ROOT, 'views');
// 纯配置壳 view：本身不渲染数据，状态由被包裹的 MarketLayout 负责
const SHELL_VIEWS = new Set(['ExpertsView.vue', 'SkillsView.vue', 'McpView.vue']);

// ══════════════════ 工具 ══════════════════
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

/**
 * 把 .vue 拆成 template / script / style 三块（含各自起始行号）。
 * T3a-3 修复：原正则 /<(template|script|style)[^>]*>([\s\S]*?)<\/\1>/g 为非贪婪配对，
 * 遇 Vue 具名插槽 <template #icon> 时，外层 template 会在首个嵌套 </template> 处提前截断，
 * 截断点到下一个开标签之间的行永不属于任何块，等于从未被扫描（实测漏扫 27 位点 / 12 文件）。
 * 修复：SFC 顶层块必在行首零缩进、具名插槽必有缩进 → 改用行首锚定的分块正则：
 *   开 /^<(template|script|style)([^>]*)>/  闭 /^<\/(template|script|style)>[ \t]*$/
 * 主 <template> 块因此正确跨越到「行首」的 </template> 关闭（具名插槽的缩进关闭不匹配 ^），
 * 其内部（含具名插槽内容）被完整纳入扫描。同时去掉 startLine + 1：行首锚定下 m.index 已是开标签所在行。
 */
export function splitSFC(text) {
  const blocks = { template: [], script: [], style: [] };
  const re = /^<(template|script|style)([^>]*)>([\s\S]*?)^<\/\1>[ \t]*\r?$/gm;
  let m;
  while ((m = re.exec(text))) {
    const tag = m[1];
    const startLine = text.slice(0, m.index).split('\n').length;
    const inner = m[3];
    blocks[tag].push({ startLine, text: inner });
  }
  return blocks;
}

/**
 * 覆盖率自检（T3a-3 永久闸门的判定核心）。
 * 判据：.vue 文件内「非空行 + 非 HTML 注释 + 命中 EMOJI_RE + 不属于任何 SFC 块」= 漏扫位点。
 * 为什么必须常驻主流程：--fail-on-regression 存在自指循环——基线由扫描器自己写，
 * 扫描器漏扫时基线同样偏低，闸门对照自己的残缺输出永远 exit 0。
 * 「扫全了」必须由独立于「没回归」的判据来证明。
 */
export function coverageMissedInVue(raw, relPath) {
  const b = splitSFC(raw);
  const covered = new Set();
  for (const blk of [...b.template, ...b.script, ...b.style]) {
    const n = blk.text.split('\n').length;
    for (let i = 0; i < n; i++) covered.add(blk.startLine + i);
  }
  const lines = raw.replace(/<!--[\s\S]*?-->/g, (s) => s.replace(/[^\n]/g, ' ')).split('\n');
  const missed = [];
  for (let i = 0; i < lines.length; i++) {
    const ln = i + 1;
    const line = lines[i];
    if (!line.trim() || covered.has(ln)) continue;
    const hits = line.match(EMOJI_RE);
    if (hits)
      missed.push({
        ln,
        chars: [...new Set(hits)].join(''),
        src: line.trim().slice(0, 76),
        text: `${relPath}:${ln}  ${[...new Set(hits)].join('')}  ${line.trim().slice(0, 60)}`,
      });
  }
  return { missed, coveredCount: covered.size, totalLines: lines.length };
}

/** 去掉 HTML 注释 / JS 行注释 / JS 块注释，但保留行数（替换为等长空白） */
function stripComments(text, kind) {
  const blank = (s) => s.replace(/[^\n]/g, ' ');
  if (kind === 'html') return text.replace(/<!--[\s\S]*?-->/g, blank);
  return text
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/(^|[^:])\/\/[^\n]*/g, (mm, p1) => p1 + blank(mm.slice(p1.length)));
}

function eachLine(block, cb) {
  block.text.split('\n').forEach((line, i) => cb(line, block.startLine + i));
}

// ══════════ 类 A 真图标判据（T3a-4 定版，来源：非 ASCII 码位穷尽普查）══════════
//
// 【为什么这一版可以「定版」而不是又一次打补丁】
// T2.5→T3a-3 共扩类五轮（●○ → ☰⛶ → ↻↺ → ▲▼ → ＋✓←↓），每轮都靠人肉抽样发现漏网字符。
// 这是补丁循环：补丁永远追不上「未知集合」。T3a-4 换了方向——**反向穷举**：
// 不猜「还有哪些图标字符」，而是把 packages/client/src 里出现过的**全部非 ASCII 码位**
// 枚举出来（123 个，见 docs/audit/uiux-charset-census-2026-08-07.md），逐码位判 A/B/C，判完即闭合。
// 本正则的每一个显式字符都能溯源到普查表的一行；普查表未出现的字符不得凭想象加入。
//
// 【判定标准】
//   类 A 真图标：删掉后「按钮没了标识 / 状态无从分辨」→ 计入违规，必须改 KIcon
//   类 B 文案标点：删掉后「句子读不通」→ 豁免（· — … → ↔ ↑ 　 ｜ – § ①②③）
//   类 C 注释/制表/数学符号：stripComments 阶段即排除（─ ═ ├ └ ∪ ≈ ≠ ≥ ⟷ 及全部中文标点）
//
// 【构成】基础集 = Unicode 属性 \p{Extended_Pictographic}（禁止手工枚举码点区间）
//         显式补充块 = 普查判定为 A、但 Extended_Pictographic 不覆盖的符号字形，逐字符溯源：
//   × U+00D7  6 位点  关闭按钮（km-chip-x / km-*-dismiss / km-output-tab-close）+ i18n '× Cancel'
//   ← U+2190  1 位点  SettingsNav.vue:64 `<template #icon>←</template>` 返回按钮
//   ↓ U+2193  1 位点  MessageList.vue:181 `↓ 滚动到底部` 按钮
//   ↗ U+2197  1 位点  types/agent.ts:46 AGENT_STATUS_ICONS 'sending-msg'
//   ↪ U+21AA  2 位点  locales/*.ts 'chat.steer'
//   ↻ U+21BB  3 位点  MessageItem.vue:293 / McpManager.vue:70 / SkillPanel.vue:51 刷新
//   ⊗ U+2297  1 位点  AgentRoleSection.vue:231 `role.disabled ? '○' : '⊗'`（与已收 ○ 同族）
//   ⋯ U+22EF  1 位点  SidebarSessionItem.vue:201 `aria-label="more"` 更多按钮
//   ⌨ U+2328  1 位点  types/agent.ts:53 'coding'
//   ▲▶▸▼▾ U+25B2/B6/B8/BC/BE  折叠指示（SubagentCard:75、FileTreePane:51、ThoughtBlock:11）
//   ◉○● U+25C9/CB/CF  开关 / 连接状态点（LeftSidebar:578、McpManageSection:46）
//   ◐ U+25D0  1 位点  types/agent.ts:45 'closing'
//   ☰ U+2630  1 位点  PageHeader.vue:118 左栏显隐
//   ⛶ U+26F6  1 位点  RightPanel 全屏
//   ✍✎✏ U+270D/0E/0F  编辑类（AgentRoleSection:54、MessageItem:285、types/agent.ts:52）
//   ✓ U+2713  2 位点  AgentMarkdown.vue:50 复制成功态 / ToolCallCard.vue:13（与已收 ✕ 同族）
//   ✕ U+2715  6 位点  关闭 / 失败态
//   ⧉ U+29C9  2 位点  PageHeader.vue:152、ChatView.vue:295 `<template #icon>⧉</template>` 右栏显隐
//   ＋ U+FF0B  8 位点  ＋添加/＋新增/＋新建 按钮（全角标点区，五轮扩类全程未覆盖）
//   ↺◀◂▴ U+21BA/25C0/25C2/25B4  普查中零出现，保留为同族一致性兜底（详见普查表§5）
//
// 【兜底集不再扩张】过去靠「猜同族变体」防漏（✔✖⊕⋮ 之类），本质仍是补丁思维。
// T3a-4 起改由 verify-scan-coverage.mjs 的**码位白名单闸门**兜底：任何普查表之外的新非 ASCII
// 码位一旦进入代码库即 exit 1，强制人工判 A/B/C 并回写普查表。未知字符必然暴露，无需再猜。
export const EMOJI_RE =
  /[\p{Extended_Pictographic}×←↓↗↪↺↻⊗⋯⌨▲▴▶▸▼▾◀◂◉○●◐☰⛶✍✎✏✓✕⧉→＋]/gv;

// ══════════════════ 主扫描 ══════════════════
function audit() {
  const files = walk(SRC_ROOT).filter((f) => /\.(vue|ts|scss)$/.test(f) && !/\.test\.ts$/.test(f));

  // ---------- Token 定义源 ----------
  const cssDefined = new Map(); // token -> file:line
  const scss = fs.readFileSync(TOKEN_FILE, 'utf8');
  scss.split('\n').forEach((line, i) => {
    const m = line.match(/^\s*(--km-[a-z0-9-]+)\s*:/);
    if (m) if (!cssDefined.has(m[1])) cssDefined.set(m[1], `${rel(TOKEN_FILE)}:${i + 1}`);
  });

  // JS 运行时注入（stores/layout.ts 的 cssVars 对象 / setProperty）
  const jsDefined = new Map();
  for (const f of files) {
    if (!/\.(ts|vue)$/.test(f)) continue;
    const text = fs.readFileSync(f, 'utf8');
    text.split('\n').forEach((line, i) => {
      for (const m of line.matchAll(/['"](--km-[a-z0-9-]+)['"]\s*:/g))
        if (!jsDefined.has(m[1])) jsDefined.set(m[1], `${rel(f)}:${i + 1}`);
      for (const m of line.matchAll(/setProperty\(\s*['"](--km-[a-z0-9-]+)['"]/g))
        if (!jsDefined.has(m[1])) jsDefined.set(m[1], `${rel(f)}:${i + 1}`);
    });
  }

  // ---------- 逐文件扫描 ----------
  const refs = new Map(); // token -> {hasFallback, sites[]}
  const hardcodedHex = [];
  const hardcodedRgba = [];
  const functionalEmoji = [];
  const sfcScriptEmoji = [];
  const tsEmoji = []; // .ts / .scss 中的 emoji（经 i18n / 映射函数 / 常量数组渲染到界面）
  const commentEmoji = [];
  const missedScan = []; // T3a-3：含图标字符却不属于任何 SFC 块的行（永久闸门判据）
  const outlineNone = [];
  const kiconFiles = new Set();
  let componentFileCount = 0;
  // 尺寸 Token 采用率：Phase A 定义了 font/space Token，但组件是否真的在用？
  const sizeRawPx = [];
  let sizeTokenUses = 0;

  const exemptHex = (r) => EXEMPTIONS.hardcodedHex.find((e) => e.match(r));
  const exemptRgba = (r) => EXEMPTIONS.hardcodedRgba.find((e) => e.match(r));

  for (const f of files) {
    const r = rel(f);
    const raw = fs.readFileSync(f, 'utf8');
    const isVue = f.endsWith('.vue');
    if (isVue) componentFileCount++;
    if (isVue && /<KIcon|<k-icon/i.test(raw)) kiconFiles.add(r);

    // Token 引用：全文件（含 style 块）
    raw.split('\n').forEach((line, i) => {
      for (const m of line.matchAll(/var\(\s*(--km-[a-z0-9-]+)\s*(,)?/g)) {
        const t = m[1];
        if (!refs.has(t)) refs.set(t, { hasFallback: false, sites: [] });
        const e = refs.get(t);
        if (m[2]) e.hasFallback = true;
        e.sites.push(`${r}:${i + 1}`);
      }
    });

    // outline:none（全文件，样式块为主）
    raw.split('\n').forEach((line, i) => {
      if (/outline\s*:\s*none/.test(line) && !/^\s*(\/\/|\*)/.test(line))
        outlineNone.push(`${r}:${i + 1}`);
    });

    if (isVue) {
      const b = splitSFC(raw);
      // ── T3a-3 永久闸门：本文件是否存在「声称扫了、实际没进任何块」的图标行 ──
      missedScan.push(...coverageMissedInVue(raw, r).missed.map((x) => x.text));
      // 尺寸 Token 采用率：font-size / padding / margin / gap 的原始 px vs --km-*
      for (const blk of [...b.style, ...b.template]) {
        for (const m of blk.text.matchAll(/font-size\s*:\s*([^;]+);/g))
          m[1].includes('--km-') ? sizeTokenUses++ : /\dpx/.test(m[1]) && sizeRawPx.push(`${r}:${blk.startLine}  fs ${m[1].trim()}`);
        for (const m of blk.text.matchAll(/(?:padding|margin|gap)\s*:\s*([^;]+);/g))
          m[1].includes('--km-') ? sizeTokenUses++ : /\dpx/.test(m[1]) && sizeRawPx.push(`${r}:${blk.startLine}  sp ${m[1].trim()}`);
      }

      // 硬编码色值：只看 <style> 块 + template 的内联 style 属性
      for (const blk of b.style) {
        const clean = { ...blk, text: stripComments(blk.text, 'css') };
        eachLine(clean, (line, ln) => {
          if (line.includes('--km-')) return; // Token 定义/引用行本身不算
          for (const m of line.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
            const ex = exemptHex(r);
            (ex ? [] : hardcodedHex).push(`${r}:${ln}  ${m[0]}`);
          }
          for (const m of line.matchAll(/rgba?\([^)]*\)/g)) {
            const ex = exemptRgba(r);
            (ex ? [] : hardcodedRgba).push(`${r}:${ln}  ${m[0]}`);
          }
        });
      }
      // template 内联 style / 脚本里的色值常量
      for (const blk of b.script) {
        const clean = { ...blk, text: stripComments(blk.text, 'js') };
        eachLine(clean, (line, ln) => {
          for (const m of line.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
            const ex = exemptHex(r);
            (ex ? [] : hardcodedHex).push(`${r}:${ln}  ${m[0]}`);
          }
        });
      }

      // emoji：template（去 HTML 注释）= 真正渲染
      for (const blk of b.template) {
        const clean = { ...blk, text: stripComments(blk.text, 'html') };
        eachLine(clean, (line, ln) => {
          const hits = line.match(EMOJI_RE);
          if (!hits) return;
          const isDataFallback = EXEMPTIONS.emojiAsDataFallback.test(line);
          const entry = `${r}:${ln}  ${[...new Set(hits)].join('')}${isDataFallback ? '  [数据兜底]' : ''}`;
          if (!isDataFallback) functionalEmoji.push(entry);
          else sfcScriptEmoji.push(entry);
        });
      }
      // script：字符串字面量里的 emoji（dropdown label 等，实际会渲染）vs 注释
      // T3a-4 第 8 项：C 类口径统一。原实现用 /^\s*(\/\/|\*|\/\*)/ 只认「行首注释」，
      // 而 .ts 分支走 stripComments 剥离「块注释 + 行尾内联注释」——同一份工具、同一个 C 类概念、
      // 两把尺子：`const x = 1; // ✅ 说明` 写在 .ts 被排除、写在 .vue <script> 却计为违规。
      // 现改为同源：先 stripComments 得到「纯代码行」，emoji 只在纯代码行里还在才算违规。
      // 判定改为「剥离后是否残留」而非「整行是否以注释起头」，行尾注释与行首注释一视同仁。
      for (const blk of b.script) {
        const cleaned = stripComments(blk.text, 'js').split('\n');
        eachLine(blk, (line, ln) => {
          const hits = line.match(EMOJI_RE);
          if (!hits) return;
          const codeHits = (cleaned[ln - blk.startLine] || '').match(EMOJI_RE);
          if (!codeHits) commentEmoji.push(`${r}:${ln}  ${[...new Set(hits)].join('')}`);
          else sfcScriptEmoji.push(`${r}:${ln}  ${[...new Set(codeHits)].join('')}`);
        });
      }
    } else {
      // .scss / .ts 非豁免文件的硬编码 + emoji（emoji 经 i18n / 映射函数 / 常量数组渲染到界面）
      const clean = stripComments(raw, f.endsWith('.scss') ? 'css' : 'js');
      clean.split('\n').forEach((line, i) => {
        if (line.includes('--km-')) return;
        for (const m of line.matchAll(/#[0-9a-fA-F]{3,8}\b/g))
          if (!exemptHex(r)) hardcodedHex.push(`${r}:${i + 1}  ${m[0]}`);
        for (const m of line.matchAll(/rgba?\([^)]*\)/g))
          if (!exemptRgba(r)) hardcodedRgba.push(`${r}:${i + 1}  ${m[0]}`);
        const em = line.match(EMOJI_RE);
        if (em) tsEmoji.push(`${r}:${i + 1}  ${[...new Set(em)].join('')}`);
      });
    }
  }

  // ---------- 幽灵 Token ----------
  const ghostNoFallback = [];
  const ghostWithFallback = [];
  const runtimeInjected = [];
  for (const [t, info] of [...refs].sort()) {
    if (cssDefined.has(t)) continue;
    if (jsDefined.has(t)) {
      runtimeInjected.push(`${t}  ← 定义于 ${jsDefined.get(t)}（合法运行时注入）`);
      continue;
    }
    const line = `${t}  (${info.sites.length} 处) ${info.sites.slice(0, 4).join(', ')}${info.sites.length > 4 ? ' …' : ''}`;
    (info.hasFallback ? ghostWithFallback : ghostNoFallback).push(line);
  }

  // ---------- 未使用 Token ----------
  const unusedTokens = [...cssDefined.keys()]
    .filter((t) => !refs.has(t))
    .map((t) => `${t}  (定义于 ${cssDefined.get(t)})`);

  // ---------- 状态覆盖 ----------
  const missingStates = [];
  for (const f of fs.readdirSync(VIEWS_DIR).filter((n) => n.endsWith('.vue'))) {
    if (SHELL_VIEWS.has(f)) continue;
    const text = fs.readFileSync(path.join(VIEWS_DIR, f), 'utf8');
    const miss = [];
    if (!/<EmptyState|<NEmpty|<n-empty/i.test(text)) miss.push('空态');
    if (!/<SkeletonCard|<SkeletonList|<NSpin|<n-spin/i.test(text)) miss.push('载态');
    if (!/<DataStateBoundary|<NAlert|<n-alert|<NResult|<n-result/i.test(text)) miss.push('错误态');
    if (miss.length) missingStates.push(`views/${f}  缺: ${miss.join(' / ')}`);
  }

  return {
    meta: {
      scannedAt: new Date().toISOString(),
      srcRoot: rel(SRC_ROOT),
      filesScanned: files.length,
      vueFiles: componentFileCount,
      tokensDefinedInCss: cssDefined.size,
      tokensReferenced: refs.size,
      tokensInjectedByJs: jsDefined.size,
    },
    metrics: {
      ghostTokensNoFallback: { count: ghostNoFallback.length, items: ghostNoFallback },
      ghostTokensWithFallback: { count: ghostWithFallback.length, items: ghostWithFallback },
      hardcodedHex: { count: hardcodedHex.length, items: hardcodedHex },
      hardcodedRgba: { count: hardcodedRgba.length, items: hardcodedRgba },
      functionalEmoji: { count: functionalEmoji.length, items: functionalEmoji },
      outlineNone: { count: outlineNone.length, items: outlineNone },
      kiconAdoption: {
        count: kiconFiles.size,
        total: componentFileCount,
        pct: +((kiconFiles.size / componentFileCount) * 100).toFixed(1),
        items: [...kiconFiles],
      },
      sizeTokenAdoption: {
        count: sizeRawPx.length, // 越小越好：仍用原始 px 的声明数
        tokenUses: sizeTokenUses,
        pct: +((sizeTokenUses / (sizeTokenUses + sizeRawPx.length || 1)) * 100).toFixed(1),
        items: sizeRawPx,
      },
      missingStates: { count: missingStates.length, items: missingStates },
      unusedTokens: { count: unusedTokens.length, items: unusedTokens },
      tsEmoji: { count: tsEmoji.length, items: tsEmoji },
      sfcScriptEmoji: { count: sfcScriptEmoji.length, items: sfcScriptEmoji },
    },
    informational: {
      runtimeInjectedTokens: { count: runtimeInjected.length, items: runtimeInjected },
      commentEmoji: { count: commentEmoji.length, items: commentEmoji },
    },
    // 自检结果不是「指标」而是「扫描器可信度」：>0 说明本次输出的所有数字都不可信
    selfCheck: {
      missedScan: { count: missedScan.length, items: missedScan },
    },
  };
}

// 越小越好的指标（回归检测方向）
const LOWER_IS_BETTER = [
  'ghostTokensNoFallback',
  'ghostTokensWithFallback',
  'hardcodedHex',
  'hardcodedRgba',
  'functionalEmoji',
  'outlineNone',
  'missingStates',
  'unusedTokens',
  'sizeTokenAdoption',
  'tsEmoji',
  'sfcScriptEmoji',
];

function render(res, opts) {
  const M = res.metrics;
  const pad = (s, n) => String(s).padEnd(n);
  const lpad = (s, n) => String(s).padStart(n);
  const SEV = {
    ghostTokensNoFallback: '🔴',
    ghostTokensWithFallback: '🟡',
    hardcodedHex: '🟡',
    hardcodedRgba: '🟡',
    functionalEmoji: '🔴',
    outlineNone: '🟡',
    missingStates: '🟡',
    unusedTokens: '🟢',
    tsEmoji: '🔴',
    sfcScriptEmoji: '🔴',
    kiconAdoption: '🟡',
    sizeTokenAdoption: '🔴',
  };
  const LABEL = {
    ghostTokensNoFallback: '幽灵Token·无fallback(真bug)',
    ghostTokensWithFallback: '幽灵Token·有fallback(主题失效)',
    hardcodedHex: '硬编码 hex',
    hardcodedRgba: '硬编码 rgba',
    functionalEmoji: '功能性 emoji(template)',
    outlineNone: 'outline:none(抵消focus环)',
    kiconAdoption: 'KIcon 采用率',
    sizeTokenAdoption: '原始px(字号/间距未用Token)',
    missingStates: '缺状态的 view',
    unusedTokens: '定义未使用的 Token',
    tsEmoji: 'tsEmoji(.ts/.scss)',
    sfcScriptEmoji: 'sfcScriptEmoji(.vue script)',
  };

  console.log('\n══════════ kmaster-studio UI/UX 合规度量 ══════════');
  console.log(
    `扫描 ${res.meta.filesScanned} 文件（${res.meta.vueFiles} 个 .vue） · ` +
      `Token 定义 ${res.meta.tokensDefinedInCss} / 引用 ${res.meta.tokensReferenced} / JS注入 ${res.meta.tokensInjectedByJs}`,
  );
  console.log('─'.repeat(62));
  console.log(`${pad('指标', 34)}${lpad('数量', 8)}   等级`);
  console.log('─'.repeat(62));
  for (const k of Object.keys(M)) {
    const v = M[k];
    let num = v.count;
    if (k === 'kiconAdoption') num = `${v.count}/${v.total} (${v.pct}%)`;
    else if (k === 'sizeTokenAdoption') num = `${v.count} (Token仅${v.pct}%)`;
    console.log(`${pad(LABEL[k], 34)}${lpad(num, 12)}   ${SEV[k]}`);
  }
  console.log('─'.repeat(62));
  const inf = res.informational;
  console.log(
    `参考：运行时注入Token ${inf.runtimeInjectedTokens.count} · ` +
      `注释emoji ${inf.commentEmoji.count}（唯一不计入违规的 emoji 类）` +
      ` · 功能性 / sfcScript / tsEmoji 三类 emoji 均计入整改面`,
  );
  console.log(
    `计数单位 = 位点（file:line），非 emoji 字符数；多 emoji 同行记 1 位点`,
  );
  const missed = res.selfCheck.missedScan.count;
  console.log(
    `扫描器自检：漏扫位点 ${missed}  ${missed === 0 ? '✅ 覆盖完整' : '❌ 本次所有数字不可信'}`,
  );

  if (opts.details) {
    for (const k of Object.keys(M)) {
      const v = M[k];
      if (!v.items?.length) continue;
      console.log(`\n── ${LABEL[k]}（${v.items.length}）──`);
      v.items.forEach((i) => console.log('   ' + i));
    }
    console.log(`\n── 运行时注入 Token（合法，非幽灵）──`);
    inf.runtimeInjectedTokens.items.forEach((i) => console.log('   ' + i));
  }
  console.log('');
}

// ══════════════════ CLI ══════════════════
// 仅在被直接执行时跑 CLI；被 import 时只导出 splitSFC / EMOJI_RE / coverageMissedInVue / audit，
// 这样 verify-scan-coverage.mjs 可以复用同一份实现，杜绝「两份复刻各自漂移」。
const isMain =
  !!process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;

export { audit };

if (isMain) {
const argv = process.argv.slice(2);
const opts = {
  json: argv.includes('--json'),
  details: argv.includes('--details'),
  writeBaseline: argv.includes('--write-baseline'),
  failOnRegression: argv.includes('--fail-on-regression'),
  metric: (argv.find((a) => a.startsWith('--metric')) || '').split('=')[1] || argv[argv.indexOf('--metric') + 1],
};

const res = audit();

/**
 * 永久闸门：扫描覆盖率自检不过 → exit 1，且禁止写基线。
 * 位置刻意放在 --write-baseline 之前：漏扫状态下写出的基线会把残缺数字固化成"合格线"，
 * 之后 --fail-on-regression 拿残缺输出对照残缺基线，永远 exit 0（自指循环）。
 */
const enforceCoverageGate = () => {
  const mc = res.selfCheck.missedScan;
  if (mc.count === 0) return;
  console.error(
    `\n❌ 扫描器覆盖率自检失败：${mc.count} 个含图标字符的行从未进入任何 SFC 块。\n` +
      `   这意味着本次输出的所有 emoji 类指标都偏低，基线与回归闸门均不可信。\n` +
      `   排查：node scripts/verify-scan-coverage.mjs <file> 可对单文件详查。`,
  );
  mc.items.forEach((i) => console.error('   ' + i));
  process.exit(1);
};

if (opts.metric && !opts.metric.startsWith('--')) {
  const v = res.metrics[opts.metric] ?? res.informational[opts.metric] ?? res.selfCheck[opts.metric];
  if (!v) {
    console.error(`未知指标：${opts.metric}`);
    process.exit(2);
  }
  console.log(JSON.stringify(v, null, 2));
  enforceCoverageGate();
  process.exit(0);
}

if (opts.json) console.log(JSON.stringify(res, null, 2));
else render(res, opts);

enforceCoverageGate();

if (opts.writeBaseline) {
  const snap = { savedAt: res.meta.scannedAt, counts: {} };
  for (const [k, v] of Object.entries(res.metrics))
    snap.counts[k] = k === 'kiconAdoption' ? { count: v.count, total: v.total } : v.count;
  fs.mkdirSync(path.dirname(BASELINE_FILE), { recursive: true });
  fs.writeFileSync(BASELINE_FILE, JSON.stringify(snap, null, 2) + '\n');
  console.log(`✅ 基线已写入 ${rel(BASELINE_FILE)}`);
}

if (opts.failOnRegression) {
  if (!fs.existsSync(BASELINE_FILE)) {
    console.error(`❌ 基线文件不存在：${rel(BASELINE_FILE)}，请先 --write-baseline`);
    process.exit(2);
  }
  const base = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8'));
  const regressions = [];
  const improvements = [];
  for (const k of LOWER_IS_BETTER) {
    const now = res.metrics[k].count;
    const was = base.counts[k];
    if (was === undefined) continue;
    if (now > was) regressions.push(`${k}: ${was} → ${now}  (+${now - was})`);
    else if (now < was) improvements.push(`${k}: ${was} → ${now}  (-${was - now})`);
  }
  const nowK = res.metrics.kiconAdoption.count;
  const wasK = base.counts.kiconAdoption?.count;
  if (wasK !== undefined) {
    if (nowK < wasK) regressions.push(`kiconAdoption: ${wasK} → ${nowK}  (采用率下降)`);
    else if (nowK > wasK) improvements.push(`kiconAdoption: ${wasK} → ${nowK}`);
  }

  console.log('── 对照基线 ' + base.savedAt + ' ──');
  improvements.forEach((i) => console.log('  ✅ 改善  ' + i));
  regressions.forEach((i) => console.log('  ❌ 回归  ' + i));
  if (!improvements.length && !regressions.length) console.log('  ⏸  无变化');
  if (regressions.length) {
    console.error(`\n❌ 检出 ${regressions.length} 项回归，验收不通过。`);
    process.exit(1);
  }
  console.log('\n✅ 无回归。');
}
} // end if (isMain)
