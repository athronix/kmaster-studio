# kmaster-studio 非 ASCII 码位穷尽普查表（T3a-4）

> 生成日期：2026-08-07 · 扫描面：`packages/client/src` 下 126 个 `.vue` / `.ts` / `.scss`（排除 `*.test.ts`）
> 生成工具：`scripts/tmp-charset-census.mjs`（一次性，普查定版后删除）
> 消费方：`scripts/uiux-audit.mjs` 的 `EMOJI_RE` · `scripts/verify-scan-coverage.mjs` 的 `CENSUS_*` 白名单
> **本表是 `EMOJI_RE` 的唯一合法来源。改 `EMOJI_RE` 必须先改本表。**

---

## §1 为什么要做这件事：终结「扩类补丁循环」

`EMOJI_RE` 从 T2.5 到 T3a-3 共扩类**五轮**，每一轮都长这样：主理人抽样 → 发现某个字符没被抓 → 把它加进正则 → 宣布"这次全了" → 下一轮又抽出新的。

| 轮次 | 阶段 | 补进的字符 | 触发方式 |
|---|---|---|---|
| 1 | T2.5 | `● ○ ▾ ▸` | 人肉抽样 |
| 2 | T3a-1 | `☰ ⛶ ✕ ✍ ✎ ⏹ ⏳ ⏸ ⏯ ↗ ◐ ◉ ⌨ ✏` | 人肉抽样 |
| 3 | T3a-2 | `↪` | 人肉抽样 |
| 4 | T3a-3 | `↻ ↺` | grep 实证 |
| 5 | T3a-3 | `▲ ▶ ▼ ◀ ◂ ▴` | 发现「同族一抓一漏」 |
| 6 | T3a-4 | `＋ ✓ ← ↓` + `× ⧉ ⋯ ⊗` | 主理人宽字符集对账 + 本次穷尽普查 |

**这是结构性错误，不是勤奋度问题。** 补丁循环的本质是：我们在用「已知样本」去逼近一个「未知集合」。只要判据是「我想到了哪些图标字符」，就永远有想不到的下一个——第 5 轮的 `▲▼` 已经暴露了荒谬之处（`▶` 恰好命中 `Extended_Pictographic` 被抓到，同族的 `▼` 不命中被漏掉，口径自相矛盾）。

**根治只有一个方向：反向穷举。** 不去猜「还有哪些图标字符」，而是把代码库里**实际出现过的全部非 ASCII 码位**枚举出来，逐个判 A/B/C，判完即闭合。集合从「未知且无界」变成「已知且有限」，补丁循环失去存在土壤。

第 6 轮的教训尤其值得记：主理人用宽字符集（`1F300-1FAFF` / `2300-23FF` / `25A0-25FF` / `2600-27BF` / `2B00-2BFF` / `2190-21FF` / `FF0B`）做对账，抓到了 11 个漏检位点——**但这套宽字符集本身仍然是"猜区间"，仍然漏了 4 个码位**（`×` U+00D7、`⧉` U+29C9、`⋯` U+22EF、`⊗` U+2297，共 8 个位点），因为它们不落在上述任何一个区间内。**用猜的字符集去验证猜的字符集，只能把误差缩小，不能归零。** 唯一能归零的判据是 `/[^\x00-\x7F]/u`——非 ASCII 全都要。

---

## §2 总览

```
扫描文件数                    126
CJK 汉字（聚合，不逐码位列出）  34849 字符 / 3720 位点   —— 100% 正文文案
非 ASCII 非汉字 码位总数       123
  ├ 类 A 真图标               83   → 全部进 EMOJI_RE
  ├ 修饰符（ZWJ / VS16）        2   → 依附基字符，不单独成位点
  ├ 类 B 文案标点              28   → 豁免
  └ 类 C 注释装饰 / 数学符号    10   → stripComments 阶段即排除
```

### 判定标准（三选一，必须落一类）

