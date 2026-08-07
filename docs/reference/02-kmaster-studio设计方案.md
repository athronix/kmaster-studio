# kmaster-studio 设计方案

> 定位：一款 **展现与交互对齐 WorkBuddy 桌面端**、**技术架构复用 hermes-studio**、**后端完全由 hermes-agent 提供服务** 的 Agent 前端 Studio。
> 约束：`D:\Users\towyq\Documents\Projects\hermes-agent` 与 `D:\Users\towyq\Documents\Projects\hermes-studio` 均为只读参考，kmaster-studio 为独立新工程。
> 本文对每一个功能点给出：前端交互 → studio-server 后台处理流程 → 对 hermes-agent 服务/功能/数据的具体调用。

---

## 一、总体架构

### 1.1 三层架构（复用 hermes-studio 骨架）

```
┌───────────────────────────────────────────────────────────────────┐
│ kmaster-client  (Vue 3 + Vite + Pinia + Naive UI)                  │
│   WorkBuddy 式三栏布局 · 消息流 reducer · Socket.IO 客户端          │
├──────────────── HTTP REST (/api/*)  +  Socket.IO (/chat-run) ──────┤
│ kmaster-server  (Koa + @koa/router + socket.io + better-sqlite3)   │
│   routes → controllers → services 三层 · 会话/消息本地库            │
│   AgentBridgeManager：拉起并连接 Python Bridge                      │
├──────── Bridge Socket 协议 (Windows: tcp://127.0.0.1:16765) ───────┤
│ hermes_bridge.py（bridge_broker/bridge_pool/bridge_server）         │
│   在 Python 进程内实例化 run_agent.AIAgent（platform="cli"）        │
├───────────────────────────────────────────────────────────────────┤
│ hermes-agent（只读依赖，pip 包或源码 checkout）                     │
│   AIAgent loop · 92 工具模块/57 工具集 · 175 技能 · MCP · 记忆      │
│   数据：~/.hermes/{config.yaml, sessions/, skills/, kanban.db,      │
│         state.db, memory, mcp_servers}                              │
└───────────────────────────────────────────────────────────────────┘
```

**为什么选 Bridge 而不是 ACP**：hermes-agent 自带 `acp_adapter/`（支持 `session/new`、`session/load`、`sessionUpdate`、`requestPermission`，与 WorkBuddy 引擎协议同源），可以作为备选直连方案；但 hermes-studio 的 AgentBridge 已经验证了更丰富的能力面（steer、clarify、compression、background delegation、goal evaluation、MCP 管理、技能热重载），且事件粒度与 WorkBuddy 的 sessionUpdate 几乎一一对应。**主方案取 Bridge，ACP 直连作为"轻量模式"备选**（见 §五）。

### 1.2 技术选型清单

| 层 | 选型 | 来源 |
|---|---|---|
| 前端框架 | Vue 3.5 `<script setup lang="ts">` + Pinia + vue-router | hermes-studio 同款 |
| UI | Naive UI + 自定义 WorkBuddy 风主题（CSS vars 双主题） | 重写视图层 |
| 消息渲染 | markdown-it + katex + mermaid + highlight.js + monaco（diff/代码） | hermes-studio 依赖复用 |
| 实时通信 | socket.io-client（命名空间 `/chat-run`） | hermes-studio 协议复用 |
| 服务端 | Koa + @koa/router + socket.io + better-sqlite3 + pino | hermes-studio 同款 |
| Agent 接入 | AgentBridge（Node client + Python bridge 子进程） | hermes-studio `services/hermes/agent-bridge` 模式重实现 |
| 桌面化(可选) | Electron 壳（加载本地 server），后期做 | hermes-studio packages/desktop 模式 |

### 1.3 工程结构

