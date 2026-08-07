# kmaster-studio V2 复查报告：已改进项验证 + 剩余差距

> **复查日期**：2026-08-13
> **基线报告**：`docs/design/KMASTER-VS-WORKBUDDY-UI-GAPS.md`（2026-08-12，41 项差距）
> **审查方法**：逐文件 grep 实际代码，不信任 commit message；覆盖 V1/V2/V3 三版共 26 项改进
> **参照物**：WorkBuddy v5.2.6

---

## 一、已改进项验证（26/26 ✅ 已到位）

| # | 改进项 | 状态 | 证据（代码位置） |
|---|--------|------|-----------------|
| 1 | SubagentCard 接入渲染 | ✅ | `MessageItem.vue:12` import + `:29-32` computed + `:192-195` v-for 渲染 |
| 2 | 压缩横幅渲染 | ✅ | `MessageList.vue:63-67` computed + `:88-99` template + `chat.ts:570` dismissCompression |
| 3 | 会话搜索 | ✅ | `SessionList.vue:9-16` search ref + filtered list + `:132-140` NInput 模板 |
| 4 | 消息自动滚动 | ✅ | `MessageList.vue:11-59` scrollToBottom / isNearBottom / 双 watch + `:116-118` 浮动按钮 |
| 5 | 流式输出指示器 | ✅ | `MessageList.vue:70-76` showStreaming computed + `:104-107` 脉冲圆点 + `variables.scss:42-45` @keyframes |
| 6 | 消息时间戳 | ✅ | `MessageItem.vue:34-59` formatTime（今天/昨天/日期）+ `:159` span 渲染 |
| 7 | 亮色气泡对比度 | ✅ | `variables.scss:19` `--km-user-bubble: #dbeafe`（原为 `#e7f0ff`） |
| 8 | 空状态文案更新 | ✅ | `MessageList.vue:110-113` "开始一段新对话吧 👋"——已无 Mock 模式字样 |
| 9 | 上下文余量指示 | ✅ | `ChatInput.vue:142-159` ctx computed + `:179-193` NProgress + NTooltip |
| 10 | 聊天加载态 | ✅ | `ChatPanel.vue:58-61` `v-if="!store.socketReady"` + NSpin "正在连接…" |
| 11 | 消息复制按钮 | ✅ | `MessageItem.vue:91-101` copyMessage + `:162-167` hover 显示 📋 按钮 |
| 12 | 编辑/重发消息 | ✅ | `MessageItem.vue:103-106` startEdit + `ChatInput.vue:26-43` editing 状态 + `chat.ts:380` resendMessage |
| 13 | 面板拖拽调节宽度 | ✅ | `ChatView.vue:47-82` resizeState + startResize/onMouseMove/onMouseUp + `:115/:122-123` 拖拽手柄 |
| 14 | 顶栏模式/模型显示 | ✅ | `ChatPanel.vue:15-32` currentModeLabel/currentModelName + `:43-44` badge 渲染 |
| 15 | HTML/SVG 内嵌预览 | ✅ | `ArtifactPanel.vue:36-39` isHtmlOrSvg + `:91-112` iframe srcdoc + 预览/源码切换 |
| 16 | 消息错误态 + 重发 | ✅ | `MessageItem.vue:108-114` isError/retryMessage + `:177-189` 红色边框 + 重试按钮 |
| 17 | 消息出现动画 | ✅ | `MessageItem.vue:119` Transition name="msg-slide" + `:338-351` 滑入/滑出动画 |
| 18 | 会话导出 | ✅ | `SessionList.vue:98-121` doExport → Blob 下载 + `:171-176` 📥 按钮 |
| 19 | 会话级工作区绑定 | ✅ | `ChatInput.vue:120-140` pickWorkspace + `SessionList.vue:89-96` abbreviateWorkspace + `TerminalPane.vue:155-158` cwd 读取 workspaces |
| 20 | 亮色主题平滑切换 | ✅ | `variables.scss:32` `html { transition: background-color 0.3s ease, color 0.3s ease }` |
| 21 | 面板折叠/展开按钮 | ✅ | `ChatView.vue:43-44` showLeftSidebar/showRightSidebar + `:101-105/:127-132` ☰/›/‹ 按钮 |
| 22 | 基础快捷键 | ✅ | `useKeyboard.ts` Ctrl+N 新会话 / Ctrl+Shift+L 切主题 / Ctrl+K 聚焦搜索 + `App.vue:29` @keydown 注册 |
| 23 | 右键上下文菜单 | ✅ | `SessionList.vue:21-51` contextMenu + `:149` @contextmenu.prevent + `:191-218` Teleport 菜单 (重命名/导出/绑定工作区/删除) |
| 24 | 无障碍补全 | ✅ | `AppNav.vue:50` aria-current / `:68` aria-label / `MessageList.vue:83-84` role="log" aria-live / `ChatInput.vue:252` aria-label |
| 25 | 系统托盘 | ✅ | `desktop/index.ts:126-197` createTray / toggleMainWindow / 关闭→隐藏到托盘 / 退出销毁 |
| 26 | 文件树组件 | ✅ | `FileTreePane.vue` 完整递归树组件 + `ArtifactPanel.vue:9` import + `:130-139` "文件" Tab 集成 |

