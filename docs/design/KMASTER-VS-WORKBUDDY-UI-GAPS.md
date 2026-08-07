# kmaster-studio 与 WorkBuddy UI/功能差异分析

> **分析日期**：2026-08-12
> **分析对象**：kmaster-studio M5（当前 `HEAD`）vs WorkBuddy v5.2.6（参照物）
> **方法**：逐文件审查全部 6 个视图 + 23 个组件 + 5 个 store + CSS 变量 + 路由表 + desktop preload
> **对照文档**：`M5-VS-WORKBUDDY-DIFF.md`（功能面对齐度 78%）

---

## 1. 总体概览

kmaster-studio 当前 UI 处于 **「功能骨架完整，体验细节稀疏」** 的阶段。三栏布局、消息气泡、工具调用卡片、子代理卡片、Artifact 面板、内置终端、设置整页等核心结构均已建立，但与 WorkBuddy 相比存在两类差距：

- **显性差距（代码缺失）**：自动滚动、消息时间戳、压缩横幅渲染、SubagentCard 集成、会话搜索、上下文余量指示、快捷键体系、消息复制按钮、加载态/错误态——这些在 WorkBuddy 中是标配，在 kmaster 中要么未实现，要么写了组件但未接入渲染。
- **隐性差距（体验细节）**：过渡动效极少、面板尺寸不可调节、无拖拽排序、无右键菜单、无障碍属性稀疏、空状态文案过时（仍写"Mock 模式"）。

好消息是差距的**修复成本普遍很低**——大部分是「加一个 div / 调一个 watch / 导一个组件」级别的工作。

---

## 2. UI 布局与导航

| WorkBuddy | kmaster-studio | 差距 | 完善建议 |
|-----------|---------------|------|---------|
| IDE 侧栏 / 独立窗口 | Electron 独立窗口（1440×900 默认），`ChatView.vue` 三栏 grid：260px + 1fr + 340px | 版式相似但面板宽度硬编码，用户不可拖拽调节 | **P1**：在 SessionList 右边界和 ArtifactPanel 左边界加 `resize: horizontal` 手柄 |
| 会话列表在左侧栏 | `SessionList.vue`（260px），显示标题+时间，hover 显示改名/删除，当前项蓝色左边框高亮 | **无搜索/过滤**——会话多了找不到 | **P0**：`SessionList.vue` 顶部加 `NInput` 搜索框，本地过滤 `store.sessions` |
| 顶栏模式/模型切换 | `AppNav.vue` 顶栏仅导航链接+主题按钮；ChatInput 底栏有模式/模型 select | 模式/模型切换埋在输入区底部，WorkBuddy 在顶栏更显眼 | **P1**：`ChatPanel.vue:17-25` 的 header 区域复用 ChatInput 的 `NSelect` 展示当前 mode/model，与 WorkBuddy 对齐 |
| 响应式：小屏隐藏 ArtifactPanel | `ChatView.vue:46-49`：`max-width:1100px` 隐藏右侧面板 | 仅一档断点，无折叠/展开按钮 | **P2**：加一个侧栏折叠按钮，允许用户手动切换面板显隐 |
| 页面拓扑：5 个管理页 + 设置 | `router/index.ts`：chat / memory / jobs / usage / queue / settings（6 条路由） | 路由数对齐；管理页均为懒加载 | — |
| 面板管理 | ArtifactPanel 双 Tab（预览 / 终端）+ 三个抽屉（SkillPanel / McpManager / SettingsDrawer） | 抽屉从右侧滑出（Naive NDrawer），与 WorkBuddy 的独立窗口不同但功能等价 | — |

---

## 3. 聊天体验

