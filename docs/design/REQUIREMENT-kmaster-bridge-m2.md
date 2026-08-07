# 需求文档 · kmaster-bridge M2（增量 PRD）

> **性质**：增量 PRD，仅描述 M2 里程碑新增/变更内容。M1 已交付内容不重复。
> **上游输入**：`docs/design/REQUIREMENT-kmaster-bridge.md`（M1 PRD）+ `docs/design/TECHNICAL-SOLUTION-kmaster-bridge.md`（M1 技术方案 §8 扩展点预留）。
> **下游消费者**：架构师（系统设计与任务分解）、Python/Node 工程师。
> **语言**：简体中文 ｜ **产品经理**：许清楚
> **里程碑范围**：M1 顺延的 P1 项 — MCP 操作族 / reloadSkills / switchSessionModel / command / backgroundPoll+委派事件 / compressionRespond+contextEstimate / ipc:// 传输。LAN discovery 待确认。

---

## 1. 背景与 M1 交付基线

### 1.1 M1 已交付（不再重复）

M1 已交付以下能力，**本 PRD 不涉及**：

| 类别 | 已交付项 |
|---|---|
| 基础设施 | BR-01 模块落地与端口隔离（16765）、BR-03 broker/worker/pool 分层与自愈、BR-05 协议契约固化 |
| 对话主链路 | BR-02 真实 hermes-agent 接入（进程内 import AIAgent）、chat 全链路端到端跑通 |
| 运行控制 | BR-04 interrupt / steer / title |
| 交互控制 | BR-06 审批转发（approvalRespond）、BR-07 澄清应答（clarifyRespond） |
| 会话生命周期 | BR-08 destroy / 超时强杀重建 |

### 1.2 M2 范围来源

以下 P1 项在 M1 技术方案 §8「顺延项的扩展点预留」中明确标注「worker 侧代码已保留，仅 gateway 未暴露」：

| 顺延项 | worker 侧状态 | gateway 侧缺口 |
|---|---|---|
| MCP 操作族 | `bridge_server.py` 分支完整保留 | `ACTION_ALIASES` 未注册 |
| `reloadSkills` | 已具备 | 未暴露 |
| `switchSessionModel` | 已具备 | 未暴露 |
| `command` | 已具备 | 未暴露 |
| 后台委派事件 | `subagent.*` / `delegation.updated` 经 `agent.event{raw}` 兜底透传 | 缺显式映射 |
| 压缩 | `EVENT_MAP` 中 `bridge.compression.*` 条目已写好标注 ⏭ | 未启用 |
| `contextEstimate` | worker 已存在 | 当前返回 `UNSUPPORTED_ACTION` |
| `ipc://` | `bridge_transport` 已含 ipc 分支 | 北向未开放配置 |

**结论**：M2 的核心工作不是「从零实现」，而是「**打通预留扩展点 + 事件泵对齐 + 前端消费**」。改动集中在 `bridge_gateway.py`（加 action 白名单）和 `bridge_protocol.py`（补事件映射），不涉及 broker/pool/runtime 重构��

### 1.3 风险提醒（来自技术方案）

| 风险 | 说明 |
|---|---|
| **MCP/技能格式漂移** | `mcpConfig` 与 `reloadSkills` 涉及直接读写 `~/.hermes/mcp_servers` 与 `~/.hermes/skills/`，hermes 版本升级可能导致配置格式不兼容 |
| **并发写冲突** | kmaster-bridge 与 hermes CLI / hermes-studio 可能同时写入同一配置文件，需文件锁保护 |
| **hermes API 耦合** | `switchSessionModel` 调 `AIAgent.switch_model()`，依赖 hermes 内部 API 稳定性（同 M1 技术方案 U4） |

---

## 2. 产品目标

> **一句话**：把 M1 技术方案 §8 预留的 8 个扩展点全部兑现为可用功能——让 kmaster 用户在会话中能**热管理 MCP 连接器、热切模型、热重载技能、执行斜杠命令、查看后台委派进度、掌控上下文用量**，使 kmaster-bridge 的控制面达到设计方案 [Bridge] 操作族 7 类的完整覆盖。

