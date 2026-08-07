# kmaster-studio 增量 PRD：P1 收尾 + P2 增强 + 布局规范化

> **基线 PRD**：`docs/prd/kmaster-redesign-2026-08-07.md`（T01-T05 已实现，commit `c688e4f`）
> **基线设计**：`docs/design/kmaster-redesign-2026-08-07.md`
> **分支**：`feat-client-homepage-sidebar`
> **技术栈不变**：Vue3 + Vite + Naive UI + Pinia + Koa BFF

---

## 一、项目信息

| 字段 | 内容 |
|------|------|
| **语言** | 简体中文 |
| **项目代号** | `kmaster_continue_2026` |
| **原始需求** | P1 收尾（7 项）+ P2 增强（4 项）+ 新增布局/主题规范（3 项），共 14 项变更 |

---

## 二、产品目标（本次增量）

1. **收尾 P1 会话体验闭环**：补全分享页、Agent 多标签切换、文件/Skills/MCP 附件标签、上下文用量可视化、模型菜单入口、设置详情面板，使会话交互页成为完整工作台。
2. **落地 P2 锦上添花功能**：语音输入占位实现、快捷键可配置、资源卡片行列可调、分类标签显示数量，提升易用性与信息密度。
3. **规范化卡片与市场布局**：统一 ResourceCard 固定布局、主题色适配 dark/light mode、MarketLayout 分类标签与排序同行，消除视觉不一致。

---

## 三、用户故事（增量）

| # | 用户故事 | 对应需求 |
|---|---------|---------|
| US-K1 | 作为用户，在会话分享页我能看到当前会话的完整配置（Agent/Model/Mode/Skills/MCP）并一键复制 JSON，而不是拿到一个 404 死链 | K01.1 |
| US-K2 | 作为用户，在专家团会话中点击不同 Agent 标签，ChatPanel 能切换显示我与该 Agent 的对话历史和任务输出 | K01.2 |
| US-K3 | 作为用户，选择多个文件后以文件名/缩略图标签平铺在输入框上方，最多 5 个，超出显示"更多{N}个文件" | K01.3 |
| US-K4 | 作为用户，勾选 Skills/MCP 后在附件行看到对应的标签，一眼确认会话挂载了哪些能力 | K01.4 |
| US-K5 | 作为用户，悬停上下文用量环能看到 "xx%: xxxkb/xxxkb 上下文已使用" 的详细信息 | K01.5 |
| US-K6 | 作为用户，在模型菜单底部看到"添加模型"入口，在发送按钮旁能选择 interrupt/steer/queue 发送模式 | K01.6 |
| US-K7 | 作为用户，在设置页点击资源卡片后右栏展示详细信息（图标、名称、状态、简介、大小、URL、关键词） | K01.7 |
| US-K8 | 作为用户，我能用语音输入问题（Web Speech API 基础实现） | K02.1 |
| US-K9 | 作为用户，我能在设置中选择 Enter 或 Ctrl+Enter 作为发送快捷键 | K02.2 |
| US-K10 | 作为用户，我能在设置中调整市场页卡片每行数量，适配不同屏幕宽度 | K02.3 |
| US-K11 | 作为用户，市场页大分类标签上能看到该分类的资源数量（如"专家 (8)"） | K02.4 |
| US-K12 | 作为用户，资源卡片在深色/浅色模式下自动适配背景、文字、边框颜色，不刺眼不模糊 | N1 |
| US-K13 | 作为用户，所有资源卡片遵循统一的固定布局，信息层级清晰一致 | N2 |
| US-K14 | 作为用户，市场页分类标签和排序规则在同一行（左分类、右排序），操作更紧凑 | N3 |

---

## 四、需求池

> 仅列本次增量新增/变更项。原 PRD 中已实现项不重复列出。

### P0 — 本次必须实现

