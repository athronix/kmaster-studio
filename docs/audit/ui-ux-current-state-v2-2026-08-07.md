# kmaster-studio UI/UX 现状基线 v2（刷新版）

> **审计日期**：2026-08-07（晚，Phase A/B/C 改造后复审）
> **审计人**：高见远（Architect / Bob）
> **审计范围**：`packages/client/src` 全量 —— 82 个 `.vue` + `styles/variables.scss` + `styles/theme.ts`
> **方法论**：DDD「先调研再下结论」。本文所有结论均通过实际打开代码 + grep 量化核对，**不照抄** `ui-ux-current-state-2026-08-07.md`（旧审计，Phase 改造前产出，多处已过时）。
> **定位**：本文为 v2 重设计的**事实基线**，供产品经理编写 `kmaster-studio-ui-ux.v2.md` 与后续完善计划直接引用。

---

## 〇、TL;DR（一句话结论）

Phase A/B/C 改造成效显著：**旧审计 7 项 🔴 已基本全部消除**（Design Token 体系、亮色代码块、PageHeader 统一、KIcon 封装、focus-visible、DirPickerModal 内联样式清零、主题持久化均已落地）。当前遗留问题从「架构性缺失」降级为「一致性收尾」：**3 个未定义且无 fallback 的「幽灵 Token」（真实渲染 bug）**、**残留 emoji ~124 处（功能性图标 ~45 处应迁 KIcon）**、**卡片状态色仍硬编码**、**5 处 `outline:none` 抵消全局 focus 环**、**错误态/重试 CTA 覆盖偏弱**。

---

## 一、全局基础层现状

### 1.1 `styles/variables.scss` —— Token 全清单（已核对 50 个定义）

改造后已建立**完整 Token 体系**，颜色/语义/组件类均提供暗（`:root`）/亮（`:root[data-theme='light']`）双值；尺寸类（圆角/字号/间距）为单值（合理，不需主题分叉）。

#### ① 基础颜色 Token（13 个，暗/亮双值 ✅ 齐全）

| Token | 暗色 | 亮色 | 备注 |
|---|---|---|---|
| `--km-bg` | `#1e1e1e` | `#ffffff` | ✅ |
| `--km-panel` | `#252526` | `#f3f3f3` | ✅ |
| `--km-border` | `#333333` | `#e5e5e5` | ✅ |
| `--km-border-light` | `#444444` | `#d4d4d4` | ✅ |
| `--km-text` | `#d4d4d4` | `#1f1f1f` | ✅ |
| `--km-accent` | `#3b82f6` | `#2563eb` | ✅ |
| `--km-user-bubble` | `#2d2d30` | `#dbeafe` | ✅ |
| `--km-muted` | `#9ca3af` | `#6b7280` | ✅ |
| `--km-danger` | `#dc2626` | `#dc2626` | 🟡 暗/亮同值，亮色下略深 |
| `--km-success` | `#34d399` | `#10b981` | ✅ |
| `--km-warning` | `#f59e0b` | `#d97706` | ✅ |
| `--km-card-bg` | `rgba(255,255,255,0.04)` | `#fff` | ✅ |
| `--km-card-border` | `rgba(255,255,255,0.08)` | `#e8e8e8` | ✅ |

#### ② 语义色 Token（Phase A，7 个，双值 ✅）

| Token | 暗色 | 亮色 |
|---|---|---|
| `--km-code-bg` | `#161616` | `#f8f8f8` |
| `--km-code-head-bg` | `#1a1a1a` | `#ebebeb` |
| `--km-bubble-ai` | `#252526` | `#f0f0f0` |
| `--km-bubble-tool` | `#1e1e2e` | `#f5f5ff` |
| `--km-input-bg` | `#2d2d30` | `#ffffff` |
| `--km-hover-bg` | `rgba(255,255,255,0.06)` | `rgba(0,0,0,0.04)` |
| `--km-overlay` | `rgba(0,0,0,0.5)` | `rgba(0,0,0,0.3)` |

#### ③ 组件专用 Token（Phase B，8 个，双值 ✅）

