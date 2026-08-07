# kmaster-studio UI/UX 合规度量基线（2026-08-07）

> **产出人**：高见远（Architect）· **任务**：T2.5 反虚高验收机制
> **工具**：`scripts/uiux-audit.mjs`（Node 22.22.2 实测通过）
> **基线快照**：`docs/audit/uiux-metrics-baseline.json`（机器可读，供 `--fail-on-regression` 比对）
> **定位**：把「UI 改造是否真的完成」从主观判断变成**一条命令、一组可复算的数字**。

---

## 〇、为什么需要这个脚本

历轮改造都宣称「已清零」，实则遗留上百处。根因是**口径漏洞**，本脚本针对性封堵四类：

| 口径漏洞 | 旧做法的误判 | 本脚本的处理 |
|---|---|---|
| 注释/脚本混入 | 把注释里的 emoji、说明文字里的色值算成渲染缺陷，数字虚高 | Vue SFC 分块解析，template/script/注释 分离统计 |
| 「写了 `var()` 就算合规」 | Token 根本没定义，永远走 fallback，主题切换失效，却被判为达标 | 幽灵 Token 拆「无 fallback」「有 fallback」两个子类 |
| 运行时注入被误杀 | `--km-left-w` 等由 JS 下发，被当成幽灵 Token，制造假警报 | 同时扫描 CSS 定义 + JS 注入（`cssVars` 对象 / `setProperty`） |
| 只查颜色 | 字号/间距 Token 建了却没人用，从不被检查 | 新增 `sizeTokenAdoption` 指标（本次最大发现） |

---

## 一、基线数字（首次运行实测）

```
══════════ kmaster-studio UI/UX 合规度量 ══════════
扫描 126 文件（82 个 .vue） · Token 定义 50 / 引用 47 / JS注入 5
──────────────────────────────────────────────────────────────
指标                                      数量   等级
──────────────────────────────────────────────────────────────
幽灵Token·无fallback(真bug)                      3   🔴
幽灵Token·有fallback(主题失效)                      5   🟡
硬编码 hex                                     30   🟡
硬编码 rgba                                    26   🟡
功能性 emoji(template)                         94   🔴
outline:none(抵消focus环)                       5   🟡
KIcon 采用率                          8/82 (9.8%)   🟡
原始px(字号/间距未用Token)                773 (Token仅0.6%)   🔴
缺状态的 view                                    5   🟡
定义未使用的 Token                                16   🟢
tsEmoji(.ts/.scss)                            63   🔴
sfcScriptEmoji(.vue script)                       57   🔴
──────────────────────────────────────────────────────────────
参考：运行时注入Token 5 · 注释emoji 29（唯一不计入违规的 emoji 类）· 功能性 / sfcScript / tsEmoji 三类 emoji 均计入整改面
计数单位 = 位点（file:line），非 emoji 字符数；多 emoji 同行记 1 位点（现存 10 处，行号见实施计划〇节）
扫描器自检：漏扫位点 0  ✅ 覆盖完整
定版后整改总面 = 214 位点（94 template + 57 .vue-script + 63 .ts/.scss），详见下文「字符类演进史」第六阶段。
```

> **T3a-4 权威数字**：判据已由 `docs/audit/uiux-charset-census-2026-08-07.md` 的 **123 码位穷尽普查**倒推定版，
> 每个字符可溯源到普查表一行。验证由 `scripts/verify-scan-coverage.mjs` 双闸门保障
> （闸门一：独立 oracle 差分；闸门二：码位白名单），两个闸门均经**故意破坏负向测试**证明会 exit 1。

> **匹配集说明（口径边界）**：`EMOJI_RE` 现已改为 **标准 Unicode 属性 `\p{Extended_Pictographic}`（基础集）+ 显式补充块（抽样实证确属 UI 图标的符号：`●○▾✕☰⛶✍✎▸↪⏹⏳⏸⏯↗◐◉⌨✏` 等）**。基础集用标准属性、禁止手工枚举整段码点区间；补充块仅收类 A 真图标。**类 B 文案标点（如 `→` `↔` `·` 等「删掉句子读不通」的字符）刻意不进补充块**，确保被豁免。故匹配集比单纯 `Extended_Pictographic` 更宽且可控，多 emoji 同行（如 `🌙☀`、`📁📂`）在位点口径下仍记 1 位点。

