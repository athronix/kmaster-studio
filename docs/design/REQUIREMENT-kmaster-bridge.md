# 需求文档 · kmaster-bridge（增量 PRD）

> **性质**：增量 PRD。基于 `docs/reference/02-kmaster-studio设计方案.md` 已确立的架构，仅描述「kmaster-bridge 从单进程骨架完善为完整 AgentBridge 实现」这一次要做的变更。
> **上游输入**：02-kmaster-studio设计方案（[Bridge] 操作族）、hermes-studio 现网 bridge 实现。
> **下游消费者**：架构师（系统设计与任务分解）、Python/Node 工程师。
> **语言**：简体中文 ｜ **产品经理**：许清楚

---

## 1. 背景与现状

### 1.1 kmaster-bridge 是什么

kmaster-studio 是独立的 Agent 前端 Studio（web-first：同一份 Vue SPA 跑浏览器与 Electron 壳），Agent 能力由 hermes-agent 提供。三层链路为：

```
Vue SPA ──Socket.IO /chat-run──> kmaster-server (Node)
                                      │  TCP NDJSON  tcp://127.0.0.1:16765
                                      ▼
                                kmaster-bridge (Python)
                                      │  subprocess + ACP stdio
                                      ▼
                                hermes-agent (run_agent.AIAgent)
```

**kmaster-bridge = kmaster-studio 自己独立的 Python 桥进程**，不复用、不依赖 hermes-studio 的 bridge 实例。

### 1.2 端口决策（已定，不可更改）

| 进程 | 端点 | 说明 |
|---|---|---|
| **kmaster-bridge** | `tcp://127.0.0.1:16765` | 本项目。env `HERMES_AGENT_BRIDGE_ENDPOINT` 可覆盖 |
| hermes-studio bridge | `tcp://127.0.0.1:18765` | 同机可能并行运行，**互不干扰** |

> ⚠️ 16765 是**刻意与 18765 错开**的隔离设计，任何实现（含从 hermes-studio copy 过来的代码与默认值）都必须把默认端口改为 16765。严禁沿用 18765。

### 1.3 现状缺口

**已有骨架**：`packages/server/src/services/hermes/bridge/bridge_server.py`（136 行）

| 维度 | 现状 | 缺口 |
|---|---|---|
| 传输 | TCP 监听 16765 + NDJSON 已跑通 | 无 ipc:// 支持；无心跳/重连语义 |
| chat 主链路 | 惰性建 `AIAgent` → `chat_stream` → 事件映射 → `completed` | 未真实 import `run_agent`（注释标注"需 hermes-agent 源码/包可 import"），未落 ACP stdio |
| 运行控制 | `interrupt`/`steer`/`title` **均为空壳**（仅 `SESSIONS.get` 或 `pass`） | 全部无实现 |
| 架构 | 单进程 + 单 `SESSIONS` 字典 + 每连接一线程 | 无 broker/worker/pool 分层；无 session/profile 隔离；worker 崩溃即全挂，无自愈 |
| 控制面 | 仅 chat 一族 | approval/clarify/destroy/model/skills/MCP/command/background/compression 全缺 |

**Node 端已就绪**：`packages/server/src/bridge.ts` 的 `RealBridge` 已完成 M2 修复（单例 socket 改为 `Map<sessionId, Socket>` 定向投递）。默认 `HERMES_BRIDGE_MOCK=1` 走 MockBridge；接真 bridge 需置 `HERMES_BRIDGE_MOCK=0`。

### 1.4 实现策略（已定）

