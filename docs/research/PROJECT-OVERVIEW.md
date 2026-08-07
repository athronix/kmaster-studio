# kmaster-studio 项目总览（PROJECT-OVERVIEW）

> 阶段：Phase 1 调研 · 版本：v0.1 · 来源：实测 `hermes-studio`、`hermes-agent`、`WorkBuddy` 部署 + 用户参考文档 00-03

## 1. 项目背景与目标
构建 **kmaster-studio**：一个完整「操作 / 管理 / 使用 hermes-agent」的前端 Studio。三条硬约束（来自用户需求）：
1. **UI 几乎等同 WorkBuddy**：展现与交互对齐 WorkBuddy 桌面端；凡需调整之处须经用户审核。
2. **架构采用 hermes-studio**：复用其 Vue3 + Koa + Socket.IO 技术骨架。
3. **严格 DDD + plan-first**：先调研→设计→实现→验证→迭代，步步文档化。

## 2. 技术架构（hermes-studio 骨架，三层）
```
kmaster-client (Vue3 + Pinia + Naive UI)
   │  REST(/api/*) + Socket.IO(/chat-run)
kmaster-server (Koa + socket.io + better-sqlite3)
   │  AgentBridge（Node client + Python bridge 子进程）
hermes-agent (run_agent.AIAgent，只读依赖)
   ~/.hermes/{config.yaml, sessions/, skills/, kanban.db, state.db, memory, mcp_servers}
```
- **数据归属**：kmaster 自身状态存 `~/.kmaster-studio/`（会话索引/消息缓存/上传）；Agent 状态始终在 `~/.hermes/`，studio 只经 Bridge/CLI/文件只读访问，绝不双写。
- 桌面化（Electron 薄壳）放到后期 M5，前期 Web 优先（与 hermes-studio 一致）。

## 3. 与 WorkBuddy 对齐策略（关键设计决策）
| 维度 | WorkBuddy | hermes-studio 现状 | kmaster 取舍 |
|------|-----------|-------------------|--------------|
| 宿主 | 重 Electron（主进程即 BFF） | Web 优先 + 薄 Electron 壳 | 取 hermes-studio 路线（Web 优先） |
| 框架 | React + zustand + radix | Vue3 + Pinia + Naive UI | 取 Vue3（架构约束） |
| 协议 | ACP（JSON-RPC over stdio） | Socket.IO 事件 + REST | 取 Socket.IO（hermes-agent Bridge 原生） |
| 布局 | 固定「会话栏+聊天+预览」三栏 | 会话栏与功能导航互斥、Drawer 默认收起 | **按 WorkBuddy 改为常驻三栏（视图层重写点）** |
| 可复用层 | — | api/、stores/、socket 协议层、composables | ≈60% 代码可平移，仅重写 views/components |

**结论**：保留 hermes-studio 的「api 层 + store 层 + socket 协议层」，重写 views/components 为 WorkBuddy 式展现（三栏常驻、消息流、折叠工具卡片、流式思考块、权限/澄清卡片、右侧 Artifact 面板、底部模式+模型、斜杠命令面板、暗/亮主题）。

## 4. 后端 hermes-agent 现状（已实测，可真实对接）
- 源码就位：`D:\Users\towyq\Documents\Projects\hermes-agent`（`run_agent.py`、`acp_adapter/`、`agent/`、92 工具模块/57 工具集/175 技能/MCP/记忆）。
- 数据目录就位：`~/.hermes`（`.env`、`.skills_prompt_snapshot.json`、skills 等），即本地已有可用实例。
- 接入方式：**Bridge 主方案**（实例化 `run_agent.AIAgent(platform="cli")`），事件粒度与 WorkBuddy `sessionUpdate` 几乎一一对应（message.delta / reasoning.delta / tool.started|completed / approval.requested / clarify.requested / subagent.* / compression.* / usage.updated / workspace.diff.completed）。
- 备选：**ACP 直连轻量模式**（`acp_adapter/` 与 WorkBuddy 引擎协议同源），用于无需 MCP 管理/技能热重载的精简部署。