```
kmaster-studio/
├── packages/client/src/
│   ├── api/            # HTTP 客户端（chat/sessions/skills/mcp/config/jobs/memory/files/models/upload）
│   ├── stores/         # Pinia：chat.ts(核心 reducer)/sessions/skills/mcp/settings/artifacts/queue
│   ├── views/          # ChatView(主三栏)/SkillsView/McpView/AutomationView/MemoryView/SettingsView/HistoryView
│   ├── components/
│   │   ├── chat/       # MessageList/UserBubble/AgentMarkdown/ThoughtBlock/ToolCallCard/PlanCard/
│   │   │               # ApprovalCard/ClarifyCard/SubagentCard/UsageBar/QueueTray/InputComposer
│   │   ├── sidebar/    # SessionList/SessionItem/NavRail
│   │   └── preview/    # ArtifactPanel/HtmlPreview/FileDiffView/FileTree/TerminalPane
│   └── styles/         # workbuddy-like 主题 token（--km-* 变量，暗/亮双主题）
├── packages/server/src/
│   ├── routes/         # sessions.ts/chat-run.ts/skills.ts/mcp.ts/config.ts/models.ts/files.ts/
│   │                   # jobs.ts/memory.ts/upload.ts/usage.ts/health.ts
│   ├── controllers/    # 请求校验层
│   ├── services/
│   │   ├── agent-bridge/   # Node 客户端 + python/ Bridge（参考 hermes-studio 实现重写）
│   │   ├── run-chat/       # /chat-run Socket.IO 编排（事件转译中枢）
│   │   ├── sessions.ts skills.ts mcp.ts cron.ts memory.ts files.ts
│   └── db/             # kmaster.db（sessions/messages/usage/settings 表）
└── bin/ scripts/ docs/
```

数据归属：**kmaster-studio 自身状态**存 `~/.kmaster-studio/`（UI 会话索引、消息缓存、上传文件）；**Agent 状态**始终在 `~/.hermes/` 由 hermes-agent 自己管理，studio 只经 Bridge/CLI/文件只读方式访问，绝不双写。

---

## 二、界面结构（对齐 WorkBuddy）

```
┌──────┬────────────────────────────────┬───────────────────┐
│ NavRail│  消息流                        │  Artifact 预览面板 │
│ +      │  ├ 用户气泡(可编辑重发)        │  ├ HTML live 预览  │
│ 会话   │  ├ Agent markdown 正文         │  ├ 文件/图片/PDF   │
│ 列表   │  ├ 思考块（折叠，流式）        │  ├ workspace diff  │
│ (搜索/ │  ├ 工具调用卡片（折叠/状态色） │  └ 内置终端(xterm) │
│ 分组/  │  ├ 计划/任务卡片(kanban 驱动)  │                   │
│ 归档)  │  ├ 权限确认卡片                │   可收起 ⇄        │
│        │  ├ 澄清问题卡片(选项按钮)      │                   │
│ 技能   │  ├ 子代理进度卡片              │                   │
│ MCP    │  └ 压缩/用量提示条             │                   │
│ 自动化 ├────────────────────────────────┤                   │
│ 记忆   │ 输入区: [模式▾][模型▾][技能◉]  │                   │
│ 设置   │  文本框(@文件 //命令) [队列][⏹]│                   │
└──────┴────────────────────────────────┴───────────────────┘
```

与 WorkBuddy 的交互对齐点：折叠式工具卡片、流式思考块、内联权限卡、消息队列托盘、右侧工件面板、底部模式+模型选择、斜杠命令面板、暗/亮主题。

---

## 三、功能点全集：后台处理流程 × hermes-agent 调用映射

> 记号：`[REST]` = kmaster-server HTTP 接口；`[WS↑/WS↓]` = /chat-run Socket.IO 上行/下行事件；`[Bridge]` = AgentBridge 操作（最终落到 Python 进程内 `run_agent.AIAgent` 的方法/状态）；`[FS/DB]` = 直接读 hermes-agent 数据文件。

### F1 发送消息（核心链路）

**前端**：InputComposer 组装 `content_blocks`（文本 + 上传文件引用）→ `[WS↑] run {session_id, message, profile, model?}`。

**后台流程**：
1. `run-chat` 收到 `run` → 校验 profile 权限 → `getOrCreateSession`（kmaster.db 建/取会话行）；
2. 判定消息是否斜杠命令（是 → 走 F14）；
3. `[Bridge] chat(sessionId, message, attachments?, instructions, profile, {background_delegation_enabled:true})` —— Bridge 首次调用时在 Python 侧创建 `AgentSession`（实例化 `AIAgent(platform="cli")`，provider/model/keys/tools 全部由 hermes-agent 自己从 `~/.hermes/config.yaml` 解析，studio 不传密钥）；
4. 返回 `run_id` → `[WS↓] run.started {run_id}`；
5. `[Bridge] chatStream(run_id)` / `getOutput(run_id, cursor, eventCursor)` 增量拉取 Agent 输出与事件，逐条转译为 WS 事件（映射表见下）；
6. run 结束 → `[Bridge] getResult(run_id)` → 消息落 kmaster.db → `[WS↓] run.completed {message, usage}`；
7. 异步 `[Bridge] getSessionTitle(sessionId)` 生成标题 → `[WS↓] session.title.updated`。