**copy-and-adapt，不从零写。** 源实现：
`d:\home\yqwang\.npm-global\node_modules\hermes-web-ui\dist\server\agent-bridge\python\`

| 模块 | 职责 |
|---|---|
| `bridge_server.py` | 进程入口、端点绑定、生命周期 |
| `bridge_broker.py` | 按 session/profile 路由请求到 worker |
| `bridge_pool.py` | worker 进程池：创建、复用、健康检查、回收 |
| `bridge_runtime.py` | worker 内运行时：spawn `run_agent.py`、ACP stdio 通信、事件泵 |
| `bridge_transport.py` | 传输层：帧编解码、连接管理 |

---

## 2. 产品目标

> **一句话**：把 kmaster-bridge 从"只能聊天的 136 行单进程骨架"升级为**生产可用的完整 AgentBridge**——复用 hermes-studio 的 broker/worker/pool 分层实现，跑通真实 hermes-agent（ACP stdio），并在其之上暴露**比 hermes-studio 更细粒度的 agent 控制面**（运行控制 / 交互审批 / 配置热切换 / 后台委派 / 上下文压缩），独占 16765 端口与 hermes-studio 完全隔离共存。

拆解为三个正交目标：

- **G1 · 真实可用**：真实 import/spawn hermes-agent，chat 全链路（含 ACP stdio 事件流）端到端跑通，替代 MockBridge 成为默认可用路径。
- **G2 · 架构健壮**：单进程升级为 broker/worker/pool 分层，实现 session/profile 隔离与进程自愈，单会话崩溃不影响其他会话。
- **G3 · 控制面完备**：覆盖设计方案 [Bridge] 操作族全部 7 类需求（对话主链路 / 运行控制 / 交互控制 / 会话生命周期 / 配置热切换 / 命令与后台 / 压缩），形成 Node ↔ Python 的稳定契约。

---

## 3. 用户故事

### 视角 A：kmaster 前端用户

- **US-1**（对话主链路，F1/F2）
  作为 kmaster 用户，我希望发送消息后能**实时看到思考流、正文流、工具调用卡片和用量**，并在结束时拿到完整回复与标题，这样我才能像用 WorkBuddy 一样自然地与 Agent 协作，而不是等一个黑盒返回。

- **US-2**（运行控制，F3/F4）
  作为 kmaster 用户，我希望在 Agent 跑偏时能**立即停止**，或者**不打断地追加一句引导**（steer），这样我不必为一次误解而重开会话浪费 token。

- **US-3**（交互控制，F5/F6）
  作为 kmaster 用户，我希望 Agent 执行敏感工具前**弹卡片让我审批**、遇到歧义时**弹卡片问我**，并且我的选择能真正让 Python 侧挂起的 Agent 继续执行，这样我才敢把写文件、跑命令的权限交给它。

- **US-4**（配置热切换与命令，F7/F8/F9/F10）
  作为 kmaster 用户，我希望**会话中途切换模型、开关技能、增删 MCP 连接器、敲 `/clear` `/compact` 斜杠命令**都能即时生效，不用重启进程或新建会话。

### 视角 B：kmaster-server（Node 后端）

- **US-5**（稳定契约与定向投递）
  作为 kmaster-server，我需要 bridge 的**每一条下行事件都带 `sessionId`**，这样我的 `Map<sessionId, Socket>` 才能把事件精确投递到对应的 WS 客户端；我还需要一份明确的 action/event 契约表，以便 `RealBridge` 与 `MockBridge` 行为对齐、可切换。

- **US-6**（隔离与自愈）
  作为 kmaster-server，我需要**某个会话的 agent 崩溃时 bridge 能自动重建 worker 并回报 `error` 事件**，而不是整个 bridge 进程退出导致所有在线会话断流；同时我需要 bridge 独占 16765，不与同机 hermes-studio（18765）抢端口。

### 视角 C：hermes-agent（被托管的 Agent 运行时）

- **US-7**（正确托管与资源释放）
  作为被托管的 hermes-agent 进程，我需要 bridge 以 **ACP stdio 正确 spawn 并按 profile 传参**（provider/model/keys 由我自己从 `~/.hermes/config.yaml` 解析，studio 不传密钥）；会话销毁或超时未响应 interrupt 时，我需要被**强杀并干净重建**，避免僵尸进程堆积。

---

## 4. 需求池

> 优先级定义：**P0 = 本里程碑必须交付**（缺失即视为未完成）；**P1 = 应当交付**（控制面补全，可分批）；**P2 = 可选增强**（不阻塞验收）。
> 验收标准均以「可执行、可观测」为准。

### 4.1 需求池总览

| 编号 | 名称 | 优先级 | 覆盖需求类 |
|---|---|---|---|
| BR-01 | bridge 模块落地与端口隔离 | P0 | 基础设施 |
| BR-02 | 真实 hermes-agent 接入（ACP stdio） | P0 | ① 对话主链路 |
| BR-03 | broker/worker/pool 分层与隔离自愈 | P0 | 基础设施 |
| BR-04 | 修复 interrupt / steer / title 空壳 | P0 | ② 运行控制 |
| BR-05 | Node↔Python 协议契约固化 | P0 | 契约 |
| BR-06 | 审批转发（approvalRespond + gateway） | P1 | ③ 交互控制 |
| BR-07 | 澄清应答（clarifyRespond） | P1 | ③ 交互控制 |
| BR-08 | 会话生命周期（destroy / 超时强杀重建） | P1 | ④ 会话生命周期 |
| BR-09 | 会话内模型切换（switchSessionModel） | P1 | ⑤ 配置热切换 |
| BR-10 | 技能热重载（reloadSkills） | P1 | ⑤ 配置热切换 |
| BR-11 | MCP 操作族（mcpList/Add/Update/Remove/Test/Tools/Reload） | P1 | ⑤ 配置热切换 |
| BR-12 | 会话命令（command） | P1 | ⑥ 命令与后台 |
| BR-13 | 后台任务与委派（backgroundPoll / complete / delegation & subagent 事件） | P1 | ⑥ 命令与后台 |
| BR-14 | 上下文压缩与估算（compressionRespond / contextEstimate） | P1 | ⑦ 压缩 |
| BR-15 | ipc:// 传输支持（Windows 自动退回 tcp） | P2 | 基础设施 |
| BR-16 | worker 端口基址可配置 | P2 | 基础设施 |
| BR-17 | 结构化日志与健康探针 | P2 | 可观测性 |
| BR-18 | LAN discovery（跨机接入，若方案确认需要） | P2 | 基础设施 |

---

### 4.2 P0 需求明细（必须交付）

#### BR-01 · bridge 模块落地与端口隔离

**描述**
将 hermes-studio 的 5 个 bridge 模块（`bridge_server.py` / `bridge_broker.py` / `bridge_pool.py` / `bridge_runtime.py` / `bridge_transport.py`）copy 到 `packages/server/src/services/hermes/bridge/`，完成 kmaster 化适配：包名/日志前缀改为 `kmaster-bridge`，**默认端点改为 `tcp://127.0.0.1:16765`**，保留 `HERMES_AGENT_BRIDGE_ENDPOINT` 环境变量覆盖能力。现有 136 行 `bridge_server.py` 骨架被替换（其 chat 事件映射逻辑作为参考保留/合并）。

