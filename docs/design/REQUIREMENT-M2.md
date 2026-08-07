# 需求文档 · M2（F4/F5/F6/F7/F10）

> 里程碑：M1（F1-F3 聊天闭环）已完成并验证。M2 在 M1 骨架上补齐「交互卡片 + 会话管理 + Artifact 预览」。
> 关联：TECHNICAL-SOLUTION-M2.md、TEST-PLAN-M2.md

## 1. 功能范围

| 功能 | 编号 | 说明 | M1 现状 |
|------|------|------|---------|
| 权限卡 | F4 | 工具调用前请求用户授权（once/session/always/deny） | 卡片+store 已建，但未由 Mock 触发、respond 未转交真实 bridge |
| 澄清卡 | F5 | agent 向用户提问并给出选项/自由输入 | 同上 |
| 计划卡 | F6 | agent 给出执行计划，用户批准/驳回/修订 | **新增** |
| 会话管理（完整版） | F7 | 会话新建/打开/改名/删除 | 仅新建/打开 |
| Artifact 预览面板 | F10 | 右侧栏预览 agent 产出的文件（md/code/text/image） | 仅占位 |

## 2. 功能需求

### F4 权限卡
- FR4.1 当 server 下发 `approval.requested` 时，对应会话出现一张授权卡（含工具名、参数、风险说明）。
- FR4.2 用户可选：允许一次 / 本次会话允许 / 总是允许 / 拒绝。选择后卡消失，并上行 `approval.respond`。
- FR4.3 server 收到 `approval.respond` 后转发给真实 bridge（RealBridge 经 TCP 发送 JSON；MockBridge 空转），并下发 `approval.resolved`。

### F5 澄清卡
- FR5.1 下发 `clarify.requested` 时显示问题 + 可选项按钮 + 自由输入框。
- FR5.2 选择选项或输入自定义回答后上行 `clarify.respond`，卡消失，下发 `clarify.resolved`。

### F6 计划卡（新增）
- FR6.1 下发 `plan.requested` 时显示计划标题 + 有序步骤列表，提供「批准 / 驳回 / 修订」三钮。
- FR6.2 用户选择后上行 `plan.respond{choice}`，卡消失，下发 `plan.resolved`。
- FR6.3 Mock 模式下一轮对话内可演示计划卡（非阻塞，用于 UI/状态验证；真实 gating 由 RealBridge 接 hermes-agent 计划审批）。

### F7 会话管理完整版
- FR7.1 会话列表项支持「改名」（行内编辑）与「删除」（二次确认）。
- FR7.2 改名：PUT/PATCH `/api/sessions/:id` 更新 title，本地列表同步。
- FR7.3 删除：DELETE `/api/sessions/:id` 删除会话及其消息，本地列表移除；若删除的是当前会话，清空消息区。

### F10 Artifact 预览面板
- FR10.1 下发 `artifact.created`/`artifact.updated` 时，右侧栏列出该会话的 artifact。
- FR10.2 按 kind 渲染：`markdown`→AgentMarkdown；`code`→带语言高亮（highlight.js）的代码块；`text`→`<pre>`；`image`→`<img>`（dataUrl 或路径）。
- FR10.3 点击列表项在面板内预览；未选中时显示会话内首个 artifact 或空态。

## 3. 非功能需求
- NFR1 视图零直接网络调用（沿用 M1 纪律：组件→store→api→server）。
- NFR2 新增 WS 事件须进入 `chat.ts` 的 `WS_EVENTS` 全局注册表，按 `session_id` 分发。
- NFR3 Mock 模式下（默认）F4/F5/F6/F10 必须可一键演示（单次对话内放出全部卡片）。
- NFR4 后端 `db.deleteSession` 在 better-sqlite3 与内存实现中语义一致。

## 4. 验收基线
- AC1 `npm run test -w packages/client` 通过（含新增 plan/artifact/deleteSession reducer）。
- AC2 `vue-tsc` + `vite build`（client）与 `tsc --noEmit`（server）零错误。
- AC3 `scripts/smoke-chat.mjs` 单轮对话内能收到 `plan.requested`/`approval.requested`/`clarify.requested`/`artifact.created` 四类事件。
- AC4 浏览器联调：发送消息后右侧出现计划卡/授权卡/澄清卡/Artifact；改名、删除会话生效。
- AC5 真实 Bridge（`HERMES_BRIDGE_MOCK=0`）下，三类 respond 经 TCP 转发至 Python bridge（手动验收，非 CI）。