**Bridge 事件 → 前端渲染映射**（与 WorkBuddy sessionUpdate 对齐）：

| hermes Bridge/事件 | WS 下行事件 | UI 组件 | WorkBuddy 等价 |
|---|---|---|---|
| 输出 delta | `message.delta` | AgentMarkdown 追加 | agent_message_chunk |
| reasoning/thinking delta | `reasoning.delta` / `thinking.delta` | ThoughtBlock | agent_thought_chunk |
| 工具开始（tool_executor 派发） | `tool.started {tool,args}` | ToolCallCard(running) | tool_call |
| 工具结束/失败 | `tool.completed/failed {result}` | ToolCallCard(done/error) | tool_call_update |
| 审批请求（tools/approval.py） | `approval.requested {approval_id,action}` | ApprovalCard | requestPermission |
| 澄清请求（tools/clarify_tool.py） | `clarify.requested {clarify_id,question,options}` | ClarifyCard | AskUserQuestion |
| 子代理（tools/delegate_tool.py + async_delegation） | `subagent.start/tool/text/progress/complete` | SubagentCard | Task/Agent 工具卡 |
| 上下文压缩（agent/context_compressor） | `compression.started/completed` | 顶部提示条 | 压缩提示 |
| 用量（agent/usage_pricing） | `usage.updated {tokens,cost}` | UsageBar | usage 事件 |
| 工作区 diff（run-chat/workspace-diff-tracker 自实现） | `workspace.diff.completed` | FileDiffView | diff 事件 |

### F2 流式思考/正文渲染

前端 chat store 是纯 reducer：按 `message_id` 聚合 delta，`reasoning.*` 进思考块（默认折叠、运行时展开），`message.delta` 进正文（markdown-it 增量渲染 + mermaid/katex 后处理）。**无后台新增调用**，数据全部来自 F1 事件流。hermes-agent 侧的思考文本由 `agent/think_scrubber.py`/reasoning 通道产生，Bridge 原样透传。

### F3 停止 / 打断 / 引导（steer）

- **停止**：`[WS↑] abort {session_id}` → `[Bridge] interrupt(sessionId)`（触发 hermes `tools/interrupt.py` 的中断机制，AIAgent 循环在安全点停止）→ `[WS↓] abort.started → abort.completed`；超时未停 → `abort.timeout` + Bridge `destroy(sessionId)` 强杀重建。
- **运行中追加引导**（WorkBuddy 的"运行中发消息"）：`[WS↑] steer {session_id,text}` → `[Bridge] steer(sessionId, text)` → hermes 在下一轮迭代把 steering 文本注入上下文；UI 把该消息以"引导"样式插入消息流。

### F4 权限确认卡片

1. hermes 工具守卫（`tools/approval.py` + `agent/tool_guardrails.py`）产生审批请求 → Bridge 事件 → `[WS↓] approval.requested {approval_id, tool, args, risk}`；
2. UI 弹 ApprovalCard（允许一次 / 总是允许 / 拒绝）；
3. `[WS↑] approval.respond {approval_id, choice}` → `[Bridge] approvalRespond(approvalId, choice)` → Python 侧 resolve 挂起的 future，AIAgent 继续/跳过该工具；
4. `[WS↓] approval.resolved` 同步给同会话其他客户端。
"总是允许"由 server 记入 kmaster.db 的会话策略，后续同类审批自动应答（与 WorkBuddy 的 always-allow 一致）。

### F5 澄清问题卡片（AskUserQuestion 等价）

hermes `tools/clarify_tool.py` → `clarify.requested {clarify_id, question, options[]}` → ClarifyCard 渲染选项按钮 + 自由输入 → `[WS↑] clarify.respond {clarify_id, response}` → `[Bridge] clarifyRespond(clarifyId, response)` → 工具返回用户答案，循环继续。

### F6 计划/任务列表卡片

WorkBuddy 的 `plan` 事件在 hermes 中对应 **kanban 体系**（`tools/kanban_tools.py`，数据在 `~/.hermes/kanban.db`）：
- Agent 调 `kanban_*` 工具建卡/更新 → 该工具调用本身经 `tool.started/completed` 事件被前端捕获，PlanCard 增量更新；
- 打开会话时全量拉取：`[REST] GET /api/kanban/cards?session=` → server 直接**只读** `kanban.db`（SQLite），映射为 checklist 渲染；
- 看板页（可选二级界面）复用同一 REST。