> **2026-08-07 修订（PM 复核触发）**：原基线 emoji 口径仅覆盖 `.vue`（template + script 块），**遗漏 `.ts`/`.scss` 层**。PM 在 v2 设计文档复核时指出 `.ts` 层仍有数十处会渲染到界面的 emoji（i18n 文案、SETTINGS_CATEGORIES 常量数组、市场页映射函数兜底图标等）。脚本已新增 `tsEmoji` 指标覆盖 `.ts`/`.scss`，并将 `EMOJI_RE` 对齐到 v2 文档第 12 章验收命令的口径。
> emoji 整改总面由原先估计的 88 处（43 template + 45 script）修正为 **≈148 处**（54 template + 48 .vue-script + 46 .ts/.scss），即真实整改量是原口径的约 1.7 倍。PM 以独立 grep 估得 217（116 .vue + 101 .ts），其 `.ts` 数偏高或因 grep 计数口径不同；T3 以本脚本为权威口径（148），并预留缓冲。

> **2026-08-07 修订（主理人裁决・口径自洽）**：上版将 `.vue` `<script>` 块内的 48 处 emoji 记为「参考项（脚本串 emoji，不计入违规）」，却同时将其计入 148 整改面，口径自相矛盾。现按主理人裁决，将 `scriptStringEmoji` **提升为正式违规指标 `sfcScriptEmoji`（🔴）**——凡 `.vue` `<script>` 块内、会渲染到界面的 emoji（含 `entity.icon || '🤖'` 数据兜底）一律计入。唯一仍不计入违规的 emoji 类仅剩：注释内 emoji（16）、`*.test.ts`、以及确认仅用于 `console.log` 的日志串。最终权威口径维持 **≈148 = 54 template + 48 .vue-script + 46 .ts/.scss**，但其中 48 的性质由「参考豁免」正名为「违规整改项」，与基线 JSON / 脚本输出完全对齐。

> **2026-08-07 修订（T3a-2・字符类扩类）**：主理人抽样复核增量后裁定「字符类扩到标准 Unicode 属性 + 显式补充块，禁止手工枚举」，并要求注释剥离覆盖 HTML 注释、豁免按 A/B/C 三类判定。据此将 `EMOJI_RE` 由手工区间改为 `\p{Extended_Pictographic}` + 补充块。扩类后原被漏判的符号（如 `AGENT_STATUS_ICONS` 14 个状态图标 `○◐↗⏳◉⌨✏`、`locales/*.ts` 内嵌 i18n 图标 `▸↪⏹✎`）被补入。**权威整改面由 148 升为 170 位点**（functionalEmoji 54→55、sfcScriptEmoji 48→54、tsEmoji 46→61）；非 emoji 指标不受影响。这是测量口径变完整，非回归——旧 148 因匹配集不完整而低估。

> **2026-08-07 修订（T3a-3・结构性漏扫修复）**：主理人下发 `verify-scan-coverage.mjs` 自检出 `splitSFC` 配对正则非贪婪，遇 Vue 具名插槽 `<template #icon>` 时外层 template 在首个嵌套 `</template>` 提前截断，截断点到下一开标签之间的行永不属于任何块——实测漏扫 **12 文件 / 27 位点**（exit 1）。修复：`splitSFC` 改**行首锚定切分**（`/^<(template|script|style)([^>]*)>/` 开、`/^<\/(template|script|style)>[ \t]*\r?$/` 闭，兼容 CRLF），并去掉 `startLine + 1`；`EMOJI_RE` 补**实心三角族 `▲▶▼◀◂▴`**（`FileTreePane.vue:51` `▶▼`、`SubagentCard.vue:75` `▲▼` 系具名折叠箭头，属类 A 真图标；原仅 ▾▸ 在块内、▲▶▼◀◂▴ 漏网，口径自相矛盾）。为根绝「两份实现各自漂移」与「自指循环」（基线由扫描器自写、漏扫时基线同样偏低 → 回归闸门永远 exit 0），将 `splitSFC`/`EMOJI_RE`/`coverageMissedInVue` 从 verify 脚本的复刻中抽离，改为 `uiux-audit.mjs` **单一导出**；主流程落「覆盖率自检永久闸门」`enforceCoverageGate`（漏扫 > 0 → exit 1 且禁止写基线）。修复后权威整改面由 **170 升为 195**（functionalEmoji 55→78、sfcScriptEmoji 54→56、tsEmoji 61 不变），漏扫归 0。此乃测量口径变完整，非回归。