**验收标准**
- AC1.1 `python bridge_server.py` 启动后，`netstat` 可见 **127.0.0.1:16765** 处于 LISTEN，且**未占用 18765**。
- AC1.2 同机先启动 hermes-studio bridge（18765）再启动 kmaster-bridge，两者**同时正常服务**，互不报端口占用错误。
- AC1.3 `HERMES_AGENT_BRIDGE_ENDPOINT=tcp://127.0.0.1:16999` 启动时，实际监听 16999（配置生效）。
- AC1.4 代码库内全文检索 `18765` **零命中**（copy 残留已清理）。
- AC1.5 启动日志首行输出 `[kmaster-bridge] listening on 127.0.0.1:16765`。

#### BR-02 · 真实 hermes-agent 接入（ACP stdio）

**描述**
worker 通过 `subprocess` spawn hermes-agent 的 `run_agent.py`，以 **ACP stdio JSON-RPC** 通信，取代当前"直接 `from run_agent import AIAgent`（未验证可 import）"的假设。hermes-agent 的 provider/model/API key/工具集**由其自身从 `~/.hermes/config.yaml` 解析，kmaster 不传任何密钥**，只传 `sessionId` / `message` / `profile` / `instructions` / `model` / `options`。sessionUpdate 流直译为 kmaster 下行事件（映射见 §5.3）。

**验收标准**
- AC2.1 `HERMES_BRIDGE_MOCK=0` 下从前端发送一条消息，能依次收到 `run.started` → `reasoning.delta`*/`message.delta`* → `usage.updated` → `completed`，最终文本与 hermes CLI 直接运行同一 prompt 的结果语义一致。
- AC2.2 消息中包含需要工具的请求（如"列出当前目录文件"）时，能收到成对的 `tool.started` / `tool.completed`（含 `toolCallId` 可配对）。
- AC2.3 hermes-agent 未安装 / 无法 spawn 时，bridge **不崩溃**，回报 `error {code:"AGENT_SPAWN_FAILED", message}` + `completed`，Node 侧能把失败态展示给用户。
- AC2.4 全链路无任何密钥/token 从 Node 传入 Python（代码走查 + 日志核验）。
- AC2.5 二轮对话在同一 session 内上下文连贯（worker 复用同一 agent 进程，或经 hermes session DB 恢复）。

#### BR-03 · broker/worker/pool 分层与隔离自愈

**描述**
以 hermes-studio 架构为准落地三层：`bridge_server`（端点/连接）→ `bridge_broker`（按 `sessionId` + `profile` 路由）→ `bridge_pool`（worker 进程池，负责 spawn/复用/健康检查/回收）→ `bridge_runtime`（worker 内 agent 运行时）。取代当前"单进程 + 全局 `SESSIONS` 字典"。

