# WorkBuddy 桌面前端深度分析报告

> 分析对象：WorkBuddy Desktop v5.2.6（`@genie/workbuddy-desktop`，app.asar 解包源码 `D:\workbuddy-workspace\_wb_asar`）
> 分析维度：①前端技术架构 ②前端展现交互结构 ③前端代码结构 ④前端交互 → 后端服务调用映射
> 所有结论均有文件路径 / 代码符号级证据，逐条可复核。

---

## 一、前端技术架构

### 1.1 总体：Electron 四进程分层

```
┌────────────────────────────────────────────────────────────────┐
│ 渲染进程 renderer/  (Chromium)                                  │
│   React SPA（Vite 构建，hash 资产）+ zustand + radix-ui + i18next│
│   ACP 协议客户端（acp-B8Kok46A.js，JSON-RPC over IPC）          │
├────────────────────────────────────────────────────────────────┤
│ 桥接层 preload/index.js  (contextBridge)                        │
│   exposeInMainWorld: workbuddyDesktop / vscode / __hostPlatform…│
│   封装 ~300 个 ipcRenderer.invoke/send/on 通道                  │
├────────────────────────────────────────────────────────────────┤
│ 主进程 main/index.js  (Node.js)                                 │
│   窗口/托盘/菜单 · 鉴权 auth.js · MCP 宿主 mcp.js · ACP 路由     │
│   daemon-app-server（后台守护）· automation 调度 · SQLite        │
├────────────────────────────────────────────────────────────────┤
│ Agent 引擎子进程 cli/dist/codebuddy.js (≈21MB 打包引擎)          │
│   @openai/agents loop + @modelcontextprotocol/sdk               │
│   与主进程之间走 ACP（Agent Client Protocol，stdio JSON-RPC）    │
└────────────────────────────────────────────────────────────────┘
```

**证据**：
- `package.json`：`"main": "main/index.js"`，deps 含 `@openai/agents`、`@modelcontextprotocol/sdk`、`better-sqlite3`、`@lydell/node-pty`、`ws`、`undici`。
- `preload/index.js`（187KB）：`contextBridge.exposeInMainWorld("workbuddyDesktop"...)`、`"vscode"`、`"__hostPlatform"` 等 14 个桥接对象。
- `renderer/assets/acp-B8Kok46A.js`：出现 `initialize`(16次)、`sessionUpdate`(15次)、`session/new`、`session/prompt`、`session/load`、`session/cancel`、`requestPermission` —— 渲染层直接实现了 ACP 客户端语义。
- `main/acp.js`：主进程侧 ACP 转发/托管模块。

### 1.2 渲染层技术栈

| 项 | 结论 | 证据 |
|---|---|---|
| 框架 | React 18（生产构建） | Vite 产物特征 + radix-ui 依赖（React 专属） |
| 构建 | Vite（ESM + modulepreload + hash 文件名） | `renderer/index.html`: `<script type="module" src="./assets/index-mLD0YETC.js">` |
| 状态管理 | zustand | bundle 关键字命中 |
| UI 基元 | radix-ui（无头组件）+ 自绘样式 | bundle 关键字命中 |
| 国际化 | i18next | bundle 关键字命中 |
| 图表/图 | mermaid（30 个 chunk：flowchart/sequence/gantt/architecture…） | `architectureDiagram-*.js` 等 |
| 代码高亮 | shiki 按语言分包 | `abap-*.js`、`apex-*.js` 等上百个语言 chunk |
| 主题体系 | VS Code 主题变量（`--vscode-*`） | `index.html` 内联样式 `var(--vscode-editor-background)`、`body[data-vscode-theme-name="IDE Light"]` |

> 值得注意：WorkBuddy 渲染层复用了 CodeBuddy IDE（VS Code 系）的主题变量体系，所以桌面端和 IDE 插件端可以共享同一套 UI 代码。

### 1.3 Agent 引擎接入方式：ACP 协议

WorkBuddy **不是**在渲染进程里直接跑 Agent，而是：

1. 主进程 spawn `cli/dist/codebuddy.js`（内置 node 运行时执行）为子进程；
2. 主进程 ↔ 引擎之间走 **ACP（Agent Client Protocol）**：`initialize` → `session/new` / `session/load` → `session/prompt` → 流式 `sessionUpdate` 通知 → `session/cancel`；
3. 渲染进程通过 `session:acpRequest` IPC 通道把 ACP 请求透传给主进程，主进程转发给引擎；引擎的 `sessionUpdate` 事件经 `session:event` 通道推回渲染进程。

ACP `sessionUpdate` 的事件子类型（renderer acp bundle 中枚举）：

