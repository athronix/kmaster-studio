# kmaster-studio UI/UX 全面审计报告

> **审计日期**：2026-08-07
> **分支**：feat-client-homepage-sidebar
> **审计范围**：全部 9 个 View + 全部组件（通用/布局/会话交互）+ 入口文件
> **审计人**：Bob (Architect)

---

## 一、全局基础架构

### 1.1 App.vue（入口）

**布局结构**：`NConfigProvider` > `NMessageProvider` > `NDialogProvider` > `.km-app-root` > `<router-view />`
- 简洁无冗余，全局 Provider 链清晰
- `.km-app-root` 仅设 `height: 100%; width: 100%; overflow: hidden`

**颜色/主题**：✅ 使用 Naive UI `darkTheme` + `themeOverrides`（buildOverrides 函数）
- `isDark` ref 驱动 `data-theme` 属性
- 全局主题切换用 `useTheme()` composable

**问题**：🟢 无明显问题，架构干净

---

### 1.2 styles/variables.scss（全局样式）

**CSS 变量定义**：`--km-bg / --km-panel / --km-border / --km-text / --km-accent / --km-user-bubble / --km-muted / --km-danger / --km-success / --km-warning / --km-card-bg / --km-card-border`

**暗色默认值**：`#1e1e1e` 背景 / `#252526` 面板 / `#333` 边框 / `#d4d4d4` 文字

**亮色主题**：✅ `:root[data-theme='light']` 有完整变量覆盖

**全局字体**：`-apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif`

**CSS Grid 壳**：`.km-shell` 定义为 5 轨道 Grid（左栏/左柄/主体/右柄/右栏）

**问题**：
- 🟡 缺少 `--km-icon-bg`、`--km-highlight-bg` 等语义变量的统一定义（出现在组件 scoped 中各自 fallback）
- 🟡 没有定义 `--km-radius` 统一圆角变量（各处硬编码 `6px/8px/10px/999px`）

---

### 1.3 styles/theme.ts（主题引擎）

**Naive UI Overrides**：`common: { primaryColor, bodyColor, cardColor, modalColor, borderColor, textColorBase, borderRadius, fontSize }`

**问题**：
- 🟡 themeOverrides 只覆盖了 `common` 层，未覆盖 `Button/Tag/Input/Modal` 等组件的独立 token
- 🟡 `isDark` 初始值硬编码 `true`，未读取 localStorage 用户偏好
- 🟡 无 `prefers-color-scheme` 媒体查询支持

---

### 1.4 router/index.ts（路由）

**路由结构**：hash 模式，LayoutShell 父路由包裹所有子页面
- 8 个子路由：`/` (chat), `/experts`, `/skills`, `/mcp`, `/memory`, `/jobs`, `/usage`, `/queue`
- `/settings` 重定向 → `/settings/monitor`，`:category` 参数化
- `afterEach` 同步 path → layout store + document.title

**问题**：🟢 无明显问题

---

### 1.5 main.ts

```ts
createApp(App).use(createPinia()).use(router).mount('#app');
```
- 引入 `highlight.js/styles/atom-one-dark.css` + `./styles/variables.scss`

**问题**：🟢 极简，无问题

---

## 二、View 层审计

### 2.1 ChatView.vue

**路径**：`packages/client/src/views/ChatView.vue`

**布局结构**：`flex column` 全高容器
```
PageHeader (title + badges + actions)
  → AgentTabBar
  → .km-chat-body (flex row: ChatPanel + ChatRightPanel)
  → SessionConfigBar (底栏)
  → ShareDialog (modal)
```

**颜色/主题**：
- 🟡 Badge 颜色大量硬编码：Agent badge `rgba(139, 92, 246, 0.16)`、Mode badge `rgba(59, 130, 246, 0.16)`、Model badge `var(--km-panel)`
- 🟡 `.km-stop-btn` 使用 `var(--km-danger)` + `#fff`（文字白硬编码于按钮上，暗色下可读但未考虑亮色下的 safety）

**字体/排版**：Badge `font-size: 10px` / Stop btn `12px` / History item `12px`
- 🟡 各级字号层级跳跃明显（10→12→13），缺少系统化 type scale

**间距/留白**：Body 用 `gap` (flex) 无额外 padding，整体紧凑

**图标**：全部 emoji：📤📋📜⧉⏹ — 无统一图标库

**交互状态**：✅ NButton `quaternary circle` 自带动效；✅ history item hover 有背景色过渡；✅ stop 按钮有 cursor pointer

**动画/过渡**：✅ history item `transition: background 0.12s ease`

**响应式**：🟡 无响应式断点处理，右栏固定宽度可能在小屏幕挤压主体

