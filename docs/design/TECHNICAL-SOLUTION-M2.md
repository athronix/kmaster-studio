# 技术方案 · M2（F4/F5/F6/F7/F10）

> 继承 M1 架构（Vue3 + Pinia + Koa + Socket.IO /chat-run）。仅记录 M2 增量变更。

## 1. 协议扩展（packages/server/src/protocol.ts）

### 上行（ClientToServerEvents）新增
```ts
'plan.respond': (req: { session_id: string; plan_id: string; choice: PlanChoice }) => void;
```
（F4/F5 的 `approval.respond`/`clarify.respond` 已在 M1 存在，M2 仅让 server 真正转发。）

### 下行（ServerToClientEvents）新增
```ts
'plan.requested': (p: { session_id: string; plan_id: string; title: string; steps: string[] }) => void;
'plan.resolved':  (p: { session_id: string; plan_id: string }) => void;
'artifact.created': (p: { session_id: string; artifact: Artifact }) => void;
'artifact.updated': (p: { session_id: string; artifact: Artifact }) => void;
```

### 类型
```ts
export type PlanChoice = 'approve' | 'reject' | 'revise';
export interface Artifact {
  id: string; name: string;
  kind: 'markdown' | 'code' | 'text' | 'image';
  language?: string; content?: string; dataUrl?: string;
}
```

### BridgeEvent 新增
```ts
| { type: 'plan.requested'; plan_id: string; title: string; steps: string[] }
| { type: 'artifact'; artifact: Artifact }
```

## 2. MockBridge 脚本流（packages/server/src/bridge.ts）
`MockBridge.chat` 单轮依次放出（用于一键演示 F4/F5/F6/F10）：
1. `reasoning.delta`（思考）
2. `plan.requested`（F6：3 步计划）
3. `tool.started`/`tool.completed`（一个工具）
4. `approval.requested`（F4：写文件授权）
5. `clarify.requested`（F5：带选项的问题）
6. `artifact`（F10：一个 .md artifact）
7. `message.delta`（正文）
8. `usage.updated` → `completed`

新增 Bridge 接口方法（Mock 空转、Real 经 TCP `send`）：
```ts
respondApproval(sessionId, approvalId, choice): Promise<void>;
respondClarify(sessionId, clarifyId, response): Promise<void>;
respondPlan(sessionId, planId, choice): Promise<void>;
```

## 3. run-chat 编排（packages/server/src/run-chat.ts）
- `onEvent` switch 新增 `plan.requested` 与 `artifact` 两个分支 → 转发为下行事件。
- 新增 `socket.on('plan.respond', ...)`：调用 `bridge.respondPlan(...)` 后下发 `plan.resolved`。
- 既有 `approval.respond`/`clarify.respond` 改为：先 `bridge.respondApproval/Clarify(...)` 再下发 `*.resolved`（M1 仅回显，M2 接真实 bridge）。

## 4. 持久层（packages/server/src/db.ts）
`Store` 接口新增：
```ts
deleteSession: (id: string) => void;
```
- sqlite 实现：`DELETE FROM messages WHERE session_id=?; DELETE FROM sessions WHERE id=?;`
- 内存实现：从 `mem.sessions`/`mem.messages` 删除。

## 5. 路由（packages/server/src/routes/sessions.ts）
新增 `DELETE /api/sessions/:id` → `store.deleteSession(ctx.params.id)`。

## 6. 前端类型（packages/client/src/types/chat.ts）
新增：
```ts
export type PlanChoice = 'approve' | 'reject' | 'revise';
export interface PlanRequest { plan_id: string; title: string; steps: string[]; session_id: string; }
export interface Artifact { id: string; name: string; kind: 'markdown'|'code'|'text'|'image'; language?: string; content?: string; dataUrl?: string; }
```

## 7. chat store（packages/client/src/stores/chat.ts）
- 新增 `pendingPlans: Record<string, PlanRequest[]>`、`artifactsBySession: Record<string, Artifact[]>`。
- `WS_EVENTS` 注册表加入 `plan.requested`/`plan.resolved`/`artifact.created`/`artifact.updated`。
- `dispatch` 新增 case：`plan.requested`(push)、`plan.resolved`(filter)、`artifact.created`(push/replace by id)、`artifact.updated`(replace by id)。
- 新增方法：`respondPlan(sid, planId, choice)` → `respondPlan` api；`deleteSession(sid)` → `http DELETE` 并本地移除；`renameSession(sid, title)` → `http PATCH` 并本地更新。

## 8. api（packages/client/src/api/hermes/chat.ts）
新增 `respondPlan(sessionId, planId, choice)` → emit `plan.respond`。

## 9. 组件改动
- **新增 `PlanCard.vue`**：渲染标题+步骤列表+三钮（批准/驳回/修订），`@respond(choice)`。
- **`SessionList.vue`**：每项增加「✎ 改名」「🗑 删除」按钮；改名进入行内 `<input>`（回车提交 `renameSession`）；删除弹 `window.confirm` 后 `deleteSession`。当前会话被删时清空消息区。
- **`ArtifactPanel.vue`**：由 store `artifactsBySession[activeSessionId]` 取列表；选中项按 kind 渲染（复用 `AgentMarkdown`；code 用 highlight.js 高亮；text 用 `<pre>`；image 用 `<img :src=dataUrl>`）。
- **`MessageItem.vue`**：渲染 `PlanCard`（来自 `pendingPlans`）。
- **`ChatView.vue`**：无需改动（ArtifactPanel 自行读 store）。

## 10. 文件清单（M2 变更）
- 改：protocol.ts / bridge.ts / run-chat.ts / db.ts / routes/sessions.ts
- 改：types/chat.ts / stores/chat.ts / api/hermes/chat.ts
- 改：SessionList.vue / ArtifactPanel.vue / MessageItem.vue
- 增：PlanCard.vue
- 改：scripts/smoke-chat.mjs（断言新事件）
- 增：stores/chat.test.ts（新增 plan/artifact/deleteSession case）
- 文档：docs/design/{REQUIREMENT,TECHNICAL-SOLUTION,TEST-PLAN}-M2.md
