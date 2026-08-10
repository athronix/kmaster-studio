# T04 实现规格 — 单 agent 会话交互域（主理人修订版）

> 本文件由主理人（齐活林）基于**实测代码**编写，用于覆盖 `TECHNICAL-SOLUTION-pages-data-alignment.md` §5 中 T04 的部分条目。
> **冲突时以本文件为准。**其余横切约定（§7 共享知识、G4 红线）仍以架构主文档为准。

## 0. 对架构原方案的两处作废（实测依据）

| 原方案 | 实测 | 裁定 |
|---|---|---|
| CH-01 要求 🆕 新建 `components/chat/ContextUsageBar.vue` | `components/chat/ContextRing.vue` **已存在**（SVG 环图，含 70%/90% 变色 + tooltip），且已在 `SessionConfigBar.vue:177` 渲染、`ChatView.vue:414-416` 传参 | **作废新建**。缺的是数据不是组件，改为给 ContextRing 供数 + 补隐藏逻辑 |
| T03 涉及 `components/session/*.vue` | `packages/client/src/components/session/` 是**空目录** | 与 T04 无关，仅记录 |

「会话头组件（Q4 确认后定位）」的答案：就是 `packages/client/src/components/chat/SessionConfigBar.vue`（底栏配置状态栏），由 `views/ChatView.vue:409` 挂载。**不需要再找。**

---

## CH-A（P0）上下文用量数据打通

**文件**：`packages/client/src/stores/chat.ts`

**现状（已 grep 确认）**：`contextBySession` 全仓只有 **一个** 写入点 —— `openSession` 路径的 `chat.ts:641`：
```ts
await Promise.allSettled([loadQueue(sid), loadContextEstimate(sid)]);
```
`dispatch()` 全程不消费上下文。**后果：那个环从开会话之后就冻住了**，每轮对话结束都不动。

另：`loadContextEstimate` 的 doc 注释（`chat.ts:899`）写着「openSession / run.completed 后各一次」——**这是假的**，全仓只有 641 一个调用点。顺手改对注释。

**改动**：在 `dispatch()` 的 `usage.updated` 与 `run.completed` 两个分支读 `payload.context_tokens`（类型 `ContextTokensPayload`，见 `types/chat.ts:497`）。

存在时**只覆盖三个数值字段，保留旧对象的富字段**（REST 那次估算带回的 `categories` / `model` / `estimated_total` 不能被 WS 冲掉）：
```ts
const prev = contextBySession.value[sid];
contextBySession.value[sid] = {
  ...prev,
  context_used: ct.total_tokens,
  context_max: ct.context_length,
  context_percent: ct.context_length > 0
    ? Math.min((ct.total_tokens / ct.context_length) * 100, 100)
    : 0,
  estimated: true,   // ContextEstimate.estimated 是必填字面量 true（types/chat.ts:480）
};
```

**缺失时：整条不写**。不得填 0/NaN，不得覆盖已有值。

**幂等（原 CH-02）**：同一 `usage.updated` 重复投递 N 次，结果必须与投递 1 次完全一致 —— 覆盖写而非累加。断线重连补发不得产生重复。

**🚫 不新增 WS 事件类型**，`WS_EVENTS` 注册表零改动（L3 硬要求）。

---

## CH-B（P0）缺失即隐藏

**文件**：`views/ChatView.vue`、`components/chat/SessionConfigBar.vue`

`ChatView.vue:188` 现在是：
```ts
const ctxPercentage = computed(() => Math.round(ctxRef.value?.context_percent ?? 0));
```
无数据时渲染一个 **0% 的假环**——这正是「回落 0」，与 CH-A 约束自相矛盾。

1. `ChatView.vue`：新增
   ```ts
   const ctxAvailable = computed(() => !!ctxRef.value && ctxRef.value.context_max > 0);
   ```
   传 `:context-available="ctxAvailable"`。
2. `SessionConfigBar.vue`：新增 prop `contextAvailable?: boolean`（默认 `false`），把第 **174–185 行**整个 `<n-tooltip>` 块包 `v-if="contextAvailable"`。
3. 删掉 `SessionConfigBar.vue:97` 的 `const m = props.contextMax ?? 100000` —— 这个 100000 是假兜底，隐藏逻辑上线后只会制造错误百分比，改 `?? 0`。

---

## CH-C（P0）工作区设置接线

**文件**：`views/ChatView.vue:193-196`

`onChangeWorkspace()` 现在是**空函数体**，点了没反应。而 `store.setWorkspace(sid, null)`（`chat.ts:758`）早已实现完整的「传 null 就弹选择器」（Electron 原生对话框 / web 端 prompt 兜底 / 用户取消返回 undefined 时静默 return）。

```ts
async function onChangeWorkspace(): Promise<void> {
  if (!sid.value) return;
  await store.setWorkspace(sid.value, null);
}
```

失败要给用户可见反馈，走 ChatView 现有错误提示机制，🚫 不要 `catch {}` 吞掉。

**验收**：改 workspace 后会话列表分组无需刷新页面即重新归组；后端 `routes/sessions.ts` 的 workspace 分支零改动（已就绪）。

---

## CH-D（P0）Agent 角色设置 —— 需后端补字段

需求点名的「Agent 角色展示与设置」目前是**读得到、改不了**：