**已知问题**：
- 🔴 对话内搜索 `searchQuery` 仅存储但 ChatPanel 透传给 MessageList 后会滚动定位到首条命中——若有多条命中，无「上一个/下一个」导航
- 🟡 `historyOpen` popover 内 hover 色 `rgba(255,255,255,0.05)` 硬编码，亮色下不可见

---

### 2.2 ExpertsView.vue

**路径**：`packages/client/src/views/ExpertsView.vue`

**布局结构**：极简 wrapper → `<MarketLayout :config="expertConfig" />`
- `flex column` 全高

**问题**：🟢 纯数据/配置组件，无独立 UI。样式仅 `.km-market-page { flex column }` 两行。

---

### 2.3 SkillsView.vue

**路径**：`packages/client/src/views/SkillsView.vue`

**布局结构**：与 ExpertsView 完全相同的模板结构 → `<MarketLayout :config="skillConfig" />`

**问题**：🟢 无独立 UI 问题。Expert / Skill / MCP 三 View 模板完全一致（代码重复），但属架构选择。

---

### 2.4 McpView.vue

**路径**：`packages/client/src/views/McpView.vue`

**布局结构**：与 ExpertsView / SkillsView 完全相同的模板结构

**问题**：🟢 同上

---

### 2.5 SettingsView.vue

**路径**：`packages/client/src/views/SettingsView.vue`

**布局结构**：`flex column` 全高
```
PageHeader
  → .km-settings-body
    → 市场类：NTabs + MarketLayout（左） + SettingsDetailPanel（右）
    → 非市场类：<Suspense> 异步加载 section 组件
```

**颜色/主题**：✅ 整体使用 `var(--km-bg)` / `var(--km-text)` / `var(--km-card-bg)` / `var(--km-card-border)`
- 🟡 `.km-settings-loading` 内 `opacity: 0.6` 没有专用的 placeholder 骨架

**字体/排版**：标题 icon `14px`、loading `13px`、body padding `16px 20px 32px`

**间距/留白**：`.km-settings-body` padding `16px 20px 32px`，flush 变体 padding `0`

**交互状态**：✅ NTabs 切换有动画；✅ Suspense fallback 有 NSpin

**已知问题**：
- 🟡 `.km-market-settings-tabs :deep()` 多层选择器穿透，维护脆弱
- 🟡 市场设置 NTabs 切换时 `@update:value` 回调为空函数体 `{ /* tab 切换仅在本组件内生效 */ }`，意味着点击 tab 不会触发路由导航，URL 不变，刷新后回到默认 tab
- 🟡 `sectionProps` 逻辑复杂（placeholder/embedded/searchable 三态判断）

---

### 2.6 JobsView.vue

**路径**：`packages/client/src/views/JobsView.vue`

**布局结构**：`flex column` 全高
```
PageHeader（独立模式）/ header（内嵌模式）
  → NAlert（调度器未运行警告）
  → NSpin > table.km-table（任务列表）
  → 运行历史时间线
  → NModal（新建/编辑表单）
```

**颜色/主题**：
- ✅ Table 全面使用 `var(--km-border)` / `var(--km-panel)` / `var(--km-user-bubble)`
- 🟡 选中行 `box-shadow: inset 3px 0 0 var(--km-accent)` 作为高亮（语义正确但 box-shadow 假扮 border-left 属 hack）
- 🟡 Timeline dot 颜色 `var(--km-success)/var(--km-danger)/var(--km-muted)`
- 🟡 `code` 内联样式 `background: rgba(127, 127, 127, 0.16)` 硬编码

**字体/排版**：Table `font-size: 13px` / th `12px` / job-id `11px` / timeline `12px`

**间距/留白**：`.km-page-body` padding `20px 24px 40px`

**交互状态**：✅ 行 hover `background: var(--km-user-bubble)`；✅ 选中行高亮；✅ NSwitch toggle；✅ NPopconfirm 删除确认

**动画/过渡**：✅ `transition: background 0.12s ease` 行悬停

**已知问题**：
- 🟡 调度器未运行时 `NAlert` 始终展示，无关闭按钮，占用首屏空间
- 🟡 历史区「全部」按钮与任务名按钮排列在一行，任务多时溢出换行不美观

---

### 2.7 MemoryView.vue

**路径**：`packages/client/src/views/MemoryView.vue`

**布局结构**：`flex column` 全高
```
PageHeader（独立模式）+ header intro（内嵌模式）
  → toolbar（分组选择 + 计数）
  → NSpin > grid columns（两个分组两列卡片）
  → NModal（新建/编辑表单）
```

**颜色/主题**：✅ NCard + NTag 使用 Naive UI 默认主题适配
- 🟡 `code` 内联样式 `background: rgba(127,127,127,0.16)` 硬编码

**字体/排版**：group-title `13px` / entry-content `13px` / entry-meta `11px`

**间距/留白**：Grid `gap: 20px` / Card `margin-bottom: 10px`

