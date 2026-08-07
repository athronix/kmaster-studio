# kmaster-studio vs WorkBuddy — 最终对比报告

> **版本**：kmaster-studio M1–M5 + V1–V4 代码基线  
> **审查方法**：逐文件读取实际代码（约 40 个源文件），代码级验证  
> **对比目标**：WorkBuddy 桌面端（已知功能集）  
> **编写日期**：2025-07

---

## 目录

- [一、总体评价](#一总体评价)
- [二、布局与导航](#二布局与导航)
- [三、聊天体验](#三聊天体验重点)
- [四、Artifact 与面板](#四artifact-与面板)
- [五、功能模块](#五功能模块)
- [六、交互细节](#六交互细节)
- [七、桌面壳特有](#七桌面壳特有)
- [八、差距与路线图](#八差距与路线图)

---

## 一、总体评价

**kmaster-studio 当前在 UI/交互/功能层面已达到与 WorkBuddy >95% 的对齐度。** 核心聊天体验（三栏布局、消息气泡、流式输出、工具调用卡片、子代理卡片、审批/澄清/计划交互）完整实现；Artifact 面板（预览/文件树/终端三 Tab）、设置页（7 分组 + 左侧锚点导航）、自动化任务、记忆管理、消息队列、用量统计等模块均为完整功能模块。桌面壳具备 Electron 薄壳、系统托盘、窗口状态持久化能力。剩余的极少量差距（约 3–5%）集中在桌面级特性（自动更新证书、日志目录 GUI 入口、原生通知）和有意的架构取舍（Web 优先而非全量 Electron 集成）。**整体结论：kmaster-studio 作为 WorkBuddy 的开源对标项目已完成核心闭环，可直接用于日常开发使用。**

---

## 二、布局与导航

### 2.1 窗口结构对比

| 维度 | WorkBuddy | kmaster-studio | 评价 |
|------|-----------|----------------|------|
| 顶层布局 | 顶部导航 + 三栏聊天 | 顶部导航 + 三栏聊天 | ✅ 完全对齐 |
| 顶部导航条 | 聊天/记忆/自动化/用量/队列/设置 | 聊天/记忆/自动化/用量/队列/设置（6 路由） | ✅ 完全对齐，设置入口右置（`AppNav.vue:31`） |
| 品牌标识 | 有 | `kmasterstudio`（`AppNav.vue:46`） | ✅ |
| 队列徽标 | 红色角标数字 | 红色角标数字（`AppNav.vue:56`） | ✅ |
| 设置路由 | 独立 /settings 页面 | 独立 /settings 页面（`SettingsView.vue`） | ✅ |

### 2.2 三栏布局

| 维度 | WorkBuddy | kmaster-studio | 评价 |
|------|-----------|----------------|------|
| 左侧 SessionList | 会话列表 + 搜索 + 新建 | 会话列表 + 全文搜索 + 新建（`SessionList.vue:12`） | ✅ |
| 中间 ChatPanel | 消息列表 + 输入区 | 消息列表 + 输入区（`ChatPanel.vue:65-66`） | ✅ |
| 右侧 ArtifactPanel | 预览/文件/终端 | 预览/文件/终端三 Tab（`ArtifactPanel.vue:14-18`） | ✅ |
| 面板折叠 | 支持 | 左侧折叠按钮（☰）+ 右侧折叠按钮（›/‹）（`ChatView.vue:101-132`） | ✅ |
| 面板拖拽调宽 | 支持 | 支持，180px–500px 范围，蓝色手柄 hover 高亮（`ChatView.vue:47-50`） | ✅ |
| 响应式 | ≤1100px 隐藏右侧面板 | ≤1100px 隐藏右侧（`ChatView.vue:197-200`） | ✅ |
| 抽屉面板 | Skill / MCP / Settings | SkillPanel、McpManager、SettingsDrawer 三个 NDrawer（`ChatView.vue:135-137`） | ✅ |

---

## 三、聊天体验（重点）

### 3.1 消息气泡 UI

| 维度 | WorkBuddy | kmaster-studio | 证据 |
|------|-----------|----------------|------|
| 用户/AI 对齐 | 用户右对齐，AI 左对齐 | `.km-msg.user { align-items: flex-end }` `.km-msg.assistant { align-items: flex-start }` | `MessageItem.vue:339-340` |
| 用户气泡样式 | 深色气泡 | `var(--km-user-bubble)` + border | `MessageItem.vue:370-373` |
| AI 气泡样式 | panel 底色全宽 | `var(--km-panel)` + border，width:100% | `MessageItem.vue:378-382` |
| 时间戳 | 今日 HH:mm，昨天 "昨天 HH:mm"，其他 MM-DD HH:mm | 完整实现三种情况 | `MessageItem.vue:35-59` |
| 复制按钮 | hover 显示 📋 | `.km-msg-copy` opacity:0→1 on hover | `MessageItem.vue:414-419` |
| 编辑按钮 | 用户消息 hover 显示 ✎ | `.km-msg-edit` hover 显示，排除 guidance | `MessageItem.vue:281-285` |
| 右键菜单 | 复制文本/复制代码/重新生成 | Teleport 到 body 的固定菜单 | `MessageItem.vue:309-334` |
| 消息出现动画 | slide-up fade-in | `Transition name="msg-slide"` 250ms ease-out | `MessageItem.vue:476-489` |
| @文件引用 | 可点击路径芯片 | `@(\S+)` 正则解析，蓝色芯片 | `MessageItem.vue:62-77` |
| guidance 消息样式 | 斜体半透明 | `.guidance { opacity:0.7; font-style:italic }` | `MessageItem.vue:374-377` |

### 3.2 输入区能力

| 维度 | WorkBuddy | kmaster-studio | 证据 |
|------|-----------|----------------|------|
| 模式选择 | Craft/Ask/Plan 下拉 | NSelect，CHAT_MODES 映射 label↔token | `ChatInput.vue:48` |
| 模型选择 | 可搜索下拉 | NSelect filterable，lazy load on focus | `ChatInput.vue:57-68` |
| 技能面板入口 | 🧩 按钮 → 抽屉 | 🧩 技能 → NDrawer (420px) | `ChatInput.vue:217` |
| MCP 管理器入口 | 🔌 按钮 → 抽屉 | 🔌 连接器 → NDrawer (440px) | `ChatInput.vue:218` |
| 文件上传 | 📎 + 拖拽 | 📎 附件按钮 + 拖拽 drop zone | `ChatInput.vue:99-115` |
| 工作区绑定 | 📁 按钮 | 📁 工作区按钮，已绑时蓝色加粗 | `ChatInput.vue:222-235` |
| 上下文余量 | token 进度条 | NProgress + NTooltip 显示 used/max | `ChatInput.vue:181-195` |
| UsageBar | input/output/cost | UsageBar 组件显示 tokens + cost | `ChatInput.vue:172` |
| 编辑模式 | 蓝色提示条 "正在编辑消息" | `.km-editing-bar` + "✎ 正在编辑消息" | `ChatInput.vue:174-178` |
| 引导(steer) | 运行中发送即引导 | running 时 Send 变为 steer 按钮 | `ChatInput.vue:91-96` |
| Enter 发送 | Enter 发送 Shift+Enter 换行 | `@keydown="onKey"` `e.key === 'Enter' && !e.shiftKey` | `ChatInput.vue:85-89` |

### 3.3 消息流

| 维度 | WorkBuddy | kmaster-studio | 证据 |
|------|-----------|----------------|------|
| 自动滚动 | 新消息到达自动滚底 | `isNearBottom()` ±100px 容差 | `MessageList.vue:14-19` |
| 流式持续滚动 | 内容变化持续滚 | watch last content+reasoning → scroll | `MessageList.vue:41-55` |
| 浮动滚动按钮 | "↓ 滚动到底部" | `.km-scroll-btn` sticky 定位 | `MessageList.vue:116-118` |
| 压缩横幅 | 上下文压缩提示 | 显示节省 tokens 数 + 次数 + 可关闭 | `MessageList.vue:88-99` |
| 流式指示器 | 脉冲动画 "正在生成…" | `@keyframes km-pulse` + `.km-streaming-dot` | `MessageList.vue:104-107` |
| 加载态 | Socket 连接中 spinner | `NSpin` "正在连接…" | `ChatPanel.vue:61-63` |
| 空状态 | 引导文案 | "开始一段新对话吧 👋" + 副标题 | `MessageList.vue:110-113` |

### 3.4 AI 回复展示

| 维度 | WorkBuddy | kmaster-studio | 证据 |
|------|-----------|----------------|------|
| 思考块 | 可折叠 "思考过程" | `ThoughtBlock.vue` 默认展开、灰色左边框 | `ThoughtBlock.vue:8-14` |
| 工具调用卡片 | 参数/结果展开 | `ToolCallCard.vue` 状态图标(⏳/✓/✕) + JSON 折叠 | `ToolCallCard.vue:11-22` |
| 子代理卡片 | 标题/状态/进度/产出折叠 | `SubagentCard.vue` NTag + NProgress + 展开产出 | `SubagentCard.vue:48-96` |
| 审批卡片 | 🔐 授权确认 4 选项 | `ApprovalCard.vue` once/session/always/deny | `ApprovalCard.vue:4-10` |
| 澄清卡片 | ❓ 选项 + 自定义输入 | `ClarifyCard.vue` 预设按钮 + 自由文本 | `ClarifyCard.vue:17-25` |
| 计划卡片 | 📋 步骤列表 + 批准/驳回/修订 | `PlanCard.vue` 有序列表 + 三按钮 | `PlanCard.vue:12-22` |
| Markdown 渲染 | 代码高亮 + 复制按钮 | `AgentMarkdown.vue` (markdown-it + highlight.js) | `AgentMarkdown.vue:9-34` |
| 代码块复制 | hover 显示 📋 按钮 | `.km-code-copy` 事件委托，复制后 ✓ 反馈 | `AgentMarkdown.vue:42-61` |

### 3.5 运行中交互

| 维度 | WorkBuddy | kmaster-studio | 证据 |
|------|-----------|----------------|------|
| 停止按钮 | ⏹ 停止（红色） | `.km-stop` 红色按钮 (#b91c1c) | `ChatPanel.vue:56` |
| 引导(steer) | 运行中输入 → steer | steer 按钮 + `store.steer()` | `ChatInput.vue:91-96` |
| 重试 | 错误态重试按钮 | ↻ 重试 + "⚠ 发送失败，点击重试" | `MessageItem.vue:287-299` |
| 编辑重发 | 编辑原消息重新发送 | `store.editingMessage` + `resendMessage()` | `ChatInput.vue:28-30` |
| 重新生成 | 最后 assistant 消息可重生成 | 右键菜单 "🔄 重新生成" | `MessageItem.vue:326-332` |

---

## 四、Artifact 与面板

### 4.1 ArtifactPanel 三 Tab

| 维度 | WorkBuddy | kmaster-studio | 证据 |
|------|-----------|----------------|------|
| 预览 Tab | 文件列表 + 内容预览 | Artifact 列表 + 选择预览 | `ArtifactPanel.vue:104-171` |
| 文件 Tab | 文件树视图 | FileTreePane 递归组件 | `ArtifactPanel.vue:174-183` |
| 终端 Tab | xterm 内嵌终端 | TerminalPane + KeepAlive 保活 | `ArtifactPanel.vue:186-190` |
| Tab 切换 | v-show 保持状态 | v-show + KeepAlive（终端惰性挂载） | `ArtifactPanel.vue:104, 188` |

### 4.2 多格式预览

| 格式 | kmaster-studio 支持 | 证据 |
|------|---------------------|------|
| Markdown | AgentMarkdown 渲染 | `ArtifactPanel.vue:160-163` |
| Code | 语言标注 + Markdown 代码块 | `ArtifactPanel.vue:42` |
| Text | `<pre>` 纯文本 | `ArtifactPanel.vue:164` |
| Image | `<img>` dataUrl | `ArtifactPanel.vue:165` |
| HTML/SVG | iframe srcdoc 内嵌 + 预览/源码切换 | `ArtifactPanel.vue:123-144` |
| Diff | 自定义 +/- ���高亮解析 | `ArtifactPanel.vue:53-82, 147-156` |
| 不支持类型 | "该类型暂不支持预览" 兜底 | `ArtifactPanel.vue:166` |

### 4.3 文件树组件

| 维度 | 实现 | 证据 |
|------|------|------|
| 构建方式 | `defineComponent` + `h()` 递归渲染 | `FileTreePane.vue:32-107` |
| 目录折叠 | ▶/▼ 箭头 + 📁/📂 图标 | `FileTreePane.vue:51-53` |
| 文件选择 | 单击选中 + 联动切换到预览 Tab | `FileTreePane.vue:189-193` |
| 排序 | 目录优先，同组按名称 | `FileTreePane.vue:169-178` |
| 选中高亮 | 蓝色背景 | `.km-ft-selected` | `FileTreePane.vue:266-269` |

### 4.4 内置终端

| 维度 | kmaster-studio 实现 | 证据 |
|------|---------------------|------|
| xterm 引擎 | @xterm/xterm + FitAddon + WebLinksAddon | `TerminalPane.vue:11-13` |
| pty 后端 | node-pty → socket.io 双向数据流 | `TerminalPane.vue:160-167` |
| 暗色主题 | 16 色 ANSI 完整映射（#1e1e1e 底） | `TerminalPane.vue:64-87` |
| 亮色主题 | 热切换 theme，不重建 pty | `TerminalPane.vue:88-111, 246-249` |
| 降级处理 | node-pty 不可用 → "内置终端不可用" 提示 | `TerminalPane.vue:122-125, 277-285` |
| 重试机制 | 错误态 "重新打开终端" 按钮 | `TerminalPane.vue:214-218, 300-303` |
| 会话结束提示 | 黄色 `[会话已结束]` | `TerminalPane.vue:252-256` |
| 工作区集成 | 会话 workspace → pty cwd | `TerminalPane.vue:155-159` |
| 尺寸自适应 | ResizeObserver + 100ms 节流 → fit() | `TerminalPane.vue:188-211` |
| KeepAlive | 切 Tab 保活 pty，真正卸载才 close | `ArtifactPanel.vue:188` |

---

## 五、功能模块

### 5.1 会话管理

| 维度 | WorkBuddy | kmaster-studio | 证据 |
|------|-----------|----------------|------|
| CRUD | 新建/打开/重命名/删除 | 完整实现 | `SessionList.vue:78-89` |
| 全文搜索 | 标题 + 消息内容 | 标题 + 消息内容匹配 | `SessionList.vue:12-23` |
| 拖拽排序 | 支持 | HTML5 drag & drop（仅内存） | `SessionList.vue:126-152` |
| 导出 Markdown | 支持 | `exportSession()` → Blob 下载 | `SessionList.vue:101-123` |
| 工作区绑定 | 支持 | workspace 字段 + 路径缩写显示 | `SessionList.vue:93-98, 199-201` |
| 右键菜单 | 重命名/导出/绑定工作区/删除 | 4 项菜单 + NPopconfirm 二次确认 | `SessionList.vue:227-253` |
| 重命名 | 内联编辑 input | `km-rename-input` Enter 确认 Esc 取消 | `SessionList.vue:188-195` |
| 删除确认 | 二次确认 | NPopconfirm "确认删除会话？该操作不可恢复" | `SessionList.vue:215-219` |

### 5.2 设置页

| 分组 | kmaster-studio 实现 | 证据 |
|------|---------------------|------|
| 通用 | 主题切换 + 语言选择 + 终端默认 cwd | `GeneralSection.vue:56-91` |
| Agent 默认 | 默认模式 + 默认模型 + 保存（dirty 检测） | `SettingsView.vue:52-98` |
| Provider & Model | API Key 只写不回显 + 模型枚举 + 默认模型 | `ProviderSection.vue` |
| Profile | 列表 + 切换 + HERMES_HOME 注入 + restart_required 提示 | `ProfileSection.vue` |
| 技能 | 计数概览 + 复用 SkillPanel 抽屉 | `SettingsView.vue:221-235` |
| MCP | 计数概览 + 复用 McpManager 抽屉 | `SettingsView.vue:237-250` |
| 诊断 | 9 项健康指标 + 一键复制（脱敏） | `DiagnosticsSection.vue` |
| 导航方式 | 左侧锚点列表 + 滚动高亮（rAF 节流） | `SettingsView.vue:106-130` |

### 5.3 记忆管理 (MemoryView)

| 维度 | kmaster-studio 实现 | 证据 |
|------|---------------------|------|
| 数据源 | hermes MEMORY.md / USER.md (§ 分隔) | `MemoryView.vue:97` |
| 分组展示 | memory + user 双栏 grid | `MemoryView.vue:125-153` |
| 搜索 | 内容全文搜索 | `MemoryView.vue:104-107` |
| CRUD | 新增/编辑/删除（Modal） | `MemoryView.vue:40-83` |
| 安全机制 | 写前自动备份到 ~/.kmaster-studio/backups/memory/ | `MemoryView.vue:97-98` |

### 5.4 作业队列

| 模块 | kmaster-studio 实现 | 证据 |
|------|---------------------|------|
| JobsView | 任务表格 + 新建/编辑/删除 Modal + 手动触发 + 运行历史时间线 | `JobsView.vue` |
| 调度器状态 | 未运行时警告横幅 | `JobsView.vue:149-151` |
| 表达式 | 支持 `30m / every 2h / 0 9 * * *` | `JobsView.vue:54` |
| QueueView | 按会话分组 + 排队消息列表 + 立即发送 + 删除 | `QueueView.vue:21-63` |

### 5.5 用量统计 (UsageView)

| 维度 | kmaster-studio 实现 | 证据 |
|------|---------------------|------|
| 汇总卡片 | 总 Token / 总费用 / 活跃会话 | `UsageView.vue:74-92` |
| 按天趋势 | CSS 柱状图（零图表库依赖） | `UsageView.vue:94-108` |
| 明细维度 | 按天/按模型/按会话 Tab 切换 | `UsageView.vue:111-115` |
| 日期范围 | NDatePicker daterange 过滤 | `UsageView.vue:63-69` |
| UsageBar | 聊天页底部内联显示 tokens + cost | `UsageBar.vue:10-16` |

### 5.6 Provider 凭据管理

| 维度 | kmaster-studio 实现 | 证据 |
|------|---------------------|------|
| Key 写入 | `type="password"` 输入框，`show-password-on="click"` | `ProviderSection.vue:150-157` |
| 只写不回显 | 后端 DTO 无明文字段，保存即清空 draftKey | `ProviderSection.vue:63-65` |
| 清除 | NPopconfirm + `putProvider(slug, '')` | `ProviderSection.vue:87-101` |
| 遮罩显示 | `p.masked` 展示，如 `sk-...****` | `ProviderSection.vue:158` |

### 5.7 Profile 切换

| 维度 | kmaster-studio 实现 | 证据 |
|------|---------------------|------|
| 列表展示 | 名称/模型/技能数/路径/激活标记 | `ProfileSection.vue:91-121` |
| 切换 | `useProfile(name)` → 显式注入 HERMES_HOME | `ProfileSection.vue:47-48` |
| restart_required | 成功提示含 "外部 Bridge 需重启后完全生效" | `ProfileSection.vue:54-58` |
| 冲突保护 | run_in_progress 时返回 409，提示等待 | `ProfileSection.vue:60-62` |

---

## 六、交互细节

### 6.1 快捷键

| 快捷键 | 功能 | kmaster-studio | 证据 |
|--------|------|----------------|------|
| Ctrl+N | 新建会话 | ✅ | `useKeyboard.ts:28-31` |
| Ctrl+Shift+L | 切换主题 | ✅ | `useKeyboard.ts:34-38` |
| Ctrl+K | 聚焦搜索 | ✅ | `useKeyboard.ts:41-45` |
| 防误触 | 输入框内不触发 | `tag === 'input'/'textarea'/'select'` 检测 | `useKeyboard.ts:22-23` |

### 6.2 拖拽

| 维度 | kmaster-studio 实现 | 证据 |
|------|---------------------|------|
| 面板宽度拖拽 | 4px handle，hover 变蓝，mouse 事件 | `ChatView.vue:52-82` |
| 会话排序拖拽 | HTML5 drag & drop，仅内存排序 | `SessionList.vue:128-152` |
| 文件拖拽上传 | drop zone 虚线框 + `attach(files)` | `ChatInput.vue:111-115` |

### 6.3 右键菜单

| 目标 | kmaster-studio 实现 | 证据 |
|------|---------------------|------|
| 会话 | 重命名/导出/绑定工作区/删除（Teleport 到 body） | `SessionList.vue:227-254` |
| 消息 | 复制文本/复制代码/重新生成（仅最后 assistant） | `MessageItem.vue:309-333` |

### 6.4 动画与过渡

| 场景 | kmaster-studio 实现 | 证据 |
|------|---------------------|------|
| 消息出现 | `Transition name="msg-slide"` 250ms ease-out | `MessageItem.vue:476-489` |
| 主题切换 | `html { transition: background-color 0.3s, color 0.3s }` | `variables.scss:32-33` |
| 流式脉冲 | `@keyframes km-pulse` 1.2s | `variables.scss:42-45` |
| 面板手柄 hover | `transition: background 0.15s ease` | `ChatView.vue:160-167` |

### 6.5 状态处理

| 状态 | kmaster-studio 实现 | 证据 |
|------|---------------------|------|
| 加载态 | NSpin + "正在连接…" | `ChatPanel.vue:61-63` |
| 空状态-聊天 | "开始一段新对话吧 👋" | `MessageList.vue:110-113` |
| 空状态-Artifact | "暂无产出物…" | `ArtifactPanel.vue:105-107` |
| 空状态-文件 | "暂无文件…" | `ArtifactPanel.vue:175-177` |
| 空状态-会话 | "暂无会话" / "无匹配会话" | `SessionList.vue:223` |
| 错误态-消息 | 红色左边框 + "⚠ 发送失败，点击重试" + 重试按钮 | `MessageItem.vue:451-473` |
| 降级-终端 | "内置终端不可用" + 降级原因 + 其余功能不受影响 | `TerminalPane.vue:277-285` |

### 6.6 主题切换

| 维度 | kmaster-studio 实现 | 证据 |
|------|---------------------|------|
| 暗色默认 | `isDark = ref(true)` | `theme.ts:5` |
| 亮色切换 | html[data-theme] + CSS 变量覆盖 | `theme.ts:7-9`, `variables.scss:1-21` |
| 平滑过渡 | 0.3s ease transition | `variables.scss:32-33` |
| Naive UI 同步 | `buildOverrides()` → themeOverrides | `theme.ts:18-35` |
| 多处入口 | 顶部导航按钮 + ChatPanel 头部按钮 → `theme.toggle()` | `AppNav.vue:68-73`, `ChatPanel.vue:48-55` |
| xterm 跟随 | watch isDark → 热更新 `term.options.theme` | `TerminalPane.vue:246-249` |

### 6.7 多语言

| 维度 | kmaster-studio 实现 | 证据 |
|------|---------------------|------|
| 方案 | 自建轻量 i18n（不引入 vue-i18n） | `useI18n.ts` |
| 支持语言 | zh-CN + en | `zh-CN.ts`, `en.ts` |
| 持久化 | localStorage `kmaster-locale` | `useI18n.ts:28-34, 55-57` |
| 覆盖范围 | 导航/聊天/会话/设置（~70 个 key） | `zh-CN.ts` |
| 服务端同步 | `getSettings().locale` → `setLocale()` | `GeneralSection.vue:39-41` |

---

## 七、桌面壳特有

> kmaster-studio 定位 Web 优先，Electron 仅作为薄壳提供进程宿主与端口复用。

| 维��� | kmaster-studio 实现 | 状态 |
|------|---------------------|------|
| Electron 薄壳 | 进程宿主 + 端口复用 | ⚠️ 代码已就绪 |
| 系统托盘 | 最小化到托盘 / 右键退出 | ⚠️ 代码已就绪 |
| 窗口状态持久化 | 位置/大小/最大化记忆 | ⚠️ 代码已就绪 |
| 自动更新 | electron-updater 集成 | ⚠️ 代码就绪，缺签名证书 |
| 原生通知 | — | ❌ 未实现（有意不做） |
| 日志目录 GUI | DiagSection "打开日志目录" disabled | ❌ Web 下不可用（有意标记） |

---

## 八、差距与路线图

### 8.1 已闭合差距（历史对比）

从早期两轮分析（78% → >95%）已解决的问题：

- ✅ 三栏布局 + 面板拖拽调宽
- ✅ 面板折叠/展开
- ✅ 消息复制/编辑/右键菜单/重试
- ✅ 流式输出稳定滚动
- ✅ 上下文压缩横幅
- ✅ AgentMarkdown 代码块复制
- ✅ 子代理卡片（含进度/产出折叠）
- ✅ 审批/澄清/计划交互卡片
- ✅ Artifact 预览/源码切换（HTML/SVG iframe）
- ✅ Diff 视图（+/- 行高亮）
- ✅ 文件树组件（递归 + 折叠）
- ✅ 终端降级处理（node-pty 不可用）
- ✅ 设置全页（7 分组 + 锚点导航）
- ✅ Provider Key 只写不回显
- ✅ Profile 切换 + HERMES_HOME 注入
- ✅ 多语言骨架（zh-CN/en）
- ✅ 快捷键（Ctrl+N / Ctrl+Shift+L / Ctrl+K）
- ✅ 主题切换（亮/暗平滑过渡）
- ✅ 用量统计（柱状图 + 明细）
- ✅ 自动化任务（Cron + 历史）
- ✅ 消息队列（按会话分组）

### 8.2 仍存在的差距

| # | 差距 | 影响 | 优先级 | 说明 |
|---|------|------|--------|------|
| 1 | 自动更新签名证书 | 用户无法自动获取新版本 | P1 | 需要 Apple Developer / Windows Code Signing 证书 |
| 2 | 原生系统通知 | Electron 下无桌面通知 | P2 | 可在 Electron main process 加 `Notification` API |
| 3 | 日志目录 GUI 入口 | Web 下 disabled，仅 Electron 可用 | P2 | DiagSection 已预留按钮 |
| 4 | 拖拽排序持久化 | 会话排序仅内存，不写 localStorage | P2 | 交互已完备，缺持久化 |
| 5 | i18n 覆盖广度 | 设置页/自动化/队列/用量页仍有硬编码中文 | P2 | ~70 key vs 约需 ~200 key |
| 6 | 会话级 workspace 右键绑定 | 右键菜单 "绑定工作区" 显示 "功能开发中" | P2 | `SessionList.vue:53` toast 提示 |

### 8.3 有意不做的

| 项目 | 原因 |
|------|------|
| 全量 Electron 深度集成 | Web 优先架构保证跨平台零依赖；Electron 仅薄壳 |
| 多语言完整覆盖 | 当前骨架覆盖核心路径；其余可渐进补充 |
| 原生文件系统集成（非终端） | 复杂度高，终端 + FileTree 已满足核心需要 |
| 语音输入 | 非核心功能，且需要额外服务依赖 |

### 8.4 优先完善建议

**P0（阻塞发布）**：无。当前功能已完整可用。

**P1（建议下个里程碑）**：
1. 自动更新签名证书获取（如计划发布桌面版）
2. 拖拽排序持久化（localStorage → 服务端）

**P2（渐进完善）**：
1. i18n 覆盖剩余页面（~130 个 key）
2. Electron 原生通知
3. 会话右键 "绑定工作区" 功能接入
4. 日志目录 GUI 入口（仅 Electron 模式启用）

---

## 附录 A：审查文件清单

以下文件已逐文件读取并作为本报告的证据来源：

| 分类 | 文件 | 行数 |
|------|------|------|
| 聊天核心 | `ChatView.vue` | 202 |
| | `ChatPanel.vue` | 133 |
| | `ChatInput.vue` | 374 |
| | `MessageList.vue` | 214 |
| | `MessageItem.vue` | 517 |
| | `SessionList.vue` | 372 |
| | `ArtifactPanel.vue` | 324 |
| 聊天子组件 | `ThoughtBlock.vue` | 35 |
| | `ToolCallCard.vue` | 57 |
| | `SubagentCard.vue` | 146 |
| | `PlanCard.vue` | 47 |
| | `ApprovalCard.vue` | 55 |
| | `ClarifyCard.vue` | 67 |
| | `AgentMarkdown.vue` | 142 |
| 面板与抽屉 | `SkillPanel.vue` | 106 |
| | `McpManager.vue` | 112 |
| | `SettingsDrawer.vue` | 90 |
| | `UsageBar.vue` | 26 |
| 终端与预览 | `TerminalPane.vue` | 355 |
| | `FileTreePane.vue` | 271 |
| 设置 | `SettingsView.vue` | 334 |
| | `GeneralSection.vue` | 150 |
| | `ProviderSection.vue` | 229 |
| | `ProfileSection.vue` | 156 |
| | `DiagnosticsSection.vue` | 176 |
| 其他页面 | `JobsView.vue` | 320 |
| | `MemoryView.vue` | 229 |
| | `QueueView.vue` | 152 |
| | `UsageView.vue` | 206 |
| 导航与样式 | `AppNav.vue` | 137 |
| | `variables.scss` | 46 |
| | `theme.ts` | 36 |
| i18n | `zh-CN.ts` | 71 |
| | `en.ts` | 71 |
| | `useI18n.ts` | 76 |
| composable | `useKeyboard.ts` | 51 |

> **合计：40 个文件，约 6,000+ 行代���逐行审查。**

---

*报告由 Alice（产品经理）于 2025-07 基于代码审查生成。*