| WorkBuddy | kmaster-studio | 差距 | 完善建议 |
|-----------|---------------|------|---------|
| 消息气泡：用户右对齐，AI 左对齐 | `MessageItem.vue:58`：`.km-msg.user` `justify-content: flex-end`，AI 靠左 | ✅ 对齐 | — |
| 思考过程折叠块 | `ThoughtBlock.vue`：左侧灰竖线 + 可折叠，「思考过程」标题 | ✅ 对齐，默认展开 | — |
| 工具调用卡片 | `ToolCallCard.vue`：工具名 + 状态图标 + 折叠参数/结果 JSON | ✅ 对齐 | — |
| **消息时间戳** | **❌ 完全没有**——`MessageItem.vue` 不渲染任何时间信息 | WorkBuddy 每条消息都有时间 | **P0**：`MessageItem.vue:58` 气泡内底部加 `<span class="km-msg-time">{{ formatTime(message.created_at) }}</span>` |
| **自动滚动到底部** | **❌ 完全没有**——`MessageList.vue` 无 `scrollToBottom` 逻辑，新消息来了不滚 | 用户必须手动滚到底部 | **P0**：`MessageList.vue` 加 `watch(messages, () => nextTick(() => scrollToBottom()))` + 一个「滚动到底部」浮动按钮 |
| **流式输出指示器** | **❌ 没有**——AI 回复进行中时无任何视觉提示（无闪烁光标、无「正在输入…」、无脉冲动画） | WorkBuddy 有明确的 streaming 动画 | **P0**：`MessageList.vue` 最后一条 assistant 消息为 running 时，底部渲染一个脉冲圆点或「正在生成…」 |
| **消息复制按钮** | **❌ 没有**——用户无法一键复制 AI 回复 | WorkBuddy 每条助手消息有复制按钮 | **P1**：`MessageItem.vue` 助手气泡右上角 hover 显示复制图标，调用 `navigator.clipboard.writeText` |
| **编辑/重发用户消息** | **❌ 不支持**——用户消息发出后不可编辑，不可重发 | WorkBuddy 允许编辑后重新发送 | **P1**：`MessageItem.vue` 用户气泡 hover 显示编辑按钮，点击回填到 ChatInput |
| 文件上传：拖拽/粘贴 | `ChatInput.vue`：`onDrop` + `fileInput` 支持拖拽和点击上传 | ✅ 对齐 | — |
| 附件 chip 展示 | `ChatInput.vue:130-137`：`v-for` 渲染 chip，带 × 移除 | ✅ 对齐 | — |
| @文件 引用解析 | `MessageItem.vue:28-43`：用户消息中的 `@path` 解析为蓝色可点击芯片 | ✅ 对齐 | — |
| 模式切换：3 种 | `CHAT_MODES`：Craft / Plan / Ask（3 种） | WorkBuddy 有 5 种（+debug/+code-explorer），但这是 hermes 生态差异，有意识不做 | — |
| 模型选择：filterable select | `ChatInput.vue:113`：`filterable` 模型下拉，focus 时加载模型列表 | ✅ 对齐 | — |
| 生成中「引导(steer)」 | `ChatInput.vue:147`：运行中时 send 按钮变「↪ 引导」 | ✅ 对齐 | — |
| 停止按钮 | `ChatPanel.vue:24`：运行中时 header 右侧显示「⏹ 停止」红色按钮 | ✅ 对齐 | — |

---

## 4. 功能模块逐项分析

### 4.1 会话管理

| WorkBuddy | kmaster-studio | 差距 | 完善建议 |
|-----------|---------------|------|---------|
| 会话 CRUD | `SessionList.vue`：新建/改名/删除 | ✅ | — |
| **会话搜索** | **❌ 无**——`SessionList.vue` 无任何搜索/过滤 | 会话超过 20 个后基本不可用 | **P0**：`SessionList.vue:27` 头部下方加 `<NInput v-model:value="search" placeholder="搜索会话…">`，`list` computed 加 `.filter()` |
| **会话导出** | **❌ 不支持** | M5 已知缺口 | **P1**：加「导出为 Markdown」按钮，约 1 人日 |
| 会话级工作区绑定 | **❌ 不支持** | `sessions` 表无 workspace 列 | **P1**：M5 已知缺口，约 2 人日 |
| **无空会话时的引导** | 空状态提示"暂无会话" | ✅，但 `MessageList.vue:14-16` 空状态文案过时：仍写「Mock 模式」 | **P0**：更新空状态文案，去掉 Mock 模式提示 |

### 4.2 Artifact 预览

