# WorkBuddy 技术分析与组件拆解 · 深度技术画像（环节 1）

> 本报告用 `win-ai-agent-analysis-decompose-skill` 对 **WorkBuddy 桌面客户端 v5.2.6**（`@genie/workbuddy-desktop`，内核 `genieVersion 5.2.6`，构建 `commit 8ee6bc11`，`date 2026-07-14`）做自我拆解。
> 素材全部来自真实文件系统与安装包（`app.asar` / `app.asar.unpacked` / `cli/product.json` / 用户数据 `~/.workbuddy`），逐条可复核。
> **第一权威源**：`cli/product.json`（323 KB）是提示词 / Agent / 工具 / 模型 / 命令的唯一结构化真相清单，本报告所有计数以其数组长度为准。

**product.json 权威计数（一切数字的锚点）**

| 数组 | 长度 | 数组 | 长度 |
|------|------|------|------|
| `.prompts[]` | **109** | `.commands[]` | **9** |
| `.agents[]` | **17** | `.builtInSubagents[]` | **1**（code-explorer） |
| `.tools[]` | **48** | `.builtInAgentsName[]` | **5**（craft/ask/plan/debug/code-explorer） |
| `.models[]` | **44** | `.outputStyles[]` | **3**（Default/Explanatory/Learning） |
| `.variables[]` | 6 | `.productFeatures{}` | 105 |

---

## 一、技术架构分析（层次 / 模块 + 技术栈）

### 1.1 分层架构（6 层）

```
┌─ UI 层 (renderer/)            前端 UI：对话流 / 文件树 / 预览面板 / 可视化器
├─ 桥接层 (preload/)            contextBridge / IPC（多个 *-preload.js：mcp-app / tdoc / client-menu）
├─ 主进程层 (main/)             Electron 主进程：窗口 / 托盘 / daemon-app-server / desktop-monitor / 鉴权 / 自动化调度
├─ Agent 内核层 (cli/)          @openai/agents 驱动的 agent loop + @modelcontextprotocol/sdk + ProductPromptProvider
├─ 能力层                       builtin-skills/(15) · builtin-mcp-apps/(3) · builtin-plugins/(2) · 109 系统提示词
└─ 传输层                       stdio(本地 MCP) / WebSocket(ws) / HTTP-SSE(undici) / 企业 IM(WeCom/钉钉/飞书/Slack)
```

### 1.2 技术栈（含证据）