### 字符类演进史

| 阶段 | `EMOJI_RE` 形态 | emoji 整改面 | 关键变化 |
|---|---|---|---|
| T2.5 初版 | 手工区间 `\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FF0B}` | ~88（仅 .vue，43 template + 45 script） | 首版仅扫 .vue |
| PM 复核触发 | 同上 + 新增 `tsEmoji` 指标 | 148（54 + 48 + 46） | 补 .ts/.scss 层，纠正「.ts 层不扫」盲区 |
| 主理人裁决 | 同上 + `scriptStringEmoji`→`sfcScriptEmoji`（🔴） | 148（口径自洽，48 由豁免正名为违规） | 消除「参考项却计入整改面」矛盾 |
| **T3a-2 扩类** | `\p{Extended_Pictographic}` + 补充块 | **170**（55 + 54 + 61） | 补 `●○▾↪⏹⏳` 等 21xx/23xx/25xx 符号 + HTML 注释剥离 |
| **T3a-3 结构性漏扫** | `splitSFC` 行首锚定 + `EMOJI_RE` 补实心三角 `▲▶▼◀◂▴` | **195**（78 + 56 + 61） | 自检出具名插槽截断导致 27 位点漏扫；行首锚定修复后漏扫归 0；落「覆盖率自检永久闸门」杜绝自指循环 |
| **T3a-4 反向普查定版** | 由 **123 码位穷尽普查**倒推生成（`\p{Extended_Pictographic}` + 40 个可溯源符号字形） | **214**（94 + 57 + 63） | 终结补丁循环：判据不再靠人肉抽样扩类，改为「先穷举码位、再逐个判 A/B/C」；补 `＋×⧉←↓✓⋯` 共 19 位点；verify 重写为独立 oracle；新增码位白名单闸门 |

> 口径演进原则：**每次扩类都会让数字上升，这是测量变准，不是代码变差**。回归门禁只对「同口径下指标变差」报警；口径变更须显式 `--write-baseline` 重置基线，不得用旧基线卡新口径。

---

## 第六阶段（T3a-4）：字符类缺口 11 位点 → 反向普查根治

### 一、缺口是怎么被抓到的

T3a-3 我判断「字符类已闭合」，主理人做独立对账，用**宽字符集全文扫描**（U+1F300-1FAFF / 2300-23FF /
25A0-25FF / 2600-27BF / 2B00-2BFF / 2190-21FF / FF0B）对 `.vue` 得 147 位点，而脚本两节合计 134，
差集 14 条 —— 其中 3 条是正确的类 B 豁免（句中 `→`），**11 条是货真价实的 A 类漏检**：

| 字符 | 码位 | 位点数 | 实证 |
|---|---|---|---|
| `＋` | U+FF0B | 8 | `＋新增` / `＋添加` / `＋新建` 按钮，全角标点区 U+FF00–FFEF **五轮扩类全程未覆盖** |
| `✓` | U+2713 | 1 | `AgentMarkdown.vue:50` —— 同文件 53 行 `📋`、57 行 `⚠` 都抓到了，唯独 50 行漏，**抓二漏一** |
| `←` | U+2190 | 1 | `SettingsNav.vue:64` `<template #icon>←</template>` —— 明文写着 `#icon` 的插槽 |
| `↓` | U+2193 | 1 | `MessageList.vue:181` `↓ 滚动到底部` |

`SettingsNav.vue:64` 这条最能说明问题：模板里明明白白写着 `<template #icon>`，语义上不可能是文案标点，
判据却认不出来。原因是 `←` 被 T3a-2 归入「类 B 导航箭头，绝不进补充块」——
**规则本身把一个真图标提前排除了**，而规则的依据是「箭头通常是文案连接符」这种想象中的统计。

### 二、根因：五轮扩类，五次都是打补丁