### F7 会话列表 / 历史会话

- 列表：`[REST] GET /api/sessions`（kmaster.db 本地索引：id/title/时间/profile/归档态）；
- 导入 hermes 既有会话：`[REST] GET /api/sessions/hermes` → server 扫描 `~/.hermes/sessions/`（hermes 会话持久化目录）→ `POST /api/sessions/hermes/:id/import` 建本地索引；
- 打开历史会话：`GET /api/sessions/:id/messages`（本地缓存）+ `[Bridge] getHistory(sessionId)` 校准；继续对话时 Bridge 侧 `AgentSession` 惰性重建，hermes 自动从其 session DB 恢复上下文（`run_agent.py _ensure_db_session`）；
- 跨会话搜索：`GET /api/sessions/search?q=` → 优先 kmaster.db FTS；深度搜索走 hermes 的 FTS5 会话检索（context_engine/session_search 数据）。
- 删除/重命名/归档：本地库操作 + `[Bridge] destroy(sessionId)` 释放 Python 侧缓存。

### F8 模式切换（Craft / Plan / Ask）

hermes-agent 无内置三模式，用 **指令注入 + 审批策略** 组合实现（acp_adapter 的 SessionModeState 证明该模式可行）：
- 模式定义在 kmaster-server 配置（instructions 模板 + 工具审批策略）：
  - Craft：默认 instructions，写操作按正常审批；
  - Plan：注入"只调研和产出计划，未经确认不得修改文件/执行变更"指令 + server 端对写类工具强制 `approval.requested`；
  - Ask：注入只读指令 + server 端拒绝所有写类工具审批（自动 deny）；
- 切换时机：模式作为会话属性存 kmaster.db，**在下一次 `[Bridge] chat(...)` 时经 `instructions` 参数带入**（Bridge chat 支持逐次传 instructions）；
- UI：底部模式下拉 + `current_mode` 标签，与 WorkBuddy 一致。

### F9 模型选择

- 模型清单：`[REST] GET /api/models` → server 执行 `hermes` CLI（`hermes model --list` 等价接口）或读 `~/.hermes/config.yaml` + providers 目录生成目录缓存（hermes-studio 的 model-catalog-cache 模式）；
- 会话内切换：`[WS↑] set-model` → `[Bridge] switchSessionModel(sessionId, provider, model)` → Python 侧调 `AIAgent.switch_model(new_model, new_provider, ...)`（run_agent.py:820）；
- 全局默认切换：`[REST] PUT /api/config/model` → server 调 `hermes config set`（CLI 子进程）写 config.yaml。

### F10 Artifact / 文件预览面板

- Agent 产出文件（write_file 等工具）→ `tool.completed` 事件含路径 → server 的 workspace-diff-tracker 对 run 前后做快照 diff → `[WS↓] workspace.diff.completed {changes[]}` → 前端 Artifact 面板列出新增/修改文件卡片；
- 预览：`[REST] GET /api/sessions/:id/workspace-file/read?path=`（server 以会话工作区为根做路径白名单校验后读文件）；HTML → iframe live 预览（sandbox）；图片/PDF/docx → 对应查看器；代码 → monaco；
- 文件树：`GET /api/sessions/:id/workspace-files/list`；
- 下载/导出：`GET /api/download?path=`。
数据源均为 hermes 会话工作区（launch cwd，`run_agent.py _launch_cwd_for_session`），**不经 Bridge，由 server 直接 fs 访问**。

### F11 技能管理（对齐 WorkBuddy 技能页 + 市场）

- 列表：`[REST] GET /api/skills` → server 扫描 hermes 技能目录：内置 `hermes-agent/skills/`（只读）、可选 `optional-skills/`、用户 `~/.hermes/skills/`，解析各 `SKILL.md` YAML frontmatter（name/description/triggers）；
- 启停：`PUT /api/skills/toggle` → 写 hermes 配置的技能开关（config.yaml 对应字段，经 `hermes config set` CLI）→ `[Bridge] reloadSkills(profile)` 热生效；
- 安装/导入：`POST /api/skills/import`（zip/目录/URL）→ 落 `~/.hermes/skills/<name>/` → `reloadSkills`；卸载 = 删目录 + reload；
- 详情：`GET /api/skills/:category/:skill/files` + 文件读取，前端渲染 SKILL.md；
- 使用统计：hermes 技能使用事件（skill_utils 记录）→ `GET /api/skills/usage/stats`。