| 类 | 判据 | 处置 |
|---|---|---|
| **A 真图标** | 删掉后「按钮没了标识 / 状态无从分辨」 | 计入违规，必须改 `KIcon`；进 `EMOJI_RE` |
| **B 文案标点** | 删掉后「句子读不通」 | 豁免；进 verify 的 `CENSUS_B` 白名单 |
| **C 注释装饰** | 只出现在注释 / 制表 ASCII art / 数学符号 | `stripComments` 阶段排除；进 `CENSUS_C` |

> **关键：判定看语境，不看字符本身。** 同一个箭头，`<template #icon>←</template>` 是 A，`设置 → Agent 角色管理` 是 B。
> 本表对每个码位给出「非注释位点数」，正是为了让语境判定有据可依——非注释位点为 0 的字符，无论长什么样都是 C。

---

## §3 类 A · 真图标（83 个码位，全部进 EMOJI_RE）

### §3.1 符号字形（40 个）—— `Extended_Pictographic` 覆盖情况见备注

| 码位 | 字符 | 字符数 | 位点 | 非注释位点 | 首个/代表位点 | 判 A 依据 |
|---|:-:|--:|--:|--:|---|---|
| U+00D7 | `×` | 18 | 15 | 6 | `ChatInput.vue:310`、`MessageList.vue:144`、`MessageList.vue:151`、`OutputPanel.vue:154`、`locales/en.ts:21`、`locales/zh-CN.ts:21` | 关闭按钮（`km-chip-x` / `km-*-dismiss` / `km-output-tab-close`）+ i18n `'× Cancel'`。**五轮扩类全程未覆盖**：拉丁-1 补充区，不在任何"emoji 区间"猜想内 |
| U+2139 | `ℹ` | 1 | 1 | 1 | `ResultDialog.vue:63` `icon: 'ℹ️'` | 明文 icon 字段。`Extended_Pictographic` 已覆盖 |
| U+2190 | `←` | 10 | 10 | 1 | `SettingsNav.vue:64` `<template #icon>←</template>` | **明文 icon 插槽**。其余 9 位点全在注释（布局示意图），故非注释位点仅 1 |
| U+2192 | `→` | 55 | 37 | 3 | `SettingsDrawer.vue:77`「更多设置 →」、`NewTaskDialog.vue:211`「设置 → Agent 角色管理」、`MemoryView.vue:202`「取锁 → 备份 → 原子写回」 | SettingsDrawer:77 = 按钮尾随导航箭头（判 A，主理人 T3a-4 收尾裁定）。另两处为**类 B 句中连接符**，经主理人裁定不计入整改面。**机械审计器不区分语境仍计数 3**（functionalEmoji 从 94 升至 97），verify 经 E4 位点级豁免仅报警 SettingsDrawer:77 一处实际漏扫。**实际可整改位点 = 1**（SettingsDrawer:77）。 |
| U+2193 | `↓` | 2 | 2 | 1 | `MessageList.vue:181` `↓ 滚动到底部` | 按钮前导图标 |
| U+2197 | `↗` | 1 | 1 | 1 | `types/agent.ts:46` `'sending-msg': '↗'` | `AGENT_STATUS_ICONS` 状态图标 |
| U+21AA | `↪` | 2 | 2 | 2 | `locales/en.ts:17` `'chat.steer': '↪ Steer'` | i18n 按钮图标 |
| U+21BB | `↻` | 3 | 3 | 3 | `MessageItem.vue:293`、`McpManager.vue:70`、`SkillPanel.vue:51` | 刷新/重试按钮 |
| U+2297 | `⊗` | 1 | 1 | 1 | `AgentRoleSection.vue:231` `role.disabled ? '○' : '⊗'` | 启用/禁用状态图标。**与已收的 `○` 同族，典型"一抓一漏"** |
| U+22EF | `⋯` | 1 | 1 | 1 | `SidebarSessionItem.vue:201` `aria-label="more"` | "更多"按钮。数学运算符区，宽字符集猜想未覆盖 |
| U+2328 | `⌨` | 1 | 1 | 1 | `types/agent.ts:53` `'coding': '⌨️'` | 状态图标 |
| U+23F0 | `⏰` | 2 | 2 | 2 | `AppNav.vue:27` `icon: '⏰'` | 导航图标。`Extended_Pictographic` 覆盖 |
| U+23F3 | `⏳` | 2 | 2 | 2 | `ToolCallCard.vue:13` running 态 | 同上 |
| U+23F8 | `⏸` | 2 | 2 | 2 | `ChatInput.vue:249` `'⏸ Interrupt'` | 同上 |
| U+23F9 | `⏹` | 3 | 3 | 3 | `locales/en.ts:18` `'chat.stop': '⏹ Stop'` | 同上 |
| U+25B2 | `▲` | 1 | 1 | 1 | `SubagentCard.vue:75` `收起产出 ▲` | 折叠指示 |
| U+25B6 | `▶` | 2 | 2 | 1 | `FileTreePane.vue:51` `node.collapsed ? '▶' : '▼'` | 折叠指示 |
| U+25B8 | `▸` | 6 | 6 | 6 | `ThoughtBlock.vue:11` `open ? '▾' : '▸'` | 折叠指示 |
| U+25BC | `▼` | 3 | 3 | 2 | `SubagentCard.vue:75` `展开产出 ▼` | 折叠指示 |
| U+25BE | `▾` | 3 | 3 | 3 | `ThoughtBlock.vue:11` | 折叠指示 |
| U+25C9 | `◉` | 2 | 2 | 2 | `LeftSidebar.vue:578` `job.enabled ? '◉' : '○'` | 开关状态 |
| U+25CB | `○` | 5 | 5 | 5 | 同上 | 开关状态 |
| U+25CF | `●` | 2 | 2 | 2 | `McpManageSection.vue:46` `'● 已连接'` | 连接状态 |
| U+25D0 | `◐` | 1 | 1 | 1 | `types/agent.ts:45` `'closing': '◐'` | 状态图标 |
| U+2600 | `☀` | 4 | 4 | 3 | `AppNav.vue:78` `theme.isDark ? '🌙' : '☀️'` | 主题切换 |
| U+2630 | `☰` | 3 | 3 | 1 | `PageHeader.vue:118` | 左栏显隐（汉堡） |
| U+267B | `♻` | 5 | 5 | **0** | `api/client.ts:141`（全在注释） | 语义确属图标，但非注释位点为 0 → 实际全部归入 `commentEmoji`，不计违规 |
| U+2699 | `⚙` | 4 | 4 | 2 | `AppNav.vue:36` `icon: '⚙️'` | 设置图标 |
| U+26A0 | `⚠` | 34 | 34 | 6 | `ProviderSection.vue:266` | 警告图标 |
| U+26D4 | `⛔` | 1 | 1 | 1 | `ResultDialog.vue:61` `icon: '⛔'` | 错误态图标 |
| U+26F6 | `⛶` | 5 | 5 | 1 | `RightPanel` 全屏按钮 | 全屏图标 |
| U+2705 | `✅` | 2 | 2 | 2 | `ResultDialog.vue:60` `icon: '✅'` | 成功态图标 |
| U+270D | `✍` | 1 | 1 | 1 | `AgentRoleSection.vue:54` `'✍️ 手动添加'` | 菜单项图标 |
| U+270E | `✎` | 7 | 7 | 7 | `MessageItem.vue:285` `>✎</button>` | 编辑按钮 |
| U+270F | `✏` | 1 | 1 | 1 | `types/agent.ts:52` `'writing': '✏️'` | 状态图标 |
| U+2713 | `✓` | 2 | 2 | 2 | `AgentMarkdown.vue:50` `btn.textContent = '✓'`、`ToolCallCard.vue:13` | 复制成功态 / 工具成功态。**与已收的 `✕` 同族，又一处"一抓一漏"** |
| U+2715 | `✕` | 8 | 8 | 6 | `ToolCallCard.vue:13` error 态 | 关闭 / 失败图标 |
| U+2728 | `✨` | 1 | 1 | 1 | `MarketLayout.vue:237` `✨ 精选推荐` | 标题装饰图标 |
| U+2753 | `❓` | 1 | 1 | 1 | `ClarifyCard.vue:18` | 提问卡片图标 |
| U+29C9 | `⧉` | 4 | 4 | 2 | `PageHeader.vue:152`、`ChatView.vue:295` `<template #icon>⧉</template>` | **明文 icon 插槽**，右栏显隐。杂项数学符号 B 区，宽字符集猜想未覆盖 |
| U+FF0B | `＋` | 9 | 9 | 8 | `McpManager.vue:95`、`AgentRoleSection.vue:166`、`ModelManageSection.vue:205`、`JobsView.vue:224`、`JobsView.vue:237`、`MemoryView.vue:123`、`MemoryView.vue:134`、`MemoryView.vue:153` | `＋添加` / `＋新增` / `＋新建` 按钮（`IconPlus` 场景）。**全角标点区 U+FF00-FFEF，五轮扩类完全未涉足** |