| Token | 暗色 | 亮色 |
|---|---|---|
| `--km-tool-card-bg` | `rgba(255,255,255,0.02)` | `#f9fafb` |
| `--km-thought-border` | `#6b7280` | `#9ca3af` |
| `--km-approval-border` / `-bg` | `#b45309` / `rgba(180,83,9,.1)` | `#d97706` / `rgba(217,119,6,.06)` |
| `--km-clarify-border` / `-bg` | `#1d4ed8` / `rgba(29,78,216,.1)` | `#2563eb` / `rgba(37,99,235,.06)` |
| `--km-plan-border` / `-bg` | `#7c3aed` / `rgba(124,58,237,.1)` | `#7c3aed` / `rgba(124,58,237,.06)` |

#### ④ 尺寸 Token（Phase A，单值）

| 类别 | Token 清单 | 状态 |
|---|---|---|
| 圆角 | `--km-radius-sm:4 / -md:6 / -lg:8 / -full:999px` | ✅ 齐全 |
| 阴影（双值） | `--km-shadow-card / -modal / -dropdown` | ✅ 暗/亮双值 |
| 字号 | `--km-font-xs:10 / -sm:12 / -md:14 / -base:15 / -lg:17 / -xl:20 / -2xl:26px` | ✅ 齐全（7 级） |
| 间距 | `--km-space-2xs:2 / -xs:4 / -sm:8 / -md:12 / -lg:16 / -xl:24 / -2xl:32 / -3xl:48px` | ✅ 齐全（8 级） |

**全局规则**：已新增 `*:focus-visible { outline: 2px solid var(--km-accent); outline-offset: 2px; }`（第 174 行）；`html { transition: background-color/color 0.3s }` 主题平滑过渡；`@keyframes km-pulse` 流式动画；`.km-shell` 5 轨道 Grid。

### 1.2 `styles/theme.ts` —— 主题引擎现状（旧审计 3 项 🟡 已全部修复）

| 旧审计问题 | 当前实测 | 状态 |
|---|---|---|
| `isDark` 硬编码 `true` | `getInitialTheme()` 读 `localStorage('km-theme')` | ✅ 已修 |
| 无 localStorage 持久化 | `toggle/setTheme` 均写 localStorage | ✅ 已修 |
| 无 `prefers-color-scheme` | `getInitialTheme` 已回落系统偏好 | ✅ 已修 |
| overrides 仅 `common` 层 | 已扩展 `Button/Tag/Input/Modal` token | ✅ 已改善 |

**仍存 🟡**：`buildOverrides()` 内颜色（`#3b82f6/#1e1e1e/#252526…`）与 `variables.scss` 平行硬编码，两套色值需手工同步，存在漂移风险 —— 建议 v2 让 theme.ts 从 CSS 变量读取或抽公共常量。

### 1.3 基础设施资产核对

| 资产 | 路径 | 现状 |
|---|---|---|
| KIcon 封装 | `components/common/KIcon.vue` | ✅ 存在，`@tabler/icons-vue` 动态取 `Icon${name}`，含 fallback；被 ~28 处引用 |
| 空态 | `components/common/EmptyState.vue` | ✅ 存在，已用 KIcon（依赖全局 focus 规则，无组件级 `:focus-visible`） |
| 骨架屏 | `SkeletonCard.vue` / `SkeletonList.vue` | ✅ 存在 |
| 状态边界 | `components/common/DataStateBoundary.vue` | ✅ Live/Loading/Empty/Error/Offline 状态机 |
| 统一页头 | `components/layout/PageHeader.vue` | ✅ 存在，被 6 个 view 引用 |

---

## 二、量化统计（上一版 vs 当前）

> 统计口径均排除 `variables.scss`（Token 定义源，允许原始色值）；`TerminalPane.vue` 的 ANSI 终端调色板（40 hex + 2 rgba）属功能必需，单列不计入「需治理」。

| 指标 | 上一版审计（估） | 当前实测 | 结论 |
|---|---|---|---|
| 硬编码 hex `#xxx`（.vue，排除 variables.scss） | 「25+」 | **67 处**；剔除 TerminalPane ANSI 后 **27 处**；真需治理约 **20 处** | 🟡 集中在卡片状态色 |
| 硬编码 `rgba()`（.vue） | 混入上项 | **31 处**；剔除 TerminalPane 后 **29 处**；多为合理阴影/遮罩，需治理 hover 类约 **12 处** | 🟡 |
| 残留 emoji（.vue，含注释） | 「15+」 | **~124 处出现**；其中功能性 UI 图标（应迁 KIcon）约 **45 处**，用户内容默认头像（`icon \|\| '🤖'`）约 **15 处**，代码注释约 **30 处** | 🔴 远超旧估，KIcon 迁移未完成 |
| `:focus-visible` 覆盖 | 「缺失」 | 全局规则 ✅ 已建立；但 **5 处 `outline:none`** 覆盖（见下） | 🟢→🟡 大幅改善但有回退点 |
| 未使用统一 PageHeader 的 view | 2（QueueView/UsageView 🔴） | **0** —— 9 view 中除 3 个 Market 壳 view 外均已用 PageHeader | ✅ 已修 |
| 缺空/载/错态的页面 | 未量化 | 空态+载态 ✅ 普遍覆盖；**错误态+重试 CTA** 仅 JobsView(NAlert) 等少数，约 **4 个页面**缺显式错误+重试 | 🟡 |
| **幽灵 Token（引用但未定义）** | 未发现 | **8 个**，其中 **3 个无 fallback = 真实渲染 bug** | 🔴 新发现 |

