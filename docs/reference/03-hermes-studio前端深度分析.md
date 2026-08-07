# hermes-studio 前端深度分析报告

> 分析对象：`D:\Users\towyq\Documents\Projects\hermes-studio`（只读）
> 分析日期：2026-07-30
> 分析维度：前端技术架构 / 前端展现交互结构 / 前端代码结构 / 前端交互对后端服务的调用映射
> 姊妹文档：《01-WorkBuddy桌面前端深度分析》《02-kmaster-studio设计方案》
> 所有结论均来自源码实测枚举（grep/read），非推断。

---

## 一、项目定位与总体架构

hermes-studio 是 hermes-agent 的**官方 Web 控制台 + 可选桌面壳**，采用「前后端一体 monorepo」结构：

```
hermes-studio/
├── vite.config.ts               # 前端构建配置（root 指向 packages/client）
├── packages/
│   ├── client/                  # Vue 3 SPA 前端（本报告主角）
│   ├── server/                  # Koa + Socket.IO 中间层（BFF）
│   ├── desktop/                 # Electron 桌面壳（复用 client 页面）
│   ├── ekko-agent/              # 内嵌轻量 agent 运行时
│   ├── skills/                  # 技能包
│   ├── website/                 # 官网
│   └── esp32-c3/                # IoT 设备固件（MCU 外设）
```

三层运行时拓扑：

```
浏览器/Electron (Vue3 SPA)
   │  HTTP REST (/api/**, /v1/**)  +  Socket.IO (/chat-run, /global-agent, /group-chat, /workflow)
   ▼
packages/server (Koa, 默认 127.0.0.1:6648)
   │  AgentBridge（进程内 Python 桥，Windows 走 tcp://127.0.0.1:16765）
   ▼
hermes-agent (run_agent.AIAgent)
```

前端开发端口 6649，通过 Vite proxy 把 `/api`、`/v1`、`/health`、`/upload`、`/webhook`、`/socket.io` 全部代理到 6648（`vite.config.ts:76-90`），生产构建产物输出到 `dist/client` 由 Koa 静态托管——即**生产环境前后端同源单端口**。

---

## 二、前端技术架构

### 2.1 技术栈清单（依赖版本实测自根 package.json）

| 层 | 选型 | 版本 | 备注 |
|---|---|---|---|
| 框架 | Vue 3（Composition API + `<script setup>`） | ^3.5.32 | 全部 SFC |
| 构建 | Vite | ^8.0.4 | esbuild minify、关闭 sourcemap、es2020 target、CSS code split |
| 状态管理 | Pinia | ^3.0.4 | 14 个 hermes store |
| 路由 | vue-router | ^4.6.4 | 全部懒加载 `() => import(...)` |
| UI 组件库 | Naive UI | ^2.44.1 | NConfigProvider 全局主题注入 |
| 国际化 | vue-i18n | ^11.3.2 | `src/i18n/locales` |
| 实时通信 | socket.io-client | ^4.8.3 | 4 个命名空间 |
| HTTP | 原生 fetch 封装（`api/client.ts`，235 行） + axios（^1.9.0，个别模块） | — | Bearer token（JWT，localStorage `hermes_api_key`） |
| Markdown | markdown-it ^14.1.1 + highlight.js ^11.11.1 | — | `MarkdownRenderer.vue` 异步加载 |
| 图表 | mermaid ^11.14.0 | — | `mermaidRenderer.ts` |
| 代码编辑 | monaco-editor ^0.55.1 | — | 文件预览/编辑 |
| 长列表 | vue-virtual-scroller ^3.0.4 | — | `VirtualMessageList.vue` |
| 样式 | SCSS（`styles/variables.scss` 设计令牌）+ Naive themeOverrides | — | 亮/暗/漫画三主题 + 自定义背景 |
| 类型 | TypeScript ~6.0.2 + vue-tsc | — | 严格类型 |

### 2.2 架构特征