| 编号 | 需求 | 当前状态 | 变更描述 |
|------|------|---------|---------|
| **K01.1** | 会话分享页重写 | ShareDialog.vue 生成 404 死链；RightPanel share 模式已含 JSON 展示 | 废弃 ShareDialog.vue 中的死链生成逻辑；RightPanel share 模式保留并增强：show 当前会话配置 JSON（Agent/Model/Mode/Skills/MCP），支持一键复制，不再生成死链 |
| **K01.2** | Agent 专家团多标签切换 | AgentTabBar.vue 已建，emit `select(agentId)` 已定义；ChatView/ChatPanel 未响应切换 | ChatView 监听 AgentTabBar `@select` → 切换 `store.activeAgentId` → ChatPanel 按 agentId 过滤消息列表显示。单 Agent 会话仅一个标签且不可关闭。无 agentId 的旧消息显示在 default 标签下 |
| **K01.3** | 文件/图片上传 → 标签平铺 | ChatInput "+"菜单已有文件入口；chips 机制已有；`visibleFileChips` 仅 slice(0,5) 未显示"更多" | (a) "+"菜单"选择文件"支持 `multiple`；(b) 图片文件 chip 显示缩略图（`<img>` 40×40 圆角）；(c) 普通文件 chip 显示文件名 + 文件类型图标；(d) 最多显示 5 个 chip，第 6 个起聚合为 `+{N} 更多文件` 标签；(e) 超出 5 个时附件行末尾显示 `更多{N}个文件` NTag |
| **K01.4** | Skills/MCP 勾选 → NTag 标签 | ChatInput chips 已有（但使用自定义 `.km-chip` 样式） | 附件行 chips 改用 Naive UI `NTag` 组件（closable），Skill 标签前缀 🧩、MCP 标签前缀 🔌，关闭标签同时取消勾选 |
| **K01.7** | 设置页卡片 → 右栏详情 | MarketLayout `handleCardClick` 为空；SettingsView 无 RightPanel | SettingsView 右侧新增 `RightPanel`（与 ChatView 中 RightPanel 复用同一组件或新建 setting 版本），点击卡片展示：资源图标、名称、installed 标签、安装/卸载/召唤按钮、简介、大小、URL/目录（可点击打开）、分类、关键词标签 |

### P1 — 应该实现

| 编号 | 需求 | 当前状态 | 变更描述 |
|------|------|---------|---------|
| **K01.5** | 上下文用量可视化增强 | ContextRing.vue 已建，SessionConfigBar 已有 NTooltip 包裹，tooltip 格式为"已用 X / 总计 Y tokens (Z%)" | tooltip 格式改为 `xx%: xxxkb/xxxkb 上下文已使用`（KB 单位），颜色阈值保持 <70% 绿 / 70-90% 黄 / >90% 红 |
| **K01.6** | 模型菜单 + 发送模式 dropdown | SessionConfigBar 已有 model dropdown（含"添加模型…"）+ sendMode dropdown（interrupt/steer/queue 三选一） | (a) 模型菜单"添加模型…"点击后跳转到 `/settings/model`；(b) 发送模式图标从 emoji 改为 Naive UI icon 或简洁文字；(c) sendMode dropdown 放发送按钮旁（而非底栏），与发送按钮并排 |
| **K02.4** | 大分类标签标明资源数 | primaryTabs 有 `count: number` 字段但未渲染 | MarketLayout 的 primaryTabs 标签文案改为 `{{ tab.label }} ({{ tab.count }})`，count 从数据源动态计算 |

### P2 — 锦上添花

