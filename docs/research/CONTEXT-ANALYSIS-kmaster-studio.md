# 现状分析（CONTEXT-ANALYSIS-kmaster-studio）

> 阶段：Phase 1 调研 · 版本：v0.1

## 1. hermes-agent 后端现状（只读依赖，已可直接对接）
- **源码就位**：`D:\Users\towyq\Documents\Projects\hermes-agent`
  - `run_agent.py`：AIAgent 主循环，公开方法 `chat / chatStream / getOutput / getResult / interrupt / steer / switch_model / approvalRespond / clarifyRespond / mcpAdd/mcpTest/mcpReload / reloadSkills / backgroundPoll` 等（kmaster Bridge 的唯一契约面）。
  - `acp_adapter/`：ACP 直连备选（`HermesACPAgent`：initialize/session-new/load/prompt/cancel + sessionUpdate + requestPermission + SessionModeState + 模型选择），与 WorkBuddy 引擎协议同源。
  - `agent/`：92 工具模块 / 57 工具集 / 175 技能 / MCP / 记忆 / kanban / cron。
- **本地实例就位**：`~/.hermes`（`.env` 凭证、`config.yaml`、skills 快照、sessions、kanban.db、state.db、memory、mcp_servers）。
- **结论**：前端可真实对接本地 hermes-agent，Bridge 模式为主、ACP 为轻量备选。

## 2. hermes-studio 架构现状（只读参考，可平移约 60% 代码）
- **monorepo**：`packages/{client,server,desktop,ekko-agent,skills,website}`。
- **client（Vue3 SPA）**：`api/`（42 模块，`api/hermes/chat.ts` 为 Socket.IO 协议层 1083 行）、`stores/hermes/`（14 个 Pinia store，`chat.ts` 4940 行核心）、`views/`（28 路由）、`components/hermes/chat/`（27 个聊天组件，`ChatPanel.vue` 3811 行、`MessageItem.vue` 1924 行、`ChatInput.vue` 2657 行）。
- **server（Koa BFF）**：`routes/ controllers/ services/{hermes/agent-bridge, run-chat} db/ middleware/`；默认 `127.0.0.1:6648`，前端 dev 6649（Vite proxy）。
- **分层纪律**：`views → stores → api → server`，视图零网络调用；socket 全局注册一次后按 `session_id` 分发。
- **结论**：kmaster 可直接复用 api/store/socket 三层，重写 views/components 为 WorkBuddy 式。

## 3. WorkBuddy 现状（只读部署，UI 范式参考）
- **部署目录**：`D:\program files\WorkBuddy\`（`app.asar` 259MB + `app.asar.unpacked/`），无开发源码，仅可审计明文（SKILL.md、模板、部分 MCP 源码）。
- **技术特征**：Electron 四进程；React + zustand + radix-ui + i18next；ACP 协议（JSON-RPC over stdio）；主题用 VS Code 变量 `--vscode-*`。
- **UI 范式（kmaster 要对齐的）**：
  - 固定**三栏常驻**：会话栏 + 消息流 + 右侧预览（artifact 卡片 / HTML live 预览 / 内联浏览器 / 文件 diff）。
  - 消息流：markdown + shiki 高亮 + mermaid；`agent_thought_chunk` 折叠思考块；`tool_call/tool_call_update` 折叠卡片；`plan` 任务列表卡片；`requestPermission` 权限卡（允许一次/总是允许/拒绝）；`AskUserQuestion` 澄清卡。
  - 底部输入区：模式(Craft/Plan/Ask) + 模型 + 连接器 + @文件 + 队列 + 停止。
  - 消息队列托盘、斜杠命令面板、暗/亮主题。
- **云端专属（kmaster 不搬）**：OneID 登录、云 Agent 沙箱、IM 通道（企微/钉钉/飞书/Slack）、腾讯文档、专家市场 —— 这些是 WorkBuddy 云端服务，非 hermes-agent 能力。

## 4. 用户参考文档现状（docs/reference，已覆盖大部分设计）
- `00` WorkBuddy 技术画像、`01` WorkBuddy 前端深度分析、`02` kmaster 设计方案（三层架构+F1-F22+协议+M1-M5）、`03` hermes-studio 前端深度分析。
- 四篇已互相印证，结论稳定：**取 hermes-studio Vue3 架构、重写 views 为 WorkBuddy 式**。

## 5. 父目录环境
- `D:\Users\towyq\Documents\Projects` 下含多工程：`hermes-studio`（架构参考）、`hermes-agent`（后端）、`hermes-agent-msgadapter*`、`openclaw/hermes-agent`、`kmaster-studio`（本项目）。各工程独立，kmaster 不依赖其余工程源码，仅只读参考。

## 6. 小结
现状对 kmaster-studio 极其有利：后端实例与源码俱在、架构参考完整、用户已做 4 篇高质量分析。唯一需要用户拍板的是 **MVP 范围 / 后端对接模式 / UI 对齐深度 / 是否首版含 Electron**（见 CHANGE-OBJECTIVE 与 R1-R4 确认）。