| WorkBuddy | kmaster-studio | 差距 | 完善建议 |
|-----------|---------------|------|---------|
| 文件树 + 多格式预览 | `ArtifactPanel.vue`：仅产物列表 + 预览区（markdown/code/text/image） | **无文件树**、**无 HTML/SVG 内嵌预览**、**无 Diff 视图**（diff 类型仅 markdown 渲染） | **P1**：加 HTML/SVG iframe 内嵌预览；**P2**：加简单文件树组件 |
| 预览高度限制 | `ArtifactPanel.vue:160`：预览区 `max-height: 320px`，溢出滚动 | 大文件预览不方便 | **P1**：预览区高度改为 `flex:1`，自适应面板剩余空间 |

### 4.3 内置终端

| WorkBuddy | kmaster-studio | 差距 | 完善建议 |
|-----------|---------------|------|---------|
| xterm + node-pty | `TerminalPane.vue`：xterm + FitAddon + WebLinksAddon，惰性挂载 + keep-alive | ✅ 技术对齐 | — |
| 亮/暗主题热切换 | `TerminalPane.vue:239-242`：`watch(isDark)` 热更新主题 | ✅ | — |
| 降级处理 | 四种状态机：booting / ready / unavailable / error，均有对应视图 | ✅ 比 WorkBuddy 更完善 | — |
| **终端 cwd 绑定会话** | **❌ 不支持**——cwd 为全局配置 | WorkBuddy 终端自动 `cd` 到会话工作区 | **P1**：同 4.1 会话级工作区，约 2 人日 |

### 4.4 设置页

| WorkBuddy | kmaster-studio | 差距 | 完善建议 |
|-----------|---------------|------|---------|
| 独立窗口 / 整页 | `SettingsView.vue`：左侧 176px 锚点导航 + 右侧 7 个分组卡片 | ✅ 版式对齐 | — |
| 主题切换 | `GeneralSection.vue`：暗/亮 switch，即时生效 + 数据库持久化 | ✅ | — |
| Provider/API Key | `ProviderSection.vue`：按 provider 分组，Key 只写不回显 | ✅ | — |
| Profile 管理 | `ProfileSection.vue`：hermes profile 列表+切换 | ✅ kmaster 独有能力 | — |
| **快捷键管理** | **❌ 无** | WorkBuddy 有快捷键配置页 | **P2**：不需要 GUI 配置，但应至少支持 3-5 个基础快捷键 |
| **账户/Profile 头像** | **❌ 无** | WorkBuddy 有用户头像/登录态 | 有意不做（本地工具） |
| **语言选项仅一项** | `GeneralSection.vue:15`：`LOCALE_OPTIONS` 仅 `zh-CN` | WorkBuddy 中/英双语 | **P1**：如需国际化，约 2 人日 |

### 4.5 子代理与压缩

| WorkBuddy | kmaster-studio | 差距 | 完善建议 |
|-----------|---------------|------|---------|
| **子代理卡片** | `SubagentCard.vue`：完整实现（标题/状态/进度条/折叠产出），**但未在任何组件中 import 或渲染！** | 纯死代码——store 中有数据、组件已写好，但 `MessageList.vue` / `MessageItem.vue` 从未引用 | **P0**：在 `MessageItem.vue` 中 `import SubagentCard`，`v-for="sub in subagents"` 渲染 |
| **压缩横幅** | `compressionBySession` 数据存储在 store 中（`stores/chat.ts:67`），**但无任何 Vue 组件渲染它！** | 用户看不到压缩发生 | **P0**：在 `MessageList.vue` 顶部渲染压缩通知条："上下文已压缩，释放 X tokens" |
| **上下文余量** | `contextBySession` 数据存在、`getContextLength` API 可用，**但无 UI 展示** | WorkBuddy 有上下文用量条 | **P1**：`ChatInput.vue` 上方加一个上下文百分比进度条（如 "68% · 82K/120K tokens"） |

### 4.6 记忆管理 / 自动化 / 队列 / 用量