### F12 MCP 连接器管理

全部走 Bridge 的 MCP 操作族（Python 侧操纵 hermes 的 `~/.hermes/mcp_servers` 配置与 `tools/mcp_tool.py` 连接池）：
- 列表：`GET /api/mcp/servers` → `[Bridge] mcpList(profile)`；
- 新增/编辑/删除：`POST/PATCH/DELETE /api/mcp/servers/:name` → `mcpAdd/mcpUpdate/mcpRemove`；
- 连通性测试：`POST /api/mcp/servers/:name/test` → `mcpTest`；
- 工具清单/开关：`GET /api/mcp/tools` → `mcpTools(server)`；
- 热重载：`POST /api/mcp/reload` → `mcpReload`。
UI 仿 WorkBuddy 连接器页：卡片 + 已连接状态 + 工具开关 + 原始 JSON 编辑器（monaco）。

### F13 记忆管理

hermes 记忆体系 = `tools/memory_tool.py` + `~/.hermes/memory` + context_engine 插件：
- 查看：`GET /api/memory` → server 读 memory 存储（文件/SQLite，按 hermes 版本适配）分组展示；
- 编辑/删除条目：`PUT/DELETE /api/memory/:id` → 写回存储（studio 内唯一直写 hermes 数据的例外，需文件锁 + 备份）；
- 会话内记忆操作仍由 Agent 自身完成（memory_tool 调用以 tool.started 卡片呈现）。

### F14 斜杠命令

- `[REST] GET /api/commands` 返回可用命令（server 静态注册 + hermes skill_commands 派生）；输入 `/` 弹命令面板（WorkBuddy 式）；
- 执行：`run` 消息经 server 的 `isSessionCommand` 判定 → `[Bridge] command(sessionId, command)` → hermes 侧执行会话命令（如 /clear、/compact、/model）→ 结果以 `session.command` 事件回显。

### F15 定时任务 / 自动化（对齐 WorkBuddy 自动化页）

hermes 内置 cron 调度器（`cron/` 目录）：
- 列表/CRUD：`GET/POST/PATCH/DELETE /api/jobs` → server 调 `hermes` CLI 的 cron 管理命令或直接读写 hermes cron 配置存储（以 CLI 为准，避免格式漂移）；
- 运行历史：`GET /api/cron-history` → 读 hermes cron 执行记录；
- 手动触发：`POST /api/jobs/:id/run` → CLI 触发一次性执行；
- 任务产物投递到会话：cron 运行产生的新会话出现在 F7 的 hermes 会话导入列表。

### F16 子代理 / 并行委派

- hermes `delegate_tool` + `async_delegation`（background delegation）→ Bridge 事件 `subagent.*`、`delegation.updated` → SubagentCard 展示每个子代理的目标/进度/产出（对齐 WorkBuddy 团队/子代理运行态）；
- 后台任务完成通知：server 轮询 `[Bridge] backgroundPoll()` → `[WS↓]` 通知 + 完成后 `completeBackgroundNotification()` 确认（hermes-studio 已验证的 at-least-once 投递模式）。

### F17 消息队列（WorkBuddy 队列托盘）

hermes Bridge 无队列概念 → **在 kmaster-server 实现**（对齐 WorkBuddy 的宿主侧队列设计）：run 进行中收到的 `run` 请求入 kmaster.db 队列表 → `[WS↓] run.queued` → UI 队列托盘（可编辑/重排/删除/立即发送）→ `run.completed` 后 server 自动出队下一条走 F1。

### F18 上下文压缩 / 上下文用量

- 自动压缩：hermes `context_compressor` 触发 → `compression.started/completed` 事件 → UI 顶部提示；
- 需要用户决策的压缩：`[Bridge] compressionRespond(...)` 应答；
- 上下文占用估算：`[Bridge] contextEstimate(sessionId, history, instructions, profile)` → UsageBar 显示 token 占用 / 上限（`GET /api/sessions/context-length` 缓存）。

### F19 文件上传 / @引用

`POST /api/upload`（multipart）→ 存 `~/.kmaster-studio/uploads/<session>/` → 返回路径 → 作为 content block 附在 F1 的 message 里（hermes AIAgent 支持附件路径注入，图像走 vision 通道）；输入框 `@` 触发工作区文件模糊搜索（`GET /api/sessions/:id/workspace-files/list?q=`）。

