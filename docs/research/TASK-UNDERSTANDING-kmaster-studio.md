# 任务理解（TASK-UNDERSTANDING-kmaster-studio）

> 阶段：Phase 1 调研 · 版本：v0.1

## 1. 三大需求拆解
### 需求 1：前端展示/操作几乎与 WorkBuddy 一致，调整须经用户审核
- 目标：用户使用 kmaster 时，体感与 WorkBuddy 桌面端一致（三栏布局、消息流交互、卡片体系、底部模式/模型、斜杠命令、暗亮主题、Artifact 预览）。
- 约束：**任何与 WorkBuddy 不一致的取舍（布局差异、功能裁剪、交互改版）必须先经用户审核**（对应 DDD R1-R4 确认 + 需求评审基线化）。
- 边界：仅对齐「布局与交互范式」+「映射 hermes-agent 能力」，不搬 WorkBuddy 云端专属功能（OneID/云Agent/IM/腾讯文档/专家市场）。

### 需求 2：技术架构采用 hermes-studio
- 目标：复用 hermes-studio 的 Vue3 + Koa + Socket.IO + Pinia + Naive UI 骨架，以及其 api/store/socket 三层与分层纪律。
- 约束：hermes-studio 为只读参考，kmaster 是独立工程；重写 views/components 展现层为 WorkBuddy 风。

### 需求 3：严格 DDD + plan-first，步步文档化
- 目标：七阶段（调研→设计→实现→验证→迭代→配套→交付）全程文档化；plan-first 维护任务树与执行状态，执行-验证-反馈闭环。
- 约束：文档先行、变更原子化、索引即时同步；测试先于实现（TDD）；每次提交含 5 大索引同步。

## 2. 功能映射（前端 → 后端，F1-F22 概要）
> 完整映射见表，详见 `docs/reference/02-kmaster-studio设计方案.md`。核心链路 F1：
> `InputComposer` → `[WS↑] run` → `run-chat` → `[Bridge] chat()` → hermes `AIAgent` → 增量事件流 → `[WS↓]` 转译为 UI 组件。

| 功能 | 前端组件 | 后端/Bridge 调用 |
|------|----------|------------------|
| F1 发消息 | InputComposer | Bridge.chat / chatStream / getOutput / getResult |
| F2 流式渲染 | AgentMarkdown / ThoughtBlock | message.delta / reasoning.delta（纯 reducer） |
| F3 停止/引导 | 停止钮 / steer 输入框 | Bridge.interrupt / steer |
| F4 权限卡 | ApprovalCard | Bridge.approvalRespond |
| F5 澄清卡 | ClarifyCard | Bridge.clarifyRespond |
| F6 计划卡 | PlanCard | kanban DB 只读 + tool.started 事件 |
| F7 会话管理 | SessionList | kmaster.db + Bridge.getHistory |
| F8 模式 | 底部模式下拉 | instructions 注入 + 写类工具审批策略 |
| F9 模型 | 模型下拉 | Bridge.switchSessionModel / hermes config |
| F10 Artifact | ArtifactPanel | workspace-diff-tracker + fs 只读 |
| F11 技能 | SkillsView | 扫描 ~/.hermes/skills + Bridge.reloadSkills |
| F12 MCP | McpManagerView | Bridge.mcpAdd/Test/Reload |
| F13 记忆 | MemoryView | 读 ~/.hermes/memory（唯一直写例外，需锁+备份） |
| F14 斜杠命令 | 命令面板 | Bridge.command |
| F15 自动化 | JobsView | hermes cron CLI |
| F16 子代理 | SubagentCard | Bridge.subagent.* + backgroundPoll |
| F17 队列 | QueueTray | kmaster.db 队列表（server 侧） |
| F18 压缩/用量 | UsageBar | compression.* + Bridge.contextEstimate |
| F19 上传 | 上传区 | POST /api/upload → ~/.kmaster-studio/uploads |
| F20 终端 | TerminalPane | node-pty（纯 studio 能力） |
| F21 设置 | SettingsView | hermes config set / profile 管理 |
| F22 用量 | UsageView | usage.updated 累积 + GET /api/usage/stats |

## 3. 布局决策（已实现用户意图）
- **WorkBuddy 式常驻三栏**（会话栏 + 聊天 + 右侧预览），而非 hermes-studio 默认的「会话栏与功能导航互斥 + Drawer 收起」。
- 右侧预览默认可见（可收起），内容融合 WorkBuddy Artifact 卡片 + hermes Drawer 的 diff/文件/终端/浏览器/子代理。
- 底部输入区常驻：模式(Craft/Plan/Ask) + 模型 + 技能 + @文件 + 队列 + 停止。

## 4. 验收视角（用户审核点）
- 每个里程碑交付前，向用户展示「与 WorkBuddy 的差异清单」供审核。
- 凡引入差异（裁剪/改版），必须经用户确认方可合入。