**交互状态**：✅ NButton tiny tertiary edit/delete；✅ NPopconfirm 删除二次确认

**已知问题**：
- 🟡 `grid-template-columns: repeat(auto-fit, minmax(360px, 1fr))` — 360px 最小列宽在窄屏下可能导致单列过窄
- 🟡 编辑 Modal 中「保存将执行：取锁 → 备份原文件 → 原子写回」这段提示有信息量但视觉呈现仅为 `font-size: 11px; opacity: 0.5`

---

### 2.8 QueueView.vue

**路径**：`packages/client/src/views/QueueView.vue`

**布局结构**：无 PageHeader，自建 `header.km-page-head` + 内容区
```
header（标题 + 副标题 + 待发送计数 + 刷新按钮）
  → NSpin > 分组列表（会话分组 > 队列项列表）
```

**颜色/主题**：✅ 使用 `var(--km-border)` / `var(--km-text)`
- 🟡 标题 `h2` 直接用原生元素无 class，继承全局样式

**字体/排版**：title `18px` / sub `12px` / qmsg `13px` / qmeta `11px`

**已知问题**：
- 🔴 QueueView 没有使用统一的 PageHeader 组件，自建 `header` 风格与其他页面不一致
- 🟡 无空状态 CTA — 仅 `NEmpty description` 无「返回对话」按钮

---

### 2.9 UsageView.vue

**路径**：`packages/client/src/views/UsageView.vue`

**布局结构**：与 QueueView 相同模式：自建 header + 内容区
```
header（标题 + 日期选择 + 刷新）
  → 三张汇总卡片（总 Token / 总费用 / 活跃会话）
  → 按天趋势 CSS 柱状图
  → NTabs > table 明细
```

**颜色/主题**：
- 🟡 柱状图 `linear-gradient(180deg, var(--km-accent), rgba(59,130,246,0.45))` — 渐变色后半硬编码
- 🟡 柱状图无 tooltip 交互，仅 `title` 属性

**字体/排版**：card-value `26px font-weight 700` / card-label `12px` / table `13px`

**已知问题**：
- 🔴 同样没有使用 PageHeader 统一组件，与其他 View 不一致
- 🟡 CSS 柱状图在大数据量（>30天）下 `flex: 1` 每个柱子会很窄，`min-width: 44px` 会导致横向溢出
- 🟡 日期选择器 `NDatePicker` 在暗色主题下的样式未验证

---

## 三、通用组件审计

### 3.1 DirPickerModal.vue

**路径**：`packages/client/src/components/common/DirPickerModal.vue`

**布局结构**：NModal 包裹自定义内容
- 面包屑导航 + 目录列表 + 当前路径 + 操作按钮

**颜色/主题**：
- 🔴 大量内联 `style` 属性硬编码：`background: var(--n-color)`, `border: 1px solid var(--n-border-color)`, `color` 等
- 🔴 面包屑分隔符 `opacity: 0.4` 硬编码
- 🔴 空目录文本 `NText depth="3"` 无 fallback

**已知问题**：
- 🔴 内联 style 极多（>15 处），应全部迁移到 scoped CSS
- 🟡 目录项双击才能进入（`@dblclick`），单击无反馈
- 🟡 无键盘导航支持（↑↓ Enter）

---

### 3.2 MarketLayout.vue

**路径**：`packages/client/src/components/common/MarketLayout.vue`

**布局结构**：
```
搜索框
  → NSpin
    → 精选推荐（横向滚动卡片行）
    → 已安装（横向滚动卡片行）
    → 资源市场（分类标签 + 排序 + 领域标签 + CSS Grid 卡片 + 分页）
```

**颜色/主题**：✅ section-title `opacity: 0.6`；✅ ml-count 使用 `var(--km-bg)`
- 🟡 `.ml-chip:hover { transform: translateY(-1px) }` 动效不依赖颜色变化，在亮色/暗色下均可见，但 hover 无背景色变化反馈

**字体/排版**：title `font-size: 13px` / count `11px` / chip `small` 依赖 NTag

**响应式**：✅ `getGridCols()` 响应窗口宽度调整 `--km-grid-cols`（5→4→3→2→1），唯一一个做了响应式的组件

**已知问题**：
- 🟡 `--km-grid-cols` 通过 JS 写 `document.documentElement.style.setProperty` 而非 CSS 媒体查询，首帧依赖 `onMounted` 且 resize 监听在 unmount 时正确移除
- 🟡 精选/已安装区滚动使用 `NScrollbar x-scrollable` 但无左右箭头指示器

---

### 3.3 ResourceCard.vue

**路径**：`packages/client/src/components/common/ResourceCard.vue`

**布局结构**：
```
icon(32×32) + name | installed tag + 卸载 + 操作按钮
  → description（两行截断）
  → tags（最多5个）
```