| 轮次 | 补入 | 发现方式 |
|---|---|---|
| T3a-1 | `●○▾✕☰⛶✍✎▸↪⏹⏳⏸⏯↗◐◉⌨✏` | 主理人抽样 |
| T3a-3 | `↻↺` | grep 人肉 |
| T3a-3 | `▲▶▼◀◂▴` | grep 人肉（发现「同族一抓一漏」） |
| T3a-4 前 | `＋✓←↓` | 主理人宽字符集对账 |

四次补丁，四次都在「发现一个补一个」。**补丁追的是已发现的漏网字符，对手却是未发现的字符集合。**
只要判据仍由人工想象枚举，第六轮就必然存在 —— 这不是态度问题，是方法论问题。

### 三、根治：反向穷举码位普查

不猜「还有哪些图标字符」，而是把 `packages/client/src` 里**实际出现过的全部非 ASCII 码位**
枚举出来，逐个判 A/B/C，判完即闭合。集合从「未知且无界」变为「已知且有限」。

**普查结果**（全表见 `docs/audit/uiux-charset-census-2026-08-07.md`）：

```
非 ASCII 非汉字码位  123
  ├ A 类 真图标      84   （emoji 42 + 符号字形 40 + 修饰符 ZWJ/VS16 2）
  ├ B 类 文案标点    29
  └ C 类 注释制表     10
CJK 汉字（聚合）     34,849 字符次 / 3,720 位点  → 全 B 类
```

普查除命中主理人预测的 11 条外，**另抓 8 条**：`×`(U+00D7) 5 处、`⧉`(U+29C9) 2 处、`⋯`(U+22EF) 1 处。
这三个码位落在宽字符集的六个区间之外 —— 宽区间抽样抓不到，只有穷举能抓到。

普查还有一个副产物：**U+FFFD 替换字符 5 位点**（`App.vue:10`「直接�染」、`stores/chat.ts:85`「Agent �态」等），
系编码往返损坏残留。全部在注释中，不影响渲染，判 C 类不计入本轮数字，但已作为**独立技术债**登记 ——
它暴露存在破坏性编辑流程，同一流程若作用到含中文的代码字符串上就是线上事故。

### 四、验证独立性倒退的纠正

T3a-3 我把 `verify-scan-coverage.mjs` 改成 `import { splitSFC, coverageMissedInVue }`，
理由是「单一事实源、杜绝双实现漂移」。理由没错，用错了地方 ——
结果是**用 `uiux-audit` 的 `splitSFC` 检查 `uiux-audit` 的 `splitSFC` 有没有漏扫**：
无论对错，两边算出的覆盖行集合永远逐位相同，差集恒为 ∅，脚本永远 `exit 0`。
这不是验证，是同义反复。

T3a-4 重写为**差分测试**：oracle 对 `.vue` 逐行全文扫描，**完全不存在「块」这个概念**，
因此原理上不可能漏掉块外的行；它可能多抓（style 块、行尾注释），但绝不会少抓。
差集每条要么落在具名豁免清单（逐条带理由），要么就是漏扫 → `exit 1`。

**import 边界**（这条线必须划清，否则又滑回循环）：
- ✅ `EMOJI_RE` 可 import —— 它是**判据**（"什么算图标"），两边必须同一把尺子，否则差集全是口径噪声。判据共享不构成循环，oracle 的独立性在于**扫描方式**。
- ✅ `audit` 可 import —— 它是**被测对象本身**。
- ❌ `splitSFC` / `coverageMissedInVue` 绝不 import 也绝不复刻 —— 它们是**被测实现**，oracle 整个绕过。

### 五、负向测试：证明闸门真的会 fail

T3a-3 的教训是「`exit 0` 的含金量为零」，所以这次两个闸门都做了**故意破坏**测试：

| 测试 | 手法 | 结果 |
|---|---|---|
| 闸门一 | 把 `splitSFC` 回退成 T3a-3 前的非贪婪配对 + `startLine+1` | **exit 1**，抓到 130 条漏扫 + 101 条行号错位 |
| 闸门二 | 注入 `__GateProbe.vue` 含白名单外字符 `✔`(U+2714) | **exit 1**，精确报出 `U+2714 ✔` 及位点 |
| 恢复后 | 两处破坏全部还原 | **exit 0**，oracle 151 = audit 151，差集双向 0 |