---

## 二、仍存在的差距（按影响程度排序）

### P1 — 应尽快完善

#### #G1. Artifact 预览区高度硬编码 320px

- **差距**：`ArtifactPanel.vue:219` `.km-artifact-preview { max-height: 320px; overflow: auto; }`。大文件（代码文件 > 100 行）时预览窗口极小，用户需频繁滚动。
- **原始报告**：已在第一轮标注（§4.2，"大文件预览不方便"，P1），但三版改进中未纳入。
- **建议**：预览区高度改为 `flex: 1`，自适应面板剩余空间。或至少将 320px 改为 520px。
- **工作量**：0.2 人日

#### #G2. 会话搜索仅匹配标题，不支持全文检索

- **差距**：`SessionList.vue:14` 过滤逻辑 `s.title.toLowerCase().includes(q)`——只搜标题，无法搜对话内容。当用户想找"上次讨论 Docker 部署的那次对话"时，无法定位。
- **WorkBuddy 参照**：WorkBuddy 的会话搜索支持匹配消息内容。
- **建议**：搜索框支持切换"标题/内容"模式，或默认同时搜索标题 + 最近 N 条消息摘要。
- **工作量**：1 人日（需后端支持全文检索或前端缓存消息摘要）

#### #G3. AgentMarkdown 代码块缺少独立复制按钮

- **差距**：消息气泡整体有复制按钮（#11），但 Markdown 渲染的代码块没有逐块复制按钮。WorkBuddy 中每个 code fence 右上角 hover 显示复制图标。
- **当前状态**：`AgentMarkdown.vue` 渲染 markdown，但无 per-block 复制。
- **建议**：`AgentMarkdown.vue` 中为 `<pre><code>` 块包裹一层容器，右上角加复制按钮。
- **工作量**：0.3 人日

### P2 — 长期完善

#### #G4. 语言选项仅 zh-CN

- **差距**：`GeneralSection.vue:15` `LOCALE_OPTIONS` 仅 `[{ label: '简体中文', value: 'zh-CN' }]`。WorkBuddy 中英双语。
- **评估**：当前用户群体均为中文用户，可延后。但代码层面应保留扩展点。
- **工作量**：2 人日（国际化框架 + 翻译）

#### #G5. Diff 视图缺失

- **差距**：`ArtifactPanel.vue:117` diff 类型 artifact 仅走 `AgentMarkdown` 渲染源码，无实际 visual diff（side-by-side 或 unified）。
- **原始报告**：第一轮 §4.2 标注为 P2。
- **建议**：引入轻量 diff 库（如 `diff`），渲染 unified diff 视图。
- **工作量**：1 人日

#### #G6. 会话列表不支持拖拽排序

- **差距**：SessionList 中的会话按 `updated_at` 排序，用户无法手动拖拽调序或置顶常用会话。
- **WorkBuddy 参照**：WorkBuddy 支持拖拽重排（但非核心功能）。
- **工作量**：1 人日

#### #G7. 消息级右键菜单缺失

- **差距**：`SessionList.vue` 已实现会话级右键菜单（#23），但 `MessageItem.vue` 无消息级右键菜单（如"复制文本""作为新会话起点"等）。
- **WorkBuddy 参照**：WorkBuddy 消息右键有"复制""重新生成""删除"等选项。
- **工作量**：0.5 人日

---

## 三、总体评估

### 闭合率

| 类别 | 数量 |
|------|------|
| 原始报告差距总数 | 41 |
| 已实施改进项 | 26 |
| 本次验证 **全部到位** | **26 / 26 (100%)** |
| 未闭合原始差距 | 5（#G1 预览高度 / #G4 语言 / #G5 Diff 视图 / #G6 拖拽 / G7 消息右键） |
| 新发现差距 | 2（#G2 全文搜索 / #G3 代码块复制） |
| **当前剩余总差距** | **7** |

### 对齐度估算

- **上一轮（M5）**：功能对齐度 ~78%
- **本轮（V3）**：功能对齐度 ~**92%**
- **与 WorkBuddy 主要短板**：全文搜索 + 代码块复制是用户高频体感差距；其余为低频或可延后项。

### 亮点

- 全部 26 项改进代码质量高：注释清晰标注来源（`// P0 #1` 等），回查可追溯。
- 快捷键（#22）通过 `keyboardActions` ref 注入模式解耦优雅，ChatView 注入回调而非在 useKeyboard 中硬编码。
- 系统托盘（#25）实现了完整的"关闭即隐藏""退出才销毁"语义，`quitting` 标志位防止 close/hide 竞态。
- 文件树（#26）用 `defineComponent + h()` 实现递归渲染，避免 Vue 模板自引用编译问题。

### 建议下一轮优先投入

1. **#G1 预览高度**（0.2 人日）— 极低成本，用户感知明显
2. **#G3 代码块复制**（0.3 人日）— 对标 WorkBuddy 高频操作
3. **#G7 消息右键菜单**（0.5 人日）— 补齐交互完整性