### §3.2 Emoji 本体（42 个码位）—— 全部由 `\p{Extended_Pictographic}` 覆盖

`🌐 U+1F310` `🌙 U+1F319` `🎛 U+1F39B` `🎨 U+1F3A8` `🎯 U+1F3AF` `👋 U+1F44B` `👤 U+1F464` `💬 U+1F4AC` `💭 U+1F4AD` `💼 U+1F4BC` `📁 U+1F4C1` `📂 U+1F4C2` `📄 U+1F4C4` `📊 U+1F4CA` `📋 U+1F4CB` `📌 U+1F4CC` `📖 U+1F4D6` `📜 U+1F4DC` `📝 U+1F4DD` `📡 U+1F4E1` `📥 U+1F4E5` `📦 U+1F4E6` `🔄 U+1F504` `🔌 U+1F50C` `🔍 U+1F50D` `🔐 U+1F510` `🔒 U+1F512` `🔧 U+1F527` `🔬 U+1F52C` `🔴 U+1F534` `🔽 U+1F53D` `🗑 U+1F5D1` `🚫 U+1F6AB` `🛒 U+1F6D2` `🛠 U+1F6E0` `🛡 U+1F6E1` `🤖 U+1F916` `🧑 U+1F9D1` `🧠 U+1F9E0` `🧩 U+1F9E9` `🧪 U+1F9EA` `🧰 U+1F9F0`