| 领域 | 技术 | 证据 |
|----|--------|------|
| 桌面外壳 | **Electron**（Chromium + Node.js） | `WorkBuddy.exe`(204MB)、`resources.pak`、`v8_context_snapshot.bin`、`chrome_*.pak`、`ffmpeg.dll`；`package.json main: main/index.js` |
| 打包 | **ASAR**（头在尾 + 3 字节尾部伪像） | `resources/app.asar`(259MB) + `app.asar.unpacked/`（原生模块/技能/MCP） |
| Agent 内核 | **@openai/agents**（OpenAI Agents SDK） | `package.json` dependencies |
| Agent 协议 | **@modelcontextprotocol/sdk** | dependencies；`.mcp.json` / `mcp.json` |
| 提示词引擎 | **nunjucks**（`{{var}}` / `{% if %}`） | `.prompts[].template` 与 `templates/*.tpl` 均为 nunjucks 语法 |
| 入参校验 | **zod** | `ardot-mcp-app/cli.cjs` 内联 zod schema |
| 本地存储 | **better-sqlite3** | dependencies + `~/.workbuddy/workbuddy.db` |
| 终端 | **node-pty**（`@lydell/node-pty`） | CLI 与 `devtools-terminal/` |
| 传输 | **ws**（WebSocket）/ **undici**（fetch/SSE） | dependencies；bootstrap 补丁针对 undici 断流 |
| 可观测 | **@opentelemetry/*** (OTLP trace) | `ardot-mcp-app/cli.cjs` 内联 `@opentelemetry/api` |
| 监控 | **@tencent/aegis-*** (electron/web SDK) | dependencies |
| 多端接入 | **@wecom/aibot-node-sdk / dingtalk-stream / @larksuiteoapi/node-sdk / @slack/socket-mode** | 企业微信 / 钉钉 / 飞书 / Slack 机器人；对应工具 `WeChatReply` `WeComReply` |
| 对象存储 | **cos-nodejs-sdk-v5**（腾讯云 COS） | dependencies |
| 归档/版本 | **adm-zip / tar / semver** | 打包与自更新 |
| 企业互操作 | **.NET**（`Newtonsoft.Json.dll` / `System.ValueTuple.dll`） | `ioa-im` 注入桥 |

### 1.3 关键模块（main/ 内主要 entry）

`main/index.js`（主入口）· `daemon-app-server-main.js`/`-entry.js`（后台守护）· `desktop-monitor-service(.js/2.js)`（桌面监控）· `auth.js`/`file-authentication-storage.js`（鉴权）· `ioa-im-actions.js`/`ioa-im-override.js`（企业 IM）· `product.json` 加载器（`ProductPromptProvider` / `PromptTemplateManager`）。

---

## 二、软件结构分析（目录 / 部署目录 / 数据目录）

### 2.1 部署目录 `D:\program files\WorkBuddy\`

```
WorkBuddy.exe (204MB)            主可执行
resources/
  ├─ app.asar (259MB)            打包应用（renderer/preload/main/cli/node_modules）
  └─ app.asar.unpacked/          需要真实文件路径的部分（原生模块 / 技能 / MCP / 插件）
elevate.exe · launcher.exe · WorkBuddyRepair.exe · Uninstall WorkBuddy.exe
Newtonsoft.Json.dll · System.ValueTuple.dll   (.NET 互操作)
*.pak · *.dll · v8_context_snapshot.bin · ffmpeg.dll   (Chromium 运行时)
```

### 2.2 应用包内部 `app.asar[.unpacked]/`

```
cli/
  ├─ product.json (323KB)        ← 第一权威源：109 prompts / 17 agents / 48 tools / 44 models / 9 commands
  ├─ product.{internal,ioa,cloudhosted,selfhosted}.json   多部署形态配置
  ├─ package.json                CLI 引擎依赖（精确版本）
  ├─ dist/                       codebuddy.js(≈21MB, 打包引擎)
  ├─ bin/ · vendor/
resources/
  ├─ builtin-skills/             15 个内置技能（明文 SKILL.md）
  ├─ builtin-mcp-apps/           _workbuddy-runtime/ · agently-cli/ · ardot-mcp-app/
  ├─ builtin-plugins/            tencent-doc-agent/ · weixinpay/
  ├─ templates/                  外部化 .tpl（桌面模式提示词等，非 109 的全集）
  ├─ *-preload.js                mcp-app / tdoc-import / tdoc-preview / client-menu 预加载
  └─ channel-branding/ · devtools-terminal/
renderer/ · preload/ · main/ · node_modules/
```

### 2.3 用户数据目录 `~/.workbuddy/`（运行时态 / 部分加密）

```
skills/           用户级技能（ai-daily-report / aihot / markitdown-skill / win-ai-agent-analysis-decompose-skill）
mcp.json          MCP server 配置（注意：非 .mcp.json）
workbuddy.db      SQLite（automations / automation_runtime_state / automation_runs / 会话元数据）
memory/           云记忆缓存（server 管理，勿本地改）
sessions/ · blobs/ · file-history/ · audit-log/ · automation-backups/
settings.json · BOOTSTRAP.md · IDENTITY.md · MEMORY.md（用户级长期记忆）
```

### 2.4 项目数据目录 `<project>/.workbuddy/`（明文，非缓存）

```
memory/MEMORY.md · memory/YYYY-MM-DD.md   项目记忆（append-only 日志 + 长期笔记）
skills/           项目级技能         plans/ · projects/
```

> **明文 vs 运行时态**：109 系统提示词（`product.json`）、外部化 `.tpl`、内置 `SKILL.md`、MCP 应用源码（`cli.cjs`/`mcp-server.mjs`）均为**明文可审计**；模型权重、用户对话、云记忆为运行时态（SQLite / server 侧），不在静态包内。

---

## 三、技术组件分析（数据库 / 基础服务依赖 / 公共 & 特定组件）

### 3.1 数据库（SQLite via better-sqlite3）

`~/.workbuddy/workbuddy.db` 关键表：
- `automations` — 定时任务定义（name/prompt/scheduleType/rrule/scheduledAt/cwds/status/validFrom/validUntil）
- `automation_runtime_state` — last/next run 运行态
- `automation_runs` — 执行历史
- 会话 / 记忆选择器元数据（`memorySelector` agent 消费）

### 3.2 基础服务依赖（远端）

- **鉴权与后端**：`endpoint https://copilot.tencent.com`（staging `https://staging-copilot.tencent.com`）；`officialEndpoints[4]`；`authentication{}` 4 键。
- **OAuth 连接器**：如 Agent Mail `GET /console/as/connector/oauth/agentmail/accesstoken`（agently-cli 消费）。
- **模型网关**：44 个模型（Deepseek / MiniMax / GLM / Kimi / Hunyuan / Hy3 …），按 agent `models[]` 与 `modelTags` 路由。
- **知识库**：`knowledgeBases[1]`；`builtInMarketplaces{2}`（技能/专家市场）。
- **对象存储**：腾讯云 COS（附件/产物）。

### 3.3 公共组件（跨模块复用）

`_workbuddy-runtime/mcp-app-bootstrap.cjs`（HTTP 超时补丁，所有 Node 型 MCP app 共享）· nunjucks 渲染器 · zod 校验 · OpenTelemetry trace · 三层记忆系统 · ToolSearch/DeferExecuteTool（延迟工具装载框架）。

### 3.4 特定组件

Ardot 设计引擎（canvas/webview）· WeChatPayCLI（多平台 prebuild 二进制）· agently-cli（Agent Mail）· 企业 IM 注入桥（ioa-im, .NET）· 桌面监控服务（desktop-monitor）。

---

## 四、运行逻辑分析（进程 / 事件 / 流程 / 机制 / 逻辑模型 / 日志 / 监控运维 / 安全）

### 4.1 进程模型

```
1 × 主进程 (main/index.js, Electron)
  ├─ N × 渲染进程 (renderer/)           对话/预览
  ├─ 1 × daemon-app-server              后台常驻（自动化调度 / 连接器）
  ├─ 1 × desktop-monitor-service        桌面状态监控
  └─ M × 内置 MCP 子进程                 node --require _workbuddy-runtime/mcp-app-bootstrap.cjs <cli.cjs>
                                          + ELECTRON_RUN_AS_NODE=1
```

### 4.2 事件与流程（Agent Loop 7 步）

```
analyze context → think → select tool → execute action → receive observation → iterate → present outcome
```
每轮把动作结果作为新 observation 追加进上下文，直到任务完成；结尾必须 `present_files` 交付。`requestMaxStepLimit=100` 限制单请求最大步数。

### 4.3 关键机制

- **ProductPromptProvider / PromptTemplateManager**：按 `.prompts[].name` 取模板 → nunjucks 渲染（注入 `.variables[]` 与运行时上下文）→ 组装成最终 system prompt。
- **延迟工具装载**：`ToolSearch` 检索 → `DeferExecuteTool` 执行，避免 48 工具全量常驻上下文。
- **上下文压缩**：`compact` / `contextSummary` agent + `token­UsageThresholds{4}` 阈值触发摘要。

### 4.4 逻辑模型（三层记忆）

云记忆（只读，server 注入 `<memory>`）→ 用户级 `~/.workbuddy/MEMORY.md`（显式写）→ 项目级 `.workbuddy/memory/`（日志 append-only + 长期笔记）。检索用 `conversation_search`（云端历史）或本地日志。

### 4.5 日志与监控运维

- 子进程 stdout 汇入主进程 `[ConnectorService] built-in <App> MCP stdout: ...`。
- OpenTelemetry OTLP trace；`@tencent/aegis-*` 崩溃/性能上报；`telemetry{2}` / `galileo{5}` 配置。
- 自更新 `updates{3}` + `semver`；`WorkBuddyRepair.exe` 修复。

### 4.6 安全

- `content_policy`（内容合规，全程不可绕过；政治敏感 / 未成年人保护 / 主权表述）——见 `cli-agent-prompt` 内联。
- `personal_files_safety`（个人目录高危操作：警告 + 列清单 + 确认 + 备份 + 回收站 + ≤10/批）。
- `command-security-review-prompt`（命令安全审查）；沙箱执行（Bash `dangerouslyDisableSandbox` 需显式授权）。

---

## 五、解决处理问题流程分析（处理模式 / 全流程 / 任务分析）

### 5.1 三种处理模式（`builtInAgentsName` 对应）

| 模式 | 语义 | 能力边界 |
|------|------|----------|
| **Craft** | You say, I do | 直接读写文件、执行命令、生成内容 |
| **Plan** | Think first | 先出方案，用户确认后执行 |
| **Ask** | 只问答 | 只读分析，不改文件不执行 |
| （debug / code-explorer） | 调试 / 代码勘探 | 内部辅助 agent |

### 5.2 全流程

```
用户输入 → 意图理解(路由/模式) → 能力选择(Skill 阻塞加载 + Tool/MCP 选择)
        → agent loop 迭代执行 → present_files 交付 → final answer(直答/携带关键结果)
        → 记忆写入(项目日志/长期笔记)
```

### 5.3 任务分析（TaskCreate/Get/Update/List）

复杂任务（≥3 步）拆分为可跟踪任务列表；团队模式（TeamCreate + 共享任务列表 + SendMessage）支持多 agent 协作，任务含 blocks/blockedBy 依赖。

---

## 六、Agent 分析（框架 / 运行时 / 类别 / Prompt 结构）

### 6.1 框架与运行时

- **框架**：`@openai/agents`（Agents SDK）+ `@modelcontextprotocol/sdk`。
- **运行时**：Node.js（Electron 内），`product.json` 声明 17 个 agent，每个 agent 绑定 `instructions`(→prompt name)、`models[]`、`modelTags`、`tools[]`、`commands[]`、`tags[]`。

### 6.2 Agent 类别（17 个 · `.agents[]`）

| Agent | 定位 | Agent | 定位 |
|-------|------|-------|------|
| **cli** | 主 Agent（`cli-agent-prompt`, 34 工具） | insightsAnalyzer | 洞察分析 |
| general-purpose | 通用子代理 | agentInstructions | 生成 agent 指令 |
| compact | 上下文压缩 | statusline-setup | 状态栏配置 |
| contextSummary | 上下文摘要 | **Explore** | 代码勘探（只读） |
| contentAnalyzer | 内容分析 | **Plan** | 规划（只读） |
| terminalTitleGenerator | 终端标题 | pulse | 心跳/巡检 |
| promptSuggestion | 提示建议 | enhance-prompt | 提示增强 |
| memorySelector | 记忆选择 | summaryGenerator | 摘要生成 |
| promptHookEvaluator | Hook 评估 | | |

### 6.3 主 Agent Prompt 结构（`cli-agent-prompt`，17960 字符）

逆向拆解（对应 `workbuddy-deep-analysis.html`）：
- **identity（身份）**：`You are CodeBuddy Code` + `{% if cliDescription %}` 可变身份注入
- **soul（灵魂/使命）**：主目标"follow the USER's instructions"；能力清单（研究/数据/构建/多模态/系统访问/专家）
- **rules（规则）**：`content_policy` · `personal_files_safety` · `regional_conventions`(红涨绿跌) · `working_modes` · `tool_use` · `final_answer_instructions`
- **skills & tools list**：`available_skills`（Skill 工具动态注入）+ 48 工具的调用契约
- **system-prompt-templates**：`.prompts[]` 的 109 条模板，经 nunjucks + `.variables[6]` 渲染

### 6.4 变量注入（`.variables[]`，6 个）

模板占位由运行时上下文填充（如 `cliDescription`、平台/OS、日期、记忆块、可用技能列表等）。

---

## 七、Skills 分析

- **内置技能 15 个**（`resources/builtin-skills/`，明文）：`ardot-design-core/-router/-to-code/-poster/-slides/-ui-design`（6 设计）、`buddy-multimodal-generation`、`cloudstudio-deploy`、`expert-manager`、`marketplace-skill-installer`、`skill-creator`、`wb-finance-skill`、`westock-data`、`westock-tool`、`neodata-financial-search`。
- **用户级技能 4 个**（`~/.workbuddy/skills/`）：`ai-daily-report`、`aihot`、`markitdown-skill`、`win-ai-agent-analysis-decompose-skill`。
- **插件内嵌技能**：`weixinpay` 内 3 个 skill、`tencent-doc-agent` 内 `format-extract`（均已拆出至 skills-tap）。
- **结构规范**：`SKILL.md`（YAML frontmatter: name/description/metadata）+ `references/` + `scripts/` + `assets/`。
- **加载机制**：`Skill` 工具按 name/description 语义匹配，**阻塞式**加载（先于回复）；用户级优先于内置。
- **技能生命周期**：`SkillManage`（创建/修改/删除，仅限 `agent_created:true`）+ `skill-creator` + `marketplace-skill-installer`。

（详见 `../workbuddy-skills-tap/` — 已封装 132 个可分发技能，含 109 个由 `.prompts[]` 转换的 `wbp-*` 提示词闭包。）

---

## 八、MCP Server & Tools 分析

### 8.1 内置工具（`.tools[]`，48 个）

Agent · Bash · PowerShell · Glob · Grep · Read · Edit · Write · NotebookEdit · WebFetch · WebSearch · ListMcpResources · ReadMcpResource · WaitForMcpServers · TaskCreate/Get/Update/List · EnterPlanMode · ExitPlanMode · KillShell · TaskStop · TaskOutput · SlashCommand · Skill · SkillManage · AskUserQuestion · LSP · StructuredOutput · ToolSearch · DeferExecuteTool · ImageGen · ImageEdit · VideoGen · ComputerUse · TeamCreate · TeamDelete · SendMessage · EnterWorktree · LeaveWorktree · CronCreate/Delete/List · DelegateTool · WeChatReply · WeComReply · Workflow。

### 8.2 内置 MCP 应用 / server（`builtin-mcp-apps/` + `builtin-plugins/`）

| 产物 | 形态 | 工具数 | 独立分发状态 |
|------|------|--------|--------------|
| **ardot-mcp-app** | Node 源码（cli.cjs + webview） | 20 | ✅ 源码 + install + mcp-config + README |
| **weixinpay-mcp** | Node 源码（mcp-server.mjs）+ 多平台 prebuilds | 2 | ✅ 源码 + prebuilds(darwin-arm64/x64,linux-x64) + 3 skills 已拆出 |
| **agently-cli** | 预编译二进制（9.3MB exe） | — | ✅ 真实 exe 已随包；非 stdio，execFile 调用 |
| **_workbuddy-runtime** | 共享 bootstrap（cjs） | — | ✅ HTTP 超时补丁，ardot 以相对路径引用 |
| ~~tencent-doc-agent~~ | 无独立 server | — | 撤销（唯一载荷 format-extract skill 已拆出） |

### 8.3 远程 MCP 连接器

`product.json` 侧另有 API Gateway 型连接器（如 `tencent-docs` = `docs.qq.com/openapi/mcp`）与 HTTP/SSE/stdio 连接器，由 `~/.workbuddy/mcp.json` 声明、用户在连接器管理页"信任"后激活。

### 8.4 MCP 工具明细

- **ardot（20）**：create_design · open_design · create_new_page · capture_screenshot · capture_layout · fetch_component_lib · fetch_editor_state · fetch_variables · fetch_file_info · export_nodes · apply_variables · batch_edit · batch_read · build_style_guide · get_available_fonts · locate_available_space · save_tokens · scan_exportable_resources · search_style_guide · upload_images。
- **weixinpay（2）**：weixinpay_register · weixinpay_feedback（`mcp-server.mjs` 内确认）。

---

## 九、12 外部化桌面模板 与 109 产品提示词 的关系剖析

> 本节回答一个反复出现的核心疑问：**「之前拆出的 12 个 prompt 模板」和「现在拆出的 109 个 prompts」到底是什么关系？**
> 结论先行：**它们是同一产品里两套并行的提示词系统，按名称零重叠，是「桌面 GUI 副集」与「引擎权威全量」的关系，而非子集/超集。**

### 9.1 技术架构：两套并行提示词源

| 维度 | ① 桌面外部化模板（早先拆出的 12 个） | ② 产品提示词注册表（现在拆出的 109 个） |
|------|--------------------------------------|----------------------------------------|
| **物理位置** | `_wb_asar/resources/templates/*.tpl`（12 个）+ `resources/templates/style/*.md`（7 个输出风格） | `cli/product.json` 的 `.prompts[]` 数组（109 条） |
| **加载器** | `PromptTemplateManager`（文件型 provider，注册进 `promptTemplateMap`） | `ProductPromptProvider`（注册表型 provider，订阅 `productManager.configuration` 变更） |
| **形态** | 独立磁盘文件，桌面初始化时读盘、可热更新（file watch） | 单一 JSON 数组，引擎启动时解析、配置变更时重渲染 |
| **命名空间** | `workbuddy-*` / `*-mode-reminder` / `user-context-*` / `style/*` | `cli-agent-prompt` / `system-reminder-*` / `user-context*` / `output-style-*` 等 |
| **模板引擎** | nunjucks（`{{var}}` / `{% if %}`） | nunjucks（同语法） |
| **名称重叠** | **与 109 个零重叠（12/12 都不在 `.prompts[].name` 中）** | **与 12 个零重叠** |

> 证据：交叉比对 12 个 `.tpl` 的基名 vs `product.json` 全部 109 个 `name`，匹配数 = 0。反向看，`product.json` 里虽有 `system-reminder-planmode`/`-md`/`-delegate`/`-todo-list` 等"提醒类"提示词，但与桌面 `ask-mode-reminder.tpl`/`craft-mode-reminder.tpl`/`system-reminder.tpl` **并非同名同体**，而是各自独立实现。

### 9.2 逻辑机制：同源目标，异路注入

两者最终产物完全一致——**都是一段渲染后的 system-prompt 字符串，喂给模型**。差异只在"从哪里取模板、何时渲染"：

```
桌面 GUI 路径（12 个）:
  resources/templates/*.tpl ──读盘──▶ PromptTemplateManager.promptTemplateMap
        │  file-watch 热更新
        ▼
  nunjucks.render(tpl, { cliDescription, mode, userContext, ... })
        ▼
  渲染后的 system prompt ──▶ 桌面对话 UI 注入模型

CLI 引擎路径（109 个）:
  cli/product.json .prompts[] ──解析──▶ ProductPromptProvider
        │  订阅 productManager.configuration 变更 → 重渲染
        ▼
  nunjucks.render(template, { ... 运行时变量 })
        ▼
  渲染后的 system prompt ──▶ Agent Loop（headless / 自动化 / CI）注入模型
```

**关键机制差异**：桌面 12 个是"文件驱动、可热改"的副集，主要服务交互式 IDE 聊天；109 个是"注册表驱动、随配置热更"的权威全量，服务整个 Agent 引擎（含无头模式、自动化、远程连接器）。

### 9.3 应用场景：覆盖面不同

| 场景 | 桌面 12 模板 | 产品 109 提示词 |
|------|--------------|----------------|
| 交互式 IDE 聊天（Ask/Craft/Expert 模式） | ✅ 主战场（`workbuddy-ask/craft/expert-prompt.tpl`、模式提醒） | ⚠️ 仅概念并行（`cli-agent-prompt` + `system-reminder-*`） |
| 工具/函数调用描述 | ❌ 不含 | ✅ 55 条 `tool-*-description` |
| 洞察分面 / 内部 Agent / 子 Agent 指令 | ❌ 不含 | ✅ 9+9+5 条 |
| 斜杠命令 / Workflow / 深度研究 | ❌ 不含 | ✅ 6+6+3 条 |
| 远程 MCP 连接器行为 | ❌ 不含 | ✅ 经 `.tools[]`/`.prompts[]` 编排 |
| 输出风格 | ✅ 7 个 `style-*.md`（creative/efficient/friendly/professional/sarcastic/socratic/straightforward） | ✅ 3 个 `.outputStyles[]`（Default/Explanatory/Learning）+ `output-style-*` |

> 可见：12 个聚焦"桌面交互态"，109 个覆盖"产品全栈能力面"。**109 是 12 的超集（按能力覆盖），但两者在命名与文本上并不共享，是平行实现。**

### 9.4 功能对照映射（概念 → 两套各自载体）

| 概念 | 桌面外部化载体（12） | 产品注册表载体（109） | 是否同文 |
|------|----------------------|----------------------|----------|
| 主 Agent 系统提示词 | `workbuddy-prompt.tpl`（36,962 字符） | `cli-agent-prompt`（约 17,960 字符） | ❌ 不同（桌面版更厚，含 CEF/桌面专属段） |
| 模式提醒 | `ask-mode-reminder.tpl`(582) / `craft-mode-reminder.tpl`(254) | `system-reminder-planmode` / `-md` / `-delegate` / `-todo-list` | ❌ 同名概念、异文 |
| 用户上下文注入 | `user-context-identity.tpl`(1,984) / `user-context-expert-identity.tpl`(919) | `user-context*`（多个） | ❌ 异文 |
| 输出风格 | `style/style-*.md`（7 个） | `.outputStyles[]`（3）+ `output-style-*` | ❌ 7 vs 3 税目不同 |

> 字符数差异证明：二者不是"同一份文件被复制"，而是**对同一组职责的两套独立撰写**（桌面版通常更完整，引擎版更精简）。

### 9.5 如何应用与第三方 AI Agent 集成

**原则：以 `product.json` 的 109 为权威单一真相（SSoT），桌面 12 个作桌面保真参考。**

1. **权威集成路径（已落地）**：把 109 个逐条转成独立技能闭包 `wbp-<name>/`（含 `SKILL.md` + 原始 `.tpl`），汇总进 `workbuddy-skills-tap/`（现 132 技能）。第三方 Agent 安装即获得与 WorkBuddy 引擎一致的行为定义。
2. **桌面保真路径（建议补）**：12 个外部化模板 + 7 个 `style-*.md` 目前仅归档在 `externalized-desktop-templates/`，**尚未包装成技能闭包**。若要第三方 Agent 在桌面 UI 层做到 100% 行为保真，应额外包装为 `wbd-<name>/`（desktop 命名空间）技能，与 `wbp-*` 并存。
3. **变量契约复用**：两套都走 nunjucks，注入变量键名一致（`cliDescription`、`mode`、`userContext` 等）。第三方集成只需复用同一渲染管线，无需重写模板语义。
4. **集成架构建议**：
   ```
   第三方 Agent
     ├─ 安装 wbp-*（109，引擎权威行为）        ← 默认、必装
     └─ 可选安装 wbd-*（12+7，桌面保真覆盖）   ← 仅当需对齐桌面 UI 语义
   ```

### 9.6 优化建议（消除双源漂移）

- **收敛为单一真相**：12 与 109 对"主 Agent/提醒/风格/用户上下文"职责重叠却文本分歧（如主提示词 37KB vs 18KB）。建议在构建期由 `product.json` 生成桌面 `.tpl`，消除手动双写漂移。
- **统一样式税目**：桌面 7 风格 vs 引擎 3 风格口径不一，应统一风格分类再各自渲染。
- **补全拆解技能的方法学**：既有的 pitfall #16 已要求"先解析 `product.json` 再谈穷举"，但仍须**同时扫描 `resources/templates/`** 才能把桌面并行副集也纳入，避免再次漏掉 12。建议把本节的"两套并行提示词系统"写进 `win-ai-agent-analysis-decompose-skill` 的 pitfalls，作为 #17。
- **技能闭包完整性**：109→`wbp-*` 已完成；12 外部化 + 7 风格→`wbd-*` 尚未做，列为后续优化项。

---

## 附：分离目标产物（环节 2/3/4 输入）

WorkBuddy 可复用能力以四形态存在，分别对应本仓库分离产物：
- **明文 Prompt**（`.prompts[]` 109 条 + 外部化 `.tpl`）→ `workbuddy-prompts/`（product-prompts + product-manifests + externalized-desktop-templates）
- **Skill**（`SKILL.md` 闭包）→ `workbuddy-skills-tap/`（132 技能，含 109 `wbp-*` 提示词闭包）
- **Tool / 原生模块** → 保留在引擎内（不可独立分发）
- **MCP Server** → `workbuddy-mcp-servers/`（ardot / weixinpay / agently-cli / _workbuddy-runtime）