拆解为三个正交目标：

- **G1 · 配置热切换完备**：MCP 连接器生命周期管理（list/start/stop/restart/config）+ 技能热重载 + 模型热切换，全部在会话内即时生效，无需重启进程或新建会话。
- **G2 · 命令与后台可见**：斜杠命令（/clear /compact /model）可执行且有回显；后台委派与子代理运行态从「兜底透传 JSON」升级为「结构化事件卡片」。
- **G3 · 上下文可控**：用户可查看精确的 token 占用/上限、可对压缩建议做出决策；ipc:// 传输为 Linux/macOS 用户提供更优性能选项。

---

## 3. 用户故事

- **US-1**（MCP 连接器管理）
  作为 kmaster 用户，我希望在会话中**查看已安装的 MCP 服务器清单、启动/停止/重启某个连接器、增改其配置**，并且变更后同一会话的下一轮对话中新工具立即可用，这样我调试 MCP 连接器时不必反复重启 bridge 进程。

- **US-2**（模型与技能热切换）
  作为 kmaster 用户，我希望**会话中途切换模型**（如从 GPT-4o 换到 Claude Sonnet）且保留上下文，同时能**热重载技能**让新安装或禁用的技能即时生效，这样我能根据当前任务灵活调配 Agent 能力组合。

- **US-3**（斜杠命令）
  作为 kmaster 用户，我希望在输入框敲 `/clear`、`/compact`、`/model` 等命令时，Agent 能**正确执行并给出回显**——清空上下文、触发压缩、切换模型——这样我能用熟悉的 WorkBuddy 式命令控制会话。

- **US-4**（后台委派可见）
  作为 kmaster 用户，当我发起后台委派任务或 Agent 自动启动子代理时，我希望前端能**以结构化卡片展示子代理的运行状态**（开始→工具调用→文本输出→进度→完成），而不是一个看不懂的 JSON blob，这样我能掌控并行任务的全局进展。

- **US-5**（上下文精算与压缩控制）
  作为 kmaster 用户，我希望**随时查看当前会话的精确 token 占用率**（UsageBar），并在上下文接近上限时**收到压缩建议并决定是否执行**，这样长对话不会因 token 溢出而截断历史。

---

## 4. 需求池

> 优先级定义：**P0 = 本里程碑必须交付**（缺失即视为未完成）；**P1 = 应当交付**（可在里程碑内分批）；**P2 = 可选增强**。
> 验收标准均以「可执行、可观测」为准。
> ⚠️ 所有需求均依赖 M1 已交付的 gateway / broker / worker / pool 基础设施，不重复列出。

### 4.1 需求池总览

| 编号 | 名称 | 优先级 | 对应 PRD 原编号 |
|---|---|---|---|
| BR-M2-01 | MCP 操作族（mcpList / mcpStart / mcpStop / mcpRestart / mcpConfig） | P0 | BR-11 |
| BR-M2-02 | reloadSkills（技能热重载） | P0 | BR-10 |
| BR-M2-03 | switchSessionModel（会话内模型热切换） | P0 | BR-09 |
| BR-M2-04 | command（会话斜杠命令） | P0 | BR-12 |
| BR-M2-05 | backgroundPoll + completeBackgroundNotification | P1 | BR-13 |
| BR-M2-06 | delegation/subagent 事件显式映射 | P1 | BR-13 |
| BR-M2-07 | compressionRespond + contextEstimate | P1 | BR-14 |
| BR-M2-08 | ipc:// 传输支持（Windows 自动退回 tcp） | P1 | BR-15 |

---

### 4.2 P0 需求明细（必须交付）

#### BR-M2-01 · MCP 操作族

**描述**
在 gateway 层暴露 5 个 MCP action：`mcpList`（列出已配置的 MCP 服务器及连接状态）、`mcpStart`（启动指定连接器）、`mcpStop`（停止指定连接器）、`mcpRestart`（重启指定连接器）、`mcpConfig`（增/改 MCP 服务器配置）。worker 侧 `bridge_server.py` 对应分支完整保留，gateway 仅需加 `ACTION_ALIASES` 条目 + 路由转发。