1. **BFF 中间层架构**（与 WorkBuddy 的「preload+主进程」等位）：前端从不直连 hermes-agent，一切经 Koa server。server 承担鉴权（JWT）、会话持久化（SQLite）、AgentBridge 进程管理、事件转发。
2. **REST 管数据 + Socket.IO 管流**：CRUD 类交互走 `/api/hermes/**` REST；Agent 运行期的流式事件走 `/chat-run` 命名空间，二者分工与 WorkBuddy 的「IPC 通道 + ACP sessionUpdate」完全同构。
3. **多 Profile 多实例**：socket 连接携带 `query: { profile }`（`chat.ts:731-741`），server 侧按 profile 路由到不同 hermes-agent 实例；REST 亦有 `/api/hermes/profiles/*` 全生命周期管理（restart/gateway/restart/runtime-status）。
4. **桌面壳可选**：`packages/desktop` 是薄 Electron 壳，preload 仅暴露一个 `hermesDesktop` 对象（`isDesktop/platform/windowKind/ensureAuth`），页面代码通过 `utils/desktop-bridge.ts` 探测运行环境，与 Web 共用同一套 SPA——和 WorkBuddy「重主进程」路线相反，是**轻壳重服务**路线。
5. **断线自愈**：socket 配置 `reconnection: Infinity + 指数退避`，重连成功后自动 `emit('resume')` 重放会话（`startRunViaSocket` 内 `handleSocketReconnect`），并有 `run.reattach_failed` 兜底事件。

---

## 三、前端展现交互结构

### 3.1 页面全景（28 个路由视图，router/index.ts 实测）

| 路由 | 视图 | 功能 | WorkBuddy 对应物 |
|---|---|---|---|
| `/hermes/chat`、`/hermes/session/:sessionId` | ChatView | 主聊天（会话侧栏+消息流+抽屉面板） | 主窗口聊天 |
| `/desktop-chat/:sessionId` | ChatView(standalone) | 桌面独立聊天窗 | 独立会话窗口 |
| `/hermes/history[/session/:id]` | HistoryView | 历史会话浏览 | 历史会话 |
| `/hermes/global-agent[/session/:id]` | GlobalAgentView | 全局代理（跨工作区） | cloudAgent |
| `/hermes/jobs` | JobsView | 定时任务 | 自动化任务 |
| `/hermes/kanban` | KanbanView | 任务看板 | 任务列表 |
| `/hermes/workflow` | WorkflowView | 可视化工作流编排 | —（超出） |
| `/hermes/models` | ModelsView | 模型/Provider 配置 | 模型选择+设置 |
| `/hermes/profiles` | ProfilesView | 多实例 Profile 管理 | —（超出） |
| `/hermes/skills`、`/hermes/skills-usage` | SkillsView 等 | 技能管理/用量 | 技能管理 |
| `/hermes/plugins` | PluginsView | 插件管理 | builtin-plugins |
| `/hermes/mcp` | McpManagerView | MCP 服务器管理 | MCP 连接器 |
| `/hermes/memory` | MemoryView | 记忆管理 | memory:* |
| `/hermes/settings`、`/hermes/theme` | SettingsView / ThemeView | 设置/主题 | 设置窗口 |
| `/hermes/logs`、`/hermes/usage`、`/hermes/performance` | — | 日志/用量/性能监控 | —（部分超出） |
| `/hermes/terminal` | TerminalView | Web 终端 | terminal:* |
| `/hermes/files` | FilesView | 工作区文件管理 | 文件预览 |
| `/hermes/coding-agents` | CodingAgentsView | 外接编码代理（Claude Code/Codex 等） | —（超出） |
| `/hermes/group-chat[/room/:roomId]` | GroupChatView | 多 Agent 群聊 | —（超出） |
| `/hermes/journey`、`/hermes/petdex`、`/desktop-pet` | — | 旅程回顾/宠物系统 | —（超出） |
| `/hermes/devices`、`/hermes/channels`、`/hermes/version-preview` | — | 设备配对/通道/版本预览 | —（超出） |
| `/` | LoginView | 登录（JWT） | 云端登录 |

侧栏导航实测 22 项（`AppSidebar.vue` 中 `hermes.*` 枚举）。聊天/历史/全局代理/群聊/工作流五类页面使用**页内侧栏**（`usesPageSidebar`，App.vue:40-42），其余页面用全局 AppSidebar——即「会话列表侧栏」与「功能导航侧栏」互斥切换，这一点与 WorkBuddy 的固定双栏不同。