> 这一段无需在 `EMOJI_RE` 里显式枚举——`\p{Extended_Pictographic}` 是 Unicode 标准属性，天然全覆盖，且随 Node 的 Unicode 版本自动更新。**禁止手工枚举码点区间来"模拟"这个属性**，那正是宽字符集猜想的错误做法。

### §3.3 修饰符（2 个，不单独成位点）

| 码位 | 字符 | 位点 | 说明 |
|---|:-:|--:|---|
| U+200D | ZWJ | 2 | 零宽连接符，构成 `🧑‍💼` 之类的组合 emoji（`MemberDetailDialog.vue:91`）。永远依附基字符，**不单独成位点**，也不单独计违规 |
| U+FE0F | VS16 | 51 | 变体选择符，把文本呈现的符号（如 `⚠`）变成 emoji 呈现（`⚠️`）。同上 |

---

## §4 类 B · 文案标点（28 个码位，豁免）

判据：**删掉后句子读不通**。这些字符承担语法/语义功能，不是可点击的视觉标识。

| 码位 | 字符 | 非注释位点 | 语境实证 | 豁免理由 |
|---|:-:|--:|---|---|
| U+00A7 | `§` | 2 | `MemoryView.vue:130` 「以 `§` 分隔条目」、`MemoryView.vue:200` placeholder | 这两处不是图标，是**在向用户解释数据格式**——正文里提到了这个字符本身 |
| U+00B7 | `·` | 24 | 各处 `A · B` 间隔 | 间隔号 |
| U+2013 | `–` | 1 | `AgentRoleDetail.vue:238` 「1–4 个字符」 | 数值范围连接号 |
| U+2014 | `—` | 34 | 各处破折号 | 破折号 |
| U+2026 | `…` | 38 | 各处省略号 | 省略号 |
| U+2191 | `↑` | **0** | `DirPickerModal.vue:65` `/** ↑ 键：上移 */` | 唯一 1 个位点在注释里，且语境是"↑ 这个按键"，非图标 |
| U+2460–U+2466 | `①②③④⑤⑥⑦` | 3 | `AddModelDialog.vue:455` 「① 连通性测试（10s）」、`:473`「② 深度测试（30s）」、`useSessionList.ts:224` 注释 | **步骤序号**，与文档 `R-11①` / `B10-③` 编号体系一一对应，删掉就失去步骤指代 |
| U+3000 | `　` | 1 | `AgentRoleSection.vue:145` `parts.join('　·　')` | 表意空格，排版分隔 |
| U+3001 `、` U+3002 `。` U+300C `「` U+300D `」` U+3010 `【` U+3011 `】` | | 92 | 全库中文正文 | 中文标点 |
| U+FF01 `！` U+FF08 `（` U+FF09 `）` U+FF0C `，` U+FF1A `：` U+FF1B `；` U+FF1F `？` | | 321 | 全库中文正文 | 全角中文标点 |
| U+FF5C | `｜` | 1 | `StatusBar.vue:71` `` `${checkedText}｜失败原因：${reason}` `` | 全角竖线，文案字段分隔符 |