第一个测试是决定性的：**同样的 bug 下，T3a-3 那版自证循环 verify 会返回 0。**

### 六、双闸门与数字

- **闸门一（覆盖率）**：oracle \ audit 非豁免差集 = 0，否则 exit 1
- **闸门二（码位白名单）**：任何普查表之外的非 ASCII 码位进入代码库即 exit 1，
  强制人工判 A/B/C → 回写普查表 → 同步 `CENSUS_*` →（若判 A）同步 `EMOJI_RE`

**补丁循环之所以能终结，不是因为这一版判据写得多全，而是因为下一个未知字符会自己撞闸。**

### 七、数字归因（2×2 交叉复算，隔离两个变量）

| 组合 | functionalEmoji / sfcScriptEmoji / tsEmoji | 合计 |
|---|---|---|
| A 旧判据 + 旧口径（T3a-3 原状） | 78 / 56 / 61 | **195** |
| B 新判据 + 旧口径（仅扩类） | 94 / 57 / 63 | 214 |
| C 旧判据 + 新口径（仅统一 C 类口径） | 78 / 56 / 61 | **195** |
| D 新判据 + 新口径（T3a-4 定版） | 94 / 57 / 63 | **214** |

- **C 类口径统一净影响 = 0 / 0 / 0** —— 主理人「零实例」判断正确，改动无副作用（回归自证通过）
- **判据扩类净影响 = +16 / +1 / +2 = +19**（`＋`8 `×`5 `⧉`2 `←`1 `↓`1 `✓`1 `⋯`1）
- **交互项 = 0**，**消失位点 = 0**（无任何原有位点被误剔除）

### 八、C 类口径统一（第 8 项）

`.ts` 分支走 `stripComments`（剥离块注释 + 行尾内联注释），而 `.vue <script>` 分支原用
`/^\s*(\/\/|\*|\/\*)/` 只认行首注释 —— **同一份工具、同一个 C 类概念、两把尺子**：
`const x = 1; // ✅ 说明` 写在 `.ts` 被排除，写在 `.vue` 的 `<script>` 里会被计为违规。
现已统一为同源实现，净影响 0（见上表 A→C）。

### 九、`.ts` 侧 61 vs 62 差 1 销案

```
A(audit stripComments 口径) = 61
B(朴素行首注释口径)         = 62
【B 有 A 无】= 1
  packages/client/src/composables/useSessionList.ts:224
  if (s.archived) continue; // ✅ 必须保留：归档过滤（B10-③ / F30）
【A 有 B 无】= 0
```

`✅` 位于**行尾内联注释**，`audit` 正确判为 C 类排除。**`tsEmoji = 61` 是对的**，
挂了三轮的「差 1」悬案销案（T3a-4 定版后因 `×` 扩类变为 63）。

---

## 二、🔴 本次最大发现：Design Token 体系「建而未用」

`sizeTokenAdoption` 是新增指标，结果最刺眼：

| 维度 | 用 Token | 用原始 px | Token 采用率 |
|---|---|---|---|
| `font-size` | 2 | 302 | **0.7%** |
| `padding/margin/gap` | 3 | 471 | **0.6%** |
| **合计** | **5** | **773** | **0.6%** |

**结论**：Phase A 宣称「Design Token 体系建立完成」，但**只有颜色 Token 被真正采用**；字号与间距 Token 共 15 个定义，几乎无人使用——这正是 `unusedTokens=16` 的直接来源（16 个未使用 Token 中 11 个是 font/space 类）。

这意味着 v1 设计文档第 1.2/1.3 章的「间距 Token / 字号 Token」在代码层面**等同于未实施**。若 v2 只盯着颜色继续改，这 773 处仍会原样留存。**建议 v2 把「尺寸 Token 落地」列为独立 P0 工作项**，而非默认它已完成。

---

## 三、🔎 专项结论：`--km-left-w` 等 5 个是否为幽灵 Token

**结论：不是幽灵 Token，是合法的运行时注入。**