| 编号 | 需求 | 当前状态 | 变更描述 |
|------|------|---------|---------|
| **K02.1** | 语音输入 | ChatInput 语音按钮 🎤 占位存在，无功能 | 点击 🎤 按钮调用浏览器 Web Speech API（`SpeechRecognition`），录音中按钮变红脉冲动画，识别结果填入 textarea。不支持时 toast 提示"浏览器不支持语音输入"。仅 Chrome/Edge 支持 |
| **K02.2** | 发送快捷键可配置 | ChatInput `onKey` 硬编码 Enter（非 Shift）发送 | (a) GeneralSection 新增"发送快捷键"设置项（`Enter` / `Ctrl+Enter`），存入 `localStorage` 或 Pinia；(b) ChatInput `onKey` 读取设置决定发送行为；(c) 默认 Enter |
| **K02.3** | 资源卡片行列数可配置 | useMarketList 硬编码 `PAGE_SIZE = 10`（2行×5列）；MarketLayout 使用 flex-wrap 无列数控制 | (a) GeneralSection 新增"市场卡片列数"设置项（3-8 列，默认 5）；(b) MarketLayout 读取设置 → CSS Grid `grid-template-columns: repeat(N, 1fr)` 替代 flex-wrap；(c) useMarketList `PAGE_SIZE` 改为 `cols × 2` |
| **N1** | 卡片主题色适配 | ResourceCard 使用 CSS 变量但可能未完整覆盖 dark mode | (a) 深色模式：`--km-card-bg: rgba(255,255,255,0.04)`，`--km-card-border: rgba(255,255,255,0.08)`；(b) 浅色模式：`--km-card-bg: #fff`，`--km-card-border: #e8e8e8`；(c) NTag 在深色模式下使用 `type="info"` 弱化颜色；(d) 使用 Naive UI `useThemeVars` 或全局 CSS 变量注入 |
| **N2** | 卡片布局规范 | ResourceCard 当前布局：icon → name → desc → tags → actions，但 icon 和 name 上下排列 | 严格按规范重排：**第一行** 左侧 icon+name 同行（icon 32×32 + name flex-1），右侧 installed 标签 + 安装/召唤按钮 + 卸载按钮（如已安装）；**中间** 简介 2 行截断；**底部行** 分类（category）NTag + 关键词（tags）NTag 平铺，颜色弱化（`type="default"` size="tiny"） |
| **N3** | 市场页分类标签与排序同行 | MarketLayout `ml-primary-tabs` 和 `ml-sort-bar` 分两行 | 合并为一行：`display:flex; justify-content:space-between`，左侧 NButton group（分类标签），右侧 NDropdown（排序：综合/最热/最新），排序从 NButton group 改为 NDropdown 下拉选择 |

---

## 五、UI 设计稿（仅改动组件）

### 5.1 ResourceCard 新布局（N2）

```
┌─────────────────────────────────┐
│ [icon]  Agent Name    [installed] │  ← 第一行：左 icon+名，右标签+按钮
│         简介简介简介…   [卸载][召唤]│
│         简介第二行截断…            │
│                                  │  ← 主体：简介（2行截断）
│ [分类] [关键词1] [关键词2]       │  ← 底部行：分类 + 关键词 NTag
└─────────────────────────────────┘
```

### 5.2 ChatInput 附件行（K01.3 + K01.4）

```
┌──────────────────────────────────────────────┐
│ [🧩 code-reviewer ×] [🔌 github ×]           │  ← Skills/MCP NTag（K01.4）
│ [📄 report.pdf ×] [🖼 screenshot.png ×]      │  ← 文件 chip（K01.3）
│ [📄 data.csv ×] [+3 更多文件]                │  ← 超出 5 个聚合
├──────────────────────────────────────────────┤
│ [+] ┌──────────────────────────────────┐ [🎤][➤]│
│     │ 输入您的问题...                    │        │
│     └──────────────────────────────────┘        │
└──────────────────────────────────────────────┘
```

### 5.3 MarketLayout 分类+排序同行（N3 + K02.4）

```
┌──────────────────────────────────────────────────────────┐
│ [专家 (42)] [专家团 (15)] [本地 (8)]    综合 ▼           │  ← 左：分类标签（含数量），右：排序 NDropdown
│ [推荐] [开发] [运维] [安全] [数据] ... [更多▼]           │  ← 领域标签行不变
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──│
│ │ ResourceCard × N                                     │  ← CSS Grid，列数可配置
│ └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──│
└──────────────────────────────────────────────────────────┘
```

### 5.4 SettingsView 右栏详情（K01.7）

```
┌──────────────────────────────────────┬──────────────────┐
│  SettingsView (MarketLayout)         │  RightPanel      │
│  ┌──────────┐ ┌──────────┐           │                  │
│  │ 卡片1    │ │ 卡片2  ← 点击       │  🤖 Agent Name   │
│  └──────────┘ └──────────┘           │  [installed]     │
│  ┌──────────┐ ┌──────────┐           │  [安装] [召唤]   │
│  │ 卡片3    │ │ 卡片4    │           │                  │
│  └──────────┘ └──────────┘           │  简介文本…       │
│                                      │                  │
│                                      │  大小: 1.2 MB    │
│                                      │  URL: /agents/…  │
│                                      │  分类: 开发      │
│                                      │  关键词: [代码]  │
│                                      │        [审查]    │
└──────────────────────────────────────┴──────────────────┘
```