### 2.1 旧审计 7 项 🔴 复核结论

| # | 旧 🔴 问题 | 当前实测 | 状态 |
|---|---|---|---|
| 1 | AgentMarkdown 代码块 `#161616` 亮色不可读 | 已改用 `--km-code-bg`（双值），无硬编码 hex | ✅ 已修 |
| 2 | QueueView 未用 PageHeader | `QueueView.vue:76` 已用 `<PageHeader>` | ✅ 已修 |
| 3 | UsageView 未用 PageHeader | `UsageView.vue:56` 已用 `<PageHeader>` | ✅ 已修 |
| 4 | DirPickerModal 15+ 内联 style | `grep style=` 结果 **0 处** | ✅ 已修 |
| 5 | SettingsView 市场 Tab 切换空回调 | 已接 `@update:value="onMarketTabChange"` | ✅ 已修 |
| 6 | ResourceCard hover 阴影暗色不可见 | 已改用 `--km-shadow-card`（双值） | ✅ 已修 |
| 7 | SessionConfigBar 模型 dropdown 无法切换 | `SessionConfigBar.vue:103` 选项仍为「当前(disabled)+添加模型…」 | 🟡 **仍未实现真实切换**（唯一残留） |

---

## 三、9 个 View 逐页现状

| View | 布局 | PageHeader | 图标现状 | 空/载/错态 | 硬编码残留 | 等级 |
|---|---|---|---|---|---|---|
| **ChatView** | flex column：PageHeader+AgentTabBar+ChatBody+SessionConfigBar | ✅ | 混用：header 部分 KIcon(2)，`📜` 等 emoji 残留 | 空态 ✅(MessageList EmptyState) | hex 2 + rgba 5（hover/badge） | 🟡 |
| **ExpertsView** | 壳 → `<MarketLayout>` | 配置壳，无独立头 | 配置项 `icon:'🤖'`（数据默认） | 继承 MarketLayout | 1 emoji（数据） | 🟢 |
| **SkillsView** | 壳 → `<MarketLayout>` | 同上 | `icon:'🧩'`（数据默认） | 继承 | 1 emoji（数据） | 🟢 |
| **McpView** | 壳 → `<MarketLayout>` | 同上 | `icon:'🔌'`（数据默认） | 继承 | 1 emoji（数据） | 🟢 |
| **SettingsView** | flex：PageHeader + NTabs/MarketLayout + Suspense section | ✅ | `icon:'🤖/🧩/🔌'` 配置项 emoji(3) | 载态 ✅(NSpin) | 3 emoji + `:deep()` 深穿透 | 🟡 |
| **JobsView** | flex：PageHeader+NAlert+表格+时间线+Modal | ✅ | 混用 emoji(3) | 载 ✅ / 错 ✅(NAlert) / 空 🟡 | rgba 1 | 🟡 |
| **MemoryView** | flex：PageHeader+toolbar+双列卡片+Modal | ✅ | emoji(5) | 载 ✅ / 空 ✅(EmptyState×2) | rgba 1 | 🟡 |
| **QueueView** | flex：PageHeader+分组列表 | ✅（已修） | 少量 | 空 ✅(NEmpty×2) / 错 🟡 | — | 🟢 |
| **UsageView** | flex：PageHeader+汇总卡+CSS柱图+NTabs表 | ✅（已修） | 少量 | 载 ✅(NSpin×3) / 错 🟡 | 柱图渐变仍含硬编码 | 🟡 |

---

## 四、组件目录分组现状

