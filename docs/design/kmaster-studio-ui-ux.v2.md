# kmaster-studio UI-UX 统一设计体系 v2

> **版本**：v2.0
> **日期**：2026-08-07（晚）
> **设计人**：许清楚（Product Manager）
> **事实基线**：`docs/audit/ui-ux-current-state-v2-2026-08-07.md`（架构师 高见远 · 227 行现状复审）
> **前身**：`docs/design/kmaster-studio-ui-ux.md`（v1 · 998 行）—— v2 是**体系化升级 + 根治收尾**，非增补、非照抄。
> **技术栈**：Vue3 + Vite + Naive UI + Pinia + SCSS；图标 `@tabler/icons-vue` + `components/common/KIcon.vue`
> **代码根**：`packages/client/src/`（本文件路径均相对此根）
> **设计目标**：界面清爽简洁、直观易用 —— 细到每个图标、每个 UI 元素、每个交互步骤。

---

## 目录

- [第 0 章 v2 相对 v1 的变化与本文定位](#第-0-章-v2-相对-v1-的变化与本文定位)
- [第 1 章 设计原则与视觉基调](#第-1-章-设计原则与视觉基调)
- [第 2 章 Design Token 完整体系](#第-2-章-design-token-完整体系)
- [第 3 章 图标系统（细到每个图标）](#第-3-章-图标系统细到每个图标)
- [第 4 章 交互状态矩阵（细到每一步）](#第-4-章-交互状态矩阵细到每一步)
- [第 5 章 交互流程规范（细到每个步骤）](#第-5-章-交互流程规范细到每个步骤)
- [第 6 章 逐页面规范（9 个视图）](#第-6-章-逐页面规范9-个视图)
- [第 7 章 逐组件规范（72 个组件）](#第-7-章-逐组件规范72-个组件)
- [第 8 章 反馈与通知体系](#第-8-章-反馈与通知体系)
- [第 9 章 响应式与布局](#第-9-章-响应式与布局)
- [第 10 章 动效规范](#第-10-章-动效规范)
- [第 11 章 无障碍规范](#第-11-章-无障碍规范)
- [第 12 章 验收标准（可复现命令 + 量化阈值）](#第-12-章-验收标准可复现命令--量化阈值)
- [附录 A — Design Token 速查卡](#附录-a--design-token-速查卡)
- [附录 B — emoji → Tabler 图标速查表](#附录-b--emoji--tabler-图标速查表)
- [附录 C — 开放问题（已全部决策）](#附录-c--开放问题已全部决策)

---

## 第 0 章 v2 相对 v1 的变化与本文定位

### 0.1 v1 已落地、v2 保留的部分（不重复设计，仅引用）

Phase A/B/C 改造后，v1 的以下体系**已实装并达标**，v2 直接采信、不再展开：50 个 Token 的四类结构（基础/语义/组件/尺寸，暗亮双值）、theme.ts 主题持久化、PageHeader 统一（9 view 全覆盖）、KIcon 封装、全局 `*:focus-visible`、EmptyState/Skeleton/DataStateBoundary 基础设施、AgentMarkdown/ThoughtBlock/ToolCallCard 的 Token 化。

### 0.2 v1 与实测不符、v2 予以纠正的点

| 项 | v1 文档写法 | 实测（v2 采信） | 出处 |
|---|---|---|---|
| PageHeader 标题字号 | `20px / 600` | **`14px / 600`** | `PageHeader.vue:181` |
| 右栏默认宽 | `320px` | **`420px`**（min 320 / max 800） | `constants/layout.ts:212` |
| 左栏宽 | 未写 | **min 180 / max 500 / default 260** | `constants/layout.ts:211` |
| ResourceCard hover 阴影 | `--km-shadow-card-hover`（新增） | 实际 hover 仍用 `--km-shadow-card`；**`--km-shadow-card-hover` 从未定义** | `ResourceCard.vue:124` |
| `--km-shadow-card` 暗色值 | `0 2px 8px rgba(0,0,0,0.3)` | 实测 `0 4px 16px rgba(0,0,0,0.3)` | `variables.scss:43` |

### 0.3 v2 相对 v1 的新增（本文重点，为「系统性」而生）

1. **幽灵 Token 根治**（v1 未发现）：8 个引用未定义 Token，其中 3 个无 fallback = 真实渲染 bug。见 §2.4。
2. **emoji 扫描范围扩容**（v1/审计盲区）：emoji 不止在 `.vue`，`.ts` 数据/i18n 层另有 **63 处**（普查穷举 123 非 ASCII 码位终值，排除 JSDoc 与 `*.test.ts`，详见 §12.6）。见 §3.2、§12。
3. **交互状态矩阵**：v1 是零散六态描述，v2 升级为「元素类型 × 9 状态」完整矩阵，每格给 Token/px/ms。见 §4。
4. **交互流程分步时序**：v1 无，v2 补 8 条关键 UX 场景的「触发→反馈→中间态→结果态→异常态」。见 §5。
5. **Token 治理规则**：禁止 `var(--x, fallback)` 掩盖式写法，给 CI 校验。见 §2.5。
6. **验收口径**：v1 只有「降至接近 0」这类模糊话术，v2 给出确切 grep 命令 + 量化门槛 + 豁免登记。见 §12。

### 0.4 篇幅说明

本文完整性优先于简洁。规格具体到「Token 名 / px / ms / 类名 / 文件:行」，可直接照着写代码。所有量化结论均可用 §12 的命令复算。

---

## 第 1 章 设计原则与视觉基调

「清爽简洁、直观易用」落成 6 条**可判定**原则。每条给出正例（✅）/反例（❌），落地时凭原则即可裁决争议。

### 原则 1：单一真源，禁止双写（Single Source of Truth）

一个视觉常量（颜色、尺寸、间距、图标映射）在整个代码库**只允许有一处定义**，其余全部引用。

- ✅ 颜色只在 `variables.scss` 定义 → 组件写 `var(--km-accent)`；图标映射只在 KIcon 内部维护。
- ❌ `theme.ts` 里 `accent = '#3b82f6'` 与 `variables.scss` 里 `--km-accent: #3b82f6` **各写一遍**（现存 Y2 漂移风险，见 §2.6）。
- ❌ McpCard 状态点 `dot: '#27ae60'` 自己定义绿色，而不引用 `--km-success`（现存 R2）。

### 原则 2：语义优先于表象（Semantic over Literal）

引用 Token 时选**语义名**而非**数值/基础色**；组件层禁止直接引用基础色。

- ✅ 危险按钮 `color: var(--km-danger)`；成功状态点 `background: var(--km-success)`。
- ❌ `color: #dc2626`（明文）、`color: var(--km-danger, #888)`（伪装 fallback）。
- ❌ 组件里直接 `var(--km-red-600)` 跳过语义层（本项目基础层未拆到色阶，但规则先立）。

### 原则 3：图标一致性 —— 一套线性图标，零 emoji UI（One Icon System）

所有**功能性 UI 图标**统一走 `KIcon`（Tabler，线性、`stroke-width:1.5`、`currentColor`）。emoji **仅允许**作为「用户内容默认头像」（如市场卡片 `icon || fallback`）保留，且该 fallback 也应逐步图标化。

- ✅ 删除按钮 `<KIcon name="Trash" :size="18" />`；主题切换 `<KIcon :name="isDark ? 'Moon' : 'Sun'" />`。
- ❌ `<button>🗑</button>`（LeftSidebar:514/555/637）、`'session.delete': '🗑 删除'`（locales 内嵌）。
- ❌ 用 emoji 表意状态：`✅⛔⚠️`（ResultDialog:60-62）应换语义图标 + 语义色。

**判定尺子**：任何在界面上**代表操作或状态**的字符，若不是文字也不是 KIcon，即违规。

### 原则 4：状态可见且完整（Complete & Visible States）

每个可交互元素必须显式定义全部适用状态；每个数据区域必须覆盖 空/载/错/无权限 四态。不允许「只做了默认态」。

- ✅ 按钮 8 态齐全（§4.2）；列表页有 EmptyState + Skeleton + 错误重试 CTA。
- ❌ 卡片只写 default+hover，selected/disabled 缺失；页面报错后白屏无重试入口（现存 Y4，JobsView/QueueView/UsageView/MemoryView）。

### 原则 5：反馈及时且克制（Timely, Restrained Feedback）

每个用户动作在 **100ms 内**给出即时反馈（hover/active 视觉变化）；耗时操作给中间态（loading/进度）；结果用最轻量的合适通道（内联 > Toast > Modal）。动效服务可用性，非装饰。

- ✅ 点击发送 → 按钮立即 disabled + 输入框清空 + 流式 loading 出现；保存成功 → 轻量 Toast 1.5s。
- ❌ 删除会话无二次确认直接消失；批量操作无进度、界面假死；50 条历史消息逐条淡入（v1 已移除 `km-msg-fade`，v2 维持禁止）。

### 原则 6：主题无关性（Theme-Agnostic）

任何视觉写法都必须在暗/亮双主题下成立。禁止任何「锁死单主题」的硬编码或掩盖式 fallback。

- ✅ 所有颜色走双值 Token；阴影暗重亮轻（`--km-shadow-*` 双值）。
- ❌ `color: var(--km-text-secondary, #888)` —— Token 永不定义时锁死灰色 `#888`，暗色下突兀（现存 R2/Y5）。
- ❌ McpCard hover `box-shadow: 0 4px 16px rgba(0,0,0,0.12)` 硬编码亮色阴影，暗色下几乎不可见。

---

## 第 2 章 Design Token 完整体系

### 2.1 Token 分层架构（三层）

```
基础层 Primitive   原始色值/尺寸原子     —— 只在 variables.scss 定义，组件禁止直接引用
     ↓ 映射
语义层 Semantic    accent/success/warning/danger/info/text/bg…  —— 组件首选引用层
     ↓ 派生
组件层 Component   code-bg/approval-bg/tool-card-bg…            —— 特定组件专用，引用语义层
```

**铁律**：组件 `.vue`/`.scss` 只允许引用**语义层与组件层** Token。当前项目基础层与语义层部分合并（如 `--km-accent` 既是基础也是语义），v2 不强拆色阶（成本高、收益低），但**新增 Token 一律进语义/组件层**，并遵守「组件层引用语义层、不写死值」。

### 2.2 现存 50 Token 全清单（保留，双值已齐 —— 引用自审计 §1.1）

沿用 `variables.scss` 现有定义，v2 不改动这 50 个的值（除 §2.7 明确标注的微调）。分类：基础色 13、语义色 7、组件专用 8、圆角 4、阴影 3、字号 7、间距 8。完整暗/亮值见审计基线 §1.1，此处不复制。

### 2.3 v2 新增/正式化 Token（P0 必补）

下表为 v2 **必须写入 `variables.scss`** 的新 Token（暗/亮双值）。凡标「幽灵」者为当前被引用但未定义，补齐即修复真实 bug。

| Token | 暗色值 | 亮色值 | 用途 | 消除的缺陷 | 现引用位置 |
|---|---|---|---|---|---|
| `--km-accent-bg` | `rgba(59,130,246,0.14)` | `rgba(37,99,235,0.10)` | 主色浅底：选中 tab、用户消息高亮、菜单 active 底 | 🔴 幽灵·无fallback | AgentTabBar:134、MessageItem:422/446 |
| `--km-danger-bg` | `rgba(220,38,38,0.14)` | `rgba(220,38,38,0.08)` | 错误消息/危险区浅底 | 🔴 幽灵·无fallback | MessageItem:467 |
| `--km-file-chip-bg` | `rgba(59,130,246,0.16)` | `rgba(37,99,235,0.10)` | 文件芯片背景 | 🔴 幽灵·无fallback | MessageItem:355 |
| `--km-success-bg` | `rgba(52,211,153,0.14)` | `rgba(16,185,129,0.10)` | 成功浅底：状态标签、成功 toast 底 | 新增（Tag/状态用） | 供 §4、McpCard |
| `--km-warning-bg` | `rgba(245,158,11,0.14)` | `rgba(217,119,6,0.10)` | 警告浅底 | 新增 | 供 §4 |
| `--km-icon-bg` | `rgba(255,255,255,0.06)` | `#f0f1f3` | 卡片图标容器底（替代 fallback `#f5f5f5`） | 🟡 伪装fallback | ResourceCard:160 |
| `--km-text-secondary` | `#9ca3af` | `#6b7280` | 次要文字（与 `--km-muted` 语义等价，见注） | 🟡 伪装fallback | ResourceCard:190 |
| `--km-sidebar-bg` | `var(--km-panel)` | `var(--km-panel)` | 侧栏背景（正式化，去 fallback） | 🟢 幽灵·有fallback | LeftSidebar:659、SettingsNav:77 |
| `--km-highlight-bg` | `rgba(59,130,246,0.28)` | `rgba(37,99,235,0.20)` | 会话定位高亮闪烁（改用主色，弃 `rgba(255,215,0,.3)` 刺眼黄） | 🟡 伪装fallback | LeftSidebar:906、SidebarSessionItem:312 |
| `--km-mono` | `ui-monospace, SFMono-Regular, 'JetBrains Mono', Consolas, monospace` | 同左 | 等宽字体族（11 处引用统一） | 🟢 幽灵·有fallback | 见审计 §5 |
| `--km-hover-bg-strong` | `rgba(255,255,255,0.10)` | `rgba(0,0,0,0.06)` | 强 hover（拖拽悬停、危险项 hover） | 新增（v1 提及未落） | 供 §4 |
| `--km-shadow-card-hover` | `0 6px 20px rgba(0,0,0,0.45)` | `0 2px 12px rgba(0,0,0,0.10)` | 卡片 hover 阴影（v1 提及未落） | 新增 | ResourceCard/McpCard |
| `--km-transition-fast` | `0.12s ease` | 同左 | 行 hover、按钮反馈 | 新增（动效 Token） | 供 §10 |
| `--km-transition-normal` | `0.15s ease` | 同左 | 卡片 hover、阴影变化 | 新增 | 供 §10 |
| `--km-transition-slow` | `0.2s ease` | 同左 | 面板宽度、布局变化 | 新增 | 供 §10 |
| `--km-transition-theme` | `0.3s ease` | 同左 | 主题切换（已隐式存在，正式化） | 正式化 | variables.scss:117 |

> **注 `--km-text-secondary` vs `--km-muted`**：二者暗/亮值完全相同。为消除歧义，v2 规定：**保留 `--km-muted` 作为唯一次要文字 Token**，将 `--km-text-secondary` 定义为 `var(--km-muted)` 的别名（兼容 ResourceCard 现引用），并在治理清单中标注「ResourceCard 后续应改引 `--km-muted`，届时删除别名」。避免两个同义 Token 长期并存。

### 2.4 幽灵 Token 专项（🔴 最高优先级根治）

**定义**：被组件引用（`var(--km-x)`）但 `variables.scss` 从未定义的 Token。分两类危害：

1. **无 fallback（真 bug）**：`--km-accent-bg`、`--km-danger-bg`、`--km-file-chip-bg` → CSS 解析为 `initial`，背景**渲染为空/透明**。用户实际看到：active tab 无高亮、错误消息无红底、文件芯片无底色。
2. **伪装 fallback（更隐蔽）**：`var(--km-icon-bg, #f5f5f5)` 之类 —— 有 fallback 不报错，但 Token 永不定义 → **永远锁死 fallback 值，主题切换完全失效**。这比明文硬编码更难发现（grep `#f5f5f5` 才见，grep Token 名却"看似规范"）。

**根治动作**（P0，见 §2.3 表已给全部值）：
- 补齐 8 个 Token 定义（暗/亮双值）。
- **同时**清理组件内的 fallback：`var(--km-icon-bg, #f5f5f5)` → `var(--km-icon-bg)`；`var(--km-text-secondary, #888)` → `var(--km-muted)`；`var(--km-sidebar-bg, var(--km-panel))` → `var(--km-sidebar-bg)`；`var(--km-highlight-bg, rgba(...))` → `var(--km-highlight-bg)`；`var(--km-mono, ui-monospace, monospace)` → `var(--km-mono)`。
- **验收**：见 §12 幽灵 Token 检测命令，门槛 = 0。

### 2.5 Token 治理规则（禁止掩盖式写法）

| 规则 | 要求 | 反例 | 正例 |
|---|---|---|---|
| **G1 禁止 fallback** | CSS 变量引用**不得**带第二参数 fallback | `var(--km-icon-bg, #f5f5f5)` | 先在 variables.scss 定义，再 `var(--km-icon-bg)` |
| **G2 先定义后引用** | 新引用任何 `--km-*` 前，必须先在 variables.scss 补定义（暗/亮双值） | 组件里凭空 `var(--km-new-x)` | PR 同时改 variables.scss + 组件 |
| **G3 禁止明文色值** | `.vue`/`.scss` 里禁止 `#hex` / `rgb()` / `rgba()`（豁免见 §12） | `color: #dc2626` | `color: var(--km-danger)` |
| **G4 组件层引用语义层** | 组件专用 Token 的值应引用语义 Token，不写死 | `--km-approval-bg: rgba(180,83,9,.1)` | 可接受（派生自语义 warning 系，登记即可） |
| **G5 双值完整** | 每个颜色 Token 必须同时出现在 `:root` 与 `:root[data-theme='light']` | 只在 `:root` 定义 | 两处都写 |

> **G4 说明**：现有组件层 Token（approval/clarify/plan 等）直接写 rgba 值，属可接受的「派生固化」（这些语义色本项目未拆基础色阶）。规则的红线是 G1/G3 —— 不许在**组件文件**里出现明文色值或 fallback。

### 2.6 CI 可检测校验规则

在 `packages/client` 增加脚本（建议 `scripts/lint-tokens.mjs`，架构师排期实现），CI 跑以下 4 条硬校验（任一非空即失败）：

```bash
# 校验1｜幽灵 Token：引用集 - 定义集，应为空（排除 JS 注入的 5 个布局宽度变量）
#   引用集 = grep -rohP 'var\(--km-[a-z-]+' src | sort -u
#   定义集 = grep -oP '^\s*--km-[a-z-]+(?=:)' src/styles/variables.scss | sort -u
#   comm -23 引用集 定义集  →  仅允许 --km-left-w/-lh-w/-rh-w/-right-w/-grid-cols

# 校验2｜掩盖式 fallback（G1）：应为 0
grep -rnP 'var\(--km-[a-z-]+\s*,' --include=*.vue --include=*.scss src

# 校验3｜明文色值（G3）：排除 variables.scss 与 TerminalPane ANSI，应为 0
grep -rniP '#[0-9a-f]{3,8}\b|\brgba?\(' --include=*.vue --include=*.scss src \
  | grep -vE 'variables\.scss|TerminalPane\.vue'

# 校验4｜双值完整（G5）：:root 定义的每个颜色 Token 都应在 light 块出现
```

### 2.7 微调项（低风险，随 P0 一并处理）

| Token | 现值 | 建议 | 理由 |
|---|---|---|---|
| `--km-danger`（亮色） | `#dc2626`（暗亮同值） | 亮色改 `#c81e1e` 或保留 | 审计 Y9：亮底上略深，对比可接受，**优先级最低，可不动** |
| `--km-shadow-card`（暗色） | `0 4px 16px rgba(0,0,0,0.3)` | 保留 | 与 v1 文档描述不一致，以实测为准 |

---

## 第 3 章 图标系统（细到每个图标）

### 3.1 KIcon 组件 API 规范

**现状**（`common/KIcon.vue`）：`props { name: string; size?: string|number = 20 }`，内部 `TablerIcons['Icon' + name]`，`stroke-width="1.5"`，无匹配时渲染 `<span class="kicon-fallback">{{ name }}</span>`。

**v2 规范（保持向后兼容，明确契约）**：

| Prop | 类型 | 默认 | 说明 |
|---|---|---|---|
| `name` | `string` | 必填 | Tabler 图标名，**不含 `Icon` 前缀**（如 `Search`、`Trash`、`PlugConnected`） |
| `size` | `number \| string` | `20` | 像素尺寸，遵循 §3.3 尺寸阶梯 |

**约定**：
- 颜色**永远** `currentColor`，由父容器 `color` 决定（禁止在 KIcon 上传 color prop）。
- 描边统一 `stroke-width:1.5`（细线，契合"清爽"）。
- `name` 传入未知图标时渲染灰底文字 fallback —— 该 fallback **仅用于开发期发现拼写错误**，生产不应出现（§12 校验图标名有效性）。
- **可访问性**：纯装饰图标外层容器加 `aria-hidden="true"`；作为唯一内容的图标按钮，父 `<button>` 必须有 `title` 或 `aria-label`（§11）。

### 3.2 emoji → Tabler 图标全量映射表（逐条·含 file:line）

> 范围：功能性 UI 图标。数据默认头像（`icon || fallback`）单列于 §3.5。ANSI/注释不计。
> 尺寸列参照 §3.3；颜色列默认 `currentColor`，特殊语义色单独标注。

#### 3.2.1 `.vue` 模板内 emoji（应替换为 KIcon）

| # | 文件:行 | 原 emoji | Tabler 图标（`name`） | 尺寸 | 颜色 |
|---|---|---|---|---|---|
| 1 | AppNav.vue:25 | 💬 | `MessageCircle` | 20 | currentColor |
| 2 | AppNav.vue:26 | 🧠 | `Brain` | 20 | currentColor |
| 3 | AppNav.vue:28 | 📊 | `ChartBar` | 20 | currentColor |
| 4 | AppNav.vue:29 | 📥 | `Inbox` | 20 | currentColor |
| 5 | AppNav.vue:36 | ⚙️ | `Settings` | 20 | currentColor |
| 6 | AppNav.vue:78 | ☀️/🌙 | `Sun` / `Moon` | 20 | currentColor |
| 7 | PageHeader.vue:118 | ☰ | `Menu2` | 18 | currentColor |
| 8 | PageHeader.vue:152 | ⧉ | `LayoutSidebarRight` | 18 | currentColor |
| 9 | PageHeader.vue:126/138 | 🔍 | `Search` | 16 | currentColor（已用 KIcon L138，L126 待清） |
| 10 | ChatView.vue:269 | 📜 | `History` | 18 | currentColor |
| 11 | ChatView.vue:299 | ⏹ | `PlayerStop` | 16 | `--km-danger` |
| 12 | LeftSidebar.vue:317 | 🔽 | `ChevronDown` | 16 | currentColor |
| 13 | LeftSidebar.vue:511/630 | 📥 | `Download` | 18 | currentColor |
| 14 | LeftSidebar.vue:514/555/637 | 🗑 | `Trash` | 18 | `--km-danger` |
| 15 | LeftSidebar.vue:613 | 🌙/☀️ | `Moon` / `Sun` | 18 | currentColor |
| 16 | LeftSidebar.vue:627 | ✎ | `Pencil` | 16 | currentColor |
| 17 | LeftSidebar.vue:633 | 📁 | `Folder` | 16 | currentColor |
| 18 | LeftSidebar.vue:578 | ◉/○ | `CircleDot` / `Circle` | 14 | currentColor |
| 19 | SessionConfigBar.vue:140 | 📁 | `Folder` | 16 | currentColor |
| 20 | SessionConfigBar.vue:153 | 🤖 | `Robot` | 16 | currentColor |
| 21 | SessionConfigBar.vue:165 | 🛡 | `ShieldHalf` | 16 | currentColor |
| 22 | SessionConfigBar.vue:195 | 🧠 | `Brain` | 16 | currentColor |
| 23 | SessionConfigBar.vue:64/65/70/73 | 🎯/📋 | `Target` / `List` | 16 | currentColor |
| 24 | MessageItem.vue:237 | 📄 | `File` | 14 | currentColor（文件芯片内） |
| 25 | MessageItem.vue:277/317 | 📋 | `Copy` | 16 | currentColor |
| 26 | MessageItem.vue:285 | ✎ | `Pencil` | 16 | currentColor |
| 27 | MessageItem.vue:298 | ⚠ | `AlertTriangle` | 16 | `--km-danger` |
| 28 | MessageItem.vue:324 | 📝 | `ClipboardText` | 16 | currentColor |
| 29 | MessageItem.vue:331 | 🔄 | `Refresh` | 16 | currentColor |
| 30 | OutputPanel.vue:203 | 📋 | `Copy` | 18 | currentColor |
| 31 | OutputPanel.vue:206 | 📥 | `Download` | 18 | currentColor |
| 32 | OutputPanel.vue:209 | 🔄 | `Refresh` | 18 | currentColor |
| 33 | OutputPanel.vue:212 | 🌐 | `World` | 18 | currentColor |
| 34 | RightPanel.vue:143/154 | ⛶ | `ArrowsMaximize` | 18 | currentColor |
| 35 | RightPanel.vue:143/157 | ✕ | `X` | 18 | currentColor |
| 36 | MarketLayout.vue:213 | 🔍 | `Search` | 16 | currentColor |
| 37 | MarketLayout.vue:237 | ✨ | `Sparkles` | 18 | `--km-accent` |
| 38 | ChatInput.vue:310/339 | 📄 | `File` | 16 | currentColor |
| 39 | ChatInput.vue:354 | 🧩 | `Puzzle` | 16 | currentColor |
| 40 | ChatInput.vue:371 | 🔌 | `PlugConnected` | 16 | currentColor |
| 41 | ChatInput.vue:248/250/255 | 📋/🎯 | `List` / `Target` | 16 | currentColor（sendMode label，需拆字段） |
| 42 | AgentMarkdown.vue:14/53/58 | 📋 | `Copy` | 16 | currentColor |
| 43 | AgentMarkdown.vue:50 | ✓ | `Check` | 16 | `--km-success` |
| 44 | AgentMarkdown.vue:57 | ⚠ | `AlertTriangle` | 16 | `--km-warning` |
| 45 | ResultDialog.vue:60 | ✅ | `CircleCheck` | 20 | `--km-success` |
| 46 | ResultDialog.vue:61 | ⛔ | `CircleX` | 20 | `--km-danger` |
| 47 | ResultDialog.vue:62 | ⚠️ | `AlertTriangle` | 20 | `--km-warning` |
| 48 | ToolCallCard.vue:13 | ✓/✕ | `Check` / `X` | 14 | success/danger |
| 49 | ToolCallCard.vue:16 | ▾ | `ChevronDown` | 14 | currentColor |
| 50 | ThoughtBlock.vue:11 | ▾ | `ChevronDown` | 14 | currentColor |
| 51 | SubagentCard.vue:75 | ▼ | `ChevronDown` | 14 | currentColor |
| 52 | ApprovalCard.vue:15 | 🔐 | `Lock` | 18 | `--km-warning` |
| 53 | ClarifyCard.vue:18 | ❓ | `HelpCircle` | 18 | `--km-accent` |
| 54 | PlanCard.vue:13 | 📋 | `ClipboardList` | 18 | `--km-accent`（plan 紫可用 accent 或 plan-border） |
| 55 | FileTreePane.vue:51 | ▶/▼ | `ChevronRight` / `ChevronDown` | 14 | currentColor |
| 56 | FileTreePane.vue:52 | 📁/📂 | `Folder` / `FolderOpen` | 16 | currentColor |
| 57 | FileTreePane.vue:58 | 📄 | `File` | 16 | currentColor |
| 58 | ShareDialog.vue:157/158 | 📋/📂 | `Copy` / `FolderOpen` | 16 | currentColor |
| 59 | NewTaskDialog.vue:261/291 | ✕ | `X` | 16 | currentColor |
| 60 | SettingsNav.vue:64 | ← | `ArrowLeft` | 16 | currentColor |
| 61 | SettingsNav.vue:43 | ⚙️ | `Settings` | 18 | currentColor |
| 62 | StatusBar.vue:113 | 🌙/☀️ | `Moon` / `Sun` | 16 | currentColor |
| 63 | MemberDetailDialog.vue:91 | 🧑/💼 | `User` / `Briefcase` | 16 | currentColor |
| 64 | AddModelDialog.vue:386 | 🔒 | `Lock` | 14 | `--km-muted` |
| 65 | ProviderSection.vue:8/266 | 🔒/⚠ | `Lock` / `AlertTriangle` | 16 | muted/warning |
| 66 | ProviderSection.vue:212/213 | ●/○ | `PointFilled` / `Point` | 12 | 语义色（连通性） |
| 67 | McpManageSection.vue:46/47/48 | ●/✕/○ | `PointFilled`/`X`/`Point` | 12/14 | 语义色 |
| 68 | McpManageSection.vue:113/154 | 🔌/📦 | `PlugConnected` / `Package` | 18 | currentColor |
| 69 | McpDetail.vue:176/187/198 | 🔧/📦/💬 | `Tool` / `Package` / `Message` | 16 | currentColor |
| 70 | MonitorSection.vue:50-65 | 🧠🧪🧩🔧📡💬 | `Brain`/`Flask`/`Puzzle`/`Tool`/`Broadcast`/`Message` | 18 | currentColor |
| 71 | AgentRoleSection.vue:167 | ▾ | `ChevronDown` | 14 | currentColor |
| 72 | AgentRoleSection.vue:174 | ⚠ | `AlertTriangle` | 16 | `--km-warning` |
| 73 | AgentRoleSection.vue:238/241 | ✎/🗑 | `Pencil` / `Trash` | 16 | currentColor / danger |
| 74 | AgentRoleSection.vue:231 | ○ | `Circle` | 14 | currentColor |
| 75 | AgentRoleSection.vue:54/55 | ✍/🛒 | `Writing` / `ShoppingCart` | 18 | currentColor |
| 76 | AgentRoleDetail.vue:94/160/214/237 | 🤖 | `Robot` | 20 | currentColor |
| 77 | ExpertPickerPanel.vue:138 | 🧑/💼 | `User` / `Briefcase` | 16 | currentColor |
| 78 | DiagnosticsSection.vue:156 | 🔒 | `Lock` | 16 | `--km-muted` |
| 79 | SidebarSessionItem.vue:93 | ⚠ | `AlertTriangle` | 14 | `--km-warning` |
| 80 | SidebarSessionItem.vue:182 | 📌 | `Pin` / `PinnedFilled` | 14 | currentColor |
| 81 | SidebarSessionItem.vue:189 | 📦 | `Archive` | 14 | currentColor |
| 82 | SkillManageSection.vue:44/81 | 🧩 | `Puzzle` | 18 | currentColor |

> 说明：以上 82 行覆盖架构师统计的 ~45 处功能性 emoji 及其散落的重复位置。`✍`（Writing）如 Tabler 无对应可用 `Edit`；`🛡`（ShieldHalf）可用 `Shield`。落地时以 KIcon fallback 报错为准做名称校正。

#### 3.2.2 `.ts` 文件内 emoji（审计盲区，v2 新增·必须治理）

> 这些 emoji **有真实渲染路径**，若仅扫 `.vue` 会漏。

| # | 文件:行 | emoji | 渲染路径 | 治理方式 |
|---|---|---|---|---|
| T1 | `constants/layout.ts:119-130` | 📊🎛️👤🤖🧩🔌🔧🧰📡🧠🧪⏰（12 类别图标） | `SettingsNav.vue:55` `<span>{{ cat.icon }}</span>` 直接渲染 | 将 `SettingsCategoryDef.icon` 值改为 Tabler `name`（`ChartBar`/`AdjustmentsHorizontal`/`User`/`Robot`/`Puzzle`/`PlugConnected`/`Tool`/`Toolbox`/`Broadcast`/`Brain`/`Flask`/`Clock`），SettingsNav 改用 `<KIcon :name="cat.icon" />` |
| T2 | `locales/zh-CN.ts` + `en.ts` | `'session.rename':'✎ 重命名'`、`'session.export':'📥 导出 Markdown'`、`'session.bindWorkspace':'📁 绑定工作区'`、`'session.delete':'🗑 删除'`、`'sidebar.action.archive':'📦 归档'`、`'msg.copy':'📋 复制文本'`、`'msg.copyCode':'📝 复制代码'`、`'msg.regenerate':'🔄 重新生成'`、`'chat.editing':'✎ 正在编辑消息'`、`'empty.chat':'…👋'`（10 条） | i18n → 右键菜单项 / 消息操作 / 空态直接渲染 | **结构改动**：文案里去掉 emoji，只保留纯文字；图标由渲染处的 KIcon 提供（菜单项 = `<KIcon/> + label`）。`empty.chat` 的 👋 直接删除或换 `MoodSmile` 图标。**成本较高，需架构师 T3 单独排期。** |
| T3 | `composables/useExpertList.ts:81/98`、`useMcpList.ts:57/72`、`useSkillList.ts:71/110` | 🤖🔌🧩🛠 | 卡片默认头像 `icon || '🤖'` | 属「数据默认头像」，见 §3.5 策略 |

### 3.3 图标尺寸阶梯

| 场景 | size | 说明 | 典型位置 |
|---|---|---|---|
| 状态点/内联微图标 | `12–14` | 连通性圆点、折叠箭头、Tag 内 | ProviderSection ● / ChevronDown |
| 内联/文件芯片 | `14–16` | 与 12–14px 文字并排 | MessageItem 文件芯片、菜单项前缀 |
| 按钮内图标 | `18` | PageHeader/工具条/操作按钮 | OutputPanel actions、RightPanel |
| 导航/菜单项 | `20` | 左栏主导航、AppNav | AppNav 导航项 |
| 页面标题图标 | `24` | PageHeader title 前（如启用） | — |
| 卡片头图标 | `32` | ResourceCard 图标容器 | ResourceCard（现 32×32） |
| 空态/大装饰 | `48` | EmptyState、详情预览 | EmptyState（现 48） |

**对齐规则**：图标与并排文字**垂直居中**（父 `display:flex; align-items:center`）；图标与文字间距用 `--km-space-xs`（4px）或 `--km-space-2xs`（2px，紧贴）。图标 `flex-shrink:0` 防被压缩。

### 3.4 描边宽度与颜色策略

- **描边**：统一 `stroke-width:1.5`（KIcon 已内置）。不混用不同粗细。
- **默认色**：`currentColor` 继承父 `color`。
- **hover**：由父元素 `color` 变化带动（不单独给图标写 hover）。
- **禁用**：父容器 `opacity: var(--km-opacity-disabled=0.4)`，图标随之变淡。
- **语义色**：危险/成功/警告图标由**父容器**设 `color: var(--km-danger|success|warning)`，图标继承。禁止在 KIcon 上硬写颜色。

### 3.5 数据默认头像策略（emoji 的唯一合法留存区）

市场卡片/角色卡片的 `item.icon || fallback` 属**用户内容**而非 UI chrome，可暂留 emoji，但遵守：

1. 优先渲染 `item.icon`（用户/远端提供的图片 URL 或字符）。
2. 加载失败/缺省时才用 fallback。
3. **fallback 逐步图标化**：`useExpertList` 的 `🤖` → `<KIcon name="Robot" :size="32">`；`useMcpList` `🔌` → `PlugConnected`；`useSkillList` `🧩` → `Puzzle`；通用 `📦` → `Package`。这样默认头像也是线性风格，与 UI 一致。
4. 过渡期允许 emoji fallback 存在，但**不计入 §12 「功能性 emoji=0」门槛**（登记豁免）。

---

## 第 4 章 交互状态矩阵（细到每一步）

### 4.1 状态定义与通用约定

**9 个状态**（不适用者标 `—`）：

| 状态 | 触发 | 说明 |
|---|---|---|
| `默认` | — | 静息态 |
| `hover` | 鼠标悬停 | 仅指针设备；触摸设备不触发 |
| `focus-visible` | 键盘 Tab 聚焦 | **仅键盘**，鼠标点击不显示焦点环 |
| `active` | 按下未松开 | 即时按压反馈 |
| `selected` | 被选中 | 持久状态，与 hover 可叠加 |
| `disabled` | 不可用 | 不响应 hover/active |
| `loading` | 异步进行中 | 阻止重复提交 |
| `error` | 校验/请求失败 | 伴随错误文案 |
| `success` | 操作成功 | 短暂态（1.5s 后回默认） |

**全局通用规则**：

| 项 | 规范 |
|---|---|
| focus 环 | `outline: 2px solid var(--km-accent); outline-offset: 2px`（全局 `*:focus-visible`，variables.scss:174）。**禁止 `outline:none`**（§11.4） |
| disabled | `opacity: var(--km-opacity-disabled)` = `0.4`；`cursor: not-allowed`；保留 `pointer-events` 以便 tooltip 提示原因 |
| 过渡 | 颜色/阴影类 `var(--km-transition-fast)` 0.12s；位移/尺寸类 `var(--km-transition-normal)` 0.15s |
| cursor | 可点击 `pointer`；禁用 `not-allowed`；文本输入 `text`；拖拽 `grab`/`grabbing`；列宽 `col-resize` |
| 状态叠加优先级 | `disabled` > `loading` > `error` > `selected` > `active` > `hover` > `默认` |

> **`--km-opacity-disabled` 尚未定义**，需随 §2.3 一并加入 variables.scss（值 `0.4`）。同时建议加 `--km-opacity-muted: 0.55`、`--km-opacity-empty: 0.6`。

### 4.2 按钮（Button）

Naive UI `NButton` 已覆盖多数态，下表为**本项目统一口径**，差异处需在 `theme.ts` overrides 或 scoped CSS 中对齐。

| 状态 | 主按钮 primary | 次按钮 default | 文字按钮 quaternary | 危险 error | 图标按钮 |
|---|---|---|---|---|---|
| 默认 | bg `--km-accent` / 字 `#fff` / 无边框 | bg 透明 / 字 `--km-text` / 边框 `--km-border` | bg 透明 / 字 `--km-text` / 无边框 | bg `--km-danger` / 字 `#fff` | bg 透明 / 字 `--km-muted` / circle |
| hover | bg 亮 8% | 边框 `--km-accent` / 字 `--km-accent` | bg `--km-hover-bg` | bg 暗 8% | bg `--km-hover-bg` / 字 `--km-text` |
| focus-visible | + 全局 focus 环 | + 焦点环 | + 焦点环 | + 焦点环 | + 焦点环 |
| active | bg 暗 6% + `transform: scale(0.98)` | bg `--km-hover-bg` + scale(0.98) | bg `--km-hover-bg-strong` | bg 暗 12% | bg `--km-hover-bg-strong` |
| selected | — | 边框 `--km-accent` + bg `--km-accent-bg` | 字 `--km-accent` | — | bg `--km-accent-bg` / 字 `--km-accent` |
| disabled | opacity .4 / not-allowed | 同 | 同 | 同 | 同 |
| loading | 文字 opacity 0 + 居中 spinner 16px；禁点击 | 同 | 同 | 同 | 图标换 `Loader` 旋转 |
| error | — | 边框 `--km-danger` | 字 `--km-danger` | — | 字 `--km-danger` |
| success | 图标短暂换 `Check`，1.5s 回落 | 同 | 同 | — | 同 |

**尺寸阶梯**（与 Naive size 对齐）：

| size | 高度 | 水平 padding | 字号 | 图标 | 用途 |
|---|---|---|---|---|---|
| tiny | 22px | 6px | `--km-font-xs` 10px | 14 | 卡片内操作（McpCard 停止/删除） |
| small | 28px | 12px | `--km-font-sm` 12px | 16 | PageHeader actions、工具条 |
| medium | 34px | 16px | `--km-font-md` 14px | 18 | 表单主操作、对话框按钮 |
| large | 40px | 20px | `--km-font-base` 15px | 20 | 空态 CTA、关键提交 |

**过渡**：`transition: background-color .12s ease, border-color .12s ease, color .12s ease, transform .12s ease`。

### 4.3 输入框 / 文本域（Input / Textarea）

| 状态 | 背景 | 边框 | 文字 | 其他 |
|---|---|---|---|---|
| 默认 | `--km-input-bg` | `1px solid --km-border` | `--km-text` | placeholder `--km-muted` |
| hover | 同 | `--km-border-light` | 同 | cursor: text |
| focus | 同 | `--km-accent` | 同 | `box-shadow: 0 0 0 3px var(--km-accent-bg)`（圆角贴合，替代方形 outline） |
| active | 同 focus | 同 focus | 同 | — |
| disabled | `--km-panel` | `--km-border` | `--km-muted` | opacity .4 / not-allowed |
| readonly | 透明 | 无 | `--km-text` | 可选中复制 |
| error | 同 | `--km-danger` | 同 | 下方错误文案 12px `--km-danger`，间距 `--km-space-xs` |
| success | 同 | `--km-success` | 同 | 右侧 `Check` 16px success 色，1.5s 后回默认 |
| loading | 同 | 同 | 同 | 右侧 `Loader` 旋转（异步校验时） |

> **focus 用 box-shadow 而非 outline 的例外说明**：输入框圆角下 `outline` 为直角、视觉割裂。本项目允许输入类控件用 `box-shadow` 焦点环**替代**全局 outline，但**必须保证键盘可见性** —— 即 `:focus-visible` 时仍有明显视觉变化。这与 §11.4 禁止的 `outline:none` 滥用（去掉后不给任何替代）性质不同。

**文本域补充**：`min-height: 40px`；`max-height: 200px` 后出现滚动；`resize: none`（由 JS 自动扩展）；行高 1.5。

### 4.4 下拉选择（Select / Dropdown）

| 状态 | 触发器 trigger | 面板项 option |
|---|---|---|
| 默认 | 同输入框默认 | bg 透明 / 字 `--km-text` |
| hover | 边框 `--km-border-light` | bg `--km-hover-bg` |
| focus-visible | 焦点环 | 焦点环（键盘 ↑↓ 移动时） |
| active | 边框 `--km-accent` + 箭头旋转 180°（.15s） | bg `--km-hover-bg-strong` |
| selected | 显示选中值 | bg `--km-accent-bg` / 字 `--km-accent` + 右侧 `Check` 14px |
| disabled | opacity .4 | opacity .4 / 跳过键盘导航 |
| loading | 面板显示 spinner + 「加载中…」 | — |
| error | 边框 `--km-danger` | — |

**面板规格**：`background: var(--km-panel)`；`border: 1px solid var(--km-border)`；`border-radius: var(--km-radius-md)`；`box-shadow: var(--km-shadow-dropdown)`；`max-height: 280px` 超出滚动；项高 32px，padding `0 12px`。

### 4.5 复选 / 单选 / 开关（Checkbox / Radio / Switch）

| 状态 | Checkbox | Radio | Switch |
|---|---|---|---|
| 默认 | 16×16，边框 `--km-border`，圆角 `--km-radius-sm` | 16×16 圆，边框 `--km-border` | 轨 36×20，bg `--km-border`，钮 16 白 |
| hover | 边框 `--km-accent` | 边框 `--km-accent` | 轨色亮 8% |
| focus-visible | 焦点环 | 焦点环 | 焦点环 |
| active | scale(0.92) | 同 | 钮宽 18（挤压感） |
| checked | bg `--km-accent` + 白 `Check` 12 | 内圆点 8 `--km-accent` | 轨 `--km-accent`，钮右移 |
| disabled | opacity .4 | opacity .4 | opacity .4 |
| indeterminate | bg `--km-accent` + 白横线 | — | — |
| error | 边框 `--km-danger` | 同 | — |

**标签点击**：label 与控件绑定（`<label for>` 或包裹），点文字等同点控件。控件与文字间距 `--km-space-sm`（8px）。

### 4.6 标签 Tag

| 变体 | 背景 | 文字 | 用途 |
|---|---|---|---|
| default | `--km-hover-bg` | `--km-text` | 通用标签（ResourceCard tags） |
| info | `--km-accent-bg` | `--km-accent` | Agent / Mode 标签 |
| success | `--km-success-bg` | `--km-success` | 已安装 / 运行中 |
| warning | `--km-warning-bg` | `--km-warning` | 已停止 / 注意 |
| error | `--km-danger-bg` | `--km-danger` | 错误 |

| 状态 | 表现 |
|---|---|
| 默认 | 上表变体样式，无边框 |
| hover（可点击时） | 背景加深至 `--km-hover-bg-strong`；**不可点击 Tag 无 hover**（避免误导可点） |
| closable hover | 关闭 `X` 由 `--km-muted` → `--km-danger` |
| selected | 边框 `1px solid var(--km-accent)` |
| disabled | opacity .4 |

**尺寸**：`tiny` 高 20 / 字 10 / padding `0 6px`；`small` 高 24 / 字 12 / padding `0 8px`。圆角 `--km-radius-sm`（4px），`round` 变体用 `--km-radius-full`。

### 4.7 卡片 Card

| 状态 | 背景 | 边框 | 阴影 | 变换 |
|---|---|---|---|---|
| 默认 | `--km-card-bg` | `1px solid --km-card-border` | `none`（静息不投影，保持清爽） | — |
| hover | `--km-card-bg` | `--km-border-light` | `--km-shadow-card-hover` | `translateY(-2px)` |
| focus-visible | 同 hover | 同 | 同 | + 焦点环 |
| active | 同 hover | 同 | `--km-shadow-card` | `translateY(-1px)` |
| selected | `--km-accent-bg` | `1px solid --km-accent` | `--km-shadow-card` | — |
| disabled | 同默认 | 同默认 | none | opacity .5 / not-allowed |
| loading | 内容换 Skeleton | 同默认 | none | — |
| error | 同默认 | `1px solid --km-danger` | none | — |

**过渡**：`transition: transform .15s ease, box-shadow .15s ease, border-color .15s ease`。

**当前偏差（需修）**：`ResourceCard.vue:117` 过渡用 `.18s`（应 `.15s`）；`ResourceCard.vue:124` hover 用 `--km-shadow-card`（应用 `--km-shadow-card-hover`）；`McpCard.vue:161` hover 阴影硬编码 `0 4px 16px rgba(0,0,0,0.12)`（亮色值，暗色下几乎不可见）→ 改 `--km-shadow-card-hover`。

### 4.8 列表项 / 侧边栏项 / 菜单项

| 状态 | 列表项 | 侧边栏会话项 | 菜单项（右键 / Dropdown） |
|---|---|---|---|
| 默认 | bg 透明 / 字 `--km-text` | 同 | 同 |
| hover | bg `--km-hover-bg` | bg `--km-hover-bg` + 右侧操作按钮 `opacity 0→1` | bg `--km-hover-bg` |
| focus-visible | 焦点环 | 焦点环 | 焦点环（键盘 ↑↓） |
| active | bg `--km-hover-bg-strong` | 同 | 同 |
| selected | bg `--km-accent-bg` + 左内嵌条 `inset 2px 0 0 var(--km-accent)` | 同 + 字 `--km-accent` | bg `--km-accent-bg` / 字 `--km-accent` |
| disabled | opacity .4 | — | opacity .4 / 跳过键盘导航 |
| loading | 行内 Skeleton | — | — |
| error | 左边框 `2px --km-danger` | 前置 `AlertTriangle` warning 色（SidebarSessionItem:93） | — |
| 危险项 | — | — | 字 `--km-danger`；hover bg `--km-danger-bg` |

**规格**：项高 32–36px；padding `0 var(--km-space-md)`（12px）；图标与文字 gap `--km-space-sm`（8px）；单行截断 `text-overflow: ellipsis`。

**高亮定位**：会话跳转时用 `--km-highlight-bg` 闪烁 2 次（总时长 1.2s）后回落（LeftSidebar:906、SidebarSessionItem:312）。v2 将该色由刺眼黄 `rgba(255,215,0,.3)` 改为主色系（§2.3）。

### 4.9 Tab 页签

| 状态 | 表现 |
|---|---|
| 默认 | 字 `--km-muted`；bg 透明；下边框 2px transparent |
| hover | 字 `--km-text`；bg `--km-hover-bg` |
| focus-visible | 焦点环 |
| active（按下） | bg `--km-hover-bg-strong` |
| selected（当前页签） | 字 `--km-accent`；下边框 `2px solid var(--km-accent)`；字重 500 |
| disabled | opacity .4 |
| closable hover | `X` 由 `--km-muted` → `--km-danger` |

**AgentTabBar 特例**：高 36px；`overflow-x: auto`；`flex-shrink: 0`；active 项 bg `--km-accent-bg` —— **依赖 §2.3 补齐该 Token，当前渲染为空（缺陷 R1）**。

### 4.10 链接

| 状态 | 表现 |
|---|---|
| 默认 | `color: var(--km-accent)`；无下划线 |
| hover | `text-decoration: underline`；色不变 |
| focus-visible | 焦点环 |
| active | 色略暗 |
| visited | 不区分（应用内链接无需 visited 态） |
| 外链 | 文字后接 `ExternalLink` 12px 图标，间距 2px |

### 4.11 表格行

| 状态 | 表现 |
|---|---|
| 默认 | bg 透明；下边框 `1px solid var(--km-border)` |
| hover | bg `--km-hover-bg`；`transition: background .12s ease` |
| focus-visible | 焦点环（行可聚焦时） |
| selected | bg `--km-accent-bg` + `box-shadow: inset 2px 0 0 var(--km-accent)` |
| disabled | opacity .4 |
| loading | 整表覆盖 Skeleton 行 ×5 |
| error | 整表替换为错误态 + 重试 CTA（§8.6） |

**表头**：bg `--km-panel`；字 `--km-font-sm` 12px / 500 / `--km-muted`；`position: sticky; top: 0; z-index: 1`。
**排序**：列头右侧 `ArrowsSort`（未排序）/ `ArrowUp` / `ArrowDown`，14px。

### 4.12 滑块 Slider

| 状态 | 轨道 | 已选段 | 手柄 |
|---|---|---|---|
| 默认 | 4px `--km-border` | `--km-accent` | 14 圆，白底 + 1px `--km-accent` 边 |
| hover | 同 | 同 | 放大至 16 |
| focus-visible | 同 | 同 | 焦点环 |
| active | 同 | 同 | 16 + `box-shadow: 0 0 0 6px var(--km-accent-bg)` |
| disabled | 同 | `--km-muted` | opacity .4 |

**键盘**：`←→` 步进 1；`PageUp/PageDown` 步进 10；`Home/End` 到端点。

### 4.13 分页 Pagination

| 状态 | 页码项 |
|---|---|
| 默认 | 28×28；bg 透明；字 `--km-text`；圆角 `--km-radius-sm` |
| hover | bg `--km-hover-bg` |
| focus-visible | 焦点环 |
| selected（当前页） | bg `--km-accent`；字 `#fff` |
| disabled（首/末页箭头） | opacity .4 / not-allowed |

**已安装模块分页**：`INTERACTION.installedPageSize = 10`（2 行 × 5 列），见 `constants/layout.ts:238`。

---

## 第 5 章 交互流程规范（细到每个步骤）

每条流程按「**触发 → 即时反馈 → 中间态 → 结果态 → 异常态**」展开。

### 5.1 发送消息（ChatInput → MessageList）

| 步骤 | 触发 | 即时反馈（<100ms） | 中间态 | 结果态 | 异常态 |
|---|---|---|---|---|---|
| ① 输入 | 键入字符 | textarea 自适应增高（40→200px）；发送按钮由 disabled 转 enabled | — | — | 超长时输入框下方 12px `--km-danger` 提示，发送按钮保持 disabled |
| ② 校验 | 提交前 | 内容为空白（仅空格）→ 发送按钮 disabled，**不弹错** | — | — | 附件上传未完成 → 发送按钮 loading，tooltip「附件上传中」 |
| ③ 提交 | Enter / Ctrl+Enter / 点发送 | 输入框**立即清空**；用户消息立即上屏（乐观渲染）；发送按钮转 loading | 停止按钮出现（ChatView:299，`PlayerStop` + `--km-danger`）；AI 气泡显示流式光标（`@keyframes km-pulse`） | — | 见 ⑥ |
| ④ 流式返回 | SSE chunk | 文本逐段追加；滚动**贴底时自动跟随**，用户上滚后停止跟随并显示「回到底部」浮标 | 光标脉冲 1s 周期 | 流结束：光标消失、停止按钮隐藏、操作按钮（复制/重试）可用 | 中途断流 → 保留已收内容 + 末尾追加错误行 |
| ⑤ 中断 | 点「停止」 | 按钮立即 disabled 防重复 | 请求 abort | 已生成内容保留；气泡下方标「已停止」12px `--km-muted` | abort 失败 → Toast error |
| ⑥ 失败 | 4xx / 5xx / 超时 | — | — | — | 气泡内联 `AlertTriangle` +「发送失败，点击重试」（MessageItem:298），整行可点即重试；**不弹 Modal** |
| ⑦ 重试 | 点失败行 /「重新生成」 | 错误行消失，回到 ③ | 同 ③④ | 同 ④ | 连续 3 次失败 → 升级为 Toast + 建议检查网络 |

**键盘语义**：`Enter` 发送 / `Shift+Enter` 换行（sendMode=Enter 时）；`Esc` 清空输入框（有内容时）或退出编辑态。

### 5.2 新建会话

| 阶段 | 行为 |
|---|---|
| 触发 | 左栏「+」按钮 / 快捷键 |
| 即时反馈 | 新会话项**立即插入列表顶部**（乐观），标题占位「新对话」，处于 selected 态 |
| 中间态 | 列表项右侧显示 12px `Loader`（后端创建中） |
| 结果态 | 后端返回真实 id → 替换占位 id；路由切到该会话；焦点移入 ChatInput |
| 异常态 | 创建失败 → 移除占位项 + Toast error「新建会话失败」+ 重试入口 |

### 5.3 切换会话

| 阶段 | 行为 |
|---|---|
| 触发 | 点击 SidebarSessionItem |
| 即时反馈 | 目标项立即 selected（`--km-accent-bg` + 左内嵌条）；旧项取消选中 |
| 中间态 | MessageList 显示 SkeletonList（**不用 spinner**）；PageHeader 标题更新 |
| 结果态 | 消息渲染完成；**滚动位置恢复到上次离开处**（DOM 保留策略，variables.scss:158 注释 R-36）；无历史则 EmptyState「开始一段新对话吧」 |
| 异常态 | 加载失败 → MessageList 区域显示错误态 + 「重试」按钮（不影响左栏可用） |

### 5.4 删除会话（含二次确认与撤销）

| 阶段 | 行为 |
|---|---|
| 触发 | 右键菜单「删除」/ hover 行内 `Trash` |
| 即时反馈 | 弹 **Popconfirm**（非 Modal，轻量）：「删除会话「{名称}」？」+ [取消] [删除]，删除按钮 `type=error` |
| 中间态 | 确认后按钮 loading；列表项 opacity 降至 .5 |
| 结果态 | 项移出列表；若删的是当前会话 → 自动切到相邻会话或空态；底部 Toast「已删除」+ **「撤销」按钮，保留 5s** |
| 异常态 | 删除失败 → 项恢复 opacity 1；Toast error「删除失败」 |
| 撤销 | 5s 内点「撤销」→ 项回插原位置；超时后 Toast 消失，删除不可逆 |

> **一致性铁律**：所有**破坏性且不可逆**操作（删除会话/角色/模型、清空记忆）统一 Popconfirm 二次确认；可撤销的用「Toast + 撤销」。禁止无确认直接删除。

### 5.5 市场安装 / 卸载

| 阶段 | 安装 | 卸载 |
|---|---|---|
| 触发 | 卡片「安装」/「一键部署」 | 「卸载」按钮 |
| 即时反馈 | 按钮转 loading + 文案「安装中…」；卡片其余操作 disabled | Popconfirm 二次确认（卸载有副作用） |
| 中间态 | 有进度显示百分比，无则保持 loading；**卡片不可重复点击** | 按钮 loading |
| 结果态 | 按钮变「已安装」+ `installed` success Tag；Toast success「{名称} 安装成功」1.5s；**列表局部刷新，不整页重载** | Tag 消失、按钮回「安装」；Toast「已卸载」 |
| 异常态 | 按钮回落原文案；Toast error 含失败原因；**卡片状态回滚到安装前**，不留中间态 | 同左，回滚为已安装 |

### 5.6 设置项修改

| 阶段 | 行为 |
|---|---|
| 触发 | 输入 / 切换开关 / 选择下拉 |
| 即时反馈 | 控件状态立即变化；**表单变脏** → 底部出现「保存 / 放弃」操作条（sticky，`--km-panel` 背景 + 上边框） |
| 实时校验 | 输入类**失焦时**校验（非每次键入，避免打字时红字闪烁）；格式类（URL/端口）防抖 300ms 即时校验 |
| 中间态 | 点「保存」→ 按钮 loading；表单整体 disabled |
| 结果态 | Toast success「已保存」1.5s；操作条收起；表单回干净态 |
| 异常态 | 保存失败 → 操作条保留；错误字段边框 `--km-danger` + 下方文案；**焦点自动移到第一个错误字段**；Toast error |
| 放弃 | 点「放弃」→ Popconfirm「放弃未保存的修改？」→ 确认后还原初值 |

**例外**：开关类即时生效项（如主题切换）无保存条，切换即生效即持久化。

### 5.7 文件上传 / 目录选择

**文件上传（ChatInput）**：

| 阶段 | 行为 |
|---|---|
| 触发 | 点「+」→「选择文件」（ChatInput:339）/ 拖拽到输入区 / 粘贴 |
| 即时反馈 | 拖拽悬停：输入区显示 `2px dashed var(--km-accent)` + bg `--km-accent-bg`；释放后立即生成附件 chip |
| 中间态 | chip 显示 `Loader` + 进度；发送按钮 loading（禁止带未完成附件发送） |
| 结果态 | chip 显示 `File` 图标 + 文件名 + `X` 移除按钮；bg `--km-file-chip-bg` |
| 异常态 | 超限（`INTERACTION.maxFileBytes` = 1MB）→ chip 红边 + tooltip「文件超过 1MB」；上传失败 → chip 显示重试图标 |

**目录选择（DirPickerModal）**：

| 阶段 | 行为 |
|---|---|
| 触发 | 「绑定工作区」等 |
| 即时反馈 | Modal 打开，焦点移入路径输入框；焦点锁在 Modal 内（focus trap） |
| 中间态 | 目录列表加载中显示 SkeletonList |
| 交互 | **单击**目录项 → selected 高亮（`--km-accent-bg`）；**双击** → 进入下级；面包屑用 `ChevronRight` 14px 分隔，每级可点回跳 |
| 键盘 | `↑↓` 移动选中；`Enter` 进入下级；`Backspace` 回上级；`Esc` 关闭；`Tab` 在 列表/输入框/按钮 间循环 |
| 结果态 | 点「确定」→ 返回路径，Modal 关闭，**焦点归还触发按钮** |
| 异常态 | 无权限目录 → 行置灰 + tooltip「无访问权限」；路径不存在 → 输入框红边 + 错误文案 |

### 5.8 审批卡片（ApprovalCard）与澄清卡片（ClarifyCard）

**ApprovalCard**（工具调用需人工批准）：

| 阶段 | 行为 |
|---|---|
| 呈现 | 消息流插入卡片：边框 `--km-approval-border`、bg `--km-approval-bg`、左上 `Lock` 18px warning 色；**默认展开**（需用户决策，不可折叠隐藏） |
| 内容 | 工具名 + 参数（代码块 `--km-code-bg` + `--km-mono`）+ 风险说明 |
| 操作 | [拒绝]（default）+ [批准]（primary）；**批准动作本身具破坏性时**用 `type=error` 并加 Popconfirm |
| 即时反馈 | 点击后两按钮立即 disabled，被点者 loading |
| 结果态 | 卡片收起为单行摘要：`Check`/`X` +「已批准 / 已拒绝」+ 时间戳；边框转 `--km-border` |
| 异常态 | 提交失败 → 按钮恢复可点 + **内联**错误文案（不弹 Modal，避免打断消息流） |
| 超时 | 卡片转灰 +「已超时，请重新发起」 |

**ClarifyCard**（AI 请求澄清）：

| 阶段 | 行为 |
|---|---|
| 呈现 | 边框 `--km-clarify-border`、bg `--km-clarify-bg`、`HelpCircle` 18px accent 色；默认展开 |
| 内容 | 问题文本 + 选项列表（Radio）或自由输入 |
| 交互 | 选项 hover `--km-hover-bg`；选中 `--km-accent-bg`；键盘 `↑↓` 选择、`Enter` 提交 |
| 即时反馈 | 提交后卡片 disabled + loading |
| 结果态 | 收起为「已回复：{答案}」摘要行 |
| 异常态 | 内联错误 + 重试 |
| ⚠ 现存缺陷 | `ClarifyCard.vue:56` 存在 `outline:none`，键盘用户看不到焦点 → 必须移除并补 `:focus-visible`（§11.4） |

### 5.9 键盘导航全链路

**Tab 顺序**（DOM 序即 Tab 序，禁止用正数 `tabindex` 篡改）：

```
左栏 LeftSidebar → PageHeader（左栏钮 → 搜索 → actions → 右栏钮）→ 主体内容 → 右栏 RightPanel
```

| 键 | 语义 |
|---|---|
| `Tab` / `Shift+Tab` | 前进 / 后退焦点；焦点必须**始终可见** |
| `Enter` | 激活当前焦点元素（按钮/链接/列表项）；表单内提交 |
| `Space` | 切换 Checkbox / Switch；滚动容器翻页 |
| `Esc` | 关闭 Modal / Dropdown / 右键菜单 → **焦点归还触发元素**；输入框内清空 |
| `↑` `↓` | 列表 / 菜单 / 下拉项间移动（**焦点不外溢出容器**） |
| `←` `→` | Tab 页签切换；滑块步进；树形展开 / 折叠 |
| `Home` / `End` | 列表首 / 末项 |
| `Ctrl+B` | 切换左栏（PageHeader:115 已有提示文案） |
| `Ctrl+\` | 切换右栏（PageHeader:149） |
| `Ctrl+F` | 聚焦页内搜索（PageHeader `focusPageSearch`，已实现） |

**焦点陷阱**：Modal / Drawer 打开时焦点锁在容器内循环；关闭后**必须**归还到触发元素。
**跳过链接**：建议在 `App.vue` 首个可聚焦位置加「跳到主内容」隐藏链接（focus 时显现）。

### 5.10 表单提交完整校验反馈规范

| 环节 | 规范 |
|---|---|
| **何时校验** | ① 格式类（URL / 端口 / 数字）→ 输入时防抖 300ms 校验；② 必填 / 业务类 → **失焦时**校验；③ 全量 → 提交时校验。**禁止每次按键就飘红** |
| **错误展示** | 字段边框 `--km-danger`；下方 12px `--km-danger` 文案，间距 `--km-space-xs`；**文案说明如何修复**（「端口需为 1–65535」而非「格式错误」） |
| **聚焦策略** | 提交校验失败 → 滚动到**第一个**错误字段并 `focus()`；错误较多时顶部加摘要 Alert |
| **提交中** | 提交按钮 loading + 表单 disabled，防重复提交 |
| **成功** | Toast success 1.5s；表单回干净态；新建场景清空或跳转 |
| **失败（服务端）** | Toast error + 字段级错误回填（若服务端返回字段错误映射） |
| **无障碍** | 错误文案用 `aria-describedby` 关联字段；错误字段 `aria-invalid="true"` |

---

## 第 6 章 逐页面规范（9 个视图）

### 6.0 通用页面骨架

所有页面挂在 `LayoutShell.vue` 的 `<router-view>` 内，外层由 `.km-shell` 5 轨网格约束。

```
┌─ .km-shell (grid: 5 轨) ─────────────────────────────────────────┐
│ ┌LeftSidebar┐│H│┌──────── <router-view> ────────┐│H│┌RightPanel┐│
│ │ 260px     ││4││  ┌ PageHeader (48px) ───────┐ ││4││ 420px    ││
│ │ 180~500   ││p││  │ [☰] Title [badge] [搜索] │ ││p││ 320~800  ││
│ │           ││x││  │              [actions][⧉]│ ││x││          ││
│ │           ││ ││  └──────────────────────────┘ ││ ││          ││
│ │           ││ ││  ┌ .km-page-body (flex:1) ──┐ ││ ││          ││
│ │           ││ ││  │   页面主体（可滚动）      │ ││ ││          ││
│ │           ││ ││  └──────────────────────────┘ ││ ││          ││
│ └───────────┘│ │└───────────── min-width:480 ───┘│ │└──────────┘│
├──────────────── StatusBar（可选，底部）────────────────────────────┤
└──────────────────────────────────────────────────────────────────┘
```

**通用契约（所有 9 个页面必须满足）**

| 编号 | 规则 | 检测方式 |
|---|---|---|
| P-1 | 页面根元素必须 `height:100%; min-width:0; display:flex; flex-direction:column` | 目视 + 侧栏拖到最小不撑破 |
| P-2 | 标题必须经 `PageHeader`，禁止页面内自绘 `<h1>` 标题栏 | `grep -n "<h1" views/` 应为 0 |
| P-3 | 主体滚动容器唯一，禁止嵌套双滚动条 | 拖动测试 |
| P-4 | 空/加载/错误三态必须齐全（见 §6.10 三态矩阵） | 逐页走查 |
| P-5 | 所有颜色引用 Token，禁止硬编码 hex（TerminalPane ANSI 除外） | §12 C-2 |

---

### 6.1 ChatView（聊天）— `views/ChatView.vue`（450 行）

**路由**：`/`（name: `chat`）｜**默认首页**

#### 6.1.1 布局骨架

```
┌ PageHeader ───────────────────────────────────────────────────┐
│ [☰] 会话标题 [Agent徽章][模式徽章][模型徽章]  [搜索框 220px]    │
│                          [分享][大纲][提问历史][右栏][⏹停止]    │
├ AgentTabBar ──────────────────────────────────────────────────┤
│ [ Agent A ×][ Agent B ×][ + ]                                 │
├ .km-chat-body (flex:1, row) ──────────────────────────────────┤
│ ┌ ChatPanel (flex:1) ───────────┐ ┌ ChatRightPanel ─────────┐ │
│ │  MessageList（滚动）           │ │ mode: outline/share/... │ │
│ │  ChatInput（底部固定）          │ │ 可 hidden               │ │
│ └───────────────────────────────┘ └─────────────────────────┘ │
├ SessionConfigBar ─────────────────────────────────────────────┤
│ [工作区][模式][Agent][模型] ─────── [ContextRing 12%][发送模式] │
└───────────────────────────────────────────────────────────────┘
```

#### 6.1.2 UI 元素清单（含图标整改）

| 位置 | 元素 | 现状 | v2 规范 | 文件:行 |
|---|---|---|---|---|
| Header title-extra | Agent 徽章 | `.km-header-agent` 文本 | 保留，前置 `<KIcon name="Robot" :size="12">` | ChatView.vue:9 |
| Header title-extra | 模式徽章 | `.km-header-mode` | 保留，色 `--km-accent-soft` | ChatView.vue:10 |
| Header title-extra | 模型徽章 | `.km-header-model` | 保留，色 `--km-tag-bg` | ChatView.vue:11 |
| Header actions | 分享 | `KIcon name="Share" :size="18"` ✅ | 保持 | ChatView.vue:26 |
| Header actions | 大纲 | `KIcon name="List" :size="18"` ✅ | 保持 | ChatView.vue:38 |
| Header actions | **提问历史** | **`📜` emoji** ❌ | **`<KIcon name="History" :size="18">`** | ChatView.vue:57 |
| Header actions | **右栏开关** | **`⧉` emoji** ❌ | **`<KIcon name="LayoutSidebarRight" :size="18">`**；展开态用 `LayoutSidebarRightExpand` | ChatView.vue:83 |
| Header actions | **停止** | **`⏹ 停止`** ❌ | **`<KIcon name="PlayerStopFilled" :size="14">` + 文本「停止」**；色 `--km-danger` | ChatView.vue:87 |
| 提问历史浮层 | 空态 | 纯文本「暂无提问记录」 | 改 `<EmptyState icon="History" title="暂无提问记录" />` | ChatView.vue:59 |

#### 6.1.3 页面特有交互规则

| 规则 | 说明 |
|---|---|
| 搜索 | 输入 → debounce `INTERACTION.searchDebounceMs=300` → 高亮 MessageList 命中项；空查询清除高亮 |
| 停止按钮 | **仅 `running===true` 时出现**；点击 → `store.stop(sid)`；点击后立即 disabled 直到 running 变 false，防重复 |
| 右栏开关 | 三态 `hidden / outline / share`；同 mode 再点 = 收起（toggle 语义） |
| 提问历史 | Popover `placement="bottom-end"`；点击条目 → `scrollToMessage(id)` + 目标消息 `--km-accent-soft` 高亮 1200ms 后淡出 |
| Agent 标签关闭 | 关闭最后一个标签时**不允许**清空，至少保留 1 个（否则 ChatPanel 无上下文） |
| 无 sid | 徽章区全部隐藏（`v-if="sid && ..."`），Header 仅剩标题 |

#### 6.1.4 三态

| 态 | 表现 |
|---|---|
| 空（无会话） | ChatPanel 居中 `EmptyState icon="MessageCircle" title="开始一段新对话吧"`（**移除 `👋`**，见 §3 i18n 拆分） |
| 加载（历史消息） | MessageList 顶部 `SkeletonList` ×3 |
| 流式中 | 最后一条 assistant 消息尾部光标动画；停止按钮出现；输入框 disabled=false（允许排队） |
| 错误 | 消息气泡内 `--km-danger` 内联错误条 + 「重试」按钮，**不弹 Toast**（避免流式过程刷屏） |

---

### 6.2 ExpertsView（专家市场）— `views/ExpertsView.vue`（92 行）

**路由**：`/experts`｜**本质**：`MarketLayout` 的薄封装（config 驱动）

```ts
expertConfig = {
  title: '专家市场', entityType: 'expert',
  primaryTabs: [{ key:'expert', label:'专家' }, { key:'team', label:'专家团' }],
  showFeatured: true, settingsMode: false,
}
```

#### 6.2.1 布局骨架（由 MarketLayout 提供）

```
┌ .ml-toolbar ──────────────────────────────────────────┐
│ [🔍 搜索…                                    ] clearable│
├ .ml-body（滚动） ─────────────────────────────────────┤
│ ✨ 精选推荐            ← showFeatured=true 时         │
│ [ResourceCard][ResourceCard][…] ← 横向滚动 NScrollbar │
│                                                       │
│ 已安装 (N)                                            │
│ [ResourceCard][…] ← 横向滚动                          │
│                                                       │
│ 资源市场                                              │
│ [专家(N)][专家团(N)]                    [排序 ▾]      │
│ [推荐][选中项][分类chip][分类chip]…                    │
│ [卡片网格 / 瀑布]                                      │
└───────────────────────────────────────────────────────┘
```

#### 6.2.2 图标整改（MarketLayout 层，三个市场页共享收益）

| 元素 | 现状 | v2 规范 | 文件:行 |
|---|---|---|---|
| 搜索框 prefix | **`🔍`** ❌ | **`<KIcon name="Search" :size="16">`**，色 `--km-muted` | MarketLayout.vue:13 |
| 精选推荐标题 | **`✨ 精选推荐`** ❌ | **`<KIcon name="Sparkles" :size="16">` + 「精选推荐」**，色 `--km-accent` | MarketLayout.vue:37 |
| 卡片默认图标 | `mapAgentEntry` 写死 `icon:'🤖'` ❌ | `icon: ''`，由 `ResourceCard` fallback 渲染 `<KIcon name="Robot" :size="32">` | ExpertsView.vue:18 |

> **注意**：`icon: '🤖'` 是**数据层**污染，不是模板层。仅改模板无效，必须同步改映射函数——这正是 §12 扫描范围必须含 `.ts`/`<script>` 段的原因。

#### 6.2.3 页面特有规则

| 规则 | 说明 |
|---|---|
| 主 Tab 计数 | `primaryTabs[].count` 当前恒为 0（硬编码），**v2 要求由 `useMarketList` 实际分组数回填**（Y3 开放问题） |
| installed 去重 | `fetchAllExpert` 用 `Set<name>` 去重，candidates 中 `installed=true` 的补进已安装区 |
| 分类 chip 顺序 | 第 1 项固定「推荐」（空 category）；选中项**插入第 2 位**（保证选中项始终可见，不被横向滚动裁掉） |
| 卡片主操作 | 未安装 →「安装」；已安装 →「召唤」+ 次操作「卸载」 |

#### 6.2.4 三态

| 态 | 表现 |
|---|---|
| 加载 | `.km-skel-grid` 内 `SkeletonCard ×6`（MarketLayout.vue:19–21）✅ 已实现 |
| 错误 | `.ml-error` 内 `<NText type="error">` ❌ **过弱**。v2 改为 `EmptyState icon="AlertTriangle" title="加载失败" :description="error" action-label="重试"` |
| 空（搜索无果） | v2 新增：`EmptyState icon="SearchOff" title="没有匹配的专家" description="试试其他关键词或清空筛选" action-label="清空筛选"` |
| 空（真无数据） | `EmptyState icon="Robot" title="暂无可用专家"` |

---

### 6.3 SkillsView（技能市场）— `views/SkillsView.vue`（90 行）

**路由**：`/skills`｜结构与 §6.2 **完全同构**，差异仅在 config：

| 项 | 值 |
|---|---|
| title | 技能市场 |
| entityType | `skill` |
| primaryTabs | `[{ key:'skill', label:'技能' }]` |
| showFeatured | `true` |
| 默认图标 | `mapSkillEntry` 写死 `'🧩'` ❌ → `''` + fallback `<KIcon name="Puzzle" :size="32">` |
| 空态图标 | `Puzzle` |

> §6.2.2 / §6.2.3 / §6.2.4 的所有规则**逐条适用**，不再重复。

---

### 6.4 McpView（MCP 管理）— `views/McpView.vue`（83 行）

**路由**：`/mcp`｜同构于 §6.2，差异：

| 项 | 值 |
|---|---|
| title | MCP 管理 |
| entityType | `mcp` |
| primaryTabs | `[{ key:'mcp', label:'MCP' }]` |
| **showFeatured** | **`false`** → 无「精选推荐」区 |
| 默认图标 | `mapDeployedMcp` 写死 `'🔌'` ❌ → `''` + fallback `<KIcon name="PlugConnected" :size="32">` |
| description | 取 `s.command`（命令行字符串）→ 需 `font-family: var(--km-font-mono)` + 单行省略 |

#### 6.4.1 McpCard 状态点专项（关键缺陷 Y4）

`components/cards/McpCard.vue:62–66` 硬编码 5 个状态色，**暗色主题下对比度不足**：

| 状态 | 现状硬编码 | v2 Token | 语义 |
|---|---|---|---|
| `connected` / `running` | `#27ae60` | `--km-status-success` | 已连接 |
| `stopped` | `#f39c12` | `--km-status-warning` | 已停止 |
| `error` | `#e74c3c` | `--km-status-error` | 连接失败 |
| `unknown` | `#95a5a6` | `--km-status-unknown` | 未知 |

另：`McpCard.vue:161` hover 阴影硬编码 `0 4px 16px rgba(0,0,0,0.12)` → 改 `var(--km-shadow-card-hover)`（暗色下 0.12 黑几乎不可见）。

**状态点规范**：直径 8px，`border-radius:50%`，与名称间距 `--km-space-2`；`error` 态叠加 `animation: km-pulse 1.6s infinite`（遵守 §10 `prefers-reduced-motion` 降级）。必须配 `title` 属性提供文本，**不可仅靠颜色传达状态**（§11 无障碍）。

---

### 6.5 MemoryView（记忆管理）— `views/MemoryView.vue`（253 行）

**路由**：`/memory`｜**双模式**：独立页 + `embedded`（内嵌设置 → 记忆管理）

```
┌ PageHeader（embedded 时隐藏，由外壳提供） ────────────┐
│ 记忆管理                    [搜索记忆内容…] [＋新增条目]│
├ .km-memory-body ─────────────────────────────────────┤
│ ┌ .km-memory-intro ─────────────────────────────────┐│
│ │ 说明文字（读写 memories/MEMORY.md 与 USER.md）     ││
│ │ [＋新增条目] ← 仅 embedded 时出现                  ││
│ └───────────────────────────────────────────────────┘│
│ ┌ .km-toolbar ──────────────────────────────────────┐│
│ │ [分组筛选 ▾]                          共 N 条      ││
│ └───────────────────────────────────────────────────┘│
│ ┌ .km-groups（NSpin 包裹）──────────────────────────┐│
│ │ 分组标题 [count标签] [＋]                          ││
│ │   ├ EmptyState(icon="Database") 或                ││
│ │   └ NCard × entry：内容 / #idx·id·时间 / [编辑][删除]││
│ └───────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────┘
```

| 元素 | 现状 | v2 规范 | 文件:行 |
|---|---|---|---|
| 新增条目按钮 | **`＋ 新增条目`**（全角加号）❌ | `<KIcon name="Plus" :size="16">` + 「新增条目」 | MemoryView.vue:9, 22 |
| 分组内快捷新增 | **`＋`** ❌ | `<KIcon name="Plus" :size="14">`，`size="tiny"` 圆形按钮 | MemoryView.vue:~46 |
| 空态 | `EmptyState icon="Database"` ✅ | 保持，补 `description="该分组暂无记忆条目"` | — |
| 删除确认 | `NPopconfirm` ✅ | 保持（破坏性操作必须二次确认，§8） | — |

**页面特有规则**

| 规则 | 说明 |
|---|---|
| 备份提示 | 所有写操作前自动备份；删除确认文案必须包含「删除前会自动备份原文件，可回滚」——降低破坏性操作焦虑 |
| `embedded` 模式 | `PageHeader` 由外壳提供 → 页面内 `v-if="!embedded"` 隐藏；主操作按钮改挂 `.km-memory-intro`。**两处按钮必须视觉一致** |
| 条目元信息 | `#{index+1} · {id} · {updated_at}`，色 `--km-muted`，`--km-font-xs` |
| 编辑弹窗 | `NModal preset="card"`，标题随 `editingEntry` 切换「编辑/新增记忆条目」 |

---

### 6.6 JobsView（定时任务）— `views/JobsView.vue`（434 行）

**路由**：`/jobs`

```
┌ PageHeader ───────────── 定时任务      [＋ 新建任务] ┐
├ .km-page-body ───────────────────────────────────────┤
│ [说明区]                              [＋ 新建任务]   │
│ ⚠ NAlert(warning)：调度器未运行  ← !schedulerRunning │
│ ┌ .km-table-wrap（NSpin）──────────────────────────┐│
│ │ 名称/ID │ 调度表达式 │ 启用 │ 状态 │ 操作         ││
│ │ 每日晨报 │ 0 9 * * * │ [◉] │ 成功 │ 触发 编辑 删除││
│ │ … 或 NEmpty「暂无自动化任务，点击右上角新建」      ││
│ └──────────────────────────────────────────────────┘│
│ 运行历史  [全部][任务A][任务B]                        │
│ └ 时间线：时间 + 状态标签 + 摘要 / NEmpty            │
└──────────────────────────────────────────────────────┘
```

| 元素 | 现状 | v2 规范 | 文件:行 |
|---|---|---|---|
| 新建任务 ×2 | **`＋ 新建任务`** ❌ | `<KIcon name="Plus" :size="16">` + 文本 | JobsView.vue:11, 24 |
| 调度器告警 | `NAlert type="warning"` ✅ | 保持；补「去启动」行动按钮，避免死胡同告警 |
| 状态标签 | `statusType(job.last_status)` → NTag type | 映射必须走 §2 `--km-status-*`，禁止 hex |
| 行操作 | `触发/编辑/删除` tiny 按钮 | 「删除」必须 `NPopconfirm` ✅ 已有；「触发」需 loading 态防重复 |
| 空态 | `NEmpty description="暂无自动化任务，点击右上角新建"` | 改 `EmptyState icon="Clock" title="暂无自动化任务" action-label="新建任务"`（**可点击的空态**优于纯文字指路） |

**页面特有规则**

| 规则 | 说明 |
|---|---|
| 行点击 | 整行点击 = 打开详情；行内操作区 `@click.stop` 阻止冒泡（已实现，JobsView.vue:72）✅ |
| 开关 | `NSwitch` `@click.stop` + `@update:value` 切换启用；切换中 loading，失败回滚 UI 状态 |
| 历史筛选 | `[全部]` + 每任务一个 tiny 按钮；选中态 `type="primary"`，未选 `default` |
| 表达式输入 | placeholder 必须给三种示例 `30m / every 2h / 0 9 * * *`（已实现）✅ 校验失败时内联错误，不弹 Toast |

---

### 6.7 UsageView（用量统计）— `views/UsageView.vue`（195 行）

**路由**：`/usage`

```
┌ PageHeader ── 用量统计   [日期范围选择器][刷新] ──────┐
├ .km-cards（3 列）────────────────────────────────────┤
│ [总 Token]      [总费用]        [活跃会话]            │
│  1,234,567       $12.34          8                   │
│  输入…·输出…     按 provider 估算  区间内会话数        │
├ 按天趋势 ────────────────────────────────────────────┤
│ .km-bars 柱状图（纯 CSS，height:%），或 NEmpty        │
├ 明细 ────────────────────────────────────────────────┤
│ NTabs: [按天][按模型][按会话]                         │
│ .km-table-wrap（NSpin）表格                           │
└──────────────────────────────────────────────────────┘
```

| 元素 | v2 规范 |
|---|---|
| 指标卡 | 3 张 `NCard size="small"`；label `--km-font-xs`/`--km-muted`，value `--km-font-xl`/600/`--km-text`，sub `--km-font-xs`/`--km-muted` |
| 柱状图 | 柱色 `--km-accent`，hover 提亮至 `--km-accent-hover`；`title` 属性提供完整数值（已实现）✅ |
| 柱标签 | 数值在上、日期在下，`--km-font-xs`；柱数 >14 时日期标签**隔一显示**防重叠 |
| 空数据 | `NEmpty size="small" description="暂无用量数据，先完成几轮对话"` → 统一为 `EmptyState icon="ChartBar"` |
| Tab 切换 | `type="line" animated`；切换触发 `reload(groupBy)`，**保留当前日期范围** |
| 金额格式 | `fmtCost` 统一 2 位小数 + 货币符；数字用 `--km-font-mono` 保证对齐 |

**页面特有规则**：日期范围为空 = 全部区间；刷新按钮点击后 `loading` 期间 disabled；柱状图高度百分比由 `store.dayBarPercent(row)` 计算，**最小可见高度 2px**（避免 0 值柱完全消失）。

---

### 6.8 QueueView（队列）— `views/QueueView.vue`（142 行）

**路由**：`/queue`

```
┌ PageHeader ── 队列（无搜索）  [待发送 N 标签][刷新] ──┐
├ NSpin ───────────────────────────────────────────────┤
│ EmptyState(icon="Clock", "队列为空", "暂无待处理…")   │
│ 或按会话分组：                                        │
│ ┌ 会话标题 [N 条] [打开会话] ──────────────────────┐ │
│ │ #1 消息内容…                                     │ │
│ │    时间 · 模型 X · 模式 Y   [立即发送][删除]      │ │
│ │ #2 …                                             │ │
│ └──────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

| 元素 | v2 规范 |
|---|---|
| Header | `:show-search="false"` ✅（队列量小，无需搜索） |
| 待发送计数 | `NTag type="info" :bordered="false"`；0 条时仍显示「待发送 0」保持位置稳定 |
| 序号 `#{position}` | `--km-font-mono`、`--km-muted`、固定宽 32px 右对齐 → 保证多行序号纵向对齐 |
| 消息文本 | 最多 2 行 `-webkit-line-clamp:2`，超出省略；`title` 给全文 |
| 元信息 | `时间 · 模型 X · 模式 Y`，分隔符统一「 · 」，色 `--km-muted` |
| 立即发送 | `type="primary" tertiary`；点击后该项 loading → 成功则整项**淡出移除**（180ms） |
| 删除 | `NPopconfirm`「确认移除这条排队消息？」✅ |
| 空态 | `EmptyState icon="Clock"` ✅ 已合规 |

---

### 6.9 SettingsView（设置）— `views/SettingsView.vue`（557 行）

**路由**：`/settings` → `redirect: /settings/monitor`；`/settings/:category`（`props:true`）
**真源**：URL 是唯一真源，`navMode` 与 `settingsCategory` 均由 path 派生（无独立可写覆盖层状态）

```
┌ PageHeader ── 设置 [category 名称 title-extra] ───────┐
├ .km-settings-body ───────────────────────────────────┤
│ ┌ SettingsNav (左) ─┐ ┌ SettingsDetailPanel (右) ───┐│
│ │ [icon] 监控        │ │  <Suspense>                 ││
│ │ [icon] 通用        │ │    动态 Section 组件        ││
│ │ [icon] 个人资料    │ │    #fallback: NSpin size=sm ││
│ │ [icon] 智能体      │ │                             ││
│ │ … 共 12 类         │ │                             ││
│ └───────────────────┘ └─────────────────────────────┘│
└──────────────────────────────────────────────────────┘
```

#### 6.9.1 设置分类图标整改（**最严重的审计盲区 T1**）

`constants/layout.ts:119–130` 的 `SETTINGS_CATEGORIES` 硬编码 12 个 emoji，经 `SettingsNav.vue:55` 的 `<span>{{ cat.icon }}</span>` 渲染。**这是 `.ts` 数据层 emoji，`.vue` 扫描完全测不到**。

| # | 类别 | 现状 emoji | v2 Tabler 图标 | 尺寸 |
|---|---|---|---|---|
| 1 | 监控 | `📊` | `ChartBar` | 18 |
| 2 | 通用 | `🎛️` | `Adjustments` | 18 |
| 3 | 个人资料 | `👤` | `User` | 18 |
| 4 | 智能体 | `🤖` | `Robot` | 18 |
| 5 | 技能 | `🧩` | `Puzzle` | 18 |
| 6 | MCP | `🔌` | `PlugConnected` | 18 |
| 7 | 工具 | `🔧` | `Tool` | 18 |
| 8 | 工具箱 | `🧰` | `Toolbox` | 18 |
| 9 | 供应商 | `📡` | `Antenna` | 18 |
| 10 | 模型 | `🧠` | `BrandOpenai` | 18 |
| 11 | 诊断 | `🧪` | `Flask` | 18 |
| 12 | 日志/定时 | `⏰` | `Clock` | 18 |

**改造方式**：`SETTINGS_CATEGORIES[].icon` 字段语义从「emoji 字符」改为「Tabler 图标名」，`SettingsNav.vue:55` 从 `<span>{{ cat.icon }}</span>` 改为 `<KIcon :name="cat.icon" :size="18" />`。**类型不变（仍是 string），零破坏性**。

#### 6.9.2 SettingsNav 项规范

| 属性 | 值 |
|---|---|
| 行高 | 36px；padding `0 var(--km-space-3)` |
| 图标—文字间距 | `--km-space-2`（8px） |
| 默认 | 文字 `--km-text-secondary`，图标 `--km-muted` |
| hover | 背景 `--km-hover-bg`，文字 `--km-text` |
| **选中** | 背景 `--km-accent-soft`，文字 + 图标均 `--km-accent`，左侧 2px `--km-accent` 指示条 |
| focus-visible | 全局 2px outline（禁止 `outline:none`） |

#### 6.9.3 页面特有规则

| 规则 | 说明 |
|---|---|
| URL 直达 | `/settings/models` 可直接打开模型管理；浏览器前进/后退正常工作（R-38）✅ |
| 异步加载 | 每个 Section 用 `<Suspense>` + `#fallback`；**fallback 必须 `SkeletonList` 而非裸 NSpin**（避免高度塌陷跳动） |
| 内嵌视图 | `isEmbeddedView` / `isMarketSettings` 时 `.km-settings-body-flush` 去内边距 |
| 未实现分类 | 走 `PlaceholderSection.vue`，必须显示 `EmptyState icon="Tool" title="功能开发中"`，不得白屏 |
| 保存反馈 | 设置项修改 → 自动保存 → 右上角 Toast「已保存」1.5s（见 §8）；失败则内联红字 + 不关闭 |

---

### 6.10 九页面三态矩阵总表

| 页面 | 加载态 | 空态（图标） | 错误态 | 当前缺口 |
|---|---|---|---|---|
| ChatView | SkeletonList ×3 | `MessageCircle`「开始一段新对话吧」 | 气泡内联 + 重试 | emoji `👋` 待拆（i18n） |
| ExpertsView | SkeletonCard ×6 ✅ | `Robot` / 搜索无果 `SearchOff` | ❌ 仅 NText → 需 EmptyState+重试 | 错误态过弱 |
| SkillsView | SkeletonCard ×6 ✅ | `Puzzle` | 同上 | 同上 |
| McpView | SkeletonCard ×6 ✅ | `PlugConnected` | 同上 | 同上 |
| MemoryView | NSpin | `Database` ✅ | ❌ 缺 | 需补错误态 |
| JobsView | NSpin ✅ | `Clock`（改可点击） | ❌ 缺 | 需补错误态 |
| UsageView | NSpin ✅ | `ChartBar` | ❌ 缺 | 需补错误态 |
| QueueView | NSpin ✅ | `Clock` ✅ | ❌ 缺 | 需补错误态 |
| SettingsView | Suspense fallback | `Tool`（Placeholder） | 内联红字 | fallback 需换 Skeleton |

> **结论**：9 个页面中 **6 个缺独立错误态**。v2 统一要求：所有数据页必须用 `DataStateBoundary` 包裹，或至少提供 `EmptyState + action-label="重试"` 的错误分支。

---

## 第 7 章 逐组件规范（72 个组件）

### 7.0 组件清单与分级

| 目录 | 数量 | 组件 |
|---|---|---|
| `common/` | 10 | KIcon, EmptyState, DataStateBoundary, ResourceCard, MarketLayout, SkeletonCard, SkeletonList, DirPickerModal, SettingsDetailPanel, MockBadge |
| `layout/` | 7 | LayoutShell, LeftSidebar, PageHeader, RightPanel, ResizeHandle, SettingsNav, StatusBar |
| `chat/` | 22 | ChatInput, MessageItem, MessageList, ChatPanel, AgentTabBar, SessionConfigBar, ContextRing, ToolCallCard, ThoughtBlock, ApprovalCard, ClarifyCard, PlanCard, SubagentCard, AgentMarkdown, OutputPanel, RightPanel, ShareDialog, SkillPanel, McpManager, SettingsDrawer, UsageBar, （ChatPanel） |
| `cards/` | 3 | ExpertCard, McpCard, SkillCard |
| `market/` | 7 | CardMarketLayout, EntityCard, ExpertDetail, McpDetail, SkillDetail, TeamDetail, InstalledCard |
| `settings/` | 14 | GeneralSection, ProfileSection, ProviderSection, ModelManageSection, McpManageSection, SkillManageSection, AgentRoleSection, AgentRoleDetail, MonitorSection, DiagnosticsSection, LogSection, ToolsSection, ExpertPickerPanel, PlaceholderSection |
| `dialog/` | 6 | AddModelDialog, NewTaskDialog, MemberDetailDialog, LogDetailDialog, ResultDialog, SchemaDialog |
| `preview/` | 2 | FileTreePane, TerminalPane |
| `sidebar/` | 1 | SidebarSessionItem |
| 根 | 1 | **AppNav.vue**（审计未列出） |

**分级**：A 级 = 高频/高影响，给完整规范（§7.1–§7.14）；B 级 = 批量规范表（§7.15）。

---

### 7.1 KIcon — `common/KIcon.vue`（33 行）

**唯一图标出口。所有图标必须经此组件。**

| 项 | 规范 |
|---|---|
| Props | `name: string`（Tabler 名，不含 `Icon` 前缀）；`size?: string \| number = 20` |
| 解析 | `TablerIcons['Icon' + name]` |
| 描边 | `stroke-width="1.5"` **全局统一，禁止逐处覆盖** |
| 颜色 | 恒为 `currentColor`，**禁止组件内写死颜色**；由父级 `color` 决定 |
| 未知名 | 渲染 `<span class="kicon-fallback">{{ name }}</span>` |
| v2 新增 | `kicon-fallback` 在 **dev 环境**必须 `console.warn('[KIcon] unknown icon: ' + name)`，避免拼错静默降级成裸文本 |
| v2 新增 | `aria-hidden="true"` 默认；装饰性图标不进无障碍树。语义性图标由父级提供 `aria-label`/`title` |

**尺寸阶梯（禁止任意值）**：12 / 14 / 16 / 18 / 20 / 24 / 32 / 48

---

### 7.2 PageHeader — `layout/PageHeader.vue`（210 行）

| 项 | 实测值 / 规范 |
|---|---|
| 高度 | `LAYOUT_LIMITS.headerHeight = 48px`（固定） |
| 标题 | `.km-ph-title` `font-size:14px; font-weight:600` ⚠️ **v1 文档写 20px，与实际不符，以 14px 为准** |
| 搜索框宽 | 220px |
| Props | `title, hideLeft, hideRight, showSearch, searchPlaceholder, embedded` |
| Emits | `toggle-left`, `toggle-right`, `search` |
| Slots | `#title-extra`, `#actions` |
| **缺陷 1** | line 118 硬编码 `☰` → **`<KIcon name="Menu2" :size="18" />`** |
| **缺陷 2** | line 152 硬编码 `⧉` → **`<KIcon name="LayoutSidebarRight" :size="18" />`** |
| 布局 | `display:flex; align-items:center; gap:var(--km-space-2)`；标题区 `flex:1 1 auto; min-width:0`，操作区 `flex:0 0 auto` |
| 溢出 | 标题 `text-overflow:ellipsis; white-space:nowrap`；**操作区永不被压缩** |
| 分隔 | 底部 `1px solid var(--km-border)` |
| `embedded` | 去掉底边框与左右 padding，供内嵌场景复用 |

---

### 7.3 ResourceCard — `common/ResourceCard.vue`（205 行）

| 项 | 现状 | v2 规范 |
|---|---|---|
| 图标容器 | 32×32 | 保持；`border-radius: var(--km-radius-md)` |
| **line 160** | `background: var(--km-icon-bg, #f5f5f5)` ❌ 伪装硬编码 | 定义 `--km-icon-bg`（亮 `#f5f5f5` / 暗 `#2a2a2a`），**去掉 fallback** |
| **line 190** | `color: var(--km-text-secondary, #888)` ❌ | 定义 `--km-text-secondary`，**去掉 fallback** |
| hover | 用 `--km-shadow-card`（与静态同值 → 无变化感） | 改 `--km-shadow-card-hover`，并 `transform: translateY(-1px)` |
| 过渡 | `.18s` | 统一 `var(--km-dur-fast) var(--km-ease-out)` = 180ms |
| fallback 图标 | 由 `fallbackIcon` prop 传入 emoji | 改传 Tabler 名，渲染 `<KIcon :name="fallbackIcon" :size="32">` |
| 标题 | 单行省略，`--km-font-md`/600 | 保持 |
| 描述 | 2 行 clamp，`--km-font-sm`/`--km-text-secondary` | 保持 |
| 标签 | `NTag size="small" :bordered="false"`，最多显示 3 个 + `+N` | 新增溢出规则 |
| 主操作 | 「安装」/「召唤」 | 未安装 `type="primary"`；已安装 `secondary` |
| 键盘 | ❌ 无 | 卡片 `tabindex="0"`，Enter = 打开详情，`focus-visible` 走全局 outline |

---

### 7.4 McpCard — `cards/McpCard.vue`（237 行）

见 §6.4.1 状态点专项。补充：

| 项 | 现状 | v2 |
|---|---|---|
| line 102 | fallback `🔌` | `<KIcon name="PlugConnected" :size="32">` |
| line 161 | hover 阴影硬编码 `0 4px 16px rgba(0,0,0,0.12)` | `var(--km-shadow-card-hover)` |
| line 62–66 | 5 个状态 hex | `--km-status-success/warning/error/unknown` |
| 状态点 | 仅颜色 | **必须配 `title` 文本 + `aria-label`**（色盲可达性） |

同类：`ExpertCard.vue:100` `🤖` → `Robot`；`SkillCard.vue:79` `🛠` → `Tool`。

---

### 7.5 ChatInput — `chat/ChatInput.vue`（653 行）⭐ 最高频组件

| 区域 | 元素 | 现状 | v2 规范 |
|---|---|---|---|
| 工具条 | 粘贴/引用 | `📋` (248, 255) | `<KIcon name="Clipboard" :size="16">` |
| 工具条 | 目标/@提及 | `🎯` (250) | `<KIcon name="Target" :size="16">` |
| 附件 | 文件 chip | `📄` (310, 339) | `<KIcon name="File" :size="14">` |
| 工具条 | 技能 | `🧩` (354) | `<KIcon name="Puzzle" :size="16">` |
| 工具条 | MCP | `🔌` (371) | `<KIcon name="PlugConnected" :size="16">` |

**输入框规范**

| 项 | 值 |
|---|---|
| 最小高度 | 1 行（约 22px 内容区）；最大 8 行后内部滚动 |
| 自动增高 | 输入即测高，`transition: height var(--km-dur-fast)` |
| 占位符 | `--km-muted` |
| 边框 | 默认 `--km-border`；focus `--km-accent` + `box-shadow: 0 0 0 2px var(--km-accent-soft)` |
| **禁止** | `outline:none` 无替代（当前 5 处之一，见 §11） |
| 发送键 | `Enter` 发送 / `Shift+Enter` 换行（受 `sendMode` 控制，可反转） |
| 发送中 | 发送按钮变「停止」；输入框**保持可用**（允许排队） |
| 文件大小 | 超 `INTERACTION.maxFileBytes = 1048576`（1MB）→ 内联红字，**不弹 Toast** |
| 拖拽上传 | 拖入时整个输入区 2px `--km-accent` 虚线边框 + `--km-accent-soft` 底 |
| 文件 chip | 高 24px，`--km-file-chip-bg`（**幽灵 Token，必须定义**），删除 `<KIcon name="X" :size="12">` |

---

### 7.6 MessageItem — `chat/MessageItem.vue`（517 行）

| 行 | 现状 | v2 |
|---|---|---|
| 237 | `📄` 附件 | `<KIcon name="File" :size="14">` |
| 277, 317 | `📋` 复制 | `<KIcon name="Copy" :size="14">` |
| 285 | `✎` 编辑 | `<KIcon name="Pencil" :size="14">` |
| 293 | `↻` 重试 | `<KIcon name="Refresh" :size="14">` |
| 298 | `⚠` 错误 | `<KIcon name="AlertTriangle" :size="14">`，色 `--km-danger` |
| 324 | `📝` 复制代码 | `<KIcon name="ClipboardText" :size="14">` |
| 331 | `🔄` 重新生成 | `<KIcon name="Refresh" :size="14">` |

**消息气泡规范**

| 项 | user | assistant |
|---|---|---|
| 对齐 | 右 | 左 |
| 背景 | `--km-accent-soft` | `--km-surface-2` |
| 圆角 | `--km-radius-lg`，靠身侧角改 `--km-radius-sm` | 同 |
| 最大宽 | 容器 78% | 容器 92% |
| 操作条 | hover 才显现（`opacity 0→1`，180ms） | 同；**流式中隐藏**，结束后出现 |
| 时间戳 | `--km-font-xs`/`--km-muted`，hover 显现 | 同 |

> ⚠️ **操作条 hover 显现在触屏不可达** → 新增：`@media (hover:none)` 时操作条常驻显示。

---

### 7.7 MessageList — `chat/MessageList.vue`（326 行）

| 项 | 规范 |
|---|---|
| line 181 | 「回到底部」`↓` → `<KIcon name="ArrowDown" :size="16">` |
| 回到底部按钮 | 圆形 32px，`--km-surface-2` + `--km-shadow-card`，绝对定位 `bottom:16px; right:16px`；距底 >200px 时淡入 |
| 自动滚动 | 用户在底部（阈值 40px）→ 新消息自动跟随；用户已上滚 → **不打断**，仅显示「N 条新消息」提示 |
| 虚拟化 | >200 条时启用（性能门槛） |
| 分隔 | 消息间距 `--km-space-4`；日期分组用居中细线 + 日期文本 |
| 搜索高亮 | 命中文本 `background: var(--km-accent-soft)`；当前项额外 1px `--km-accent` 边框 |

---

### 7.8 AgentTabBar — `chat/AgentTabBar.vue`（164 行）

| 项 | 规范 |
|---|---|
| 高度 | 36px |
| 标签 | 水平排列，可横向滚动（隐藏滚动条），最小宽 80px、最大 180px 省略 |
| 默认 | 文字 `--km-text-secondary`，底 `transparent` |
| hover | 底 `--km-hover-bg` |
| **选中** | 底 `--km-surface-1`，文字 `--km-text`，底部 2px `--km-accent` 指示条 |
| ⚠️ 缺陷 | 选中态依赖**幽灵 Token**（无 fallback）→ 当前实际渲染为透明，**选中态不可见**。必须随 §2 Token 定义修复 |
| 关闭按钮 | `<KIcon name="X" :size="12">`，仅 hover / 选中态可见；至少保留 1 个标签 |
| 新增 | 末尾 `<KIcon name="Plus" :size="14">` 按钮 |
| 键盘 | `←`/`→` 切换，`Ctrl+W` 关闭当前 |

---

### 7.9 SessionConfigBar — `chat/SessionConfigBar.vue`（261 行）

| 行 | 现状 | v2 |
|---|---|---|
| 64 | `🎯` 模式 | `<KIcon name="Target" :size="14">` |
| 65, 70, 73 | `📋` | `<KIcon name="Clipboard" :size="14">` |
| 140 | `📁` 工作区 | `<KIcon name="Folder" :size="14">` |
| 153 | `🤖` Agent | `<KIcon name="Robot" :size="14">` |
| 165 | `🛡` 权限/模式 | `<KIcon name="Shield" :size="14">` |
| 195 | `🧠` 模型 | `<KIcon name="BrandOpenai" :size="14">` |

| 项 | 规范 |
|---|---|
| 高度 | 32px，顶部 `1px solid var(--km-border)` |
| 结构 | 左：工作区/模式/Agent/模型 四个下拉；右：ContextRing + 发送模式 |
| 每项 | `[icon] label ▾`，`--km-font-xs`，hover 底 `--km-hover-bg` |
| **缺陷 Y1** | **模型切换未真正生效**——UI 可选但不改变实际请求模型。**这是功能缺陷，须架构师排期**（见 §12 开放问题） |
| 溢出 | 窗口窄时按 `模型 > Agent > 模式 > 工作区` 优先级依次折叠为纯图标 |

---

### 7.10 ContextRing — `chat/ContextRing.vue`（95 行）

| 项 | 规范 |
|---|---|
| 尺寸 | 外径 20px，环宽 2.5px |
| 颜色分档 | <60% `--km-status-success`；60–85% `--km-status-warning`；>85% `--km-status-error` |
| 文本 | 环中心不放文字（太小），改 `title` 提供 `已用 X / 上限 Y（Z%）` |
| line 35 | `→` 在注释中，非渲染内容，**不计入 emoji 整改** |
| 动画 | 百分比变化 `transition: stroke-dashoffset var(--km-dur-base)`；`prefers-reduced-motion` 下取消 |

---

### 7.11 结构化卡片组（ToolCallCard / ThoughtBlock / ApprovalCard / ClarifyCard / PlanCard / SubagentCard）

| 组件 | 行数 | emoji | v2 图标 | 主色 |
|---|---|---|---|---|
| ToolCallCard | 56 | — | `Tool` 16 | `--km-muted` |
| ThoughtBlock | 34 | — | `Bulb` 16 | `--km-muted` |
| ApprovalCard | 54 | `🔐` (15) | `Lock` 18 | `--km-status-warning` |
| ClarifyCard | 66 | `❓` (18) | `HelpCircle` 18 | `--km-accent` |
| PlanCard | 46 | `📋` (13) | `ListCheck` 18 | `--km-accent` |
| SubagentCard | 145 | — | `Robot` 16 | `--km-muted` |

**统一卡片规范**

| 项 | 值 |
|---|---|
| 容器 | `border:1px solid var(--km-border)`；`border-radius: var(--km-radius-md)`；`background: var(--km-surface-2)` |
| 左侧强调条 | 3px，颜色 = 该卡片主色 |
| 头部 | `[icon] 标题` + 右侧折叠箭头 `ChevronDown`（展开时旋转 180°，180ms） |
| 内容 | `--km-font-sm`；代码/参数用 `--km-font-mono` |
| 默认折叠 | ToolCallCard / ThoughtBlock 折叠；ApprovalCard / ClarifyCard **必须展开**（需用户行动） |
| 行动卡 | ApprovalCard「批准/拒绝」；ClarifyCard 输入框 + 提交。**行动后卡片转为只读态并显示结果**，不得消失（保留决策痕迹） |

---

### 7.12 LeftSidebar — `layout/LeftSidebar.vue`（967 行）⭐ 最大组件

| 项 | 规范 |
|---|---|
| 宽度 | 默认 260px，范围 180–500px（`LAYOUT_LIMITS.left`） |
| 分区 | ① 顶部品牌/新建会话 ② 导航（Chat/市场/记忆/任务/用量/队列） ③ 会话列表（滚动） ④ 底部设置/主题 |
| 折叠 | 宽度 <200px 时导航项隐藏文字仅留图标 + `title` |
| 拖拽 | 经 `ResizeHandle.vue`（4px 命中区，hover 时 `--km-accent`，`cursor:col-resize`） |
| 导航项选中 | 底 `--km-accent-soft`，文字 + 图标 `--km-accent`，左侧 2px 指示条（与 SettingsNav 统一） |
| ⚠️ 建议 | 967 行 **过大**，建议拆分为 SidebarNav / SidebarSessionList / SidebarFooter 三个子组件（架构师决策，非本文档强制） |

**AppNav.vue（根目录，审计遗漏）**：7 个 emoji（`💬🧠📊📥⚙🌙☀`，行 25/26/28/29/36/78）→ `MessageCircle / BrandOpenai / ChartBar / Download / Settings / Moon / Sun`。**主题切换按钮**图标随 `theme` 切换。

---

### 7.13 SidebarSessionItem — `sidebar/SidebarSessionItem.vue`（314 行）

| 行 | 现状 | v2 |
|---|---|---|
| 93 | `⚠` 错误标记 | `<KIcon name="AlertTriangle" :size="12">`，色 `--km-danger` |
| 182 | `📌` 置顶 | `<KIcon name="Pin" :size="14">` |
| 189 | `📦` 归档 | `<KIcon name="Archive" :size="14">` |

| 项 | 规范 |
|---|---|
| 高度 | 36px（单行标题）/ 52px（含副标题） |
| 默认 | 文字 `--km-text-secondary` |
| hover | 底 `--km-hover-bg`，操作按钮淡入 |
| **选中** | 底 `--km-accent-soft`，文字 `--km-text`，左侧 2px `--km-accent` |
| 右键菜单 | 重命名/导出 Markdown/绑定工作区/归档/删除 —— **文案含 emoji（i18n 层），须拆分**（见 §3 i18n） |
| 重命名 | 双击标题 → 就地编辑 `<input>`；`Enter` 提交，`Esc` 取消，失焦提交 |
| 删除 | `NPopconfirm` 二次确认 |

---

### 7.14 EmptyState / SkeletonCard / SkeletonList / DataStateBoundary

| 组件 | 规范 |
|---|---|
| **EmptyState** | Props `icon, title, description, actionLabel`；Emits `action`。图标 48px `--km-muted`；标题 `--km-font-lg`/`--km-muted`；描述 `--km-font-sm`/`--km-muted`；垂直居中，`gap: var(--km-space-3)`。**v2 新增**：`actionLabel` 存在时渲染 `type="primary"` 按钮 |
| **SkeletonCard** | 尺寸必须与 `ResourceCard` **完全一致**（避免加载→就绪的布局跳动）；`--km-skeleton-bg` 微光动画 1.4s |
| **SkeletonList** | 行高与目标列表项一致；默认 3 行，可配 |
| **DataStateBoundary** | 5 态 Live / Loading(NSpin) / Empty(NEmpty) / Error(NResult 500) / Offline(NAlert)。**v2 要求**：Empty 分支改用 `EmptyState`，Error 分支必须带「重试」回调，与 §6.10 统一 |

---

### 7.15 B 级组件批量规范表

| 组件 | emoji 整改 | 关键规范 |
|---|---|---|
| `AgentMarkdown.vue` | `📋`(14,53,58)→`Copy`；`✓`(50)→`Check`；`⚠`(57)→`AlertTriangle` | 代码块右上角复制按钮，复制后图标切 `Check` 1.2s；表格横向滚动；链接 `--km-accent` |
| `OutputPanel.vue` | `⛶`(9,143)→`Maximize`；`📋`(203)→`Copy`；`📥`(206)→`Download`；`🔄`(209)→`Refresh`；`🌐`(212)→`World` | 工具条按钮统一 28px 方形，`quaternary`；全屏态 `Esc` 退出 |
| `ShareDialog.vue` | `📋`(157)→`Copy`；`📂`(158)→`FolderOpen` | Modal 宽 480px；复制链接后 Toast「已复制」 |
| `McpManager.vue` | `↻`(70)→`Refresh`；`＋`(95)→`Plus` | 列表项状态点同 §6.4.1 |
| `SkillPanel.vue` | `↻`(51)→`Refresh` | 同上 |
| `SettingsDrawer.vue` | `🚫`(4) 注释内，不整改 | Drawer 宽 400px，右侧滑入 220ms |
| `MonitorSection.vue` | `🧠`(50)`🧪`(53)`🧩`(56)`🔧`(59)`📡`(62)`💬`(65) → 同 §6.9.1 映射 | 指标卡网格，`repeat(auto-fill, minmax(180px,1fr))` |
| `McpManageSection.vue` | `✕`(47)→`X`；`🔌`(113)→`PlugConnected`；`📦`(154)→`Package` | 表格行操作统一 tiny |
| `ModelManageSection.vue` | `＋`(205)→`Plus` | 新增模型走 `AddModelDialog` |
| `SkillManageSection.vue` | `🧩`(44,81)→`Puzzle` | 同市场卡片规范 |
| `ProviderSection.vue` | `🔒`(8) 注释；`⚠`(266)→`AlertTriangle` | API Key 输入 `type="password"` + 眼睛切换；**日志中禁止打印 Key** |
| `ExpertPickerPanel.vue` | `🧑`(138)`💼`(138)→`User`/`Briefcase` | 双列选择，选中打勾 |
| `GeneralSection.vue` | `♻`/`🚫` 均在注释，不整改 | 表单项 label 左对齐、宽 120px |
| `PlaceholderSection.vue` | `🧰`(18)→`Toolbox` | `EmptyState icon="Toolbox" title="功能开发中"` |
| `TerminalPane.vue` | — | **ANSI 40 色硬编码属合理豁免**，须在 §12 登记 |
| `FileTreePane.vue` | — | 树节点 20px 行高；展开箭头 `ChevronRight`，展开旋转 90° |
| `DirPickerModal.vue` | — | 面包屑 + 列表；`Enter` 进入，`Backspace` 上级 |
| `AddModelDialog.vue` | — | 644 行，分步表单；`fetchModelsTimeoutMs=10000` 超时提示 |
| `NewTaskDialog.vue` | — | 表达式实时校验，内联错误 |
| `StatusBar.vue` | — | 高 24px，`--km-font-xs`；连接状态点同 §6.4.1 配色 |
| `MockBadge.vue` | — | 仅 dev 显示，`--km-status-warning` 底 |
| `UsageBar.vue` | — | 与 ContextRing 同色阶 |
| `EntityCard.vue` / `InstalledCard.vue` | — | 继承 §7.3 ResourceCard 全部交互规范 |
| `*Detail.vue`（Expert/Mcp/Skill/Team/Member） | — | 详情面板统一：头部 `[icon] 名称 + 标签`，正文分段，底部主操作固定 |

---

## 第 8 章 反馈与通知体系

### 8.1 五种反馈载体的使用边界（**唯一判据表**）

| 载体 | 何时用 | 何时**禁止** | 位置 | 时长 |
|---|---|---|---|---|
| **Toast**（`message`） | 操作成功、轻量结果（已保存/已复制/已删除） | 表单校验错误；流式过程中的中间态；需要用户决策的事 | 顶部居中，距顶 24px | 成功 1500ms / 错误 3000ms |
| **Notification** | 异步长任务完成（任务运行完/导出完成）、后台事件 | 用户刚点完立即返回的同步操作 | 右上角，距顶 48px、距右 16px | 4500ms，可手动关 |
| **Modal** | 需要用户完整决策或输入的流程（新建/编辑/详情） | 只是展示一句话 | 屏幕居中，遮罩 `rgba(0,0,0,.45)` | 手动关 |
| **Popconfirm** | **所有破坏性操作**（删除/卸载/清空/重置） | 非破坏性操作（徒增点击） | 锚定触发元素 | 手动关 |
| **内联错误** | 表单字段校验、请求失败但上下文明确（消息气泡、卡片内） | 全局性错误 | 紧贴出错元素下方 | 常驻至修正 |

### 8.2 反馈选择决策树

```
操作发生
 ├─ 破坏性？ ──是→ Popconfirm 确认 → 执行 → Toast「已删除」
 ├─ 需要用户输入/决策？ ──是→ Modal
 ├─ 失败了？
 │   ├─ 归属某个字段/某条消息？ ──是→ 内联错误（红字 + 图标 + 重试）
 │   └─ 全局性？ ──是→ Toast(error) 3000ms
 └─ 成功了？
     ├─ 同步、用户在场？ ──是→ Toast(success) 1500ms
     └─ 异步长任务？ ──是→ Notification
```

### 8.3 层级（z-index）

| 层 | z-index | 说明 |
|---|---|---|
| 基础内容 | 0 | — |
| 吸顶/吸底栏 | 10 | PageHeader / SessionConfigBar / StatusBar |
| 拖拽手柄 | 20 | ResizeHandle |
| Popover / Dropdown / Tooltip | 1000 | Naive UI 默认 |
| Modal 遮罩 + 内容 | 2000 | — |
| Notification | 3000 | — |
| **Toast** | **4000** | 恒在最顶，Modal 内操作的 Toast 也必须可见 |

> 全部收敛为 Token：`--km-z-sticky/handle/popup/modal/notification/toast`，**禁止组件内写魔法数字**。

### 8.4 文案语气规范

| 场景 | ✅ 正确 | ❌ 错误 |
|---|---|---|
| 成功 | 「已保存」「已复制」「已删除 3 项」 | 「保存成功！」「操作成功~」（感叹号/颜文字） |
| 失败 | 「保存失败：网络连接超时」+ 重试按钮 | 「出错了」「Error: 500」（无因无解） |
| 确认 | 「删除后不可恢复，确认删除「每日晨报」？」 | 「确定吗？」（未说明后果与对象） |
| 空态 | 「暂无自动化任务」+「新建任务」按钮 | 「没有数据」（死胡同） |
| 加载 | 骨架屏（无文案） | 「加载中...」纯文字 |

**三条硬规则**：① 错误必须给「原因 + 下一步」；② 确认必须点名「对象 + 后果」；③ 全站禁用感叹号与颜文字。

### 8.5 防刷屏规则

| 规则 | 说明 |
|---|---|
| 去重 | 相同内容 Toast 在 2s 内只显示 1 条，重复者仅重置计时 |
| 上限 | 同屏 Toast ≤ 3，超出排队 |
| 流式静默 | 消息流式生成期间**不弹任何 Toast**，错误一律内联 |
| 批量合并 | 批量操作只在结束时汇总一条：「已卸载 3 项，1 项失败」 |

---

## 第 9 章 响应式与布局

### 9.1 断点

| 名称 | 范围 | Token |
|---|---|---|
| `xs` | < 768px | `--km-bp-xs` |
| `sm` | 768 – 1023px | `--km-bp-sm` |
| `md` | 1024 – 1439px | `--km-bp-md` |
| `lg` | 1440 – 1919px | `--km-bp-lg` |
| `xl` | ≥ 1920px | `--km-bp-xl` |

> 桌面 Electron 应用，**主战场是 md/lg**；xs 仅需保证不崩坏，不做移动端优化。

### 9.2 三栏行为矩阵

| 断点 | LeftSidebar | 主区 | RightPanel |
|---|---|---|---|
| `xl` | 260px 常驻 | flex:1 | 420px 常驻 |
| `lg` | 260px 常驻 | flex:1 | 420px 常驻 |
| `md` | 260px 常驻 | flex:1，min 480px | **默认收起**，点击浮层覆盖 |
| `sm` | **折叠为 56px 图标栏** | flex:1 | 收起，浮层 |
| `xs` | **抽屉式**，默认隐藏 | 全宽 | 抽屉式 |

**约束**：`LAYOUT_LIMITS.mainMinWidth = 480px` 是硬底线——主区被压到 480px 时，**优先收右栏，再折左栏**，绝不允许主区低于 480px。

### 9.3 卡片网格

```css
.km-card-grid {
  display: grid;
  gap: var(--km-space-4);
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
}
```

| 断点 | 有效列数（主区 1200px 时） |
|---|---|
| xl / lg | 4–5 列 |
| md | 3–4 列 |
| sm | 2 列 |
| xs | 1 列 |

> 用 `auto-fill + minmax` **自适应**，禁止写死列数媒体查询——列数由可用宽度自然决定。

### 9.4 最小可用尺寸

| 项 | 值 |
|---|---|
| 窗口最小宽 | 900px（Electron `minWidth`） |
| 窗口最小高 | 600px |
| 主区最小宽 | 480px |
| 点击命中区 | ≥ 28×28px（图标按钮）；ResizeHandle 视觉 4px、**命中 8px** |

---

## 第 10 章 动效规范

### 10.1 时长与缓动 Token

| Token | 值 | 用途 |
|---|---|---|
| `--km-dur-instant` | `80ms` | 颜色/透明度微变（hover 变色） |
| `--km-dur-fast` | `180ms` | 常规过渡（卡片 hover、按钮、折叠箭头） |
| `--km-dur-base` | `240ms` | 面板展开/收起、Drawer |
| `--km-dur-slow` | `360ms` | Modal 入场、大区域切换 |
| `--km-ease-out` | `cubic-bezier(0.16, 1, 0.3, 1)` | 入场（快进慢出） |
| `--km-ease-in-out` | `cubic-bezier(0.65, 0, 0.35, 1)` | 位移/尺寸变化 |
| `--km-ease-linear` | `linear` | 循环动画（spinner、脉冲） |

> 现状散落的 `.18s` / `0.2s` / `0.3s` 等字面量**全部替换为 Token**。

### 10.2 允许 / 禁止清单

**✅ 允许**

| 动效 | 属性 | 时长 |
|---|---|---|
| hover 变色 | `background-color`, `color`, `border-color` | instant |
| 卡片抬升 | `transform: translateY(-1px)`, `box-shadow` | fast |
| 操作条淡入 | `opacity` | fast |
| 折叠箭头旋转 | `transform: rotate()` | fast |
| 面板展开 | `height` / `transform: translateX()` | base |
| Modal 入场 | `opacity` + `transform: scale(.98→1)` | slow |
| 骨架微光 | `background-position` | 1400ms linear infinite |
| 状态点脉冲（error） | `opacity`/`transform: scale()` | 1600ms linear infinite |

**❌ 禁止**

| 禁止项 | 原因 |
|---|---|
| 动画 `width`/`height`/`top`/`left`（非必要） | 触发 layout，掉帧 → 改用 `transform` |
| 时长 > 400ms 的交互反馈 | 显迟钝 |
| 弹跳/回弹（`ease-out-back`） | 与「干净克制」定位冲突 |
| 无限循环动画用于非加载语义 | 干扰注意力 |
| 页面切换整页转场 | Electron 内导航应即时 |

### 10.3 `prefers-reduced-motion` 降级（**强制**）

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

降级后**必须保证状态仍可辨识**：脉冲状态点改为静态实心 + `title` 文本；骨架屏改为静态灰块（不闪）。

---

## 第 11 章 无障碍规范

### 11.1 焦点管理（**当前最大缺口**）

| 规则 | 说明 |
|---|---|
| A-1 | 全局 `*:focus-visible { outline: 2px solid var(--km-accent); outline-offset: 2px; }`（`variables.scss:174`）✅ 已存在 |
| A-2 | **严禁裸 `outline:none`**。当前 5 处违规，必须逐一改造 |
| A-3 | 确需自定义焦点样式时，必须提供**等效或更强**的替代：`box-shadow: 0 0 0 2px var(--km-accent-soft), 0 0 0 1px var(--km-accent)` |
| A-4 | Modal 打开时焦点移入 Modal 首个可聚焦元素；关闭后**焦点归还触发元素** |
| A-5 | Modal / Drawer 内焦点循环（Tab 到末尾回到首个），不得逸出到背景 |
| A-6 | `Esc` 关闭最上层浮层（Modal → Popover → Drawer 逐层） |

**5 处 `outline:none` 整改方案**

| # | 场景 | 整改 |
|---|---|---|
| 1–5 | 输入框 / 可编辑区 / 自定义按钮 | 删除 `outline:none`，改用 A-3 的 `box-shadow` 方案；若原意是「去掉鼠标点击时的外框」，改用 `:focus:not(:focus-visible) { outline: none; }`——**保留键盘焦点，仅隐藏鼠标焦点**，这是唯一允许的写法 |

### 11.2 对比度最低标准（WCAG AA）

| 元素 | 最低对比度 | 校验对象 |
|---|---|---|
| 正文文字 | 4.5 : 1 | `--km-text` vs `--km-bg` / `--km-surface-*` |
| 大字（≥18px 或 ≥14px 粗体） | 3 : 1 | 标题 |
| 次要文字 | 4.5 : 1 | `--km-text-secondary` vs 背景 |
| 占位符 / 禁用文字 | 3 : 1 | `--km-muted` |
| 图标（语义性） | 3 : 1 | 状态点、警告图标 |
| 边框 / 分隔线 | 无硬性要求，建议 ≥ 1.5 : 1 | `--km-border` |

**双主题都要过**：每个 Token 对必须在 light 与 dark 下**分别**校验。§2 新定义的 8 个幽灵 Token 值必须先过此关。

### 11.3 键盘可达性

| 要求 | 说明 |
|---|---|
| K-1 | 所有交互元素可 `Tab` 到达；Tab 顺序符合视觉顺序（禁止正数 `tabindex`，只用 `0` / `-1`） |
| K-2 | 卡片、列表项等 `div` 型可点击元素必须 `tabindex="0"` + `role="button"` + `@keydown.enter/@keydown.space` |
| K-3 | 下拉/自动补全支持 `↑↓` 移动、`Enter` 选中、`Esc` 关闭 |
| K-4 | 全站快捷键：`Ctrl/Cmd+K` 搜索、`Ctrl/Cmd+N` 新建会话、`Esc` 关闭浮层、`Ctrl+W` 关闭标签 |
| K-5 | 焦点不得被隐藏元素捕获（`display:none` 的容器内元素必须不可聚焦） |

### 11.4 语义与屏幕阅读器

| 要求 | 说明 |
|---|---|
| S-1 | 用语义标签：`<button>` 而非 `<div @click>`；`<nav>`/`<main>`/`<aside>` 划分区域 |
| S-2 | 纯图标按钮必须 `aria-label`（如「关闭」「重新生成」） |
| S-3 | 装饰性图标 `aria-hidden="true"`（KIcon 默认） |
| S-4 | 状态**不得仅靠颜色**传达 → 状态点必须配 `title` + `aria-label` 文本 |
| S-5 | 流式消息容器 `aria-live="polite"`；错误提示 `aria-live="assertive"` |
| S-6 | 表单字段 `<label for>` 关联；错误用 `aria-describedby` + `aria-invalid="true"` |
| S-7 | Modal `role="dialog"` + `aria-modal="true"` + `aria-labelledby` 指向标题 |
| S-8 | 加载区域 `aria-busy="true"` |

---

## 第 12 章 验收标准（可复现命令 + 量化阈值）

> **本章是整个文档的执行落点。** 历史上出现过「声称 emoji 已清零、实测 124 个」的虚报，根因是**扫描范围只覆盖 `.vue`**。本章所有命令均已固定扫描范围与排除规则，任何人在任何机器上执行都应得到相同数字。

### 12.0 统一前提

```bash
cd packages/client/src        # 所有命令的执行目录
```

**扫描范围**：`--include=*.vue --include=*.ts --include=*.scss`
**通用排除**：`node_modules`、`dist`、`*.d.ts`

### 12.1 验收项总表

| ID | 项目 | 当前实测 | 目标阈值 | 豁免 |
|---|---|---|---|---|
| **C-1** | 幽灵 Token（引用未定义） | 8（3 无 fallback + 5 伪装） | **0** | 无 |
| **C-2** | 影响渲染的硬编码 hex | 27（不含 TerminalPane） | **0** | TerminalPane ANSI 40 色 |
| **C-3** | 功能性 emoji（`.vue` 模板区） | **95**（可整改，机械 97） | **2**（类 B `→` 豁免） | 普查穷举 123 非 ASCII 码位终值：97（机械）− 2（类 B `→`）= 95 位点可整改；旧值 116 为第三套不可复现口径，已作废 |
| **C-4** | 功能性 emoji（`.ts` 数据/i18n 层） | **63** | **0** | 普查终值 63（排除 JSDoc 与 `*.test.ts`）；旧字符类测 47→扩类 62→普查确认 63（见 §12.6 普查口径） |
| **C-5** | 裸 `outline:none` | 5 | **0** | `:focus:not(:focus-visible)` 写法 |
| **C-6** | McpCard 状态硬编码色 | 5 | **0** | 无 |
| **C-7** | theme.ts 双写 hex | 8+ | **0**（改为 JS 调色板常量模块，`theme.ts` 不再硬编码 hex） | 无 |
| **C-8** | 时长字面量（`.18s` 等） | 待测 | **0**（全部 Token 化） | 关键帧内 |
| **C-9** | z-index 魔法数字 | 待测 | **0**（全部 Token 化） | 无 |
| **C-10** | 页面缺错误态 | 6 / 9 | **0** | 无 |
| **C-11** | 对比度 AA 未达标 | 待测 | **0** | 无 |
| **C-12** | 组件直引 primitive 层 Token | 待测 | **0** | 语义层定义处 |
| **C-13** | `＋`（U+FF0B）全角加号按钮 | 8 | **0**（批量替换 IconPlus） | `McpManager / AgentRoleSection / ModelManageSection / JobsView / MemoryView` 的「＋ 新增/添加/新建」按钮 | 普查新增 |
| **C-14** | `×`（U+00D7）乘号关闭按钮 | 5 | **0**（替换 KIcon X） | `ChatInput / MessageList / OutputPanel` 的关闭/取消/解除绑定按钮 | 普查新增 |
| **C-15** | U+FFFD 中文编码损坏 | 5 | **0**（修复原始中文注释） | `App.vue:10 / MessageItem.vue:117 / ExpertDetail.vue:45 / stores/chat.ts:85 / types/dataSource.ts:11`；不影响渲染 | 普查新增 |

> ⚠️ **C-3 / C-4 的普查终值远高于审计基线的「~45 功能性 emoji」**（215 vs ~45，~4.8×）。差异来源见 §12.6 计数口径说明——这是本轮最重要的范围修正。

### 12.2 检测命令（逐项可复现）

> 📌 **本节以 `scripts/uiux-audit.mjs` 为唯一事实来源。** 权威验收命令（一次跑出全部指标）：
> ```bash
> NO_PROXY=localhost,127.0.0.1 node scripts/uiux-audit.mjs --details
> ```
> 通过条件：脚本输出各 metric = 0（如 `functionalEmoji = 0`）。**下方各 C-x 的 grep 为人工抽查辅助，数字一律以脚本为准，grep 结果不得写入任何验收结论。**

**C-1 幽灵 Token**
```bash
# 1) 导出已定义 Token
grep -oP '^\s*--km-[a-z0-9-]+' styles/variables.scss | tr -d ' ' | sort -u > /tmp/defined.txt
# 2) 导出被引用 Token
grep -rhoP 'var\(\s*\K--km-[a-z0-9-]+' --include=*.vue --include=*.scss --include=*.ts . | sort -u > /tmp/used.txt
# 3) 差集 = 幽灵 Token，必须为空
comm -13 /tmp/defined.txt /tmp/used.txt
```
**通过条件**：第 3 步输出行数 = 0。

```bash
# C-1b 伪装硬编码：var(--x, fallback) 形式，整改后应为 0
grep -rnP 'var\(\s*--km-[a-z0-9-]+\s*,' --include=*.vue --include=*.scss . | wc -l
```

**C-2 硬编码 hex**
```bash
grep -rnP '#[0-9a-fA-F]{3,8}\b' --include=*.vue --include=*.scss . \
  | grep -v 'preview/TerminalPane.vue' \
  | grep -vP ':\s*\d+:\s*(\*|//|/\*|<!--)' \
  | wc -l
```
**通过条件**：输出 = 0。

**C-3 `.vue` 功能性 emoji**（权威以脚本 `functionalEmoji` 模板区 = 2 为准；2 个类 B `→` 豁免，不整改）

> ⚠️ 以下 grep 为人工抽查辅助，**口径与权威脚本不同且偏宽**（含类 B 文案标点 `→ ↔`、不做 SFC 分块与三类判定，类 B 定义见 §12.6）。**数字以脚本为准，grep 结果不得写入任何验收结论。**
```bash
# 完整 Unicode 字符类（含 2300–23FF / 25A0–25FF / 2190–21FF，旧类会漏检数据层符号）
grep -rnP '[\x{1F300}-\x{1FAFF}\x{2300}-\x{23FF}\x{25A0}-\x{25FF}\x{2600}-\x{27BF}\x{2B00}-\x{2BFF}\x{2190}-\x{21FF}\x{FF0B}]' --include=*.vue . \
  | grep -vP ':\d+:\s*(\*|//|/\*|<!--)' \
  | wc -l
```
**辅助抽查**：普查已闭合（穷举 123 非 ASCII 码位），模板区 functionalEmoji = 97（机械）/ 95（可整改，−2 类 B `→`）；grep 仅供肉眼核对，不计为验收数字。

**C-4 `.ts` 功能性 emoji**（权威以脚本 `tsEmoji` = 0 为准；辅助标注同 C-3 ⚠️）
```bash
# 完整 Unicode 字符类；必须排除 JSDoc 注释行与 *.test.ts 文件
grep -rnP '[\x{1F300}-\x{1FAFF}\x{2300}-\x{23FF}\x{25A0}-\x{25FF}\x{2600}-\x{27BF}\x{2B00}-\x{2BFF}\x{2190}-\x{21FF}\x{FF0B}]' --include=*.ts . \
  | grep -vP ':\d+:\s*(\*|//|/\*)' \
  | grep -v '\.test\.ts:' \
  | wc -l
```
**辅助抽查**：普查已闭合，tsEmoji = 63；grep 仅供肉眼核对，不计为验收数字。

**C-5 `outline:none`**
```bash
grep -rnP 'outline\s*:\s*(none|0)' --include=*.vue --include=*.scss . \
  | grep -v 'focus-visible' \
  | wc -l
```
**通过条件**：输出 = 0。

**C-6 McpCard 状态色**
```bash
grep -nP '#(27ae60|f39c12|e74c3c|95a5a6)' components/cards/McpCard.vue | wc -l
```
**通过条件**：输出 = 0。

**C-7 theme.ts 双写**
```bash
grep -nP "#[0-9a-fA-F]{6}" styles/theme.ts | wc -l
```
**通过条件**：输出 = 0（改为 JS 调色板常量模块，`theme.ts` 不再硬编码 hex，单一真源由常量模块生成后供 JS 与 SCSS 共消费）。

**C-8 时长字面量**
```bash
grep -rnP 'transition[^;]*\b0?\.\d+s\b|animation[^;]*\b0?\.\d+s\b|\b\d{2,4}ms\b' \
  --include=*.vue --include=*.scss . \
  | grep -v 'variables.scss' | wc -l
```
**通过条件**：输出 = 0。

**C-9 z-index 魔法数字**
```bash
grep -rnP 'z-index\s*:\s*\d+' --include=*.vue --include=*.scss . \
  | grep -v 'variables.scss' | wc -l
```
**通过条件**：输出 = 0。

**C-12 组件直引 primitive**
```bash
grep -rnP 'var\(\s*--km-(gray|blue|green|red|orange)-\d+' --include=*.vue . | wc -l
```
**通过条件**：输出 = 0（组件只准用语义层/组件层）。

### 12.3 人工验收清单（命令测不到的）

| ID | 检查项 | 方法 |
|---|---|---|
| M-1 | 双主题切换后**无任何元素不可见/失联** | 逐页切 light/dark 目视 |
| M-2 | AgentTabBar 选中态可见 | 切主题 × 切标签 |
| M-3 | McpCard 状态点在 dark 下清晰 | 目视 + 对比度取色 |
| M-4 | 9 页面三态齐全（§6.10） | 断网 / 清空数据 / 慢速网络三种模拟 |
| M-5 | 键盘可全程操作（不碰鼠标完成：新建会话→发消息→打开设置→改一项→返回） | 实操 |
| M-6 | 焦点环在所有可交互元素上可见 | Tab 遍历 |
| M-7 | `prefers-reduced-motion` 开启后无动画且状态可辨 | 系统设置切换 |
| M-8 | 窗口拖到 900px 最小宽不崩坏 | 拖拽 |
| M-9 | Toast 不刷屏（连点 10 次保存） | 实操 |
| M-10 | 模型切换真正生效（Y1） | 切模型后看实际请求体 |

### 12.4 合理豁免登记表

**豁免必须登记在此表，未登记的一律视为违规。**

| # | 豁免对象 | 文件 | 理由 | 复核期 |
|---|---|---|---|---|
| E-1 | ANSI 40 色硬编码 | `preview/TerminalPane.vue` | 终端 ANSI 标准色，与主题无关，改 Token 反而失真 | 长期 |
| E-2 | 注释内 emoji / 排印箭头 `→` | 全局 | 不参与渲染，仅文档说明用途（普查发现 93 处注释装饰字符，均不整改） | 长期 |
| E-3 | `:focus:not(:focus-visible) { outline:none }` | 全局 | 仅隐藏鼠标焦点环，保留键盘焦点，符合 A-2 意图 | 长期 |
| E-4 | 关键帧内的时长 | `@keyframes` 定义处 | 动画自身定义，非交互过渡 | 长期 |
| E-5 | `variables.scss` 内的 hex / 数值 | `styles/variables.scss` | Token **定义源**，必须是字面量 | 长期 |
| E-6 | 默认头像 emoji fallback（过渡期） | `composables/use*List.ts` | 分批图标化，过渡期允许 | **本轮结束前清零** |

### 12.5 CI 集成建议

```bash
# ── CI 主门禁（唯一判定依据）── 脚本回归即失败，grep 不参与判定
NO_PROXY=localhost,127.0.0.1 node scripts/uiux-audit.mjs --fail-on-regression || exit 1

# ── 附加人工抽查项（不参与 CI 判定，仅供核对，数字不得写入验收结论）──
# 以下 grep 仅打印，不影响 CI 通过/失败
( cd packages/client/src
  echo "C-1 幽灵Token:    $(comm -13 /tmp/defined.txt /tmp/used.txt | wc -l)"
  echo "C-2 硬编码hex:     ..."   # 见 §12.2
  echo "C-3 vue-emoji:    ..."
  echo "C-4 ts-emoji:     ..."
  echo "C-5 outline:none: ..."
) || true
```

### 12.6 计数口径说明（**防虚报的关键**）

| 口径（`scripts/uiux-audit.mjs` 指标） | 机械总数 | 可整改 | 说明 |
|---|---|---|---|
| `functionalEmoji`（`.vue` 模板区） | 97 | **95**（−2 类 B `→`） | 普查穷举 123 非 ASCII 码位终值；含 93 处注释装饰字符不计入可整改；旧值 116 为第三套不可复现口径，已作废 |
| `sfcScriptEmoji`（`.vue <script>` 内） | 57 | **57** | T3a-3 splitSFC 修复后独立追踪；旧值 56→普查确认 57 |
| `tsEmoji`（`.ts` / `.scss`） | 63 | **63** | 演变链：旧字符类 47→扩类 62→普查确认 63；排除 JSDoc 与 `*.test.ts` |
| **合计** | **217** | **215** | 审计基线 ≈45（~4.8×）；普查基线：`docs/audit/uiux-charset-census-2026-08-07.md` |

**结论**：整改面**终版 215 处（可整改）/ 217 处（机械总数）**，是审计基线估算（~45）的 **~4.8 倍**。数字来源：架构师 T3a-4 普查穷举全部 123 个非 ASCII 码位，逐码位判 A（图标/状态）/ B（文案连接符）/ C（注释装饰）后产出终值。普查已闭合：`verify-scan-coverage.mjs` 闸门二（全非 ASCII 码位白名单）已通过，今后任何新增非 ASCII 字符一进代码库即报警，数字不再变化。详细普查表见 `docs/audit/uiux-charset-census-2026-08-07.md`。

**计数纪律（防虚报关键）**

_A. `.ts` 口径（排除项，主理人裁定）_
- **`.ts` 统计必须排除 JSDoc 注释**（`/** ... */`、`//`、`*` 行内的 emoji 不参与渲染，如 `api/client.ts` 的 `♻️⚠️🔒`、`types/chat.ts` 的 `⚠️🔒`）。
- **`.ts` 统计必须排除 `*.test.ts`** 文件（测试 fixture 内的 emoji 非交付物，如 `stores/agentRoles.test.ts` 的 `🤖🏗️👥`、`composables/useInstall.test.ts` 的 `①` 序号等）。

_B. 全局口径（本轮新增，主理人裁定，三条纪律）_
- **（纪律一·计数单位）** 一切整改面数字必须标注计数单位（**位点 file:line** / 字符 / 文件），不标单位的数字一律视为无效。本项目统一采用**位点**口径：多个图标字符同行记 1 位点（例：`AppNav.vue:79 🌙☀` 一行两字符记 1 位点）。
- **（纪律二·字符类）** 图标字符检测必须使用**标准 Unicode 属性 + 显式补充块**，禁止手工枚举范围。基线字符类须覆盖：`\p{Extended_Pictographic}` + 箭头 `\u2190-\u21FF` + 技术符号 `\u2300-\u23FF` + 几何图形 `\u25A0-\u25FF` + 杂项符号 `\u2600-\u27BF`。**验证样本**：`types/agent.ts` 的 `AGENT_STATUS_ICONS` 14 个状态图标必须一个不漏。

- **（纪律三·扫描器必须自证覆盖）** 声明「扫了什么、没扫什么、为什么」是必要条件，不是充分条件 —— 声明了边界，不等于边界内真的扫全了。任何用于验收的扫描脚本，必须内建**覆盖率自检**：显式计算「已扫描行号集合」，凡落在声明范围内、却未被任何扫描块覆盖、且命中目标模式的行，必须报错并 `exit 1`。**判别口诀**：「你敢证明你扫过的行覆盖了你声称的范围吗？」答不上来，这个数字就不能作为验收依据。**溯源**：验收机制四次自曝漏洞 —— ① 漏数据层（出现≠渲染）② 计数单位不统一（文件/位点/字符）③ 字符类不完整（手工枚举码点）④ **结构性漏扫（SFC 嵌套 template 截断，21 位点）**。前三次都在「声明边界」层面，第四次证明声明边界还不够。

- **（纪律四·单一计数口径）** 全文档任何量化结论只能来自 `scripts/uiux-audit.mjs`。禁止在文档中出现第二套可产生数字的检测方法（手写 grep 区间、目测清单、印象估计）。辅助命令必须显著标注「不得作为验收依据」。**溯源**：本轮发现文档 grep（147）与脚本（109）差 38（**.vue 范围**），其中 27 来自脚本缺陷、3 来自类 B 豁免、8 来自注释粒度 —— 两套口径并存导致每次对数都要重新解释一遍差值，是纪律一/二/三之后的第四类系统性内耗。（注：T3a-4 普查已闭合，全文档数字已统一校准为 `scripts/uiux-audit.mjs` 权威值 217/215。）

**类 B 文案标点豁免（具名样例）**

判定尺子（口诀）：「换成 Tabler 图标后这句话还通顺吗？」—— 若替换后句子读不通（如「更多设置 <IconArrowRight/>」不通顺），则该字符是**文案连接符**而非操作/状态图标，判为类 B、豁免，不计违规。

| 文件:行 | 原文 | 判定 | 备注 |
|---|---|---|---|
| `SettingsDrawer.vue:77` | 更多设置 → | 类 B 正面样例 | 「更多设置 <IconArrowRight/>」不通顺 → 判为文案连接符，豁免 |
| `NewTaskDialog.vue:211` | 设置 → Agent | 类 B 正面样例 | 同上，连接符，豁免 |
| `MemoryView.vue:202` | 取锁 → 备份 → 原子写回 | 类 B 正面样例 | 流程连接符，豁免 |

> ✅ **普查已闭合（T3a-4，2026-08-07）**：架构师穷举全部 123 个非 ASCII 码位，逐码位判定 A/B/C 类产出终值。`verify-scan-coverage.mjs` 双闸门已通过：闸门一（脚本覆盖所有文件行）→ PASS；闸门二（全非 ASCII 码位在白名单内）→ PASS。今后任何新增非 ASCII 字符一旦进入代码库即触发 `--fail-on-regression` 报警。数字演变链：170（T3a-2）→ 195（T3a-3 splitSFC 修复）→ 214（T3a-4 普查）→ **217（→ 改判 +1）**，可整改 **215**。详细码位判定表见 `docs/audit/uiux-charset-census-2026-08-07.md`。

**三条防虚报纪律**
1. 报数必须附**完整命令 + 输出**，不接受「已完成」口头结论。
2. 扫描范围必须含 `.ts`，否则 SettingsNav（12 类）与右键菜单（10 项）会全部漏检。
3. 每轮整改后重跑 §12.2 全套命令，**数字只允许单调下降**。

### 12.7 里程碑目标（M1–M5）

普查闭合后，整改按 5 批推进，每批有明确的量化里程碑目标：

| 里程碑 | 批次 | 核心指标 | 当前→目标 | 判定标准 |
|---|---|---|---|---|
| **M1** | B1（渲染缺陷） | C-1 幽灵 Token / C-5 outline / C-6 状态色 | — → **0** | §12.5 CI 门禁全绿 |
| **M2** | B2（数据层 emoji） | `tsEmoji` | **63→0** | `scripts/uiux-audit.mjs --fail-on-regression` 中 tsEmoji=0 |
| **M3** | B3（模板层 emoji） | `functionalEmoji`（可整改） | **95→0**（2 类 B `→` 豁免不整改） | 脚本 functionalEmoji 模板区 ≤ 2 |
| **M4** | B4（像素尺寸） | 硬编码 px + z-index 魔法数 | — → **0**（全部 Token 化） | C-8/C-9 清零 |
| **M5** | B5（JS 调色板） | theme.ts 双写 hex | 8+ → **0**（常量模块单源） | `theme.ts` 无 hex 字面量 |

> `sfcScriptEmoji`（57）随 B2/B3 自然清零，不需单列里程碑。

---

## 附录 A — Design Token 速查卡

| 分类 | Token | light | dark |
|---|---|---|---|
| 背景 | `--km-bg` | `#ffffff` | `#1e1e1e` |
| 表面 | `--km-surface-1` / `-2` | `#fafafa` / `#f5f5f5` | `#252525` / `#2a2a2a` |
| 文字 | `--km-text` | `#1f1f1f` | `#e8e8e8` |
| 次文字 | `--km-text-secondary` ★新 | `#888888` | `#a0a0a0` |
| 弱化 | `--km-muted` | `#999999` | `#777777` |
| 边框 | `--km-border` | `#e5e5e5` | `#3a3a3a` |
| 主色 | `--km-accent` | `#3b82f6` | `#3b82f6` |
| 主色态 | `--km-accent-hover` / `-pressed` | `#60a5fa` / `#2563eb` | 同 |
| 主色软 | `--km-accent-soft` ★新 | `rgba(59,130,246,.10)` | `rgba(59,130,246,.18)` |
| 主色底 | `--km-accent-bg` ★新（幽灵） | `rgba(59,130,246,.08)` | `rgba(59,130,246,.16)` |
| 危险 | `--km-danger` | `#e74c3c` | `#ff6b5b` |
| 危险底 | `--km-danger-bg` ★新（幽灵） | `rgba(231,76,60,.08)` | `rgba(255,107,91,.16)` |
| 状态 | `--km-status-success/warning/error/unknown` ★新 | `#27ae60`/`#f39c12`/`#e74c3c`/`#95a5a6` | `#3ddc84`/`#ffb454`/`#ff6b5b`/`#8a8a8a` |
| 悬停底 | `--km-hover-bg` | `rgba(0,0,0,.04)` | `rgba(255,255,255,.06)` |
| 图标底 | `--km-icon-bg` ★新（幽灵） | `#f5f5f5` | `#2a2a2a` |
| 文件片 | `--km-file-chip-bg` ★新（幽灵） | `#eef2f7` | `#31363d` |
| 圆角 | `--km-radius-sm/md/lg/full` | `4 / 6 / 10 / 999px` | 同 |
| 间距 | `--km-space-1…8` | `4/8/12/16/20/24/32/40px` | 同 |
| 字号 | `--km-font-xs/sm/md/lg/xl` | `11/12/14/16/20px` | 同 |
| 等宽 | `--km-font-mono` | `ui-monospace, SFMono-Regular, Menlo, monospace` | 同 |
| 阴影 | `--km-shadow-card` | `0 2px 8px rgba(0,0,0,.06)` | `0 4px 16px rgba(0,0,0,.3)` |
| 阴影 | `--km-shadow-card-hover` ★新 | `0 4px 16px rgba(0,0,0,.12)` | `0 6px 24px rgba(0,0,0,.45)` |
| 时长 | `--km-dur-instant/fast/base/slow` ★新 | `80/180/240/360ms` | 同 |
| 缓动 | `--km-ease-out/in-out/linear` ★新 | 见 §10.1 | 同 |
| 层级 | `--km-z-sticky/handle/popup/modal/notification/toast` ★新 | `10/20/1000/2000/3000/4000` | 同 |

★新 = v2 新增或由幽灵 Token 转正。

---

## 附录 B — emoji → Tabler 图标速查表

| emoji | Tabler | 语义 | 出现位置（示例） |
|---|---|---|---|
| `☰` | `Menu2` | 菜单/左栏 | PageHeader:118 |
| `⧉` | `LayoutSidebarRight` | 右栏 | PageHeader:152, ChatView:83 |
| `📜` | `History` | 提问历史 | ChatView:57 |
| `⏹` | `PlayerStopFilled` | 停止 | ChatView:87 |
| `🔍` | `Search` | 搜索 | MarketLayout:13 |
| `✨` | `Sparkles` | 精选 | MarketLayout:37 |
| `＋` | `Plus` | 新增 | Memory/Jobs/McpManager/ModelManage |
| `📋` | `Copy` / `Clipboard` | 复制/剪贴 | 多处（最高频） |
| `📝` | `ClipboardText` | 复制代码 | MessageItem:324 |
| `✎` | `Pencil` | 编辑 | MessageItem:285 |
| `↻` `🔄` | `Refresh` | 刷新/重试 | MessageItem:293,331 |
| `⚠` | `AlertTriangle` | 警告 | MessageItem:298 等 |
| `✓` | `Check` | 完成 | AgentMarkdown:50 |
| `✕` | `X` | 关闭 | McpManageSection:47 |
| `↓` | `ArrowDown` | 回到底部 | MessageList:181 |
| `📄` | `File` | 文件 | ChatInput:310,339 |
| `📁` | `Folder` | 工作区 | SessionConfigBar:140 |
| `📂` | `FolderOpen` | 打开目录 | ShareDialog:158 |
| `📥` | `Download` | 导出/下载 | OutputPanel:206 |
| `📦` | `Package` | 归档/包 | SidebarSessionItem:189 |
| `📌` | `Pin` | 置顶 | SidebarSessionItem:182 |
| `🤖` | `Robot` | 专家/Agent | ExpertCard:100 等 |
| `🧩` | `Puzzle` | 技能 | SkillPanel/SkillManage |
| `🔌` | `PlugConnected` | MCP | McpCard:102 等 |
| `🧠` | `BrandOpenai` | 模型 | SessionConfigBar:195 |
| `🎯` | `Target` | 目标/模式 | ChatInput:250 |
| `🛠` `🔧` | `Tool` | 工具 | SkillCard:79 |
| `🧰` | `Toolbox` | 工具箱 | PlaceholderSection:18 |
| `📊` | `ChartBar` | 统计 | AppNav:28 |
| `💬` | `MessageCircle` | 聊天 | AppNav:25 |
| `⚙` | `Settings` | 设置 | AppNav:36 |
| `🌙` / `☀` | `Moon` / `Sun` | 主题 | AppNav:78 |
| `🔐` | `Lock` | 审批 | ApprovalCard:15 |
| `❓` | `HelpCircle` | 澄清 | ClarifyCard:18 |
| `🛡` | `Shield` | 权限 | SessionConfigBar:165 |
| `📡` | `Antenna` | 供应商 | MonitorSection:62 |
| `🧪` | `Flask` | 诊断 | MonitorSection:53 |
| `⏰` | `Clock` | 定时 | layout.ts:130 |
| `👤` `🧑` | `User` | 个人资料 | layout.ts, ExpertPicker:138 |
| `💼` | `Briefcase` | 专家团 | ExpertPickerPanel:138 |
| `🎛️` | `Adjustments` | 通用设置 | layout.ts:120 |
| `⛶` | `Maximize` | 全屏 | OutputPanel:9,143 |
| `🌐` | `World` | 网页/外链 | OutputPanel:212 |
| `🗑` | `Trash` | 删除 | i18n `session.delete` |
| `👋` | （移除） | 空态问候 | i18n `empty.chat`——**删除 emoji，不替换** |

---

## 附录 C — 开放问题（已全部决策）

> 主理人于 T2 验收后逐项裁决。下列 Y1–Y7 均已「已决策」，含理由与所属批次，文档自洽、可直接排期。
> 批次定义：**B1 首批**＝渲染缺陷（幽灵 Token＋状态色＋outline）＋Y3；**B2 数据/i18n 层**＝63 处 `.ts` emoji（tsEmoji，含 Y4 最小改动）；**B3 模板层**＝95 处 `.vue` 模板区 emoji（functionalEmoji 可整改，机械 97−2 类 B `→`，含 Y7）；**B4 像素尺寸**＝773px 硬编码尺寸；**B5 末批**＝theme.ts 双写→JS 调色板常量模块（Y2）。

| # | 问题 | 决策状态 | 理由 | 所属批次 |
|---|---|---|---|---|
| **Y1** | `SessionConfigBar` 模型切换未真正生效 | **已决策：本轮不做，登记技术债** | 功能缺陷（请求体未真正切换模型），非样式问题，需架构师独立排期改请求链路，不应混入 UI 整改 | 技术债（不在本轮 5 批内） |
| **Y2** | `theme.ts` 与 `variables.scss` 双写颜色 | **已决策（经逆转）：JS 调色板常量模块作单一真源** | 初裁采用 `getComputedStyle` 读 CSS 变量（单一真源、根除主题漂移）；**架构师技术复核后逆转**——`getComputedStyle` 为运行时读取，有性能开销且时序依赖 DOM 已挂载，不宜作主题真源。改为新建 JS 调色板常量模块：编译期静态可分析、一处定义两处消费（JS + SCSS 生成）、可被 lint 约束。逆转发起人：架构师。批次不变（B5）。 | **B5（末批）** |
| **Y3** | 市场页 `primaryTabs[].count` 恒为 0 | **已决策：并入首批** | 由 `useMarketList` 实际分组数回填，属渲染正确性，与首批渲染缺陷同源，低成本同批解决 | **B1（首批）** |
| **Y4** | i18n 文案内嵌 emoji（20 处） | **已决策：本轮做，但最小改动** | 仅删 i18n 字符串内 emoji、调用处渲染 `KIcon`，**不改动类型定义**（仅 20 处，`locales/zh-CN.ts` 10 + `locales/en.ts` 10，成本可控） | **B2（数据/i18n 层）** |
| **Y5** | **整改面 215 处（可整改）/ 217 处（机械）≫ 审计估算 45 处** | **已决策：分 5 批，数据层先于模板层** | 先清数据层（B2，63 处）再清模板层（B3，95 处可整改），像素尺寸（B4，773px）单列，避免一次性大改引发回归 | **B1→B2→B3→B4→B5** |
| **Y6** | `LeftSidebar.vue` 967 行 | **已决策：本轮不做，登记技术债** | 可维护性重构，非阻塞缺陷，架构师后续独立排期拆分 3 个子组件 | 技术债（不在本轮 5 批内） |
| **Y7** | `AppNav.vue` 审计未收录 | **已决策：已在本文档补入（§7.12）** | 7 个 emoji 已纳入 §7.12 与 C-3 扫描范围，随模板层一并整改 | **B3（模板层）** |

---

*文档结束*