### 5.5 SessionConfigBar 发送模式位置（K01.6-c）

```
┌──────────────────────────────────────────────────────────┐
│ [📁] worksp  [🤖] default  [🛡] Craft    ⚡45%  [🧠] gpt │  ← 底栏不变
└──────────────────────────────────────────────────────────┘

ChatInput 行：
┌──────────────────────────────────┐ [Queue ▼] [🎤] [➤]   │  ← 发送模式 dropdown 移到发送按钮旁
│ 输入您的问题...                   │                       │
└──────────────────────────────────┘
```

---

## 六、影响文件清单

| 文件 | 变更类型 | 涉及需求 |
|------|---------|---------|
| `packages/client/src/components/chat/ShareDialog.vue` | **修改** | K01.1（移除死链，改为配置 JSON 展示） |
| `packages/client/src/components/chat/RightPanel.vue` | 修改 | K01.1（增强 share 模式），K01.7（复用到 Settings） |
| `packages/client/src/components/chat/AgentTabBar.vue` | 修改 | K01.2（支持 select 事件链路） |
| `packages/client/src/views/ChatView.vue` | 修改 | K01.2（监听 AgentTabBar select → 切换消息视图） |
| `packages/client/src/components/chat/ChatPanel.vue` | 修改 | K01.2（按 agentId 过滤消息列表） |
| `packages/client/src/components/chat/ChatInput.vue` | **修改** | K01.3（文件多选 + 缩略图 + 更多{N}），K01.4（NTag 替换 chip），K02.1（语音），K02.2（快捷键） |
| `packages/client/src/components/chat/SessionConfigBar.vue` | 修改 | K01.6（添加模型跳转路由，sendMode 移到 ChatInput 旁） |
| `packages/client/src/components/chat/ContextRing.vue` | 修改 | K01.5（tooltip 格式 KB 单位） |
| `packages/client/src/components/common/ResourceCard.vue` | **重写** | N1（主题色），N2（布局规范） |
| `packages/client/src/components/common/MarketLayout.vue` | 修改 | K02.4（分类数量显示），K02.3（CSS Grid），N3（分类+排序同行） |
| `packages/client/src/views/SettingsView.vue` | 修改 | K01.7（右栏详情面板） |
| `packages/client/src/composables/useMarketList.ts` | 修改 | K02.3（动态 PAGE_SIZE） |
| `packages/client/src/components/settings/GeneralSection.vue` | 修改 | K02.2（快捷键设置项），K02.3（列数设置项） |
| `packages/client/src/stores/chat.ts` | 修改 | K01.2（activeAgentId 状态管理） |

---

## 七、待确认问题

| # | 问题 | 影响范围 |
|---|------|---------|
| Q1 | Agent 多标签切换时，ChatPanel 的消息过滤是以 `message.agentId` 字段为准，还是需要在 store 中维护 `agentMessages` 映射？当前消息结构是否包含 agentId？ | K01.2 |
| Q2 | 设置页右栏详情面板（K01.7）是复用 ChatView 的 RightPanel 组件，还是新建独立的 SettingsDetailPanel？复用可能需要扩展 mode 枚举 | K01.7 |
| Q3 | Web Speech API 在 Windows 桌面端（Electron/WebView2）是否可用？若不支持，是否需要降级方案？ | K02.1 |
| Q4 | K02.6-c：sendMode dropdown 从底栏 SessionConfigBar 移到 ChatInput 发送按钮旁——这是否会导致 SessionConfigBar 中 sendMode 入口被移除？还是两边都有？ | K01.6 |
| Q5 | K02.3 市场卡片列数设置 —— 设置值应存在 localStorage（前端）还是后端用户配置？ | K02.3 |
| Q6 | ResourceCard 的 category 字段当前数据源中是否已填充？若未填充，底部行"分类"标签是否显示"未分类"还是隐藏？ | N2 |