### F20 内置终端（可选，对齐 WorkBuddy devtools-terminal）

`[REST/WS] /api/terminal` → server 用 node-pty 在会话工作区开 shell，xterm.js 前端；与 hermes-agent 无交互（纯 studio 能力），但 cwd 对齐会话工作区，方便用户查看 Agent 产物。

### F21 设置页

- Provider/API Key：`GET/PUT /api/config/providers` → `hermes config set`（密钥只写不回显；hermes 的 credential 体系管理实际存储）；
- Profile 多实例：`GET/POST /api/profiles` → hermes profile 目录管理（每 profile 独立 `~/.hermes` 变体，Bridge 按 profile 路由到不同 worker —— bridge_broker 原生支持）；
- 主题/语言/快捷键：kmaster.db settings 表，纯前端消费；
- 诊断：`GET /api/health` + `hermes doctor` 输出展示。

### F22 用量统计页

- 会话级：F1 的 `usage.updated` 事件累积存 kmaster.db usage 表；
- 汇总：`GET /api/usage/stats`（按天/模型/会话聚合）；数据源为 hermes `usage_pricing`/`billing_usage` 经 Bridge 透传的 token+cost 字段。

---

## 四、Socket.IO `/chat-run` 事件协议总表

**上行**：`run`、`abort`、`steer`、`resume`（断线重连恢复：server 重放缓存事件 + `[Bridge] statusIfLoaded` 校准运行态）、`approval.respond`、`clarify.respond`、`compression.respond`、`set-model`。

**下行**：`run.started/queued/completed/failed/reattach_failed`、`message.delta/interim`、`reasoning.delta`、`thinking.delta`、`tool.started/completed/failed`、`approval.requested/resolved`、`clarify.requested/resolved`、`subagent.start/tool/text/progress/complete`、`delegation.updated`、`compression.started/completed`、`abort.started/timeout/completed`、`usage.updated`、`workspace.diff.completed`、`session.title.updated`、`session.command`、`agent.event`（兜底透传）。

该协议是 hermes-studio `/chat-run` 命名空间的实测事件集（`packages/client/src/api/hermes/chat.ts:746-791`），kmaster-studio 原样继承，保证与 Bridge 层零适配成本。

---

## 五、备选：ACP 直连轻量模式

hermes-agent 的 `acp_adapter/`（`server.py` 中 `HermesACPAgent`：`initialize/authenticate/session-new/load/prompt/cancel` + `sessionUpdate` 回放 + `requestPermission` + SessionModeState + 模型选择）与 WorkBuddy 引擎协议同源。轻量模式下 kmaster-server 可直接 spawn `python -m acp_adapter`（stdio JSON-RPC），把 ACP sessionUpdate 直译为同一套 WS 事件。适用场景：无需 MCP 管理/技能热重载/后台委派的精简部署。两种模式共用前端，仅 server 内 `agent-runner` 实现不同。

---

## 六、实施路线

| 阶段 | 内容 | 里程碑 |
|---|---|---|
| M1 | server 骨架 + AgentBridge 打通 + F1/F2/F3 最小聊天闭环 | 能流式对话、停止 |
| M2 | F4/F5/F6 卡片体系 + F7 会话管理 + F10 Artifact 面板 | WorkBuddy 式主界面完整 |
| M3 | F8 模式 / F9 模型 / F11 技能 / F12 MCP / F19 上传 | 管理面完整 |
| M4 | F13 记忆 / F15 自动化 / F16 子代理 / F17 队列 / F18 压缩 / F22 用量 | 全功能对齐 |
| M5 | F20 终端 / F21 Profile / Electron 桌面壳 / 打包分发 | 桌面化 |

**风险与对策**：
1. Bridge 协议为 hermes-studio 私有实现 → kmaster 重写 Python bridge 时锁定 hermes-agent 版本（v0.18.x），以 `run_agent.AIAgent` 公开方法为唯一契约；
2. hermes-agent 只读约束 → 所有写操作只经 CLI（`hermes config set` 等）或 `~/.hermes` 用户数据目录，不改源码；
3. Windows 上 Bridge 用 TCP 127.0.0.1:16765，需处理端口占用与多 profile 端口分配（`HERMES_AGENT_BRIDGE_WORKER_PORT_BASE`）。