**验收标准**
- AC3.1 两个不同 `sessionId` 并发发起 chat，事件流**互不串扰**（每条事件的 `sessionId` 正确，无交叉）。
- AC3.2 两个不同 `profile` 的会话被路由到**不同 worker**（可通过日志/进程列表观测到独立 PID）。
- AC3.3 手动 `kill` 某个 worker 进程后：该会话收到 `error` 事件；**其他会话事件流不中断**；该会话下一次 chat 时 pool **自动重建 worker** 并正常响应（自愈）。
- AC3.4 会话数超过 pool 上限时，请求排队或按 LRU 回收空闲 worker，**不出现 spawn 风暴**（进程数有上界，可配置）。
- AC3.5 bridge 主进程退出时，所有子 worker 与 agent 进程被清理，**无僵尸进程残留**。

#### BR-04 · 修复 interrupt / steer / title 空壳

**描述**
把现骨架中三个空实现补成真实功能：
- `interrupt(sessionId)`：触发 hermes `tools/interrupt.py` 中断机制，AIAgent 循环在安全点停止；
- `steer(sessionId, text)`：运行中把引导文本注入下一轮迭代上下文，**不中断当前 run**；
- `getSessionTitle(sessionId)`：异步生成会话标题并以 `session.title.updated` 事件回传。

**验收标准**
- AC4.1 长任务运行中发送 `interrupt`，**3 秒内**收到 `abort.started` → `abort.completed`，且事件流停止推送 delta。
- AC4.2 interrupt 超时（默认 10s，可配）未停止时，回报 `abort.timeout` 并自动执行 `destroy(sessionId)` 强杀重建，下一次 chat 仍可用。
- AC4.3 运行中发送 `steer {text}`，当前 run **不中断**，且后续输出可观测到引导内容被采纳（如"改用表格输出"生效）。
- AC4.4 首轮对话结束后，异步收到 `session.title.updated {sessionId, title}`，title 非空且与对话内容相关。
- AC4.5 三个 action 在无对应活跃 session 时返回 `error {code:"SESSION_NOT_FOUND"}`，**不静默 pass、不抛未捕获异常**。

#### BR-05 · Node↔Python 协议契约固化

**描述**
以 §5 的命令表/事件表为**唯一契约**，Python 侧实现与 Node 侧 `RealBridge`、`MockBridge` 三方对齐。所有下行事件**必须携带 `sessionId`**（Node 的 `Map<sessionId, Socket>` 定向投递依赖此字段）；未知 action 与未知事件类型有明确兜底行为。

**验收标准**
- AC5.1 bridge 下行的**每一条**事件 JSON 均含非空 `sessionId` 字段（自动化断言：抓取一次完整 run 的事件流逐条校验）。
- AC5.2 发送未知 `action` 时返回 `error {code:"UNKNOWN_ACTION", action}`，连接**不断开**。
- AC5.3 Python 侧产生的未在映射表内的 agent 事件，以 `agent.event {raw}` 兜底透传，不丢弃、不报错。
- AC5.4 `MockBridge` 与 `RealBridge` 对同一组 action 的事件序列**形状一致**（前端无需区分模式）。
- AC5.5 单条 NDJSON 帧超长（>64KB）时正确分片重组，不出现 JSON 解析错误（现骨架 `recv(65536)` 边界问题必须解决）。

---

### 4.3 P1 需求明细（控制面补全）

#### BR-06 · 审批转发（approvalRespond + gateway）
**描述**：hermes 工具守卫（`tools/approval.py` + `agent/tool_guardrails.py`）产生审批请求 → bridge 上抛 `approval.requested {approvalId, tool, args, risk}`；Node 下发用户选择 → `approvalRespond(sessionId, approvalId, choice)` → Python 侧 resolve 挂起的 future。需实现 **gateway 审批转发**：worker 内的审批请求经 broker 路由到发起该 session 的连接。
**验收标准**：
- 触发敏感工具时前端收到 `approval.requested`，Agent 侧**处于挂起态**（无后续 delta）；
- 回 `choice=allow` 后工具执行并产生 `tool.completed`；回 `choice=deny` 后工具被跳过，Agent 继续；
- `approval.resolved` 广播给同会话其他客户端；
- 审批挂起超时（可配，默认 5min）自动按 deny 处理并回报，不永久悬挂 worker。

#### BR-07 · 澄清应答（clarifyRespond）
**描述**：`tools/clarify_tool.py` → `clarify.requested {clarifyId, question, options[]}`；`clarifyRespond(sessionId, clarifyId, response)` 把答案回注工具返回值。
**验收标准**：收到 `clarify.requested` 后 Agent 挂起；回 `response`（选项或自由文本）后工具返回该答案且循环继续；`clarify.resolved` 同步；超时策略同 BR-06。