### 3.2 主聊天界面结构（ChatPanel.vue，3811 行）

实测模板结构（行号相对 template 起点）：

```
<div class="chat-panel">
├── <aside class="session-list">              # 会话侧栏（可折叠）
│   ├── PageSidebarNav                        # 新建会话 + chat/global 切换
│   ├── session-list-toolbar                  # Profile 过滤下拉 + 批量删除模式
│   ├── 置顶分组 + 时间分组会话列表（SessionListItem）
│   └── 新会话弹窗（工作区选择 FolderPicker + 模型选择）
├── <main class="chat-main">
│   ├── chat-header                           # 标题/模型徽标/工具按钮（监控、语音、抽屉开关）
│   ├── <div class="chat-main-content">
│   │   ├── MessageList / VirtualMessageList  # 消息流（虚拟滚动）
│   │   └── ChatInput                         # 富输入框（2657 行）
│   ├── OutlinePanel                          # 会话大纲导航
│   └── DrawerPanel（右侧抽屉）
│       ├── WorkspaceDiffPreview              # 运行级工作区 diff
│       ├── FilePreview                       # 文件预览（monaco）
│       ├── SubagentStreamPanel               # 子代理流面板
│       ├── FilesPanel                        # 工作区文件树
│       ├── TerminalPanel                     # 内嵌终端
│       └── DesktopBrowserPanel               # 内嵌浏览器
├── ConversationMonitorPane                   # 会话监控模式（human-only 过滤）
└── RealtimeVoiceStage (Teleport)             # 实时语音对话舞台
```

**三栏格局与 WorkBuddy 高度同构**：会话侧栏 = WorkBuddy 左栏；chat-main = 中栏；DrawerPanel = WorkBuddy 右侧 Artifact/预览面板（且内容更丰富：diff/文件/终端/浏览器/子代理四合一）。

### 3.3 消息流渲染体系（MessageItem.vue，1924 行）

消息 role 五类：`user / assistant / system / tool / command`（chat store `Message` 接口实测）。渲染分支：

- **tool 消息** → 工具卡片：折叠态显示 `toolPreview` 摘要，`toolStatus: running/error` 有转圈/错误徽标，可展开看完整 trace；文件修改类工具渲染 `ToolChangeCard`（diff 卡片）。等价于 WorkBuddy 的 tool_call/tool_call_update 卡片。
- **assistant 消息** → `MarkdownRenderer`（markdown-it + highlight.js + mermaid，含 `markdownFenceRepair.ts` 流式围栏修复）；思考内容双通道：优先 `reasoning` 字段（来自 `reasoning.delta/thinking.delta` 事件），回退解析正文 `<think>` 标签（`thinking-parser.ts`），渲染为可折叠 thinking-block，流式期间强制展开，并统计思考时长与字符数。
- **审批卡片**：store 内 `PendingApproval { command, description, choices: ['once','session','always','deny'] }`——四选一按钮组，对应 WorkBuddy 的 requestPermission 卡片。
- **澄清卡片**：`PendingClarify { question, choices }`——AskUserQuestion 等价物。
- **子代理流**：`SubagentStream { status, entries: (text|thinking|tool|status)[] }` 独立面板渲染。
- **压缩/中断状态条**：`compression.started/completed`、`abort.started/timeout/completed` 事件驱动的会话级状态。

### 3.4 富输入框（ChatInput.vue，2657 行）

实测能力：文件附件（点击/拖拽/粘贴上传，`handleDrop/handlePaste/handleFileChange`）、斜杠命令与技能选择器（`showSkillPicker`、`showBundlePicker`+`BundleCreateModal` 技能捆绑）、模型即时切换（`handleModelButtonClick`）、推理力度滑杆（`onReasoningEffortSliderChange`，对应 `reasoning_effort` 参数）、上下文上限编辑（`showContextEditModal`）、语音输入（麦克风录音 + STT，`useMicRecorder/usePcmStreamRecorder`）、输入法组合键处理、停止按钮（`onIsStop` → abort）。

