# M1 技术方案 (TECHNICAL-SOLUTION-M1)

> 阶段：Phase 2.2 · 版本：v0.1 · 架构：复用 hermes-studio 骨架

## 1. 工程结构（monorepo）
```
kmaster-studio/
├── package.json            # npm workspaces: client, server
├── tsconfig.base.json
├── vite.config.ts          # 根：dev proxy /api,/socket.io → 6648
├── packages/
│   ├── client/             # Vue3 SPA
│   └── server/             # Koa BFF + Socket.IO
└── bin/                    # 启动脚本
```

## 2. 服务端（packages/server）
### 2.1 入口
- Koa 监听 `127.0.0.1:6648`；Socket.IO 挂载 `/chat-run` 命名空间。
- 开发期 Vite(`6649`) 经 proxy 把 `/api`、`/socket.io` 转发到 `6648`；生产期 Koa 静态托管 `dist/client`，前后端同源单端口。

### 2.2 AgentBridge（Node 客户端 + Python bridge 子进程）
- **Node 客户端**经 TCP `127.0.0.1:16765`（`HERMES_AGENT_BRIDGE_ENDPOINT`）连接 Python bridge 进程。
- **Python bridge 子进程**（`services/hermes/bridge/bridge_server.py`）：`spawn` 启动，内部 `from run_agent import AIAgent` 实例化 `AIAgent(platform="cli")`，暴露方法：
  `chat / chatStream / getOutput / getResult / interrupt / steer / approvalRespond / clarifyRespond / switchSessionModel / getSessionTitle / contextEstimate`。
- **容错兜底**：`HERMES_BRIDGE_MOCK=1` 启用 `MockBridge`（模拟流式输出），保证前端全链路在无真实 agent 时也可验证；`HERMES_BRIDGE_MOCK=0` 连真实 hermes-agent。

### 2.3 run-chat 编排（/chat-run 命名空间）
- 收到 `run` → `getOrCreateSession` → `Bridge.chat` → `chatStream` 增量拉取 → 逐条转译为 WS 下行事件。
- `abort` → `Bridge.interrupt`；`steer` → `Bridge.steer`；`resume` → 重放缓存事件 + 校准运行态。

### 2.4 REST（M1 子集）
- `GET/POST /api/sessions`（kmaster.db 索引：id/title/time/profile/归档态）
- `GET /api/sessions/:id/messages`（本地缓存）
- `GET /api/health`

### 2.5 DB（better-sqlite3，kmaster.db）
- `sessions(id TEXT PK, title TEXT, profile TEXT, created_at INT, updated_at INT, archived INT)`
- `messages(id TEXT PK, session_id TEXT, role TEXT, content TEXT, created_at INT, usage_json TEXT)`

## 3. 前端（packages/client）
### 3.1 入口
- Vite + Vue3 `<script setup lang="ts">`；`main.ts` 挂 `NConfigProvider`(Naive 主题) + `router` + `Pinia`。

### 3.2 网络层
- `api/client.ts`：fetch 封装（baseUrl + 未来 JWT）。
- `api/hermes/chat.ts`：Socket.IO `/chat-run` 客户端（`connectChatRun` / `registerSessionHandlers` / `startRunViaSocket` / `abortRun` / `steerRun`）；全局注册一次，事件按 `session_id` 分发到 store 的 per-session handlers。

### 3.3 状态（stores/chat.ts，纯 reducer）
- `sessions: Session[]`、`messagesBySession: Record<sid, Message[]>`、`runState: Record<sid, 'idle'|'running'|'aborting'>`、`pendingApprovals`、`pendingClarifies`、`usage`。

### 3.4 视图（WorkBuddy 式三栏）
- `views/ChatView.vue`：左 `SessionList` | 中 `ChatPanel` | 右 `ArtifactPanel`（M1 占位，M2 充实）。
- `components/chat/*`：`ChatPanel`、`MessageList`、`MessageItem`、`ChatInput`、`AgentMarkdown`、`ThoughtBlock`、`ToolCallCard`、`ApprovalCard`(M1 原型)、`ClarifyCard`(M1 原型)、`UsageBar`。

### 3.5 主题（WorkBuddy 风）
- `styles/variables.scss` + `styles/theme.ts`：`--km-*` 设计 token，暗/亮双主题（NConfigProvider themeOverrides 注入 Naive）。

## 4. Socket.IO `/chat-run` 协议（M1 子集）
**上行**：`run` `abort` `steer` `resume`
**下行**：`run.started` `run.completed` `run.failed` `run.queued` · `message.delta` · `reasoning.delta` `thinking.delta` · `tool.started` `tool.completed` `tool.failed` · `approval.requested` `approval.resolved` · `clarify.requested` `clarify.resolved` · `usage.updated` · `session.title.updated` · `abort.started` `abort.timeout` `abort.completed` · `connect` `disconnect`

## 5. 数据归属
- kmaster 自身状态：`~/.kmaster-studio/`（会话索引、消息缓存、上传）。
- Agent 状态：始终在 `~/.hermes/`，studio 只经 Bridge/CLI/文件只读访问，绝不双写。

## 6. 风险与对策
- **Python hermes-agent 可运行性不确定** → `MockBridge` 兜底，前端全链路可验证；真实链路手动验收（`HERMES_BRIDGE_MOCK=0`）。
- **Windows TCP 端口冲突** → 端口可配 + 连接失败指数退避重试。
- **密钥安全** → studio 不持有、不传输密钥，仅转发指令给 Bridge（Bridge 在 Python 进程内由 hermes 自己读 `~/.hermes`）。