#### BR-08 · 会话生命周期（destroy / 超时强杀重建）
**描述**：`destroy(sessionId, force?)` 释放 Python 侧 AgentSession 与 worker 资源；支持 abort 超时后的强杀重建（与 BR-04 AC4.2 联动）；空闲会话按 TTL 自动回收。
**验收标准**：`destroy` 后进程列表中对应 agent 子进程消失；再次 chat 同一 sessionId 能惰性重建且从 hermes session DB 恢复上下文；空闲超 TTL（默认 30min，可配）的 worker 被自动回收且日志可见。

#### BR-09 · 会话内模型切换（switchSessionModel）
**描述**：`switchSessionModel(sessionId, provider, model)` → Python 侧调 `AIAgent.switch_model(...)`。
**验收标准**：切换后**同一会话上下文保留**（不清空历史）；下一轮 `usage.updated` 中的 model 字段为新模型；切换非法模型返回 `error {code:"MODEL_NOT_AVAILABLE"}` 且会话仍可用。

#### BR-10 · 技能热重载（reloadSkills）
**描述**：`reloadSkills(profile)` 让 hermes 侧技能开关/新装技能热生效，无需重启 worker。
**验收标准**：修改 `~/.hermes/config.yaml` 技能开关或新增 `~/.hermes/skills/<name>/` 后调用 `reloadSkills`，同一活跃会话的下一轮对话中新技能可被调用/已禁用技能不再出现。

#### BR-11 · MCP 操作族
**描述**：`mcpList / mcpAdd / mcpUpdate / mcpRemove / mcpTest / mcpTools / mcpReload`，操纵 hermes 的 `~/.hermes/mcp_servers` 配置与 `tools/mcp_tool.py` 连接池。
**验收标准**：`mcpList` 返回与 hermes CLI 一致的服务器清单与连接状态；`mcpAdd` 后 `mcpTest` 可测通连通性；`mcpReload` 后新 MCP 工具在活跃会话下一轮可用；非法配置返回结构化 `error` 而非崩溃。

#### BR-12 · 会话命令（command）
**描述**：`command(sessionId, command, args?)` 执行 hermes 会话命令（`/clear`、`/compact`、`/model` 等），结果以 `session.command` 事件回显。
**验收标准**：`/clear` 后同会话上下文被清空（下一轮不引用此前内容）；`/compact` 触发压缩并产生 `compression.started/completed`；未知命令返回 `session.command {ok:false, error}`。

#### BR-13 · 后台任务与委派
**描述**：`backgroundPoll()` 轮询后台任务通知 + `completeBackgroundNotification(notificationId)` 确认（at-least-once 投递，沿用 hermes-studio 已验证模式）；`delegate_tool` / `async_delegation` 产生 `subagent.start/tool/text/progress/complete` 与 `delegation.updated` 事件。
**验收标准**：发起后台委派任务后，`backgroundPoll` 能取到通知；`completeBackgroundNotification` 确认后**同一通知不再重复返回**；未确认时重复 poll **仍可取到**（at-least-once 语义可验证）；子代理运行期间前端能收到 `subagent.*` 事件序列。

#### BR-14 · 上下文压缩与估算
**描述**：自动压缩产生 `compression.started/completed`；需用户决策的压缩经 `compressionRespond(sessionId, compressionId, choice)` 应答；`contextEstimate(sessionId, history?, instructions?, profile?)` 返回 token 占用/上限供 UsageBar 显示。
**验收标准**：长对话触发自动压缩时前端收到成对事件；`compressionRespond` 能让挂起的压缩流程继续；`contextEstimate` 返回 `{used, limit}` 且 used 随对话增长单调递增（同一会话内）。

---

### 4.4 P2 需求明细（可选增强）

#### BR-15 · ipc:// 传输支持
**描述**：`HERMES_AGENT_BRIDGE_ENDPOINT` 支持 `ipc:///path/to.sock`（Unix domain socket），性能与安全优于 TCP；**Windows 平台自动退回 tcp://127.0.0.1:16765**。
**验收标准**：Linux/macOS 下配 ipc:// 能正常服务；Windows 下配 ipc:// 时日志给出降级提示并成功绑定 16765，不报错退出。

#### BR-16 · worker 端口基址可配置
**描述**：worker 若需独立监听端口，其基址由 env（如 `KMASTER_BRIDGE_WORKER_PORT_BASE`）配置，默认值须与 hermes-studio worker 端口段错开。
**验收标准**：配置后 worker 端口按基址顺序分配；与 hermes-studio 并行运行无端口冲突。