**数据流**：
```
前端 → Node → gateway(mcpList/mcpStart/...) → broker → worker → bridge_pool
                                                              ├─ 读/写 ~/.hermes/mcp_servers
                                                              └─ 操作 mcp_tool 连接池
```

**验收标准**
- AC1.1 `mcpList` 返回的服务器清单与 `hermes CLI` 的 `mcp list` 输出一致，含 `name` / `status`（connected/disconnected/error）/ `tools_count`。
- AC1.2 `mcpStart` 调用后，该服务器的 `status` 变为 `connected`，且同一会话下一轮对话中该服务器的工具可被 Agent 调用（出现对应 `tool.started`）。
- AC1.3 `mcpStop` 调用后，该服务器的工具从当前会话的可用工具列表中移除（下一轮对话不再出现该服务器的工具调用）。
- AC1.4 `mcpRestart` 等价于 stop → start 原子操作，调用后 `status` 回到 `connected` 且工具可用。
- AC1.5 `mcpConfig` 增/改配置后，`mcpList` 能立即反映变更；传入非法配置（如 JSON 格式错误、必填字段缺失）时返回结构化 `error{code:"MCP_CONFIG_INVALID"}` 而非崩溃。
- AC1.6 并发写保护：bridge 写 `~/.hermes/mcp_servers` 前加文件锁（`fcntl.flock` / `msvcrt.locking`），写入失败时返回 `error{code:"MCP_CONFIG_LOCKED"}` 并提示稍后重试。

**依赖与风险**
- 依赖 hermes 的 `mcp_tool.py` 连接池 API 稳定性。
- **格式漂移风险**：M1 技术方案 U4 已指出 hermes 内部 API 强耦合。若 hermes 升级导致 `mcp_servers` 配置格式变化，bridge 需同步适配。建议 T05 附带记录当前 hermes-agent 版本号。
- **并发写风险**：kmaster-bridge 与 hermes CLI / hermes-studio 可能同时操作 `~/.hermes/mcp_servers`。AC1.6 文件锁是底线防护。

---

#### BR-M2-02 · reloadSkills（技能热重载）

**描述**
`reloadSkills(profile)` 让 hermes 侧技能开关/新装技能热生效。worker 侧能力已具备，gateway 仅需开放 action 映射。

**验收标准**
- AC2.1 修改 `~/.hermes/config.yaml` 技能开关（禁用某技能）后调用 `reloadSkills`，同一活跃会话的下一轮对话中该技能不再被调用。
- AC2.2 新增 `~/.hermes/skills/<name>/` 目录后调用 `reloadSkills`，新技能出现在可用工具列表中，下一轮对话可被调用。
- AC2.3 返回 `result{ok:true, skills:[{name, enabled}]}`，skills 数组反映重载后的技能状态。
- AC2.4 重载失败（如配置 YAML 语法错误）时返回 `error{code:"SKILLS_RELOAD_FAILED", message}`，**不影响当前已加载的技能集**（原子性：失败即回退）。

**依赖与风险**
- 同样涉及读取 `~/.hermes/config.yaml` 和 `~/.hermes/skills/`，存在 YAML 格式漂移风险。
- 技能目录结构若 hermes 升级改变，需要同步适配。

---

#### BR-M2-03 · switchSessionModel（会话内模型热切换）

**描述**
`switchSessionModel(sessionId, provider, model)` → worker 侧调 `AIAgent.switch_model()`。gateway 开放 action 映射即生效。切换后上下文**保留**不清空。

**验收标准**
- AC3.1 切换模型后同一会话的下一轮对话中，`usage.updated` 事件的 `model` 字段反映新模型名称。
- AC3.2 切换前后��话上下文**连续**——Agent 能引用切换前的对话内容（验证：切换后问"我刚才说了什么"能得到正确回答）。
- AC3.3 切换为不可用模型（如 provider 不存在或 model 名称错误）时返回 `error{code:"MODEL_NOT_AVAILABLE"}`，且**当前会话仍可用原模型继续对话**。
- AC3.4 返回 `result{ok:true, model, provider}` 确认切换结果。