---

## §5 类 C · 注释装饰与数学符号（10 个码位，扫描阶段即排除）

共同特征：**非注释位点全部为 0**，即从未出现在会渲染的代码里。

| 码位 | 字符 | 字符数 | 位点 | 非注释位点 | 用途 |
|---|:-:|--:|--:|:-:|---|
| U+222A | `∪` | 5 | 3 | 0 | `useSessionList.ts:121` 注释「本地角色库 ∪ 会话角色名」——集合并 |
| U+2248 | `≈` | 1 | 1 | 0 | `ContextRing.vue:35` 注释「1 token ≈ 4 bytes」 |
| U+2260 | `≠` | 1 | 1 | 0 | `LayoutShell.vue:20` 注释「折叠 ≠ 卸载」 |
| U+2265 | `≥` | 4 | 4 | 0 | `constants/sidebar.ts:110` 注释阈值说明 |
| U+2500 | `─` | 1262 | 177 | 0 | 注释分隔线 ASCII art |
| U+2514 | `└` | 2 | 2 | 0 | `RightPanel.vue:8` 注释结构树 |
| U+251C | `├` | 5 | 5 | 0 | 同上 |
| U+2550 | `═` | 5164 | 121 | 0 | 注释分节线 ASCII art |
| U+27F7 | `⟷` | 2 | 2 | 0 | `LeftSidebar.vue:10` 注释布局示意 |
| U+FFFD | `�` | 14 | 5 | 1 | **文件编码损坏残留，见 §6** |

---

## §6 普查副产物：U+FFFD 文件编码损坏（新债型，独立于 emoji）

普查的意外收获。`U+FFFD REPLACEMENT CHARACTER` 出现 14 次 / 5 位点，这不是"有人写了个奇怪符号"，而是**源文件在某次读写中发生了编码损坏**，中文字符被替换字符吃掉：

| 位点 | 现状 | 应为 |
|---|---|---|
| `App.vue:10` | `` * - `<router-view>` 直接���染（LayoutShell 由路由注入） `` | 渲染 |
| `components/chat/MessageItem.vue:117` | `// —— V4：仅复制消息中所有代码块 —���` | `——` |
| `components/market/ExpertDetail.vue:45` | `<!-- ���用场景 -->` | 适用场景 |
| `stores/chat.ts:85` | `// —— UI 重设计 T02：置顶会话 & Agent ���态 ——` | 状态 |
| `types/dataSource.ts:11` | `Live = 'live',       // 真��数据已加载` | 真实 |

**影响面**：全部在注释中，不影响渲染，不属 UI 债。
**但它是真缺陷**——源文件完整性受损，且预示某个工具链环节存在编码处理 bug（很可能是历史上某次批量改写用了错误的编码读入）。
**处置建议**：单列为独立低优先级整改项（`Y3 · 源文件编码修复`），**不并入 emoji 整改面**，避免污染 217 这个数字的语义。