```
agent_message_chunk    # 正文文本增量
agent_thought_chunk    # 思考增量
user_message_chunk     # 用户消息回放
tool_call              # 工具调用开始（含 kind/status/locations）
tool_call_update       # 工具调用状态/结果更新
plan                   # 任务计划（TaskList 的 UI 数据源）
available_commands_update  # 可用斜杠命令变更
current_mode_update    # Craft/Plan/Ask 模式变更
diff                   # 文件修改 diff 卡片
terminal               # 终端输出嵌入
```

权限确认：引擎发 `requestPermission`（JSON-RPC request），渲染层弹权限卡片，用户选择后经 `session:resolvePermission` / `session:rejectPermission` 回传。

### 1.4 多形态部署

`cli/product.json` + `product.{internal,ioa,cloudhosted,selfhosted}.json`：同一前端通过产品配置切换 内部版/企业版/云托管/私有化。product.json 是「109 条提示词 / 17 agents / 48 tools / 44 models / 9 commands」的唯一权威源，前端的模式菜单、模型下拉、斜杠命令面板全部由它驱动。

---

## 二、前端展现交互结构

### 2.1 主窗口布局（三栏 + 底部富输入）

```
┌──────┬───────────────────────────────┬──────────────────┐
│ 侧栏 │  会话消息流（虚拟滚动）        │  右侧预览面板     │
│      │  ├ 用户消息气泡               │  (artifact 卡片/  │
│ 会话 │  ├ Agent 正文(markdown/mermaid)│   HTML live 预览/ │
│ 列表 │  ├ 思考块(可折叠)             │   内置浏览器/     │
│ 专家 │  ├ 工具调用卡片(折叠+状态)     │   文件 diff 视图) │
│ 技能 │  ├ 任务列表卡片(plan)          │                  │
│ 自动 │  ├ 权限确认卡片(允许/拒绝)     │                  │
│ 化   │  └ show_widget 内联可视化      │                  │
│      ├───────────────────────────────┤                  │
│      │ 底部输入区：模式(Craft/Plan/   │                  │
│      │ Ask)·模型选择·连接器·@文件·队列│                  │
└──────┴───────────────────────────────┴──────────────────┘
```

**代码证据**（renderer/assets 的 chunk 命名即路由/面板名）：
`agent-chat-pane-*.js`（聊天主面板）、`archived-tasks-*`（归档任务）、`apply-join-page-*`（企业加入页）、`account-*`（账户）、以及 preload 通道语义（见 §四）。

### 2.2 关键交互模式

1. **消息流**：markdown 渲染 + shiki 高亮 + mermaid 图；`agent_thought_chunk` 渲染为可折叠"思考中"块；`tool_call`/`tool_call_update` 渲染为折叠卡片（标题=工具描述，状态=running/success/error，点击展开入参出参）。
2. **任务列表**：ACP `plan` 事件驱动，右上/内联显示 checklist，实时打勾。
3. **权限确认**：`requestPermission` → 内联卡片（允许一次/总是允许/拒绝），支持"跳过所有权限"模式。
4. **消息队列**：输入框支持在 Agent 运行中排队消息（`session:enqueueMessage`、`session:getMessageQueue`、`session:pauseQueue`…一整组通道），队列可编辑/重排/立即发送。
5. **打断与引导**：运行中可以 `session:cancel` 停止，或者直接发新消息触发 interruption（`session:resolveInterruption`）。
6. **右侧预览**：present_files 触发 artifact 卡片 + HTML live preview + 内置浏览器（localhost URL）；文件 diff 走 `diff` 事件。
7. **模式/模型切换**：底部下拉，`session:setMode` / `session:setModel`，模式清单来自 product.json 的 5 个 builtin agents（craft/ask/plan/debug/code-explorer）。
8. **斜杠命令**：`available_commands_update` 动态更新；输入 `/` 弹出命令面板。

### 2.3 二级界面

| 界面 | 功能 | 相关通道前缀 |
|---|---|---|
| 设置 | 通用/模型/快捷键/代理/隐私 | `config:*`、`shortcut:*` |
| 技能管理 | 列表/启停/导入/市场安装/安全扫描 | `skill:*`、`skillhub:*`、`builtin-market:*` |
| MCP 连接器 | 官方连接器 OAuth + 自定义 mcp.json | `connector:*`、`mcp:*` |
| 自动化 | 定时任务 CRUD + 运行历史 + 收件箱 | `automation:*` |
| 专家中心 | 100+ 专家浏览/召唤/自定义 | `expert:*` |
| 记忆管理 | 云端画像/本地记忆/导入 | `memory:*` |
| 云 Agent | 云端沙箱会话（Cloud Agent） | `cloudAgent:*` |
| IM 通道 | 企微/钉钉/飞书/Slack/QQ 机器人绑定 | `claw:*`、`agentIm:*` |
| 腾讯文档 | 导入/预览/上传 | `tencentDocs:*`、`docs:*` |