**依赖与风险**
- 直接依赖 hermes `AIAgent.switch_model()` API，耦合风险同 M1 技术方案 U4。

---

#### BR-M2-04 · command（会话斜杠命令）

**描述**
`command(sessionId, command, args?)` 执行 hermes 会话命令。首批支持：`/clear`（清空上下文）、`/compact`（触发上下文压缩）、`/model`（切换模型，语义同 BR-M2-03 但以命令形式）。结果以 `session.command` 事件回显。

**验收标准**
- AC4.1 `/clear` 后同会话下一轮对话**不引用此前任何内容**（验证：先聊一段，`/clear`，再问"我们刚才在聊什么"→ Agent 表示不知道）。
- AC4.2 `/compact` 触发压缩并产生 `compression.started` → `compression.completed` 事件对（与 BR-M2-07 联动）。
- AC4.3 `/model <provider> <model>` 效果等价于 `switchSessionModel`（AC3.1~AC3.3 成立）。
- AC4.4 未知命令（如 `/unknown`）返回 `session.command{ok:false, error:"UNKNOWN_COMMAND"}`，不崩溃、不断连。
- AC4.5 命令执行结果以 `session.command{command, ok, output?, error?}` 事件回传前端，可用于命令行回显区域展示。

**依赖**
- `/compact` 依赖 BR-M2-07（压缩链路启用）。
- `/model` 与 BR-M2-03 共享 worker 侧 `switch_model` 实现。

---

### 4.3 P1 需求明细（控制面补全）

#### BR-M2-05 · backgroundPoll + completeBackgroundNotification

**描述**
`backgroundPoll()` 轮询后台任务通知（at-least-once 投递）+ `completeBackgroundNotification(notificationId)` 确认消费。沿用 hermes-studio 已验证模式。M1 中此链路未暴露。

**验收标准**
- AC5.1 `backgroundPoll` 返回 `{notifications:[{notificationId, type, payload, createdAt}]}`，包含已完成的后台委派任务通知。
- AC5.2 调用 `completeBackgroundNotification(notificationId)` 确认后，同一通知**不再出现在后续 poll 结果中**。
- AC5.3 未确认的通知在重复 poll 时**仍可获取**（at-least-once 语义，验证：poll → 不确认 → 再次 poll → 通知仍在）。
- AC5.4 空队列时返回 `{notifications:[]}` 而非报错。

**依赖**
- worker 侧后台通知缓冲机制（参考实现已具备）。

---

#### BR-M2-06 · delegation/subagent 事件显式映射

**描述**
M1 中 `subagent.start` / `.tool` / `.text` / `.progress` / `.complete` 与 `delegation.updated` 经 `agent.event{raw}` 兜底透传——前端收到的是不可解析的 JSON blob。M2 将兜底升级为 `EVENT_MAP` 中的**显式映射条目**，前端可渲染结构化 SubagentCard。

**验收标准**
- AC6.1 发起后台委派任务后，前端按顺序收到：`subagent.start{subagentId, task}` → `subagent.text{subagentId, delta}` / `subagent.tool{subagentId, tool, args, result}` → `subagent.progress{subagentId, percent}` → `subagent.complete{subagentId, summary}`。
- AC6.2 `delegation.updated{delegationId, status, progress?}` 在委派状态变化时实时推送。
- AC6.3 事件中不再出现 `agent.event{raw}` 包裹的子代理事件（除非 hermes 新增未知事件类型）。
- AC6.4 多条并行委派任务的事件按 `subagentId` / `delegationId` 正确分流，不串扰。

**依赖**
- 依赖 M1 事件泵（RunPump）游标轮询机制，仅补映射规则。

---

#### BR-M2-07 · compressionRespond + contextEstimate