> **归因更正（主理人复核，2026-08-07 15:10）**：本节初稿把主理人此前「命中 0」归因为「本机 `grep` 被 BusyBox 接管、不支持 `--include` 而静默退化」，该诊断经实测**不成立**——本机为 GNU grep 3.0，`grep -rn "km-left-w" packages/client/src --include=*.ts` 正常命中 5 条。
>
> **真实根因是搜索假设过窄**：当时检索的模式是 `setProperty('--km-left-w')`，而这 4 个 Token 实际经 `cssVars` 对象字面量 + Vue `:style` 绑定下发，**根本不经过 `setProperty`**。因此「0 命中」是正确的检索结果，错的是「运行时注入 ⇒ 必然调用 setProperty」这一前提。
>
> **教训（比工具故障更重要）**：CSS 变量在 Vue 项目中至少有 3 条合法注入路径 —— ① `setProperty`、② 响应式对象 + `:style` 绑定、③ SCSS 静态定义。检索 Token 定义源必须三条全查，只查其一必然误判。若误信「工具不可靠」，后续所有人都会放弃 grep 转而依赖主观判断，反而更危险。

证据链完整：

| Token | 定义位置 | 下发方式 |
|---|---|---|
| `--km-left-w` | `stores/layout.ts:78,86` | `cssVars` computed |
| `--km-lh-w` | `stores/layout.ts:79,87` | 同上 |
| `--km-rh-w` | `stores/layout.ts:80,88` | 同上 |
| `--km-right-w` | `stores/layout.ts:81,89` | 同上 |
| `--km-grid-cols` | `components/common/MarketLayout.vue:95` | `document.documentElement.style.setProperty(...)` |

绑定点：`components/layout/LayoutShell.vue:136`
```vue
<div ref="shellRef" class="km-shell" :style="layout.cssVars">
```
`variables.scss:144-148` 的 `var(--km-left-w, 260px)` 是**首帧兜底**（避免 store 未就绪时布局塌陷），设计合理。

> 该判定已固化进脚本：JS 注入的 Token 自动归入 `runtimeInjectedTokens`（参考项，不计违规），今后无需人工争论。
>
> **口径厘清**：13 = 8 真幽灵（3 无 fallback + 5 有 fallback） + 5 合法运行时注入。双方数字都对，差异只在「运行时注入算不算幽灵」，现由脚本统一裁定。

---

## 四、幽灵 Token 明细

### 4.1 🔴 无 fallback = 真实渲染 bug（3 个，背景直接渲染为空）

| Token | 位置 |
|---|---|
| `--km-accent-bg` | `chat/AgentTabBar.vue:134`、`chat/MessageItem.vue:422`、`:446` |
| `--km-danger-bg` | `chat/MessageItem.vue:467` |
| `--km-file-chip-bg` | `chat/MessageItem.vue:355` |

### 4.2 🟡 有 fallback = 主题切换永久失效（5 个）

主理人的判断成立且重要：这类**比明文硬编码更隐蔽**——形式上「已经用了 Token」，历次审计据此放过，实则永远走 fallback，暗/亮切换对其完全无效。

| Token | 位置 | 实际恒定值 | 后果 |
|---|---|---|---|
| `--km-icon-bg` | `common/ResourceCard.vue:160` | `#f5f5f5` | 暗色下图标底仍为浅灰 |
| `--km-text-secondary` | `common/ResourceCard.vue:190` | `#888` | 描述文字不随主题 |
| `--km-highlight-bg` | `layout/LeftSidebar.vue:906`、`sidebar/SidebarSessionItem.vue:312` | `rgba(255,215,0,.3)` | 高亮恒为金黄 |
| `--km-sidebar-bg` | `layout/LeftSidebar.vue:659`、`layout/SettingsNav.vue:77` | `var(--km-panel)` | 降级合理，建议正式定义 |
| `--km-mono` | 14 处（AddModelDialog/LogDetailDialog/ResultDialog 等） | `ui-monospace` | 等宽字体无法统一调整 |

---

## 五、其他指标明细

