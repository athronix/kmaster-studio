# M1 测试方案 (TEST-PLAN-M1)

> 阶段：Phase 2.3 · 版本：v0.1 · 原则：测试先于实现（TDD）

## 1. 测试策略
先写「store reducer 纯函数」与「bridge 事件映射纯函数」单测，再实现；E2E 验证完整聊天闭环（MockBridge 下确定性可跑）。

## 2. 单元测试（Vitest）
### 2.1 chat store reducer
- `message.delta` 按 `message_id` 正确聚合到对应消息正文。
- `reasoning.delta` 进入思考块且默认折叠、运行时展开标记正确。
- `tool.started → tool.completed/failed` 状态机正确（running→done/error）。
- `approval.requested/resolved`、`clarify.requested/resolved` 增删正确。
- `abort.started/completed` 切换 `runState`。

### 2.2 bridge 事件映射（纯函数）
- 给定 Bridge 事件对象 → 断言产出正确的 WS 下行事件 + 正确的 store action 调用（用 mock socket /  spies）。

## 3. E2E（Playwright）
- 启动 server（`HERMES_BRIDGE_MOCK=1`）+ client。
- 用例：新建会话 → 输入文本 → 发送 → 断言消息流出现流式文本与思考块 → 点击停止 → 断言 run 终止、无后续 delta。
- 断言暗/亮主题切换生效。

## 4. 构建验证
- 客户端：`vue-tsc -b` 类型检查 + `vite build` 通过。
- 服务端：`tsc --noEmit -p packages/server/tsconfig.json` 通过。

## 5. 真实 agent 验证（手动）
- `HERMES_BRIDGE_MOCK=0` 连真实 hermes-agent，跑通 F1–F3；记录与 WorkBuddy 的差异清单供用户审核。

## 6. 验收门槛
- Vitest 单测全绿；Playwright 主链路 E2E 通过；客户端与服务端构建均通过。未达门槛不得进入 M2。