### 3.5 主题与个性化

`useTheme` + `styles/theme.ts`：暗色（naive darkTheme）/亮色/漫画（isComic）三模式 + 服务器同步的自定义背景图（`/api/theme/background`），themeOverrides 动态计算。另有桌面宠物（WebPet/DesktopPetView）等趣味层。

---

## 四、前端代码结构

```
packages/client/src/
├── main.ts / App.vue            # 入口；App.vue 装配 NConfigProvider/侧栏/搜索弹窗/桌面标题栏
├── router/index.ts              # 243 行，28 路由全懒加载
├── api/                         # ★ 网络层（与后端唯一接触面）
│   ├── client.ts                # fetch 封装：baseUrl/JWT 管理/401 跳登录/角色解析（235 行）
│   ├── auth.ts / theme.ts / coding-agents.ts
│   └── hermes/                  # 42 个模块，按域一文件
│       ├── chat.ts              # ★ Socket.IO 协议层（1083 行，详见第五章）
│       ├── sessions.ts / skills.ts / mcp.ts / config.ts / jobs.ts / kanban.ts
│       ├── files.ts / memory.ts / logs.ts / profiles.ts / plugins.ts
│       ├── workflows.ts / workflow-socket.ts / group-chat.ts / global-agent.ts
│       ├── stt.ts / tts.ts / voice-provider-probe.ts
│       ├── anthropic-auth.ts / codex-auth.ts / copilot-auth.ts / nous-auth.ts / xai-auth.ts
│       └── runtime-versions.ts / write-gate.ts / performance-monitor.ts / ...
├── stores/hermes/               # 14 个 Pinia store
│   ├── chat.ts                  # ★ 核心（4940 行）：会话列表/消息流/运行状态/审批/澄清/子代理流/压缩/中断/usage
│   ├── app.ts（全局 UI 态+模型列表） settings.ts  profiles.ts  models.ts
│   ├── files.ts  jobs.ts  kanban.ts  usage.ts  group-chat.ts
│   └── tool-panel.ts  session-browser-prefs.ts  pets.ts  pet-state.ts
├── views/                       # LoginView + hermes/ 28 个页面视图（视图薄、逻辑在 store）
├── components/
│   ├── layout/                  # AppSidebar/DesktopTitleBar/ModelSelector/ProfileSelector/主题语言切换
│   ├── hermes/chat/             # ★ 聊天组件群（27 个）：ChatPanel/MessageList/VirtualMessageList/
│   │                            #   MessageItem/ChatInput/MarkdownRenderer/ToolChangeCard/
│   │                            #   DrawerPanel/FilesPanel/TerminalPanel/DesktopBrowserPanel/
│   │                            #   OutlinePanel/SubagentStreamPanel/SessionListItem/SessionSearchModal/...
│   └── hermes/{files,jobs,kanban,mcp,models,profiles,settings,skills,usage,workflow,pets,group-chat}/
├── composables/                 # 14 个：useTheme/useKeyboard/useSessionSearch/useSpeech/
│                                #   useMicRecorder/useVoiceDialogue/useToolTraceVisibility/...
├── utils/                       # desktop-bridge/thinking-parser/clipboard-files/completion-sound/
│                                #   workflow-* 系列/http-error/...
├── i18n/  styles/  types/  shared/  constants/  data/  assets/
```

**分层纪律**（对 kmaster-studio 最有价值的部分）：`views → stores → api → server`，视图不直接发请求；socket 事件在 `api/hermes/chat.ts` 全局注册一次，按 `session_id` 分发给 store 注册的 per-session handlers（`registerSessionHandlers`，30 个回调槽位）——多会话并行运行互不串流。

---

## 五、前端交互对后端服务的调用映射

### 5.1 通信通道总览

| 通道 | 地址 | 用途 |
|---|---|---|
| REST | `/api/**`（约 110+ 端点，实测枚举） | 全部 CRUD/配置/查询 |
| REST | `/v1/**` | OpenAI 兼容代理（对外 API） |
| Socket.IO | `/chat-run` | ★ 聊天运行主通道 |
| Socket.IO | `/global-agent` | 全局代理运行（事件协议同 /chat-run，`chat.ts:730` 按 transport 切换） |
| Socket.IO | `/group-chat` | 多代理群聊 |
| Socket.IO | `/workflow` | 工作流运行事件 |
| HTTP | `/upload`、`/api/hermes/download` | 附件上传/下载 |