| 指标 | 数量 | 说明 |
|---|---|---|
| `hardcodedHex` | 30 | 集中于 `McpCard`(5 状态点)、`#fff` 按钮文字(约 10)、`AppNav`、`OutputPanel` 等 |
| `hardcodedRgba` | 26 | 多为 hover/阴影半透明层 |
| `functionalEmoji` | 94 | template 内真实渲染的 emoji（已剔除注释与脚本串兜底；兜底类归 `sfcScriptEmoji`）。T3a-3 结构性漏扫修复 55→78；**T3a-4 普查定版 78→94**（`＋`8 `×`3 `⧉`2 `←`1 `↓`1 `⋯`1 = 16） |
| `sfcScriptEmoji` | 57 | `.vue` 的 `<script>` 段字符串内 emoji（含 `\|\|` 兜底、映射表）。T3a-3 后 54→56；**T3a-4 普查定版 56→57**（`AgentMarkdown.vue:50` `✓`）。C 类注释口径已与 `.ts` 分支统一（`stripComments` 同源），净影响 0 |
| `tsEmoji` | 63 | `.ts/.scss` 数据层 emoji（含 `AGENT_STATUS_ICONS` 14、`locales/*.ts` i18n 图标）。T3a-2 扩类后 46→61；T3a-3 不受影响；**T3a-4 普查定版 61→63**（`locales/en.ts:21`、`zh-CN.ts:21` 的 `'× Cancel'`）。「61 vs 62 差 1」悬案已销案，见第六阶段§九 |
| `outlineNone` | 5 | `ChatInput:561`、`ClarifyCard:56`、`DirPickerModal:324`、`LeftSidebar:819`、`SidebarSessionItem:302` |
| `kiconAdoption` | 8/82 (9.8%) | KIcon 已封装但仅 8 个文件采用 |
| `missingStates` | 5 | 见下方注意事项 |
| `unusedTokens` | 16 | 其中 11 个为 font/space 类，印证 §二 |

### 5.1 `missingStates` 判读注意（避免误伤）

| view | 缺 | 说明 |
|---|---|---|
| `ChatView.vue` | 空/载/错 | **已人工确认为良性**：状态由子组件 `MessageList`(EmptyState) 与 `ChatPanel`(NSpin) 承担，属组合式委托 |
| `SettingsView.vue` | 空/错 | 空态由内嵌 MarketLayout 承担；错误态确缺 |
| `MemoryView` / `QueueView` / `UsageView` | 错误态 | **真实缺失**，无统一错误+重试 CTA |

> 脚本按「单文件是否出现状态组件」判定，无法追踪跨组件委托。**该项数字需配合人工判读**，已在报告注明，避免下轮被当作硬指标误伤。

---

## 六、脚本使用说明

```bash
NODE=C:/Users/towyq/.workbuddy/binaries/node/versions/22.22.2/node.exe

$NODE scripts/uiux-audit.mjs                          # 控制台表格
$NODE scripts/uiux-audit.mjs --details                # 附完整 file:line
$NODE scripts/uiux-audit.mjs --json                   # 机器可读
$NODE scripts/uiux-audit.mjs --metric ghostTokensNoFallback   # 单项排查
$NODE scripts/uiux-audit.mjs --write-baseline         # 固化基线
$NODE scripts/uiux-audit.mjs --fail-on-regression     # 回归则 exit 1
```

**回归门禁已实测验证**：人为篡改基线模拟劣化后，脚本正确输出
`❌ 回归 ghostTokensNoFallback: 0 → 3 (+3)`、`❌ 回归 functionalEmoji: 40 → 43 (+3)`，
同时识别 `✅ 改善 outlineNone: 9 → 5`，并以 **exit 1** 中止。无变化时 exit 0。

---

## 七、豁免清单（每条必须有理由）

### 7.1 emoji / 符号字符的三类判定（A/B/C）

扫描到的「非文字字符」按下列三类判定，**类 A 计入违规、类 B / 类 C 豁免**：