| 环节 | 位置 | 状态 |
|---|---|---|
| `GET /api/sessions` 出参带 `agent` | `packages/server/src/routes/sessions.ts:150`（`km?.agent ?? hs?.profile_name ?? null`） | ✅ 已有 |
| `POST` 建会话接受 `agent` | 同文件 `:197-198` | ✅ 已有 |
| `applySessionPatch` 的 agent 分支 | 同文件 `:250-286` | ❌ **不存在** |
| 客户端 `SessionPatch.agent` | `types/chat.ts:247` | ❌ **不存在** |

**要做**：
1. **后端** `routes/sessions.ts`：`applySessionPatch` 加分支
   ```ts
   if (body?.agent !== undefined) { store.setSessionAgent(id, body.agent ?? null); hits++; }
   ```
   先确认 store 有无 `setSessionAgent`，没有就照 `setSessionWorkspace` 的写法加 —— **只动 kmaster.db 侧车的 agent 列，🚫 绝不写 hermes state.db**。
2. **前端** `types/chat.ts`：`SessionPatch` 加 `agent?: string | null`。
3. **前端** `stores/chat.ts`：加 `setSessionAgent(sid, agent)`，照 `setWorkspace` 形状（PUT + 乐观更新本地 `sessions`）。
4. **前端** `ChatView.vue:205` `onChangeAgent()`（现空壳）：打开 Agent 选择，数据源用现成的 `getAgents('installed')`（`api/client.ts:443`）。UI 用 Naive UI `NDropdown`，与 `SessionConfigBar` 现有模式/模型 dropdown 同风格，🚫 不新建重组件，🚫 无 mock 残留。

---

## CH-E（P1）多 Agent 标签 —— 先诊断再改

`ChatView.vue:149` 的 `agentTabs` computed 数据源未核实；`onAgentClose()`（`:227`）确认是空壳。

**先读 149 行确认数据源能否反映真实多 agent 状态**（store 导出了 `agentStates`，见 `chat.ts:947`）：
- 能反映 → 只补 `onAgentClose()`
- 不能反映 → **把改动方案先回报主理人确认**，不要直接大改

**硬约束**：多 agent Tab 是 kmaster 自有增强，hermes 无对应概念，**不引入 hermes skills 的 `target` 维度**（L4）。技能相关类型/UI 中不得出现 `target` 字段。

---

## CH-F（P1）modeBySession 脏值收敛

**文件**：`stores/chat.ts`

`modeBySession` 有三个写入点（`chat.ts:239` / `:622` / `:634`），全是 `session.mode as HermesMode` 裸断言，不校验值是否在 `CHAT_MODES`（`types/chat.ts:37`）内。hermes 侧若写入 kmaster 不认识的 mode，`SessionConfigBar.vue:57-60` 的 `currentModeLabel` 会把原始 token 直接秀给用户。

加单点 `normalizeMode(raw): HermesMode`，不在 `CHAT_MODES` 内的回落到 `globalSettings.default_mode ?? 'default'`，三处统一走它。

**硬约束**：🚫 不新建任何模式（L2）；`MODE_TO_HERMES_APPROVAL` 映射不变；全仓 grep 无游离模式字面量。

---

## 验收标准（缺一不可）

- `cd packages/server && ../../node_modules/.bin/tsc --noEmit` → EXIT 0
- `cd packages/client && ../../node_modules/.bin/vue-tsc --noEmit` → EXIT 0
- `cd packages/client && ../../node_modules/.bin/vitest run` 全绿（当前基线 251）
- **新增测试**：
  1. dispatch 收到带 `context_tokens` 的 `run.completed` → `contextBySession` 更新，且 `categories` 未被冲掉
  2. 收到不带 `context_tokens` 的 `usage.updated` → 旧值原样保留（不被覆盖成 0）
  3. 同一 `usage.updated` 重复投递 3 次 → 结果与投递 1 次一致
  4. `normalizeMode` 脏值回落
- **G4 红线**：`services/hermes/cos-cache.ts`、`routes/skillhub.ts`、`aggregate/skills.ts`、`aggregate/mcp.ts` 四文件 `git diff 5743b15` 必须为空
- 按逻辑分组提交，报告全部 hash

## 铁律

**git**：❌ `stash` / `gc` / `repack` / `prune` / `worktree` 一律禁止（本仓 `.git` 曾被 `git stash -u` 触发的自动 gc 搞坏过，699 个 object 进了回收站）；✅ 只用 `add` / `commit` / `log` / `diff` / `status` / `show` / `fsck`。对基线用 `git diff 5743b15`。

**环境**：Node 用 `C:/Users/towyq/.workbuddy/binaries/node/versions/22.22.2/node.exe`；前端命令走相对路径 `../../node_modules/.bin/`（禁 `/d/...` 绝对路径）；联调用 `localhost`（非 127.0.0.1）+ `NO_PROXY=localhost,127.0.0.1`。

**文件归属**：T04 期间独占 `packages/client/src/**` 与 `packages/server/src/routes/sessions.ts`。其他 agent 只写 `docs/`。

**已知环境噪音**：后端 vitest 因 better-sqlite3 原生 ABI 不匹配（NODE_MODULE_VERSION 137 vs 127）有约 48 处既存失败，与本次改动无关，**不要 `npm rebuild`**。后端以 `tsc --noEmit` 零错为准。