## 5. 功能全集（F1-F22，详见 02 号文档）
| 编号 | 功能 | 对应 WorkBuddy |
|------|------|----------------|
| F1 | 发送消息（核心链路） | 主聊天 |
| F2 | 流式思考/正文渲染 | agent_message_chunk / thought |
| F3 | 停止/打断/引导(steer) | cancel / interruption |
| F4 | 权限确认卡片 | requestPermission |
| F5 | 澄清问题卡片 | AskUserQuestion |
| F6 | 计划/任务列表卡片 | plan 事件 / kanban |
| F7 | 会话列表/历史 | 历史会话 |
| F8 | 模式切换(Craft/Plan/Ask) | 模式菜单 |
| F9 | 模型选择 | 模型下拉 |
| F10 | Artifact/文件预览面板 | 右侧预览 |
| F11 | 技能管理 | 技能页+市场 |
| F12 | MCP 连接器管理 | MCP 连接器 |
| F13 | 记忆管理 | memory:* |
| F14 | 斜杠命令 | 命令面板 |
| F15 | 定时任务/自动化 | 自动化页 |
| F16 | 子代理/并行委派 | 团队/子代理 |
| F17 | 消息队列托盘 | 队列 |
| F18 | 上下文压缩/用量 | 压缩提示/usage |
| F19 | 文件上传/@引用 | @文件 |
| F20 | 内置终端(可选) | terminal |
| F21 | 设置页(Provider/Profile/主题) | 设置 |
| F22 | 用量统计页 | usage |

## 6. Socket.IO `/chat-run` 协议（直接继承 hermes-studio，零适配）
- 上行：`run` `abort` `steer` `resume` `approval.respond` `clarify.respond` `set-model` `compression.respond`
- 下行：42 类事件（`run.started/completed`、`message.delta`、`reasoning.delta`、`tool.started/completed/failed`、`approval.requested/resolved`、`clarify.requested/resolved`、`subagent.*`、`compression.*`、`workspace.diff.completed`、`usage.updated` 等）
- 事件按 `session_id` 过滤分发（`sessionEventHandlers: Map<sessionId, handlers>`），多会话并行互不串流。

## 7. 实施路线（M1-M5，来自 02 号）
| 阶段 | 内容 | 里程碑 |
|------|------|--------|
| M1 | server 骨架 + AgentBridge 打通 + F1/F2/F3 最小聊天闭环 | 能流式对话、停止 |
| M2 | F4/F5/F6 卡片 + F7 会话管理 + F10 Artifact 面板 | WorkBuddy 式主界面完整 |
| M3 | F8/F9/F11/F12/F19 模式/模型/技能/MCP/上传 | 管理面完整 |
| M4 | F13/F15/F16/F17/F18/F22 记忆/自动化/子代理/队列/压缩/用量 | 全功能对齐 |
| M5 | F20 终端 / F21 Profile / Electron 桌面壳 / 打包分发 | 桌面化 |

## 8. 风险与对策
1. Bridge 协议为 hermes-studio 私有实现 → 重写 Python bridge 时锁定 hermes-agent 版本，以 `run_agent.AIAgent` 公开方法为唯一契约。
2. hermes-agent 只读约束 → 写操作只经 CLI 或 `~/.hermes` 用户目录，不改源码。
3. Windows 上 Bridge 用 TCP 127.0.0.1:16765，需处理端口占用与多 profile 端口分配。

## 9. 待确认事项（见 R1-R4 确认）
- MVP 范围边界（先做 M1？还是 M1+M2？）
- 后端对接模式（真实 hermes-agent Bridge vs Mock 契约服务）
- UI 对齐深度（仅布局/交互范式；是否含 WorkBuddy 云端专属功能）
- 首版是否含 Electron 桌面壳
