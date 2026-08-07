# 测试计划 · M2（F4/F5/F6/F7/F10）

## 1. 单元测试（Vitest，packages/client）
文件：`packages/client/src/stores/chat.test.ts`（在 M1 12 例基础上追加）

| 用例 | 验证点 |
|------|--------|
| plan.requested 入栈 | `dispatch('plan.requested', {session_id, plan_id, title, steps})` → `pendingPlans[sid]` 含该 plan |
| plan.resolved 出栈 | 再 dispatch `plan.resolved` → 该 plan 从 `pendingPlans` 移除 |
| artifact.created 入栈/替换 | 两次 created 同 id → 列表长度不变、内容更新 |
| artifact.updated 替换 | created 后 updated 同 id → 内容更新 |
| deleteSession 本地移除 | 调 `deleteSession` → `sessions` 不含该 id，且 `messagesBySession[sid]` 清空 |
| renameSession 本地更新 | 调 `renameSession` → `sessions` 中 title 更新 |
| respondPlan 调用 api | spy `respondPlan` api → 触发一次 `plan.respond` emit（用 mock socket 验证） |

> store 纯 reducer，`dispatch` 已暴露，可直接测；api 调用以 mock 注入验证。

## 2. 构建验证
- 客户端：`npm run build -w packages/client`（`vue-tsc` 类型检查 + `vite build` 产出 `dist/`）。
- 服务端：`npx tsc --noEmit -p packages/server/tsconfig.json`。
- 期望：两者零错误、零类型告警（含新增协议类型）。

## 3. 烟雾测试（scripts/smoke-chat.mjs）
单轮 `run` 后断言收到（在 M1 基础上扩展）：
- `run.started`
- `plan.requested` ✅新增
- `approval.requested` ✅新增
- `clarify.requested` ✅新增
- `artifact.created` ✅新增
- `message.delta`
- `run.completed`
任一缺失即退出非 0。运行：`NO_PROXY=localhost,127.0.0.1 node scripts/smoke-chat.mjs`

## 4. 浏览器联调（手动，非 CI）
启动 `npm run dev -w packages.server`（Mock）与 `npm run dev -w packages.client`，开 `http://localhost:6649`：
- 发送一条消息 → 右侧依次出现 计划卡 / 授权卡 / 澄清卡 / Artifact。
- 点击计划卡「批准」、授权卡「允许一次」、澄清卡选一个选项 → 卡消失。
- 左侧会话项「改名」「删除」生效；删除当前会话后消息区清空。
- 右侧 Artifact 预览：markdown 渲染、code 高亮、image 显示。

## 5. 真实 Bridge 验收（手动，HERMES_BRIDGE_MOCK=0）
- 启动 `bridge_server.py` 连真实 hermes-agent。
- 发送消息，观察真实 `plan/approval/clarify/artifact` 事件与 respond 的 TCP 转发（日志核对）。
- 属手动验收项，不进 CI。

## 6. 验收门禁
AC1-AC5 全部达成（见 REQUIREMENT-M2.md）方视为 M2 通过，随后执行原子提交。