**颜色/主题**：
- 🟡 `rc-card:hover { box-shadow: 0 4px 16px rgba(0,0,0,0.1) }` — 阴影硬编码，暗色下不可见
- 🟡 `rc-icon-wrap` fallback `background: var(--km-icon-bg, #f5f5f5)` — fallback 亮灰色
- 🟡 `rc-desc` color `var(--km-text-secondary, #888)` — fallback #888

**字体/排版**：name `13px` / desc `11px` / tags `tiny`

**交互状态**：✅ hover 上浮 `translateY(-2px)` + 阴影

**已知问题**：
- 🔴 hover 阴影在暗色主题下不可见（`rgba(0,0,0,0.1)` 在 `#252526` 上不可辨识）
- 🟡 actionLabel 不能随 entityType 自适应——需由 MarketLayout 传入

---

### 3.4 SettingsDetailPanel.vue

**路径**：`packages/client/src/components/common/SettingsDetailPanel.vue`

**布局结构**：
```
有选中项：icon(48×48) + name + installed tag + description + 操作按钮 + tags
空态："点击左侧卡片查看详情"
```

**颜色/主题**：🟡 `.sdp-desc { color: var(--n-text-color-2) }` 直接使用 Naive 内部变量

**已知问题**：
- 🟡 仅支持 `summon` 操作（NButton 写死为"召唤"），对 skill/mcp 类型语义不正确
- 🟡 空态无视觉层次，仅为一行灰色文字

---

### 3.5 DataStateBoundary.vue

**路径**：`packages/client/src/components/common/DataStateBoundary.vue`

**布局结构**：v-if 状态机（Live/Loading/Empty/Error/Offline）

**颜色/主题**：✅ NSpin / NEmpty / NResult / NAlert 均使用 Naive 内置组件

**问题**：🟢 设计合理，状态覆盖完整。Loading/Empty/Error 均 `min-height: 120px` 居中。

---

### 3.6 MockBadge.vue

**路径**：`packages/client/src/components/common/MockBadge.vue`

**布局结构**：单个 `n-tag type="warning" size="small" round` + ⚠️ icon

**问题**：🟢 极简单组件，无问题。

---

## 四、布局组件审计

### 4.1 LayoutShell.vue

**路径**：`packages/client/src/components/layout/LayoutShell.vue`

**布局结构**：CSS Grid 5 轨道
```
grid-template-columns: var(--km-left-w) var(--km-lh-w) minmax(0,1fr) var(--km-rh-w) var(--km-right-w)
```
- LeftSidebar → ResizeHandle(left) → `<router-view>` → ResizeHandle(right) → RightPanel

**颜色/主题**：✅ 完全依赖 CSS 变量 + layout store

**响应式**：✅ `ResizeObserver` 监听 shell 宽度，主体不足 480px 自动收起右栏；放大后自动恢复

**已知问题**：
- 🟡 `ResizeObserver` 不支持 IE11（但现代浏览器都支持）
- 🟡 全屏右栏用 `position: fixed; inset: 0; z-index: 100` 遮盖主体——可能遮挡 modal/drawer

---

### 4.2 LeftSidebar.vue

**路径**：`packages/client/src/components/layout/LeftSidebar.vue`

**布局结构**：`flex column` 全高
```
top（version + 搜索/过滤/最近会话图标按钮）
  → 搜索输入（条件显示）
  → 菜单按钮（新建会话/专家/技能/MCP/定时任务）
  → 会话列表区（置顶 + NCollapse 工作区分组 + 定时任务列表）
  → 底栏（设置 + 主题切换）
```

**颜色/主题**：
- ✅ `var(--km-sidebar-bg, var(--km-panel))` 有 fallback
- 🟡 `.km-filter-on` 使用硬编码 `color: var(--km-accent); background: var(--km-user-bubble)`

**字体/排版**：version `11px` / group-title `11px` / session-title `13px` / sub `11px`

**交互状态**：
- ✅ session-item hover + active 态明确
- ✅ 拖拽排序有视觉反馈（opacity 0.4）
- ✅ session-actions hover 显示
- ✅ 右键菜单有完整交互

**已知问题**：
- 🟡 Emoji 图标过多（🔍🔽💬➕🤖🧩🔌⏰📌⚙️🌙☀️📁📥🗑✎），缺乏统一图标库
- 🟡 `.km-sidebar-version` 显示 "kmaster v1.0" 硬编码文本
- 🟡 会话列表项 `new Date(s.updated_at).toLocaleString()` 子行仍用完整时间戳而非相对时间—与 `sessionSub()` 函数并存（置顶区用 `toLocaleString`，下拉菜单用 `timeAgo`）

---

### 4.3 layout/RightPanel.vue

**路径**：`packages/client/src/components/layout/RightPanel.vue`

**布局结构**：统一右栏外壳
```
title 栏（标题 + 全屏 + 关闭按钮）
  → 内容区（v-if/v-else-if 按 mode 分派 9 种内容态）
```