| 类 | 判定 | 特征 | 处置 | 证据 |
|---|---|---|---|---|
| **A 真图标** | 计入违规，必须改 KIcon | 独立占位、可点击控件或状态指示、不依附句子语义 | 替换为 Tabler 图标组件 | `AgentRoleSection.vue:167` `▾` 折叠箭头；`NewTaskDialog.vue:261/291` `✕` 关闭钮；`McpManageSection.vue:46` `{label:'● 已连接'}` 状态点；`ProviderSection.vue:212/213` `● 已配置`/`○ 未配置`；`PageHeader.vue` `☰` 汉堡菜单；`RightPanel.vue` `⛶` 全屏；`types/agent.ts` `AGENT_STATUS_ICONS` 14 状态图标；`locales/*.ts` `▸↪⏹✎` i18n 图标；`FileTreePane.vue:51` `▶▼` 折叠箭头；`SubagentCard.vue:75` `▲▼` 折叠箭头（T3a-3 补实心三角族，类 A） |
| **B 文案标点** | **豁免，但逐条登记理由** | 嵌在句子里表示逻辑关系/路径导航，删掉句子不通顺 | 保留原文，记理由 | `NewTaskDialog.vue:211` `placeholder="选择 Agent（可在「设置 → Agent 角色管理」中新增）"` 中 `→` 表导航路径，是文案一部分 |
| **C 注释** | **豁免，扫描阶段即排除** | 位于 `//` / `/* */` / JSDoc / `<!-- -->` | 剥离层去除，不进入统计 | `AgentRoleSection.vue:5` JSDoc；`McpManageSection.vue:3` JSDoc；`MemoryView.vue:133` `<!-- 内嵌「设置 → 记忆管理」 -->` HTML 注释；`SettingsView.vue:341` JSDoc；`TerminalPane.vue:187` JSDoc |

> **判别口诀（类 A vs 类 B）**：把这个字符换成 Tabler 图标组件，句子还读得通吗？读不通 = 类 B（豁免）；读得通且它是独立控件/状态 = 类 A（整改）。
>
> **类 C 实现要点**：`stripComments` 已覆盖 HTML 注释 `<!-- -->`、JS `//` 与 `/* */` 块注释、JSDoc `*` 续行；`.vue` 模板块与 `.ts`/`.scss` 块均在 emoji 扫描前剥离。增量复核中 HTML 注释里大量 `→`（如 `MemoryView`/`JobsView`/`SettingsView`/`TerminalPane`/`ExpertPickerPanel` 的架构说明）已正确排除，未灌入假阳性。

| 指标 | 豁免对象 | 理由 |
|---|---|---|
| hex / rgba | `styles/variables.scss` | Token 定义源，原始色值是其职责 |
| hex / rgba | `components/preview/TerminalPane.vue` | ANSI 终端标准 16 色，由 xterm 规范固定，不可主题化（40 hex + 2 rgba） |
| hex / rgba | `styles/theme.ts` | Naive UI `themeOverrides` 要求字面量，无法消费 CSS 变量；已单列为技术债 Y2 |

> 豁免集中在脚本顶部 `EXEMPTIONS` 常量，新增豁免必须同步写明理由，禁止无理由豁免。
>
> **口径变更（2026-08-07 主理人裁决）**：原「`entity.icon || '🤖'` 数据兜底 emoji」豁免已**撤销**——此类 emoji 仍会渲染到界面，现统一计入 `sfcScriptEmoji`（🔴 违规指标）。当前唯一不计入违规的 emoji 仅剩：注释内 emoji（16）/ `*.test.ts` / 确认仅用于 `console.log` 的日志串。

---

## 八、给 v2 完善计划的量化目标建议

| 指标 | 当前 | v2 目标 | 优先级 |
|---|---|---|---|
| 幽灵Token·无fallback | 3 | **0** | P0 |
| 幽灵Token·有fallback | 5 | **0** | P0 |
| 原始px（尺寸Token采用） | 773 (0.6%) | < 200 (>70%) | **P0（新增，此前被完全忽略）** |
| 功能性 emoji | 78 | 0 | P1 |
| sfcScriptEmoji | 56 | 0 | P1 |
| tsEmoji | 61 | 0 | P1 |
| KIcon 采用率 | 9.8% | > 40% | P1 |
| 硬编码 hex | 30 | < 8 | P1 |
| 硬编码 rgba | 26 | < 10 | P2 |
| outline:none | 5 | 0 | P1 |
| 缺错误态 view | 3（真实） | 0 | P2 |
| 未使用 Token | 16 | < 4 | P2 |

---

> 基线固化：2026-08-07 · 高见远（Architect）
> 未修改任何 `.vue` / 源码，仅新增 `scripts/uiux-audit.mjs` 与本文档、基线 JSON。