鉴权：REST 带 `Authorization: Bearer <JWT>`；socket 握手带 `auth: { token }`。server 侧路由挂载顺序见 `server/src/routes/index.ts:61-116`（公开路由 → authMiddleware → 37 个受保护路由组）。

### 5.2 /chat-run 命名空间完整事件协议（chat.ts 实测枚举）

**上行（前端 emit，5 个）**：

| 事件 | 载荷 | 语义 |
|---|---|---|
| `run` | `StartRunRequest { input(string\|ContentBlock[]), session_id, profile, model, provider, workspace, instructions, reasoning_effort, mcp_servers, mode: 'scoped'\|'global', source, ... }` | 发起一轮 Agent 运行 |
| `resume` | `{ session_id, profile? }` | 恢复/重挂会话（回 `resumed`） |
| `abort` | `{ session_id }` | 中断当前运行 |
| `approval.respond` | `{ session_id, approval_id, choice: 'once'\|'session'\|'always'\|'deny' }` | 工具审批答复 |
| `clarify.respond` | `{ session_id, clarify_id, response }` | 澄清问题答复 |

**下行（前端 on，42 个，connectChatRun 全局注册）**：

| 类别 | 事件 | 对应 WorkBuddy ACP 事件 |
|---|---|---|
| 文本流 | `message.delta` / `message.interim` | agent_message_chunk |
| 思考流 | `reasoning.delta` / `thinking.delta` / `reasoning.available` | agent_thought_chunk |
| MoA | `moa.reference` / `moa.aggregating` | —（多模型聚合，超出） |
| 工具 | `tool.started` / `tool.completed` / `tool.failed` | tool_call / tool_call_update |
| 工作区 | `workspace.diff.completed` / `session.workspace.updated` | diff |
| 子代理 | `subagent.start/tool/progress/text/thinking/complete` + `delegation.updated` | —（WorkBuddy 无细粒度等价） |
| 运行生命周期 | `run.queued` / `run.started` / `run.completed` / `run.failed` / `run.peer_user_message` / `run.reattach_failed` | plan/stopReason |
| 审批 | `approval.requested` / `approval.resolved` | requestPermission RPC |
| 澄清 | `clarify.requested` / `clarify.resolved` | AskUserQuestion |
| 压缩 | `compression.started` / `compression.completed` | —（上下文压缩提示） |
| 中断 | `abort.started` / `abort.timeout` / `abort.completed` | session/cancel 回执 |
| 会话元数据 | `session.title.updated` / `session.command` | 会话标题生成 |
| 用量 | `usage.updated`（input/output/total_tokens） | — |
| 透传 | `agent.event` | 通用扩展事件 |
| 连接 | `connect` / `connect_error` / `disconnect` / `resumed` | — |

事件按 `event.session_id` 过滤分发（server 侧打 tag，client 侧 `sessionEventHandlers: Map<sessionId, handlers>`）。

### 5.3 REST API 全域映射（client/src/api 实测枚举，按域归并）