---

## 三、前端代码结构

```
_wb_asar/
├── package.json              # main: main/index.js
├── main/                     # 主进程（60+ 模块，编译后 JS）
│   ├── index.js              # 主入口：窗口/生命周期/协议注册
│   ├── acp.js                # ACP 会话托管与转发
│   ├── auth.js / file-authentication-storage.js / legacy-auth-session-migrator.js
│   ├── mcp.js / streamableHttp.js         # MCP 宿主（stdio + streamable HTTP）
│   ├── daemon-app-server-{main,entry}.js  # 后台守护 server（IM 通道、自动化在无窗口时运行）
│   ├── desktop-monitor-service*.js        # 桌面监控（屏幕/活动）
│   ├── main-docs-service.js / tdoc-*.js   # 腾讯文档集成
│   ├── menu-builder.js / menu-i18n*.js    # 原生菜单
│   ├── protocol.js                        # 自定义协议(deep link)
│   ├── readonly-sqlite.js                 # SQLite 只读访问层
│   ├── seed-builtin-plugins.js            # 内置插件播种
│   ├── session-create-timing.js / prompt-trace-reporter.js  # 性能与trace上报
│   └── workbuddy-product-config*.js       # product.json 装载
├── preload/index.js          # 唯一 preload：contextBridge + IPC 白名单封装
├── renderer/                 # 前端 SPA（Vite 产物）
│   ├── index.html            # 单页入口，VS Code 主题变量内联
│   └── assets/               # ~千个 hash chunk：页面级代码分包
│       ├── index-mLD0YETC.js         # app 入口
│       ├── acp-B8Kok46A.js           # ACP 客户端协议层
│       ├── agent-chat-pane-*.js      # 聊天面板
│       ├── app-providers-*.js        # 全局 Provider（主题/i18n/store）
│       ├── <mermaid 30 chunks> / <shiki 语言包> / *.css
├── cli/                      # Agent 引擎（独立可执行）
│   ├── product.json          # 109 prompts/17 agents/48 tools/44 models 权威源
│   ├── product.{internal,ioa,cloudhosted,selfhosted}.json
│   ├── dist/codebuddy.js     # 21MB 打包引擎（@openai/agents loop）
│   ├── dist/web-ui/ dist/wasm/
│   └── bin/ vendor/
├── resources/
│   ├── builtin-skills/(15) builtin-mcp-apps/(3) builtin-plugins/(2)
│   ├── templates/*.tpl       # 外部化 nunjucks 提示词模板
│   ├── mcp-app-preload.js / tdoc-*-preload.js / client-menu-preload.js
│   └── devtools-terminal/    # 内置终端(xterm + node-pty)
└── node_modules/
```

分层要点：**renderer 不直接碰 Node API**，一切经 preload 白名单；**引擎与 UI 完全解耦**（引擎是独立 CLI，可单独运行），UI 只是 ACP 客户端 —— 这是 kmaster-studio 可以直接借鉴的最核心设计。

---

## 四、前端交互 → 后端服务调用映射

### 4.1 IPC 通道全景（preload 实测枚举，按域分组）