---

## §7 零出现兜底字符（4 个，保留在 EMOJI_RE 但本次普查中不存在）

`↺ U+21BA` `◀ U+25C0` `◂ U+25C2` `▴ U+25B4`

这四个是 T3a-3 以"同族一致性"为由收入的，本次普查确认**代码库中零出现**。保留理由：它们与已收字符（`↻` / `▶▸▼▾▲`）严格同族，未来一旦被引入，不应再经历一次"发现漏网—打补丁"。

**但兜底集到此为止，不再扩张。** 过去靠"猜同族变体"（`✔ ✖ ⊕ ⋮` 之类）防漏，本质仍是补丁思维的残余。T3a-4 起改由 §8 的**闸门②** 兜底：任何普查表之外的新非 ASCII 码位一进代码库就 `exit 1`，强制人工判 A/B/C 并回写本表。**未知字符必然暴露，无需再猜。**

---

## §8 定版 `EMOJI_RE` 与双闸门

### 定版正则（`scripts/uiux-audit.mjs`）

```js
export const EMOJI_RE =
  /[\p{Extended_Pictographic}×←↓↗↪↺↻⊗⋯⌨▲▴▶▸▼▾◀◂◉○●◐☰⛶✍✎✏✓✕⧉→＋]/gv;
```

- `\p{Extended_Pictographic}` → 覆盖 §3.2 的 42 个 emoji + §3.1 中标注"`Extended_Pictographic` 覆盖"的 12 个符号
- 显式补充块的**每一个字符**都对应 §3.1 表格的一行，可逐字符溯源
- §7 的 4 个零出现字符也在其中，理由见 §7

### 闸门①（覆盖率）· `verify-scan-coverage.mjs`

用**全文逐行扫描 oracle**（完全没有"块"的概念，因此原理上不可能漏掉块外的行）对照 `audit()` 的分块结果，差集必须 100% 具名豁免。

**这道闸门做过变异测试（positive control）**：把 `splitSFC` 回退成 T3a-3 修复前的非贪婪配对版，闸门立刻报出 `oracle 151 / audit 122 / 漏扫 29` 并 `exit 1`。
**这一步不能省**——T3a-3 的教训正是「差集 0」有两种可能：真的没漏，或者验证退化成了同义反复。不做变异测试，就分不清这两者。

### 闸门②（字符类完备）· 本表的强制执行机制

遍历全部非 ASCII 码位，每个码位要么被 `EMOJI_RE` 覆盖（类 A），要么落在 `CENSUS_B` / `CENSUS_C` 白名单。**出现第三种即 `exit 1`**，并提示：

```
❌ 闸门二失败：检出 N 个普查表之外的非 ASCII 码位。
   请人工判定 A/B/C，回写 docs/audit/uiux-charset-census-2026-08-07.md，并同步本脚本 CENSUS_* 常量；
   若判为 A 类真图标，还须同步 uiux-audit.mjs 的 EMOJI_RE。
```

**这是本次普查真正的交付物**——普查表本身会过期（新代码带来新字符），但闸门②保证它**过期即报警**。一次性普查 + 永久闸门，补丁循环从此关闭。

### 当前实跑状态

```
══════ 独立差分验证（oracle=全文逐行扫描，绕过 splitSFC）══════
扫描 126 文件（82 个 .vue）
A  oracle 全文扫描位点(.vue) : 151
B  audit  分块扫描位点(.vue) : 151
   ├ 已具名豁免              : 0
   ├ 疑似漏扫(A\B 非豁免)    : 0
   └ B 有 A 无               : 0
✅ 闸门一通过：oracle 与 audit 差集已 100% 具名豁免，无漏扫。
✅ 闸门二通过：全部非 ASCII 码位均在普查表 123 项白名单内。
```

---

## §9 普查带来的数字修正