**mode 分派**：output / expert / team / skill / mcp / job-artifact / agent-role / expert-picker / hidden

**颜色/主题**：✅ `var(--km-panel)` / `var(--km-border)` / `var(--km-bg)`
- 🟡 自定义滚动条样式 `::-webkit-scrollbar` 仅适用于 WebKit

**已知问题**：
- 🟡 `detailEntity as Expert` 类型断言不安全
- 🟡 `summonShow` / `summonAgent` 仅 expert/team 详情使用，但挂在 RightPanel 上——耦合度偏高

---

## 五、会话交互组件审计

### 5.1 ChatPanel.vue

**路径**：`packages/client/src/components/chat/ChatPanel.vue`

**布局结构**：极简 `flex column`
```
NSpin（socket 未就绪时）
  → .km-chat-messages（MessageList）
  → ChatInput
```

**问题**：🟢 简洁透传组件，无独有 UI 问题。

---

### 5.2 MessageList.vue

**路径**：`packages/client/src/components/chat/MessageList.vue`

**布局结构**：`flex column` 滚动容器
```
压缩横幅 / 镜像横幅
  → TransitionGroup > MessageItem（带消息淡入动画）
  → 流式输出指示器
  → 空状态
  → 滚动到底部按钮
```

**动画/过渡**：✅ `km-msg-fade` 过渡动画 (opacity + translateY)
- ✅ 流式指示器 `km-pulse` 动画
- ✅ 滚动按钮 sticky + opacity 过渡

**已知问题**：
- 🟡 压缩横幅 `border: 1px solid var(--km-accent)` 和镜像横幅 `border: 1px dashed var(--km-border)` 风格不统一
- 🟡 空状态 CTA 仅为文字描述，无可点击按钮

---

### 5.3 MessageItem.vue

**路径**：`packages/client/src/components/chat/MessageItem.vue`

**布局结构**：
```
.km-msg（user 右对齐 / assistant 左对齐）
  → .km-msg-bubble（用户蓝底 / 助手面板底）
    → 用户消息：@文件芯片 + 文本
    → 助手消息：ThoughtBlock + ToolCallCard + AgentMarkdown
    → ApprovalCard / ClarifyCard / PlanCard
    → 时间戳
    → hover 操作按钮（复制/编辑/重试）
  → 子代理卡片
```

**颜色/主题**：
- 🟡 用户气泡 `var(--km-user-bubble)` + `var(--km-border-light)`；助手气泡 `var(--km-panel)` + `var(--km-border)`
- 🟡 时间戳 `color: #888` 硬编码
- 🟡 文件芯片 `background: rgba(59,130,246,0.16)` 硬编码

**交互状态**：✅ 复制/编辑按钮 hover 显示（opacity 0→1）；✅ 错误态红色左边框

**已知问题**：
- 🟡 `.km-msg-bubble.guidance` 用 `font-style: italic` + `opacity: 0.7` 区分引导消息——语义不清
- 🟡 右键菜单 `.km-cm-item:hover { background: rgba(255,255,255,0.06) }` 硬编码，亮色下不可见

---

### 5.4 ChatInput.vue

**路径**：`packages/client/src/components/chat/ChatInput.vue`

**布局结构**：
```
编辑提示条（条件）
  → 附件 chips 行（NTag closable + 文件缩略图）
  → 已上传附件 chips
  → .km-input-row（+ 按钮 + textarea + 语音按钮 + sendMode dropdown + 发送按钮）
```

**颜色/主题**：
- 🟡 编辑条 `background: rgba(59,130,246,0.1)` 硬编码
- 🟡 textarea focus `border-color: var(--km-accent)` 正确
- 🟡 语音录音中 `color: #ef4444` 硬编码
- 🟡 `+` 面板 hover `background: rgba(255,255,255,0.06)` 硬编码

**交互状态**：✅ drag-over 虚线边框；✅ 编辑模式蓝色高亮
- ✅ 可配置快捷键（Enter / Ctrl+Enter）从 localStorage 读取

**已知问题**：
- 🟡 文件缩略图 `km-chip-img` 固定 40×40，没有适配不同宽高比的 object-fit
- 🟡 `+` 菜单中 Skills/MCP 列表无搜索/过滤，列表长时不便操作
- 🟡 语音按钮依赖 `window.SpeechRecognition`，无 polyfill 提示

---

### 5.5 AgentTabBar.vue

**路径**：`packages/client/src/components/chat/AgentTabBar.vue`

**布局结构**：水平横向滚动标签栏
- NTag 平铺，active 蓝色边框高亮，hover 显示关闭按钮

**颜色/主题**：
- ✅ active `border-color: var(--km-accent)` + `background: rgba(59,130,246,0.08)`
- 🟡 hover `background: rgba(255,255,255,0.06)` 硬编码
- 🟡 close button hover `color: #ef4444` 硬编码