#### BR-17 · 结构化日志与健康探针
**描述**：统一 JSON 结构化日志（含 `sessionId`/`workerPid`/`action`/`latencyMs`）；提供轻量健康探针 action（如 `ping` / `statusIfLoaded`）。
**验收标准**：一次完整 run 的日志可按 sessionId 串联；`ping` 在 100ms 内返回 `{ok:true, uptime, workers}`。

#### BR-18 · LAN discovery
**描述**：若最终方案需要跨机接入（server 与 bridge 不同机），提供发现/注册机制。**是否纳入取决于 §7 Q4 的拍板结果。**
**验收标准**：待需求确认后补充。

---

## 5. 接口 / 协议约定（Node ↔ Python 契约）

> 本节是**架构师与工程师的唯一契约来源**。Python 侧实现、Node 侧 `RealBridge`、`MockBridge` 三方必须一致。

### 5.1 传输与帧格式

| 项 | 约定 |
|---|---|
| 端点 | `tcp://127.0.0.1:16765`（env `HERMES_AGENT_BRIDGE_ENDPOINT` 覆盖；P2 支持 `ipc://`） |
| 编码 | UTF-8 |
| 帧格式 | **NDJSON**：一行一条 JSON，以 `\n` 分隔；接收端须支持跨 `recv` 边界的分片重组 |
| 上行（Node→Python） | `{ "action": string, "requestId"?: string, "sessionId"?: string, ...payload }` |
| 下行（Python→Node） | `{ "type": string, "sessionId": string, "runId"?: string, ...payload }` |
| **强制字段** | 所有下行事件**必须**带 `sessionId`（Node `Map<sessionId, Socket>` 定向投递依赖） |
| 请求-响应关联 | 带 `requestId` 的命令，其同步结果以 `{type:"result", requestId, ok, data?, error?}` 回传 |
| 错误 | `{type:"error", sessionId, code, message, requestId?}`；连接不因业务错误断开 |

### 5.2 上行命令表（Bridge Action）

| 需求类 | action | 字段 | 优先级 | 同步回执 |
|---|---|---|---|---|
| ① 对话主链路 | `chat` | `sessionId, message, attachments?, instructions?, profile?, model?, options?{background_delegation_enabled}` | P0 | `run.started{runId}` |
| ① | `chatStream` | `runId` | P0 | 事件流 |
| ① | `getOutput` | `runId, cursor, eventCursor` | P0 | `result{output, nextCursor}` |
| ① | `getResult` | `runId` | P0 | `result{message, usage}` |
| ① | `getSessionTitle` | `sessionId` | P0 | 异步 `session.title.updated` |
| ① | `getHistory` | `sessionId, limit?` | P0 | `result{messages[]}` |
| ① | `statusIfLoaded` | `sessionId` | P1 | `result{running, runId?}` |
| ② 运行控制 | `interrupt` | `sessionId` | P0 | `abort.started` → `abort.completed`/`abort.timeout` |
| ② | `steer` | `sessionId, text` | P0 | `result{ok}`（不中断 run） |
| ③ 交互控制 | `approvalRespond` | `sessionId, approvalId, choice` (`allow`/`always`/`deny`) | P1 | `approval.resolved` |
| ③ | `clarifyRespond` | `sessionId, clarifyId, response` | P1 | `clarify.resolved` |
| ④ 生命周期 | `destroy` | `sessionId, force?` | P1 | `result{ok}` |
| ⑤ 配置热切换 | `switchSessionModel` | `sessionId, provider, model` | P1 | `result{ok, model}` |
| ⑤ | `reloadSkills` | `profile` | P1 | `result{ok, skills[]}` |
| ⑤ | `mcpList` | `profile` | P1 | `result{servers[]}` |
| ⑤ | `mcpAdd` / `mcpUpdate` | `profile, name, config` | P1 | `result{ok}` |
| ⑤ | `mcpRemove` | `profile, name` | P1 | `result{ok}` |
| ⑤ | `mcpTest` | `profile, name` | P1 | `result{ok, latencyMs?, error?}` |
| ⑤ | `mcpTools` | `profile, server?` | P1 | `result{tools[]}` |
| ⑤ | `mcpReload` | `profile` | P1 | `result{ok}` |
| ⑥ 命令与后台 | `command` | `sessionId, command, args?` | P1 | `session.command` |
| ⑥ | `backgroundPoll` | `—` | P1 | `result{notifications[]}` |
| ⑥ | `completeBackgroundNotification` | `notificationId` | P1 | `result{ok}` |
| ⑦ 压缩 | `compressionRespond` | `sessionId, compressionId, choice` | P1 | `compression.completed` |
| ⑦ | `contextEstimate` | `sessionId, history?, instructions?, profile?` | P1 | `result{used, limit}` |
| — | `ping` | `—` | P2 | `result{ok, uptime, workers}` |