| 域 | 通道（节选） | 后端处理 |
|---|---|---|
| **会话核心** | `session:create/load/list/get/delete/rename/move/archive` | 主进程 SQLite(`workbuddy.db`) + `~/.workbuddy/sessions/` |
| **消息收发** | `session:sendMessage`、`session:event`(推送)、`session:upsertMessage`、`session:notifyListenerReady` | 主进程 → ACP `session/prompt` → 引擎；`sessionUpdate` 流回推 |
| **ACP 透传** | `session:acpRequest` | 渲染层任意 ACP 方法直达引擎 |
| **停止/打断** | `session:cancel`、`session:requestYield`、`session:resolveInterruption` | ACP `session/cancel` |
| **权限** | `session:resolvePermission/rejectPermission/notifyPermissionPendingApproval/notifyPermissionResolvedFromLocal` | 应答引擎 `requestPermission` RPC |
| **问答/征询** | `session:answerQuestion/cancelQuestion`、`session:respondElicitation/respondToSampling/respondToRoots` | AskUserQuestion 卡片 + MCP elicitation/sampling 应答 |
| **消息队列** | `session:enqueueMessage/getMessageQueue/pauseQueue/resumeQueue/cancelQueue/reorderQueue/removeQueueItem/sendQueueItemNow/popQueueItemForEdit/saveMessageQueue/activateQueue` | 主进程队列管理器，Agent 空闲时自动出队 |
| **模式/模型/配置** | `session:setMode/setModel/setConfigOption/updateConfig`、`session:getAvailableCommands` | ACP `session/update` + product.json |
| **子代理/团队** | `session:getSubagentList`、`session:getTeamRuntime` | 引擎 team/subagent 运行态查询 |
| **用量** | `session:getLastUsageEvent/getPersistedUsage` | 引擎 usage 事件持久化 |
| **技能** | `skill:list/toggle/delete/import/installByPath/installFromUrl/installMarketplace/getContent/queryScanResult`、`skillhub:list/search/detail/install/categories`、`enterpriseSkills:*` | 主进程读写 `~/.workbuddy/skills/` + 云端技能市场 HTTP + 安全扫描 |
| **MCP** | `mcp:list/toggle/toggleTool/delete/reconnect/getConfigContent/saveConfigContent/openConfig` | 主进程 MCP 宿主管理 `~/.workbuddy/mcp.json` + stdio/HTTP 连接池 |
| **连接器** | `connector:listRegistry/getConnectors/authStart/authConnect/authStatus/authRevoke/updateEnv/updateHeaders/listProjectConnectors/…` | OAuth 流程（云端）+ 本地配置 |
| **文件** | `file:read/readChunked/write/writeBatch/listDir/makeDir/remove/rename/search/upload/exists/getInfo` | 主进程 fs 白名单操作 |
| **记忆** | `memory:getProfile/clearProfile/importContent/saveSettings/submitSuggestion/checkUpdating` | 云记忆 HTTP + 本地 MEMORY.md |
| **自动化** | `automation:update/delete/getSnapshot/deleteInboxItem` | 主进程 SQLite `automations` 表 + 调度器 |
| **鉴权/账户** | `auth:getToken/getUserInfo/getAccount/getAccountUsage/getEnterpriseUsage/…`、`oneid:getSSOLoginLink` | 云端 OneID/OAuth HTTP |
| **云Agent** | `cloudAgent:createConversation/createInstance/getQuota/listAvailableModels/…`（26 个） | 云端沙箱服务 HTTP |
| **窗口/更新** | `window:minimize/maximize/close/openExternal/…`、`update:check/download/quitAndInstall` | Electron 原生 + 更新服务器 |
| **专家/市场** | `expert:summonExpert/getCategories/getAgentTemplates/deleteCustomExpert`、`builtin-market:list/getByIds` | 云端市场 HTTP + 本地专家包 |
| **IM 通道** | `claw:getSavedChannels/setWecomEnabled/…`、`agentIm:getBinding/listBindings` | daemon-app-server 里的 IM SDK |
| **腾讯文档** | `tencentDocs:*`（20+） | 文档开放平台 HTTP |

### 4.2 核心链路时序（发送一条消息）

```
用户点击发送
→ renderer: session:sendMessage (IPC invoke)
→ main: 若引擎未起 → spawn cli/dist/codebuddy.js → ACP initialize
→ main: 无会话 → ACP session/new (cwd, mcpServers, mode, model)
→ main → 引擎: ACP session/prompt {sessionId, prompt:[{type:text,...},{type:resource_link,...}]}
→ 引擎循环: LLM 流式 → sessionUpdate(agent_thought_chunk/agent_message_chunk)
           工具调用 → sessionUpdate(tool_call → tool_call_update)
           需要授权 → requestPermission ⇄ session:resolvePermission
           计划更新 → sessionUpdate(plan)
→ main: 每个事件 webContents.send('session:event', …) 推给 renderer
→ renderer: zustand store 增量更新 → React 重渲染消息流
→ 引擎: prompt 完成 → 返回 stopReason → main 落库(SQLite/会话文件) → UI 置为 idle
```

### 4.3 云端 HTTP 面（主进程独占）

- 登录鉴权：OneID SSO（`oneid:*`）、企业策略（`enterprisePolicy:*`）
- 模型网关：引擎经统一 LLM 网关调模型（44 个模型清单在 product.json）
- 记忆云同步：`memory:*` 背后的画像服务
- 技能市场/专家市场：`skillhub:*`、`builtin-market:*`、`expert:*`
- 遥测：aegis SDK + OpenTelemetry OTLP + `prompt-trace-reporter.js`

**关键设计结论（供 kmaster-studio 借鉴）**：
1. UI 与 Agent 引擎之间用**标准化会话协议**（ACP）解耦，UI 不感知工具实现；
2. 所有流式渲染由**统一事件流**（sessionUpdate 子类型）驱动，UI 只是事件的 reducer；
3. 权限/提问/征询是**双向 RPC**（引擎等待 UI 应答），而非单向事件；
4. 消息队列、模式、模型都是**会话级状态**，由宿主（主进程）持有，UI 无状态可重连恢复；
5. 能力清单（模式/命令/模型/技能）全部**配置驱动**（product.json），UI 动态渲染。