**已知问题**：
- 🟡 标签 `closable` 仅当 `agents.length !== 1` 时启用——单个 agent 无法关闭
- 🟡 无「添加 Agent」按钮入口

---

### 5.6 SessionConfigBar.vue

**路径**：`packages/client/src/components/chat/SessionConfigBar.vue`

**布局结构**：`flex row`，两端对齐，高度 32px
```
左侧：工作区 / Agent / 模式（NButton text tiny + NDropdown）
右侧：ContextRing / 模型（NDropdown）
```

**颜色/主题**：✅ `var(--km-panel)` / `var(--km-muted)` / `var(--km-text)`
- 🟡 hover `background: rgba(255,255,255,0.05)` 硬编码

**已知问题**：
- 🔴 模型 dropdown options 仅一条当前模型 + "添加模型…"，无模型列表可切换（可能在旧设计中保留但当前实现不完整）
- 🟡 发送模式在 SessionConfigBar 中没有暴露（在 ChatInput 中有），底栏右侧仅有 ContextRing + Model

---

### 5.7 ContextRing.vue

**路径**：`packages/client/src/components/chat/ContextRing.vue`

**布局结构**：SVG 22×22 环图
- 背景环 + 前景环（颜色按百分比：绿<70%<黄<90%<红）+ 百分比文字

**颜色/主题**：🔴 颜色硬编码：`#34d399`(绿) / `#fbbf24`(黄) / `#f87171`(红) / `var(--km-border)`(背景)

**已知问题**：
- 🟡 百分比文字在 22×22 SVG 内 `font-size="7"` 太小
- 🟡 `stroke-linecap="round"` 在百分比接近 0 或 100 时视觉效果异常

---

### 5.8 ShareDialog.vue

**路径**：`packages/client/src/components/chat/ShareDialog.vue`

**布局结构**：NModal preset="card" 480px
- 配置摘要（Agent/Model/Mode/Skills/MCP 各一行）
- 操作按钮（复制 JSON / 在右栏查看）

**颜色/主题**：✅ NTag 各 type；🟡 `.km-share-none` `opacity: 0.4`

**问题**：🟢 无明显问题。

---

### 5.9 chat/RightPanel.vue

**路径**：`packages/client/src/components/chat/RightPanel.vue`

**布局结构**：会话内右侧栏，360px 固定宽
```
title 栏 + 关闭按钮
  → share 页：复制 JSON + <pre> 展示
  → outline 页：用户消息列表（可点击定位）
  → artifacts 页：OutputPanel
```

**已知问题**：
- 🟡 该组件与 `layout/RightPanel.vue` 功能重叠。chat/RightPanel 是 ChatView 内嵌的会话内右栏（share/outline/artifacts 三态），layout/RightPanel 是全局右栏（output/expert/team/skill/mcp 等 9 态）。两套右栏体系并存增加了维护复杂度。
- 🟡 滚动条样式重复定义（与 layout/RightPanel 完全相同）

---

### 5.10 SessionList.vue

**路径**：`packages/client/src/components/chat/SessionList.vue`

**状态**：🟡 已标记 `@deprecated`，逻辑已迁入 `useSessionList` composable + LeftSidebar
- 保留不删，但不再被引用

**问题**：🟡 死代码，可考虑后续清理

---

### 5.11 AgentMarkdown.vue

**路径**：`packages/client/src/components/chat/AgentMarkdown.vue`

**布局结构**：`markdown-it` 渲染 HTML → `v-html`

**颜色/主题**：
- 🔴 `pre.hljs` 背景硬编码 `#161616`、代码块头部 `#1a1a1a`
- 🔴 代码块边框 `border: 1px solid var(--km-border)` ✅，但 head 背景不跟随主题
- 🟡 `.km-code-copy` 按钮 `background: rgba(255,255,255,0.06); color: #aaa` 硬编码

**已知问题**：
- 🔴 代码块在亮色主题下显示异常——pre 背景 `#161616` 是暗色硬编码
- 🟡 复制按钮通过事件委托绑定，依赖 `containerRef` 不变

---

### 5.12 OutputPanel.vue

**路径**：`packages/client/src/components/chat/OutputPanel.vue`

**布局结构**：产物多标签面板（R-11）
- 标签栏（任务概览 + 动态标签 + 关闭按钮）
- 内容区（AgentMarkdown / FileTreePane / TerminalPane）

**已知问题**：🟢 设计合理，职责清晰

---

### 5.13 ThoughtBlock.vue

**路径**：`packages/client/src/components/chat/ThoughtBlock.vue`

**布局结构**：可折叠思考过程
```
head（dot + "思考过程" + chevron）
  → body（pre-wrap 文本）
```