| 模块 | 当前状态 | 差距 |
|------|---------|------|
| 记忆管理 | `MemoryView.vue`：搜索+分组+编辑 Modal+删除确认，功能完整 | ✅ 对齐 |
| 自动化任务 | `JobsView.vue`：表格+CRUD+手动触发+运行历史时间线 | ✅ 对齐 |
| 消息队列 | `QueueView.vue`：按会话分组+立即发送+删除 | ✅ 对齐 |
| 用量统计 | `UsageView.vue`：三张卡片+CSS 柱状图+按天/模型/会话明细 | ✅ 对齐；柱状图用纯 CSS 实现，零图表库依赖 |

### 4.7 技能 / MCP 面板

| WorkBuddy | kmaster-studio | 差距 | 完善建议 |
|-----------|---------------|------|---------|
| 技能面板 | `SkillPanel.vue`：NDrawer + 搜索 + 分类树 + 点击调用 | ✅ | — |
| MCP 管理器 | `McpManager.vue`：NDrawer + 列表 + 新增/删除 | ✅ | — |
| 设置页复用 | `SettingsView.vue` 中技能/MCP 分组复用同一组件 | ✅ | — |

---

## 5. 视觉与交互

### 5.1 配色与主题

| 维度 | 当前状态 | 差距 | 完善建议 |
|------|---------|------|---------|
| CSS 变量体系 | `variables.scss`：7 个 `--km-*` 变量，暗/亮各一套 | ✅ 简洁有效 | — |
| 暗色默认 | `#1e1e1e` 背景 + `#252526` 面板 + `#3b82f6` 强调 | ✅ 与 WorkBuddy VS Code 风一致 | — |
| 亮色 | `#ffffff` 背景 + `#f3f3f3` 面板 + `#2563eb` 强调 | ✅ | — |
| Naive UI 覆盖 | `theme.ts:buildOverrides` 将 accent 注入 Naive | ✅ | — |
| **用户气泡颜色亮色下对比度偏低** | `--km-user-bubble: #e7f0ff` 在白色背景上几乎看不见 | 亮色模式下用户消息气泡与背景融为一体 | **P0**：亮色下 `--km-user-bubble` 改为 `#dbeafe` 或加 `border: 1px solid #bfdbfe` |

### 5.2 动效与过渡

当前过渡极度稀缺：
- `AppNav.vue:99`：导航项 `transition: background 0.15s ease, opacity 0.15s ease`
- `UsageView.vue:186`：柱状图 `transition: height 0.25s ease`
- `SettingsView.vue:303`：锚点 `transition: background 0.15s ease, opacity 0.15s ease`

**缺失**：
- 消息出现无动画（WorkBuddy 有滑入效果）
- 面板切换无过渡
- 抽屉开合依赖 Naive UI 自带动画
- 主题切换无过渡（瞬间切换，可能闪眼）

**建议**：
- **P1**：`MessageItem.vue` 加 `<Transition name="msg-fade">` 包裹
- **P2**：`variables.scss` 给 `html` 加 `transition: background-color 0.3s, color 0.3s` 平滑主题切换

### 5.3 空状态 / 加载态 / 错误态

| 状态 | 当前处理 | 差距 |
|------|---------|------|
| 空消息列表 | `MessageList.vue:14-16`：提示文案**已过时**（仍写 Mock 模式） | **P0**：更新文案 |
| 空会话列表 | `SessionList.vue:58`：NEmpty「暂无会话」 | ✅ |
| **消息加载中** | **❌ 无任何 loading 状态**——ChatPanel 无 spinner、无骨架屏 | **P0**：`ChatPanel.vue` 加 `NSpin`，在 socket 未就绪时显示 |
| **发送失败/网络错误** | **❌ 无错误边界**——消息发送失败时仅 toast 提示 | **P1**：`MessageItem.vue` 支持 `message.error` 状态 + 重发按钮 |
| 终端降级 | `TerminalPane.vue`：四种状态机完整处理 | ✅ 优秀 |
| 设置加载中 | `GeneralSection.vue:86`：`NSpin` 包裹 | ✅ |
| 记忆/自动化/用量页面 | 各自有 `NSpin` 和 `NEmpty` | ✅ |

### 5.4 无障碍

当前仅有 `ArtifactPanel.vue:38-47` 的 Tab 有 `role="tablist"` / `role="tab"` / `aria-selected`。