### 5.3 下行事件表（Bridge Event）

> 所有事件默认携带 `sessionId`；run 内事件另带 `runId`。

| 分组 | type | 关键字段 | 前端消费 |
|---|---|---|---|
| 运行态 | `run.started` | `runId` | 进入运行态 |
| 运行态 | `completed` | `runId, text, usage?` | run 结束、消息落库 |
| 运行态 | `error` | `code, message, requestId?` | 失败态展示 |
| 内容流 | `message.delta` | `messageId?, delta` | AgentMarkdown 追加 |
| 内容流 | `message.interim` | `text` | 临时态渲染 |
| 内容流 | `reasoning.delta` / `thinking.delta` | `delta` | ThoughtBlock |
| 工具 | `tool.started` | `toolCallId, tool, args` | ToolCallCard(running) |
| 工具 | `tool.completed` | `toolCallId, tool, result` | ToolCallCard(done) |
| 工具 | `tool.failed` | `toolCallId, tool, error` | ToolCallCard(error) |
| 交互 | `approval.requested` | `approvalId, tool, args, risk` | ApprovalCard |
| 交互 | `approval.resolved` | `approvalId, choice` | 卡片收敛 |
| 交互 | `clarify.requested` | `clarifyId, question, options[]` | ClarifyCard |
| 交互 | `clarify.resolved` | `clarifyId, response` | 卡片收敛 |
| 中断 | `abort.started` / `abort.completed` / `abort.timeout` | `runId` | 停止态提示 |
| 委派 | `subagent.start` / `.tool` / `.text` / `.progress` / `.complete` | `subagentId, ...` | SubagentCard |
| 委派 | `delegation.updated` | `delegationId, status, progress?` | 委派进度 |
| 后台 | `background.notification` | `notificationId, payload` | 后台完成通知 |
| 压缩 | `compression.started` / `compression.completed` | `compressionId, before?, after?` | 顶部提示条 |
| 用量 | `usage.updated` | `input_tokens, output_tokens, cost, model?` | UsageBar |
| 会话 | `session.title.updated` | `title` | 侧栏标题刷新 |
| 会话 | `session.command` | `command, ok, output?, error?` | 命令回显 |
| 兜底 | `agent.event` | `raw` | 原样透传（不丢弃） |

**边界说明（重要，避免架构师误分工）**：
- `run.queued` / `run.failed` / `run.reattach_failed` / `workspace.diff.completed` **由 kmaster-server 产生**（队列 F17、diff 追踪均在 Node 侧实现），**不属于 kmaster-bridge 下行事件**，bridge 无需实现。见 §7 Q2 确认。
- `approval.requested` 的 "总是允许" 策略记忆由 **kmaster-server** 落 kmaster.db，bridge 只处理单次 choice。

---

## 6. 非功能需求与验收基线

### 6.1 非功能需求

| 编号 | 要求 |
|---|---|
| NFR-1 | **端口隔离**：默认 16765，与 hermes-studio（18765）同机并行零冲突 |
| NFR-2 | **无密钥透传**：Node 侧不向 Python 传任何 provider key/token，凭据由 hermes-agent 自解析 `~/.hermes/config.yaml` |
| NFR-3 | **故障隔离**：单 worker/agent 崩溃不影响其他会话；bridge 主进程不因业务异常退出 |
| NFR-4 | **资源上界**：worker 进程数、会话空闲 TTL、审批挂起超时均可配置且有默认上界 |
| NFR-5 | **优雅退出**：主进程退出清理全部子进程，无僵尸残留 |
| NFR-6 | **可降级**：`HERMES_BRIDGE_MOCK=1` 时 Node 走 MockBridge，开发链路不依赖 Python 环境 |
| NFR-7 | **契约一致**：MockBridge 与 RealBridge 事件形状一致，前端零分支 |

### 6.2 里程碑验收基线