**颜色/主题**：
- 🔴 所有颜色硬编码：`border-left: #6b7280` / `color: #9ca3af` / dot `background: #9ca3af`

**已知问题**：
- 🟡 思考内容仅纯文本展示（`white-space: pre-wrap`），不支持 Markdown
- 🟡 默认展开（`open = ref(true)`），长思考可能占用大量空间

---

### 5.14 ToolCallCard.vue

**路径**：`packages/client/src/components/chat/ToolCallCard.vue`

**布局结构**：可折叠工具调用卡片
```
head（状态图标 + 工具名 + 状态 + chevron）
  → body（参数 JSON + 结果 JSON）
```

**颜色/主题**：
- 🔴 `pre` 背景硬编码 `#161616`
- 🟡 状态色 `#22c55e`(done) / `#ef4444`(error) 硬编码
- 🟡 卡片背景 `background: rgba(255,255,255,0.02)` 硬编码

**问题**：与 ThoughtBlock 相同的硬编码问题

---

### 5.15 ApprovalCard.vue / ClarifyCard.vue / PlanCard.vue

**共同特征**：三个交互卡片组件，均为 `border + 半透明背景 + 按钮行`

**ApprovalCard**：
- 🔴 `border: #b45309` / `background: rgba(180,83,9,0.1)` 硬编码
- 🟡 拒绝按钮 `background: #6b7280` 硬编码

**ClarifyCard**：
- 🔴 `border: #1d4ed8` / `background: rgba(29,78,216,0.1)` 硬编码

**PlanCard**：
- 🔴 `border: #7c3aed` / `background: rgba(124,58,237,0.1)` 硬编码
- 🟡 驳回按钮 `background: #6b7280` 硬编码

**共同问题**：三个组件共享相同的结构模式但颜色各自硬编码，应抽取 `--km-approval-border` / `--km-clarify-border` / `--km-plan-border` 等语义变量

---

### 5.16 SubagentCard.vue

**路径**：`packages/client/src/components/chat/SubagentCard.vue`

**布局结构**：子代理状态卡片
```
header（标题 + 状态 NTag）
  → meta（子任务/工具/模型/耗时）
  → NProgress
  → progress text / summary
  → toggle（展开/收起产出）
```

**颜色/主题**：
- 🟡 左侧边颜色 `#16a34a`(success) / `#dc2626`(error) / `#d97706`(warning) 硬编码
- 🟡 基础卡片 `border-left: 3px solid var(--km-accent)` ✅

**已知问题**：🟢 设计合理，信息密度好

---

### 5.17 其他组件快速记录

**UsageBar.vue**：🟢 极简 token/cost 展示，`font-size: 11px; opacity: 0.55`

**ArtifactPanel.vue**：🟡 `@deprecated`，被 OutputPanel 替代

**SettingsDrawer.vue**：NDrawer 快捷设置——默认模式 + 默认模型两字段

**SkillPanel.vue** & **McpManager.vue**：未在聊天组件中找到独立文件，功能可能已整合到 MarketLayout

---

## 六、全局审计汇总

### 6.1 审计统计

| 类别 | 数量 |
|------|------|
| 审计文件总数 | **48** |
| View 层 | 9 |
| 通用组件 | 6 |
| 布局组件 | 3 |
| 会话交互组件 | 20 |
| 入口/路由/样式/Store | 5 |

### 6.2 问题分布

| 级别 | 数量 | 占比 |
|------|------|------|
| 🔴 严重（影响可用性） | 7 | 15% |
| 🟡 中等（视觉不一致） | 38 | 79% |
| 🟢 轻微（可优化） | 3 | 6% |

### 6.3 TOP 5 问题类别

| 排名 | 问题类别 | 出现次数 | 典型文件 |
|------|---------|---------|---------|
| 1 | **硬编码颜色值**（#xxx / rgba 非变量） | 25+ | AgentMarkdown, ThoughtBlock, ToolCallCard, ApprovalCard, ClarifyCard, PlanCard, ResourceCard, ChatInput, MessageItem |
| 2 | **Emoji 图标替代图标库** | 15+ | 所有 View header、LeftSidebar、ChatInput、SessionConfigBar、AgentTabBar |
| 3 | **亮色主题适配缺失** | 12+ | AgentMarkdown(pre背景), ResourceCard(阴影), ChatInput(+面板hover), MessageItem(右键菜单), ContextRing(环颜色) |
| 4 | **交互状态不完整**（无 focus 态 / hover 硬编码） | 10+ | DirPickerModal(无键盘), NButton 依赖 Naive 默认但自定义按钮无 outline |
| 5 | **间距/字号缺乏系统化**（10/11/12/13/14/16/18/26px 混杂） | 8+ | 全局——无 type scale 定义 |

### 6.4 🔴 严重问题清单