**缺失**：
- 导航链接无 `aria-current`
- 按钮无 `aria-label`（尤其 emoji 图标按钮如 🌙/☀️/🧩/🔌/📎/⚙）
- 消息列表无 `role="log"` / `aria-live`
- 输入框无 `aria-label`
- 无键盘导航（Tab 键无法在消息间移动）

**建议**：
- **P2**：给 emoji 按钮加 `aria-label`，消息列表加 `role="log"`，输入框加 `aria-label="输入消息"`

---

## 6. 优先级完善路线图

### P0 — 立即可做（ROI 最高，总计约 4 人日）

| # | 项目 | 具体落点 | 工作量 |
|---|------|---------|--------|
| 1 | **SubagentCard 接入渲染** | `MessageItem.vue`：`import SubagentCard`，从 `store.subagentsBySession[sid]` 读取，`v-for` 渲染在助手气泡下方 | 0.5 人日 |
| 2 | **压缩横幅渲染** | `MessageList.vue` 顶部：`v-if="compressionBySession[sid]"`，显示 "上下文已压缩，节省 X tokens（第 N 次压缩）" | 0.3 人日 |
| 3 | **会话搜索** | `SessionList.vue:28` 下方加 `NInput`，`list` computed 加 `filter(s => s.title.includes(search))` | 0.3 人日 |
| 4 | **消息自动滚动** | `MessageList.vue`：`watch(messages, () => nextTick(scrollToBottom))` + 浮动"滚动到底部"按钮 | 0.5 人日 |
| 5 | **流式输出指示器** | `MessageList.vue` 最后一条 assistant 消息下方渲染脉冲圆点 | 0.2 人日 |
| 6 | **消息时间戳** | `MessageItem.vue:58` 气泡底部 `<span class="km-msg-time">` | 0.2 人日 |
| 7 | **亮色气泡对比度** | `variables.scss:17`：`--km-user-bubble: #dbeafe` | 0.1 人日 |
| 8 | **空状态文案更新** | `MessageList.vue:14-16` 去掉 Mock 模式提示 | 0.1 人日 |
| 9 | **上下文余量指示** | `ChatInput.vue:100` 上方加 `<div class="km-context-bar">` 显示 token 使用百分比 | 0.5 人日 |
| 10 | **聊天加载态** | `ChatPanel.vue`：socket 未就绪时包裹 `NSpin` | 0.3 人日 |

### P1 — 下一里程碑（总计约 7 人日）

| # | 项目 | 具体落点 | 工作量 |
|---|------|---------|--------|
| 11 | **消息复制按钮** | `MessageItem.vue` 助手气泡 hover 显示复制图标 | 0.3 人日 |
| 12 | **编辑/重发消息** | `MessageItem.vue` 用户气泡 hover 编辑按钮 → 回填 `ChatInput` | 1 人日 |
| 13 | **面板拖拽调节宽度** | `ChatView.vue` grid 改 flex + resize handle；`SessionList.vue` / `ArtifactPanel.vue` 加拖拽手柄 | 1 人日 |
| 14 | **顶栏模式/模型显示** | `ChatPanel.vue` header 复用 `NSelect` 展示当前 mode/model | 0.5 人日 |
| 15 | **HTML/SVG 内嵌预览** | `ArtifactPanel.vue:77-78` 加 `<iframe srcdoc>` 分支 | 0.5 人日 |
| 16 | **消息错误态 + 重发** | `MessageItem.vue` 支持 `message.status === 'error'` 渲染红色边框 + 重试按钮 | 0.5 人日 |
| 17 | **消息出现动画** | `MessageItem.vue` 加 `<Transition name="msg-slide">` | 0.3 人日 |
| 18 | **会话导出** | `SessionList.vue` 加导出按钮 → 调 API 下载 Markdown/JSON | 1 人日 |
| 19 | **会话级工作区绑定** | DB migration + server 端点 + 终端 cwd 绑定 | 2 人日 |
| 20 | **亮色主题平滑切换** | `variables.scss` 加 `transition: background-color 0.3s` | 0.1 人日 |

### P2 — 长期完善（总计约 6 人日）