- **AB-1** bridge 独立启动并监听 16765，与 hermes-studio bridge 并行运行互不影响（BR-01）。
- **AB-2** `HERMES_BRIDGE_MOCK=0` 下，浏览器发送消息可获得完整流式回复（思考 + 正文 + 工具卡 + 用量 + 完成），并异步收到会话标题（BR-02/BR-04）。
- **AB-3** 两会话并发无串扰；kill 单 worker 后仅该会话报错且下轮自愈（BR-03）。
- **AB-4** 运行中 `interrupt` 3s 内停止、超时降级强杀重建；`steer` 不中断且生效（BR-04）。
- **AB-5** 一次完整 run 的所有下行事件均含 `sessionId`；未知 action 返回结构化 error 且连接存活（BR-05）。
- **AB-6** P1 控制面按批次交付，每批附对应验收脚本/手测记录。
- **AB-7** 现有回归不破：`npm run test -w packages/client` 通过、`tsc --noEmit`（server）零错误。

---

## 7. 待确认问题（需架构师 / 用户拍板）

### Q1 · 事件协议：保留 kmaster 自有协议，还是直接复用 hermes-studio 协议？
**背景**：02 设计方案第四节写明「kmaster-studio 原样继承 hermes-studio `/chat-run` 实测事件集，保证与 Bridge 层零适配成本」；但本次 PRD 的控制面（§5.2 共 26 个 action）**已超出 hermes-studio 暴露的范围**，且 kmaster 强制要求每条事件带 `sessionId`（hermes-studio 未必如此）。
**选项**：(A) 完全继承 hermes-studio 协议，kmaster 新增能力以扩展事件追加；(B) 定义 kmaster 自有协议，在 worker 内做一层 hermes→kmaster 映射（当前骨架的 `map_hermes_event` 即此思路）。
**PM 倾向**：**B**（自有协议 + 映射层），因为 sessionId 强制字段与更细控制面已经偏离原协议，映射层能隔离 hermes 版本漂移。**需架构师确认代价。**

### Q2 · 职责边界：队列 / diff / always-allow 策略是否确定留在 Node 侧？
**背景**：设计方案 F17 明确「hermes Bridge 无队列概念 → 在 kmaster-server 实现」，F4 的"总是允许"记入 kmaster.db，workspace-diff 由 server 自实现。本 PRD §5.3 已据此把 `run.queued` / `workspace.diff.completed` 排除出 bridge 事件表。
**待确认**：这一边界是否最终成立？若架构师认为 diff 更适合在 Python 侧（贴近文件系统操作）产生，需在设计阶段调整事件表。

### Q3 · P1 范围：MCP 操作族（BR-11）与技能热重载（BR-10）是否必须在本里程碑交付？
**背景**：这两项涉及直接读写 hermes 配置目录（`~/.hermes/mcp_servers`、`~/.hermes/skills/`），存在**格式漂移与并发写风险**（设计方案在 F13 已提到需文件锁 + 备份）。若本里程碑主目标是"bridge 跑通 + 架构分层"，这两项可后置。
**选项**：(A) 本里程碑仅交付 P0 + 交互控制（BR-06/07/08），MCP/技能顺延下一里程碑；(B) 全量 P1 一次交付。
**PM 倾向**：**A**，先把主链路和稳定性打穿。**需用户拍板范围。**

### Q4 · worker 进程管理：`subprocess` 直接 spawn，还是走 `uv` / 虚拟环境隔离？
**背景**：hermes-studio 现实现用 `subprocess` spawn `run_agent.py`，依赖宿主 Python 环境已装好 hermes-agent。kmaster-studio 若要作为独立产品分发（尤其 Electron 壳），可能需要 `uv run` 或独立 venv 来保证依赖可复现。此外还牵连 BR-18（LAN discovery）是否需要——若 bridge 与 server 恒同机，则 BR-18 可直接删除。
**待确认**：(a) worker spawn 方式；(b) bridge 是否只需支持同机 127.0.0.1（决定 BR-18 去留）。

---

## 8. 附：与 hermes-studio bridge 的差异摘要

| 维度 | hermes-studio bridge | **kmaster-bridge（本次目标）** |
|---|---|---|
| 端点 | `tcp://127.0.0.1:18765` | **`tcp://127.0.0.1:16765`** |
| 架构 | broker / worker / pool 分层 | **同构复用**（copy-and-adapt） |
| 控制面 | 对话 + 基础运行控制 | **+ 交互审批 / 澄清 / 模型热切 / 技能重载 / MCP 操作族 / 会话命令 / 后台委派 / 压缩**（§5.2 共 26 action） |
| 事件 sessionId | 不强制 | **强制携带**（Node 定向投递依赖） |
| 队列 / diff | — | 在 kmaster-server 侧实现，不入 bridge |
| 归属 | hermes-web-ui 内置 | **kmaster-studio 独立进程，可与前者并行运行** |