| 功能域 | 端点（节选自 110+ 实测清单） | 前端调用方 |
|---|---|---|
| 认证/用户 | `POST /api/auth/login`、`/api/auth/setup`、`/api/auth/me`、`/api/auth/users`、`/api/auth/change-password`、`/api/auth/locked-ips` | LoginView、api/auth.ts |
| 会话 | `GET/POST /api/hermes/sessions`、`GET/DELETE /sessions/:id`、`/sessions/:id/rename`、`/archive`、`/unarchive`、`/model`、`/workspace`、`/category`、`/usage`、`/context`、`POST /sessions/batch-delete`、`GET /sessions/conversations/:id/messages/paginated`、`GET /api/hermes/search/sessions`、`/session-categories` | chat store（会话列表/切换/改名/归档/分页拉历史） |
| 会话工作区文件 | `/sessions/:sid/workspace-files/list`、`/workspace-file/{read,content,write,copy,delete,rename,mkdir}`、`/workspace-run-changes[/:changeId/files/:fileId]` | FilesPanel、WorkspaceDiffPreview、FilePreview |
| 技能 | `GET /api/hermes/skills`、`GET/PUT/DELETE /skills/:category/:name`、`/skills/:c/:s/files`、`POST /skills/toggle`、`/skills/pin`、`/skills/external-dirs`、`GET /skills/usage/stats`、skill-bundles | SkillsView、ChatInput 技能选择器 |
| MCP | `GET/POST /api/hermes/mcp/servers`、`PUT/DELETE /mcp/servers/:name`、`POST /mcp/servers/:name/test`、`POST /mcp/reload`、`GET /mcp/tools` | McpManagerView |
| 模型/Provider | `/api/hermes/config/{model,models,providers,credentials,auxiliary-models,moa}`、`/available-models`、`/provider-models[/cache/refresh]`、`/custom-model`、`/model-alias`、`/model-visibility`、`/model-context/:provider/:model` | ModelsView、ModelSelector |
| Provider OAuth | `/api/hermes/auth/{anthropic,codex,copilot,nous,xai}/start|status` | models/settings 组件 |
| Profile | `GET/POST /api/hermes/profiles`、`/profiles/active`、`/profiles/:name/{rename,restart,gateway/restart,runtime-status,avatar}` | ProfilesView、ProfileSelector |
| 任务/看板 | `/api/hermes/jobs[?include_disabled]`、`/jobs/delivery-targets`、`/api/hermes/kanban/{boards,tasks/bulk,dispatch,complete,unblock,stats,links,assignees,capabilities,diagnostics}` | JobsView、KanbanView |
| 工作流 | `/api/hermes/workflows`、`/:id/run`、`/:id/runs/:runId/{stop,rerun-from-node,nodes/:nodeId/approval}`、`/import/{preview,confirm,cancel}`、`/:id/export`、`/batch-delete` | WorkflowView + /workflow socket |
| 记忆 | `/api/hermes/memory` | MemoryView |
| 日志/监控 | `/api/hermes/logs[/:name]`、`/performance/runtime`、`/usage/stats` | LogsView、PerformanceView、UsageView |
| 写入门禁 | `/api/hermes/write-gate/pending[/:subsystem/:id/{approve,reject,diff}]` | 审批中心（agent 配置写保护） |
| 文件管理 | `/api/hermes/files/{write,copy,delete,rename,mkdir}`、`/api/hermes/download` | FilesView |
| 更新/版本 | `/api/hermes/update[/preview/{prepare,start,stop,install,tags}]`、`/runtime-versions/**` | VersionPreviewView、版本管理弹窗 |
| 语音 | `/api/hermes/stt/{settings,transcribe}`、`/tts/settings`、`/api/voice/providers/probe` | 语音输入/朗读设置 |
| 主题 | `GET/POST /api/theme`、`/api/theme/background` | ThemeView（服务器同步主题） |
| 其他 | `/api/coding-agents/**`、`/api/devices/**`、`/api/mcu-devices/**`、`/api/hermes/weixin/**`、`/api/hermes/plugins/:key/{enable,disable}`、`/api/hermes/journey`、`/api/hermes/petdex/**` | 相应视图 |

### 5.4 核心链路端到端时序

**① 发送消息（主链路）**

```
ChatInput.handleSend
→ chat store：乐观插入 user 消息
→ api/hermes/chat.ts startRunViaSocket(body)
   ├─ connectChatRun(profile)   # 复用/新建 /chat-run socket（auth.token + query.profile）
   ├─ registerSessionHandlers(session_id, 30 个回调)
   └─ socket.emit('run', StartRunRequest)
→ [server] run-chat/index.ts 收 'run' → AgentBridge.chatStream() → hermes-agent AIAgent
→ 下行事件流：run.started → (reasoning.delta|thinking.delta)* → message.delta*
   → (tool.started → tool.completed|failed)* → (subagent.*)* → usage.updated
   → workspace.diff.completed? → run.completed{output, usage, workspace_run_change}
→ store 按事件增量更新 Message[]；MessageList 流式渲染
→ 完成后 session.title.updated（首轮自动命名）
```

