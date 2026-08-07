# M1 需求设计 (REQUIREMENT-M1)

> 阶段：Phase 2.1 · 版本：v0.1 · 范围：F1 / F2 / F3（连真实 hermes-agent，Bridge 模式）

## 1. 范围
M1 仅实现**核心聊天闭环**：F1 发送消息、F2 流式思考/正文渲染、F3 停止·打断·引导。其余 F4–F22 留待 M2–M5。

## 2. 功能需求

### F1 发送消息（核心链路）
- **FR1.1** 用户在 InputComposer 编辑文本消息，点击发送 → `[WS↑] run {session_id, message, profile, model?}`。
- **FR1.2** server `run-chat` 收到 `run` → 校验 profile → `getOrCreateSession`（kmaster.db 建/取会话行）。
- **FR1.3** server 调用 `[Bridge] chat(sessionId, message, profile, {model?})` 触发 hermes `AIAgent` 运行；返回 `run.started {run_id}`。
- **FR1.4** `[Bridge] chatStream/getOutput` 增量拉取 Agent 输出与事件，逐条转译为 WS 下行事件（见技术方案协议表）。
- **FR1.5** run 结束 → `[Bridge] getResult` → 消息落 kmaster.db → `[WS↓] run.completed {message, usage}`；异步 `[Bridge] getSessionTitle` → `[WS↓] session.title.updated`。

### F2 流式思考/正文渲染
- **FR2.1** chat store 为纯 reducer：按 `message_id` 聚合 `message.delta` → `AgentMarkdown` 增量渲染（markdown-it + katex + mermaid + highlight.js）。
- **FR2.2** `reasoning.delta` → `ThoughtBlock`（默认折叠，运行时展开，统计时长/字符数）。
- **FR2.3** `tool.started/completed/failed` → `ToolCallCard`（折叠态摘要 + 状态色，可展开看入参/出参）。

### F3 停止 / 打断 / 引导（steer）
- **FR3.1** 停止：`[WS↑] abort {session_id}` → `[Bridge] interrupt(sessionId)` → `[WS↓] abort.started → abort.completed`；超时未停 → `abort.timeout` + `destroy` 强杀重建。
- **FR3.2** 运行中追加引导：`[WS↑] steer {session_id, text}` → `[Bridge] steer(sessionId, text)` → UI 以「引导」样式插入消息流。

## 3. 非功能需求
- **NFR1** 流式首字延迟 < 2s（受 agent 侧约束）。
- **NFR2** Windows 上 Bridge 走 TCP `127.0.0.1:16765`，端口可经环境变量配置，连接失败自动重试。
- **NFR3** 不暴露任何密钥；provider/API key 仅存 `~/.hermes`，studio 不传不回显。
- **NFR4** 暗/亮双主题，WorkBuddy 风设计 token。
- **NFR5** 视图层零网络调用：所有请求经 `api/` → server；socket 事件在 `api/hermes/chat.ts` 全局注册后按 `session_id` 分发到 store。

## 4. 验收基线
打开应用 → 新建会话 → 输入并发送消息 → 看到流式思考块 + 正文 → 工具调用卡片（若有）→ 可中途停止 → 会话标题自动生成 → 刷新后可从历史重载消息。

## 5. 不在 M1 范围
F4 权限卡、F5 澄清卡、F6 计划卡、F7 会话管理完整版、F10 Artifact 面板、F8–F22 —— 均留 M2–M5。