| 目录 | 数量 | KIcon 采用 | 残留 emoji | 硬编码色 | 交互态覆盖 | 主要遗留 |
|---|---|---|---|---|---|---|
| `chat/`（会话交互，~20） | 20 | 部分（ChatInput 7、AgentTabBar 1、RightPanel 1） | **多**（ChatInput 7、SessionConfigBar 8、MessageItem 6、OutputPanel 6） | AgentTabBar/ClarifyCard/PlanCard/ApprovalCard 各 1 处 `#fff` 按钮字 + MessageItem 幽灵 token | hover/selected ✅；ChatInput `outline:none` 🟡 | 见 §五 幽灵 token |
| `market/` | 6 | 少 | EntityCard/InstalledCard `icon\|\|'📦'`（数据默认） | rgba 各 1 | hover ✅ | emoji 多为数据默认，可接受 |
| `settings/`（14） | 14 | 少 | MonitorSection 6、AgentRoleSection 3、McpManageSection 2 等（多为 NCard title emoji） | AgentRoleDetail/ProfileSection 各 2（头像） | ✅ 基本齐全 | NCard title 内嵌 emoji 应换 KIcon |
| `layout/`（6） | 6 | LeftSidebar **13**、PageHeader 1 | LeftSidebar 11、RightPanel 3、SettingsNav 1 | — | ✅ 完整（拖拽/hover/active/右键菜单） | LeftSidebar `🗑📥📁🔽🌙☀️` 等按钮 emoji、`outline:none` |
| `common/`（8） | 8 | EmptyState/DirPickerModal/AgentTabBar | MarketLayout 6(`🔍✨🤖🧩🔌`)、ResourceCard 1 | ResourceCard 幽灵 token fallback(`#f5f5f5/#888`) | ✅ + focus-visible | MarketLayout section/搜索图标 |
| `cards/`（3） | 3 | 无 | ExpertCard/SkillCard/McpCard `icon\|\|emoji`（数据默认） | **McpCard 状态点 5 处 hex**(`#27ae60/#f39c12/#e74c3c/#95a5a6`) | hover ✅ | 🔴 状态点应映射 `--km-success/warning/danger` |
| `dialog/`（7） | 7 | 少 | ResultDialog 3、AddModelDialog/MemberDetail 等 | AddModelDialog 3 hex | ✅ | ResultDialog `✅⛔⚠️` 状态图标 |
| `preview/`（2） | 2 | 无 | FileTreePane `📁📂📄`、TerminalPane（注释） | TerminalPane 40 hex(**ANSI 合理**) | ✅ | FileTreePane 树图标应换 KIcon |
| `sidebar/`（1） | 1 | 无 | SidebarSessionItem `📌📦`(3) | rgba 1 | ✅ + `outline:none` | 置顶/归档按钮 emoji |

---

## 五、专项：幽灵 Token（🔴 新发现，最高优先级）

`comm` 对比「被引用的 63 个 `--km-*`」与「已定义 50 个」，发现 **13 个引用未定义**，剔除 5 个运行时 JS 注入（`--km-left-w/-lh-w/-rh-w/-right-w/-grid-cols`，正常）后，剩 **8 个真实幽灵 Token**：

| Token | 使用位置 | 是否有 fallback | 后果 | 等级 |
|---|---|---|---|---|
| `--km-accent-bg` | AgentTabBar:134、MessageItem:422/446 | ❌ **无** | active tab / 用户消息高亮**背景渲染为空** | 🔴 |
| `--km-danger-bg` | MessageItem:467 | ❌ **无** | 错误消息背景**渲染为空** | 🔴 |
| `--km-file-chip-bg` | MessageItem:355 | ❌ **无** | 文件芯片背景**渲染为空** | 🔴 |
| `--km-icon-bg` | ResourceCard:160 | ✅ `#f5f5f5` | 亮色 fallback，暗色下突兀 | 🟡 |
| `--km-text-secondary` | ResourceCard:190 | ✅ `#888` | 固定灰，不随主题 | 🟡 |
| `--km-sidebar-bg` | LeftSidebar:659、SettingsNav:77 | ✅ `var(--km-panel)` | 降级正常，建议正式定义 | 🟢 |
| `--km-highlight-bg` | LeftSidebar:906、SidebarSessionItem:312 | ✅ `rgba(255,215,0,.3)` | 高亮闪烁降级正常 | 🟢 |
| `--km-mono` | 6 处（AddModelDialog/LogDetail/ResultDialog…） | ✅ `ui-monospace` | 降级正常，建议定义等宽字体 Token | 🟢 |