| # | 项目 | 具体落点 | 工作量 |
|---|------|---------|--------|
| 21 | **面板折叠/展开按钮** | `ChatView.vue` 加侧栏折叠 toggle | 0.5 人日 |
| 22 | **基础快捷键** | `Ctrl+N` 新会话、`Ctrl+Shift+L` 切亮色/暗色、`Ctrl+K` 搜索会话 | 0.5 人日 |
| 23 | **右键上下文菜单** | 会话右键菜单（重命名/删除/导出） | 1 人日 |
| 24 | **无障碍补全** | emoji 按钮 `aria-label`、消息列表 `role="log"`、输入框 `aria-label` | 0.5 人日 |
| 25 | **系统托盘** | `packages/desktop/src/main/index.ts` 加 `Tray` 支持「关闭到托盘」 | 1.5 人日 |
| 26 | **文件树组件** | 新建 `FileTreePane.vue`，集成到 ArtifactPanel 第三个 Tab | 2 人日 |

---

## 附录 A：关键代码位置速查

| 组件 | 路径 | 行数 | 职责 |
|------|------|------|------|
| ChatView | `packages/client/src/views/ChatView.vue` | 51 | 三栏布局容器 |
| ChatPanel | `packages/client/src/components/chat/ChatPanel.vue` | 60 | 聊天主面板（header + MessageList + ChatInput） |
| ChatInput | `packages/client/src/components/chat/ChatInput.vue` | 226 | 输入区（模式/模型/技能/MCP/附件/发送） |
| MessageList | `packages/client/src/components/chat/MessageList.vue` | 40 | 消息列表（纯 v-for，无自动滚动） |
| MessageItem | `packages/client/src/components/chat/MessageItem.vue` | 144 | 单条消息（气泡 + 思考 + 工具 + 审批 + 澄清 + 计划） |
| ThoughtBlock | `packages/client/src/components/chat/ThoughtBlock.vue` | 35 | 思考过程折叠块 |
| ToolCallCard | `packages/client/src/components/chat/ToolCallCard.vue` | 57 | 工具调用卡片 |
| SubagentCard | `packages/client/src/components/chat/SubagentCard.vue` | 146 | ⚠️ 子代理卡片（已实现，**未接入渲染**） |
| ArtifactPanel | `packages/client/src/components/chat/ArtifactPanel.vue` | 167 | 右侧面板（预览 + 终端双 Tab） |
| TerminalPane | `packages/client/src/components/preview/TerminalPane.vue` | 348 | xterm 终端（四种状态机） |
| SessionList | `packages/client/src/components/chat/SessionList.vue` | 123 | 左侧会话列表（无搜索） |
| SettingsDrawer | `packages/client/src/components/chat/SettingsDrawer.vue` | 90 | 快捷设置抽屉（模式/模型） |
| SettingsView | `packages/client/src/views/SettingsView.vue` | 334 | 设置整页（7 分组 + 锚点导航） |
| GeneralSection | `packages/client/src/components/settings/GeneralSection.vue` | 141 | 通用设置（主题/语言/终端 cwd） |
| AppNav | `packages/client/src/components/AppNav.vue` | 130 | 顶部导航条 |
| variables.scss | `packages/client/src/styles/variables.scss` | 29 | CSS 变量定义（暗/亮两套） |
| theme.ts | `packages/client/src/styles/theme.ts` | 36 | 主题切换逻辑 + Naive UI 覆盖 |
| chat store | `packages/client/src/stores/chat.ts` | ~80 (节选) | 全部 WS 事件 reducer，含 subagents/compression/context/queue |

## 附录 B：未渲染但已实现的数据/组件

以下 store 数据**已正确写入**但**无 UI 渲染**，属于「就差最后一步」的快速胜利：

| Store 字段 | 类型 | 组件 | 状况 |
|-----------|------|------|------|
| `compressionBySession` | `Record<string, CompressionNotice>` | 无 | 数据到位，无渲染 |
| `contextBySession` | `Record<string, ContextEstimate>` | 无 | API 已通，无 UI |
| `subagentsBySession` | `Record<string, Record<string, SubagentState>>` | `SubagentCard.vue` | 组件已写，从未 import |
| `delegationsBySession` | `Record<string, unknown[]>` | 无 | P1 占位 |