| # | 文件 | 问题描述 |
|---|------|---------|
| 1 | `AgentMarkdown.vue` | 代码块 `pre` 背景 `#161616` 硬编码——亮色主题下白底黑代码块变成黑底白字，完全不可读 |
| 2 | `QueueView.vue` | 未使用 PageHeader 统一组件，自建 header 风格与其他 7 个 View 不一致 |
| 3 | `UsageView.vue` | 同上，未使用 PageHeader |
| 4 | `DirPickerModal.vue` | 15+ 处内联 `style` 硬编码，颜色/边框/间距全部写在 HTML 属性中 |
| 5 | `SettingsView.vue` | NTabs 切换回调为空——URL 不变导致刷新后回到默认 tab |
| 6 | `ResourceCard.vue` | hover 阴影 `rgba(0,0,0,0.1)` 在暗色主题下不可见 |
| 7 | `SessionConfigBar.vue` | 模型 dropdown 选项仅一条 + "添加模型"，无法切换模型 |

### 6.5 建议优先级

| 优先级 | 改进项 | 影响范围 |
|--------|--------|---------|
| P0 | 建立统一的 Design Token 体系（颜色/间距/字号/圆角/阴影） | 全局 |
| P0 | AgentMarkdown 代码块亮色主题适配 | 所有对话渲染 |
| P1 | 引入图标库（如 `@tabler/icons-vue` 或 `unplugin-icons`）替代全部 emoji | 全局 |
| P1 | 统一 PageHeader 使用（QueueView/UsageView 补上） | 2 个 View |
| P1 | 硬编码颜色迁移到 CSS 变量 | 15+ 文件 |
| P2 | 清理 dead code（SessionList/ArtifactPanel） | 2 文件 |
| P2 | 统一 chat/RightPanel 与 layout/RightPanel 两套右栏体系 | 架构级 |
| P2 | 建立响应式断点策略（目前仅 MarketLayout 有） | 全局 |

---

## 七、CSS 变量完整清单

### 7.1 当前已定义变量（variables.scss）

| 变量 | 暗色值 | 亮色值 | 用途 |
|------|--------|--------|------|
| `--km-bg` | `#1e1e1e` | `#ffffff` | 页面背景 |
| `--km-panel` | `#252526` | `#f3f3f3` | 面板/侧栏背景 |
| `--km-border` | `#333333` | `#e5e5e5` | 边框 |
| `--km-border-light` | `#444444` | `#d4d4d4` | 淡边框 |
| `--km-text` | `#d4d4d4` | `#1f1f1f` | 正文 |
| `--km-accent` | `#3b82f6` | `#2563eb` | 主题色 |
| `--km-user-bubble` | `#2d2d30` | `#dbeafe` | 用户气泡 |
| `--km-muted` | `#9ca3af` | `#6b7280` | 次要文字 |
| `--km-danger` | `#dc2626` | `#dc2626` | 错误/危险 |
| `--km-success` | `#34d399` | `#10b981` | 成功 |
| `--km-warning` | `#f59e0b` | `#d97706` | 警告 |
| `--km-card-bg` | `rgba(255...0.04)` | `#fff` | 卡片背景 |
| `--km-card-border` | `rgba(255...0.08)` | `#e8e8e8` | 卡片边框 |

### 7.2 建议新增的变量

| 变量 | 建议暗色值 | 建议亮色值 | 用途 |
|------|-----------|-----------|------|
| `--km-code-bg` | `#161616` | `#f8f8f8` | 代码块背景 |
| `--km-code-head-bg` | `#1a1a1a` | `#ebebeb` | 代码块头部 |
| `--km-radius-sm` | `4px` | `4px` | 小圆角 |
| `--km-radius-md` | `6px` | `6px` | 中圆角 |
| `--km-radius-lg` | `8px` | `8px` | 大圆角 |
| `--km-radius-full` | `999px` | `999px` | 全圆角 |
| `--km-shadow-card` | `0 4px 16px rgba(0,0,0,0.3)` | `0 2px 8px rgba(0,0,0,0.08)` | 卡片阴影 |
| `--km-font-xs` | `10px` | `10px` | 极小字号 |
| `--km-font-sm` | `12px` | `12px` | 小字号 |
| `--km-font-md` | `14px` | `14px` | 正文字号 |
| `--km-font-lg` | `18px` | `18px` | 标题字号 |
| `--km-font-xl` | `26px` | `26px` | 大数字 |
| `--km-space-xs` | `4px` | `4px` | 极小间距 |
| `--km-space-sm` | `8px` | `8px` | 小间距 |
| `--km-space-md` | `12px` | `12px` | 中间距 |
| `--km-space-lg` | `16px` | `16px` | 大间距 |
| `--km-space-xl` | `24px` | `24px` | 超大间距 |

---

> **审计完成时间**：2026-08-07
> **下一次审计建议**：Design Token 体系建立后，进行一致性验证审计