**描述**
启用 M1 技术方案 §8 中已写好但标注 ⏭ 的压缩事件映射；开放 `compressionRespond` action 让用户对压缩建议做决策；`contextEstimate` 从 `UNSUPPORTED_ACTION` 改为正式可用。

**验收标准**
- AC7.1 长对话触发自动压缩时，前端收到成对的 `compression.started{compressionId, before_tokens}` → `compression.completed{compressionId, after_tokens, saved_tokens}`。
- AC7.2 需用户决策的压缩场景，前端收到 `compression.requested{compressionId, estimated_savings, preview?}`，用户通过 `compressionRespond(sessionId, compressionId, choice)` 选�� `allow`/`deny` 后流程继续/跳过。
- AC7.3 `contextEstimate(sessionId)` 返回 `{used, limit, percent}`，其中 `used` 随对话增长单调递增（同一会话内两次 estimate 对比可验证）。
- AC7.4 超限（used > limit * 0.9）时自动触发压缩建议，不依赖用户手动调用。

**依赖**
- worker 侧 `context_estimate` 已存在，只需 gateway 取消 `UNSUPPORTED_ACTION` 拦截。
- `/compact` 命令（BR-M2-04 AC4.2）依赖本需求启用。

---

#### BR-M2-08 · ipc:// 传输支持

**描述**
`HERMES_AGENT_BRIDGE_ENDPOINT` 支持 `ipc:///path/to.sock`（Unix domain socket）。`bridge_transport.py` 已含 ipc 分支（M1 copy 时保留），仅需开放北向配置。**Windows 平台自动退回 `tcp://127.0.0.1:16765`** 并日志提示降级。

**验收标准**
- AC8.1 Linux/macOS 下配置 `HERMES_AGENT_BRIDGE_ENDPOINT=ipc:///tmp/kmaster-bridge.sock`，bridge 正常启动且 Node 可连接通信。
- AC8.2 Windows 下配置 `ipc://` 时，bridge **不报错退出**，日志输出 `[kmaster-bridge] ipc:// not supported on Windows, falling back to tcp://127.0.0.1:16765`，并以 TCP 模式正常服务。
- AC8.3 未配置时默认行为不变（TCP 16765），不影响 M1 兼容性。

---

## 5. 接口变更清单（对比 M1）

### 5.1 新增 action（上行）

> M1 已暴露 13 个 action（chat/interrupt/steer/getSessionTitle/approvalRespond/clarifyRespond/destroy/getHistory/getOutput/getResult/statusIfLoaded/ping + contextEstimate[UNSUPPORTED]/plan.respond[UNSUPPORTED]）。
> M2 新增 **8 个可用 action** + **1 个解除拦截**：

| action | 字段 | 优先级 | 同步回执 | 对应 M1 原编号 |
|---|---|---|---|---|
| `mcpList` | `profile` | P0 | `result{servers[{name, status, tools_count}]}` | BR-11 |
| `mcpStart` | `profile, name` | P0 | `result{ok, server{name, status}}` | BR-11 |
| `mcpStop` | `profile, name` | P0 | `result{ok}` | BR-11 |
| `mcpRestart` | `profile, name` | P0 | `result{ok, server{name, status}}` | BR-11 |
| `mcpConfig` | `profile, name, config` | P0 | `result{ok}` | BR-11 |
| `reloadSkills` | `profile` | P0 | `result{ok, skills[{name, enabled}]}` | BR-10 |
| `switchSessionModel` | `sessionId, provider, model` | P0 | `result{ok, model, provider}` | BR-09 |
| `command` | `sessionId, command, args?` | P0 | `session.command{command, ok, output?, error?}` | BR-12 |
| `backgroundPoll` | `—` | P1 | `result{notifications[{notificationId, type, payload, createdAt}]}` | BR-13 |
| `completeBackgroundNotification` | `notificationId` | P1 | `result{ok}` | BR-13 |
| `compressionRespond` | `sessionId, compressionId, choice` | P1 | `compression.completed` | BR-14 |
| `contextEstimate` | `sessionId` | P1 | `result{used, limit, percent}` | BR-14 |