> **根因**：Phase B 迁移时「把硬编码 rgba 换成 Token」但漏在 `variables.scss` 补定义，且 MessageItem/AgentTabBar 3 处未写 fallback → 直接可见渲染缺陷。v2 首要修复。

---

## 六、遗留 Gap 汇总表（按等级）

### 🔴 严重（影响可用性 / 真实缺陷）

| # | 位置 | 问题 | 一句话说明 |
|---|---|---|---|
| R1 | `variables.scss` + MessageItem/AgentTabBar | 3 个无 fallback 幽灵 Token | active/错误/文件芯片背景直接渲染为空，需补定义 |
| R2 | `cards/McpCard.vue` | 状态点 5 处硬编码 hex | `#27ae60` 等应映射语义色 Token，暗/亮不适配 |
| R3 | 全局 emoji | ~45 处功能性 emoji 未迁 KIcon | LeftSidebar/SessionConfigBar/OutputPanel/MessageItem 操作按钮仍为 emoji，跨平台字形不一致 |

### 🟡 一般（一致性 / 体验）

| # | 位置 | 问题 |
|---|---|---|
| Y1 | `SessionConfigBar.vue:103` | 模型 dropdown 仍无真实切换（仅当前+添加），旧 🔴#7 唯一残留 |
| Y2 | `theme.ts` | overrides 色值与 variables.scss 双写，易漂移 |
| Y3 | 5 处 `outline:none`（ChatInput/LeftSidebar/DirPickerModal/SidebarSessionItem/ClarifyCard） | 覆盖全局 focus 环，需补 `:focus-visible` |
| Y4 | JobsView/QueueView/UsageView/Memory | 错误态多为 NAlert 或缺失，无统一「重试 CTA」 |
| Y5 | ResourceCard/SettingsDetailPanel | 引用 `--km-text-secondary/--km-icon-bg` 未定义（靠 fallback） |
| Y6 | SettingsView | `:deep()` 多层穿透 + 市场 NTabs 与路由弱同步 |
| Y7 | UsageView | CSS 柱状图渐变后半段硬编码、无 tooltip、>30 天横向溢出 |
| Y8 | settings/ 多组件 | NCard title 内嵌 emoji（🧠🧪🧩🔧📡💬）应换 KIcon |
| Y9 | `--km-danger` | 暗/亮同值，亮色下对比略深 |

### 🟢 已达标 / 可保留

| 位置 | 说明 |
|---|---|
| variables.scss Token 体系 | 颜色/语义/组件/尺寸四类齐全，暗/亮双值完整 |
| theme.ts 主题持久化 | localStorage + prefers-color-scheme 已落地 |
| PageHeader 统一 | 9 view 全部收敛 |
| AgentMarkdown/ThoughtBlock/ToolCallCard/ContextRing | 已全量 Token 化，亮色可读 |
| DirPickerModal | 内联样式清零 |
| 空态/骨架屏/DataStateBoundary | 组件齐备且已使用 |
| cards/market 的 `icon\|\|emoji` | 属用户内容默认头像，可保留（非硬编码 UI 图标） |

---

## 七、给 v2 设计的输入建议（供产品经理参考）

1. **补齐 Token（P0）**：`variables.scss` 增补 `--km-accent-bg / --km-danger-bg / --km-file-chip-bg / --km-icon-bg / --km-text-secondary / --km-sidebar-bg / --km-highlight-bg / --km-mono` 8 个 Token（暗/亮双值），并清理组件内 fallback。
2. **收口 KIcon（P1）**：建立 emoji→Tabler 图标映射表，优先替换 45 处功能性 emoji；用户内容默认头像单独定策略。
3. **状态色语义化（P1）**：McpCard 等状态点全部走 `--km-success/-warning/-danger`。
4. **focus 一致性（P1）**：5 处 `outline:none` 统一补 `:focus-visible`。
5. **错误态规范（P2）**：以 DataStateBoundary 统一 loading/empty/error+retry。
6. **theme.ts 去重（P2）**：消除与 variables.scss 的色值双写。
7. **遗留功能（P2）**：SessionConfigBar 模型真实切换。

---

> 审计完成：2026-08-07 晚 · 高见远（Architect）
> 数据可复现：`grep -roE '#[0-9a-fA-F]{3,8}' --include=*.vue`、`comm -23 referenced defined` 等，详见正文口径说明。