**② 工具审批**：`approval.requested{approval_id, command, description, choices}` → store 挂 PendingApproval → MessageItem 渲染四钮卡片 → `respondToolApproval()` emit `approval.respond{choice}` → server 转 Bridge `approvalRespond()` → agent 继续/拒绝 → `approval.resolved` 清卡片。

**③ 澄清问答**：`clarify.requested{clarify_id, question, choices}` → 卡片（选项或自由文本）→ `respondClarify()` emit `clarify.respond` → `clarify.resolved`。

**④ 停止**：停止按钮 → `socket.emit('abort',{session_id})` → `abort.started` →（agent 侧最长等待）→ `abort.completed` 或 `abort.timeout`；UI 全程显示中断中状态。

**⑤ 恢复会话/断线重连**：切换会话或 socket 重连 → `emit('resume',{session_id})` → server 重挂运行中的 run 并回 `resumed{...}`（含未消费事件回放）；若 run 已丢失回 `run.reattach_failed`。历史消息本体则走 REST 分页 `GET /sessions/conversations/:id/messages/paginated`。

**⑥ 新建会话**：新会话弹窗（选工作区 FolderPicker + 模型）→ `POST /api/hermes/sessions` → 路由跳 `/hermes/session/:id` → 首条消息走链路①。

### 5.5 server 内部下游（供参考，衔接 02 号文档）

`/chat-run` handler → `services/hermes/run-chat/` → `services/hermes/agent-bridge/`（`client.ts` 提供 `chat/chatStream/abort/approvalRespond/clarifyRespond/contextEstimate/listSessions/mcpAdd/mcpTest/mcpReload/reloadSkills/...`）→ Python bridge 进程内实例化 `run_agent.AIAgent`（Windows 经 `tcp://127.0.0.1:16765`）。REST 路由则大多直接读写 server 自己的 SQLite（会话/看板/任务）或转发 Bridge。

---

## 六、与 WorkBuddy 前端对照及对 kmaster-studio 的启示

| 维度 | WorkBuddy | hermes-studio | kmaster-studio 取舍（呼应 02 号文档） |
|---|---|---|---|
| 宿主 | 重 Electron（主进程即 BFF） | Web 优先 + 薄 Electron 壳 | 取 hermes-studio 路线（Web 优先） |
| 渲染框架 | React + zustand + radix | Vue3 + Pinia + Naive UI | 取 Vue3 栈（复用度最高） |
| UI↔引擎协议 | ACP（JSON-RPC over stdio） | Socket.IO 事件 + REST | 取 Socket.IO；事件语义两者可 1:1 映射（见 5.2 对照列） |
| 会话流事件 | sessionUpdate 10 类 | /chat-run 下行 42 类（更细） | 直接复用 /chat-run 协议，裁剪 UI 不用的（moa/pets 等） |
| 权限确认 | requestPermission 双向 RPC | approval.requested/respond 事件对 | 复用事件对 |
| 右侧面板 | Artifact/HTML 预览/浏览器 | Drawer：diff/文件/终端/浏览器/子代理 | 合并两者：WorkBuddy 式 Artifact 卡片 + hermes 式 Drawer 内容 |
| 布局差异 | 固定「会话栏+聊天+预览」三栏 | 会话栏与功能导航互斥、Drawer 默认收起 | 按 WorkBuddy 改为常驻三栏（视图层重写点） |
| 可直接复用层 | — | api/（42 模块）、stores/（14 store）、socket 协议层、composables、i18n/主题 | ≈60% 代码可平移，仅重写 views/components 展现层 |

**核心结论**：hermes-studio 的「api 层 + store 层 + socket 协议层」已经把 hermes-agent 的全部能力（会话/流式/工具/审批/澄清/子代理/技能/MCP/记忆/模型/任务）封装成前端可消费的干净接口，且分层纪律良好（视图零网络调用）。kmaster-studio 只需**保留这三层、重写 views/components 为 WorkBuddy 式展现**，即可用最小成本获得完整功能面——这验证并细化了 02 号设计方案的主方案路线。