> ⚠️ `contextEstimate` 从 M1 的 `UNSUPPORTED_ACTION` 变为正式可用（解除拦截）。

### 5.2 新增/升级下行事件

> M1 事件表共 24 种事件类型。M2 **新增 10 种显式事件映射**（从 `agent.event{raw}` 兜底中提取升级）：

| type | 关键字段 | 前端消费 | M1 状态 | M2 变更 |
|---|---|---|---|---|
| `mcp.status.changed` | `server, status` | MCP 连接器状态指示 | — | **新增** |
| `session.command` | `command, ok, output?, error?` | 命令回显区 | 已定义但无上游 | **启用** |
| `subagent.start` | `subagentId, task` | SubagentCard(running) | 经 `agent.event{raw}` 兜底 | **显式映射** |
| `subagent.tool` | `subagentId, tool, args, result` | SubagentCard 工具调��� | 经 `agent.event{raw}` 兜底 | **显式映射** |
| `subagent.text` | `subagentId, delta` | SubagentCard 文本输出 | 经 `agent.event{raw}` 兜底 | **显式映射** |
| `subagent.progress` | `subagentId, percent` | SubagentCard 进���条 | 经 `agent.event{raw}` 兜底 | **显式映射** |
| `subagent.complete` | `subagentId, summary` | SubagentCard(done) | 经 `agent.event{raw}` 兜底 | **显式映射** |
| `delegation.updated` | `delegationId, status, progress?` | 委派进度指示 | 经 `agent.event{raw}` 兜底 | **显式映射** |
| `background.notification` | `notificationId, payload` | 后台任务完成通知 | 已定义但无上游 | **启用** |
| `compression.requested` | `compressionId, estimated_savings, preview?` | 压缩决策卡 | — | **新增** |

> `compression.started` / `compression.completed` 已在 M1 `EVENT_MAP` 中写好但标注 ⏭——本次直接启用，不视为新增。

### 5.3 错误码新增

| code | 触发条件 | 所属需求 |
|---|---|---|
| `MCP_CONFIG_INVALID` | `mcpConfig` 传入非法配置 | BR-M2-01 |
| `MCP_CONFIG_LOCKED` | 配置文件被其他进程占用 | BR-M2-01 |
| `MCP_SERVER_NOT_FOUND` | `mcpStart/mcpStop/mcpRestart` 目标服务器不存在 | BR-M2-01 |
| `SKILLS_RELOAD_FAILED` | 技能重载失败（YAML 语法错误等） | BR-M2-02 |
| `MODEL_NOT_AVAILABLE` | `switchSessionModel` 目标模型不可用 | BR-M2-03 |
| `UNKNOWN_COMMAND` | `command` 传入未知命令 | BR-M2-04 |

### 5.4 M1→M2 变更汇总

| 维度 | M1 交付 | M2 交付后 |
|---|---|---|
| 可用 action 数 | 13（+2 UNSUPPORTED） | **23**（+2 UNSUPPORTED 减为 1） |
| 显式事件类型 | 24 | **34**（+10 新映射） |
| `agent.event{raw}` 兜底范围 | 含 subagent/delegation/压缩 | 仅含 hermes 未来新增的未知事件 |
| 控制面覆盖 | 5/7 类（对话/运行控制/交互/生命周期/契约） | **7/7 类**（+ 配置热切换 / 命令与后台 / 压缩） |

---

## 6. 非功能需求

| 编号 | 要求 |
|---|---|
| NFR-M2-1 | **兼容 M1**：M1 所有 action/event 行为不变，已有契约测试全部通过 |
| NFR-M2-2 | **配置安全**：`mcpConfig` 和 `reloadSkills` 涉及文件写操作必须加锁，写入失败不损坏现有配置 |
| NFR-M2-3 | **降级友好**：`ipc://` 在 Windows 上自动退回 TCP，不阻塞启动 |
| NFR-M2-4 | **事件不丢**：subagent/delegation 从 `agent.event{raw}` 升级为显式映射后，原兜底机制保留处理未来新事件 |
| NFR-M2-5 | **Mock 对齐**：MockBridge 需补 M2 新增 action/event，保持 NFR-7 的「Mock 与 Real 形状一致」 |