| 指标 | T3a-3 | T3a-4 定版 | 增量 |
|---|--:|--:|--:|
| `functionalEmoji`（template） | 78 | **95** | +17 |
| `sfcScriptEmoji`（.vue script） | 56 | **57** | +1 |
| `tsEmoji`（.ts / .scss） | 61 | **63** | +2 |
| **emoji 整改总面** | **195** | **215** | **+20** |

### +20 的逐字符归因（`scripts/tmp-attribution.mjs` 实跑，旧判据 vs 定版判据差集）

| 字符 | 码位 | 净增位点 | 位点清单 |
|:-:|---|--:|---|
| `＋` | U+FF0B | 8 | `McpManager.vue:95`、`AgentRoleSection.vue:166`、`ModelManageSection.vue:205`、`JobsView.vue:224`、`JobsView.vue:237`、`MemoryView.vue:123`、`MemoryView.vue:134`、`MemoryView.vue:153` |
| `×` | U+00D7 | 5 | `MessageList.vue:144`、`MessageList.vue:151`、`OutputPanel.vue:154`、`locales/en.ts:21`、`locales/zh-CN.ts:21` |
| `⧉` | U+29C9 | 2 | `PageHeader.vue:152`、`ChatView.vue:295` |
| `✓` | U+2713 | 1 | `AgentMarkdown.vue:50` |
| `↓` | U+2193 | 1 | `MessageList.vue:181` |
| `←` | U+2190 | 1 | `SettingsNav.vue:64` |
| `⋯` | U+22EF | 1 | `SidebarSessionItem.vue:201` |
| `→` | U+2192 | 1 | `SettingsDrawer.vue:77`（T3a-4 收尾裁定改判 A；另两处 `NewTaskDialog:211` / `MemoryView:202` 维持 B，verify E4 豁免） |
| | | **20** | 按扩展名：`.vue` 18 / `.ts` 2 |

> **为什么 `×` 只净增 5 而非 6**：`ChatInput.vue:310` 同行已有 `📄`，旧判据已把该行记为位点。计数单位是 **file:line 位点**，同行多字符仍记 1。
> **为什么 `✓` 只净增 1 而非 2**：`ToolCallCard.vue:13` 同行已有 `⏳` `✕`。
> **为什么 `⊗` 净增 0**：`AgentRoleSection.vue:231` 同行已有 `○`。仍将其收入 `EMOJI_RE`，是为消除"同族一抓一漏"的口径矛盾。

### 附：`.ts` 侧 61 vs 62 的差值交代（主理人纪律项）

主理人四象限实测 `.ts` 为 62，`uiux-audit.mjs` 输出 61，差 1。**具名答案：`packages/client/src/composables/useSessionList.ts:224`**

```js
if (s.archived) continue; // ✅ 必须保留：归档过滤（B10-③ / F30）
```

`✅` 位于**行尾内联注释**。`uiux-audit.mjs` 走 `stripComments` 精确剥离行尾注释 → 判 C 类不计（**正确**）；四象限实测用「行首注释」朴素判据 → 计入（**多计 1**）。
`scripts/tmp-ts-diff.mjs` 对拍两口径：`【B 有 A 无】= 1`（恰为此条）、`【A 有 B 无】= 0`。
**结论：61 是对的，62 多计 1。** 定版后因 `×` 进判据，`.ts` 侧升至 **63**（+2 = `locales/{en,zh-CN}.ts:21` 的 `'× Cancel'` / `'× 取消'`）。

---

## §10 维护约定

1. **改 `EMOJI_RE` 前必须先改本表**——新增字符要在 §3 补一行，写明位点与判 A 依据。
2. **改 verify 的 `CENSUS_B` / `CENSUS_C` 前必须先改本表**——§4 / §5 补一行，写明豁免理由。
3. **闸门② 报警时不许直接把字符塞进白名单了事**——必须先判 A/B/C，判 A 的要进 `EMOJI_RE` 并计入整改面。
4. 本表的生成工具 `scripts/tmp-charset-census.mjs` 为一次性脚本，定版后删除；需要重新普查时从本文件 §1 的方法描述重建即可（`/[^\x00-\x7F]/u` 全量枚举 + 按码位聚类 + 输出非注释位点数）。