---

## 7. 待确认问题（需主理人 / 架构师拍板）

### Q1 · LAN discovery（BR-18）是否正式删除？

**背景**：M1 技术方案 §8 明确「按 Q4 已删除，不预留」。主理人在任务说明中提出「需确认是否仍需要——上一轮主理人倾向删除」。
**PM 建议**：**正式删除**。理由：(a) kmaster-bridge 与 kmaster-server 恒同机部署（127.0.0.1），跨机场景无需求支撑；(b) 即使未来需要跨机，方案应是 server 侧反向代理而非 bridge 侧 LAN 发现，后者会引入 UDP 广播的安全与网络策略问题。
**需主理人确认**：是否明确从需求池中永久移除 BR-18？

### Q2 · MCP 操作粒度：全部暴露，还是仅 list/start/stop？

**背景**：主理人任务说明中列出的 MCP 操作为 `mcpList / mcpStart / mcpStop / mcpRestart / mcpConfig`（5 个），相比 M1 PRD 的 `mcpList/Add/Update/Remove/Test/Tools/Reload`（7 个）**精简了 mcpTest 和 mcpTools**，并将 Add/Update/Remove 合并为 mcpConfig。
**PM 建议**：**采用主理人的 5 个 action 方案**。理由：(a) `mcpConfig` 统一处理增/改/删（通过 config 字段区分），减少 action 数量且语义清晰；(b) `mcpTest` 可合并到 `mcpStart` 的返回结果中（连接失败即 test 不通过）；(c) `mcpTools` 可合并到 `mcpList` 的返回中（含 `tools_count`，详情按需通过 server name 过滤）。
**需主理人确认**：(a) 是否确定按此 5 action 方案？(b) `mcpConfig` 中的 delete 操作是否需要单独的 `mcpRemove` action（考虑 REST 语义清晰度）？

### Q3 · 文件锁策略：Python 侧加锁 vs 依赖 hermes 自身锁？

**背景**：MCP 配置读写（`~/.hermes/mcp_servers`）和技能重载（`~/.hermes/config.yaml` / `~/.hermes/skills/`）涉及**跨进程并发写风险**——kmaster-bridge、hermes CLI、hermes-studio bridge 可能同时操作同一文件。M1 技术方案 F13 曾提到「需文件锁 + 备份」。
**PM 建议**：**bridge 侧加 `fcntl.flock`（POSIX）/ `msvcrt.locking`（Windows）文件锁**，写入前获取排他锁、写入后释放。若获取锁超时（如 3s），返回 `MCP_CONFIG_LOCKED` 错误并提示稍后重试。同时写入前备份原文件（`.bak`），写入失败时回滚。
**需架构师确认**：(a) hermes 自身是否已有文件锁机制？若有，bridge 是复用还是独立加锁？(b) 备份策略是否过于保守（增加复杂度）——是否可以依赖 git 或用户自行备份？

---

## 8. 附：M2 交付后控制面全图

```
kmaster-bridge 控制面（7 类，26 action）—— M2 交付后完整态

① 对话主链路      chat / chatStream / getOutput / getResult / getSessionTitle / getHistory / statusIfLoaded
② 运行控制        interrupt / steer
③ 交互控制        approvalRespond / clarifyRespond
④ 会话生命周期    destroy
⑤ 配置热切换  ★  switchSessionModel / reloadSkills / mcpList / mcpStart / mcpStop / mcpRestart / mcpConfig
⑥ 命令与后台  ★  command / backgroundPoll / completeBackgroundNotification
⑦ 压缩        ★  compressionRespond / contextEstimate

★ = M2 新增/启用
```

---

> **文档版本**：v1.0 ｜ **作者**：许清楚（PM）｜ **日期**：2025-07-03
> **下次更新**：待 Q1~Q3 拍板后修订。
