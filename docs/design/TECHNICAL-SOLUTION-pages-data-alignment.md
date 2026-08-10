# 技术方案：kmaster-studio 页面数据逻辑对齐 hermes-studio

| 项 | 值 |
|---|---|
| 文档类型 | TECHNICAL SOLUTION（系统设计 + 任务分解） |
| 作者 | 高见远（Architect / software-architect） |
| 团队 | software-kmaster-pages |
| 输入 | PM（Alice）PRD：SL/CH/ST/MD 四域 27 项需求 |
| 约束来源 | 用户裁定 D1~D4 ＋ 主理人裁定 L1~L4 ＋ 硬约束 G4 |
| 目标仓库 | `kmaster-studio`（pnpm monorepo：`packages/client` Vue3、`packages/server` Koa+TS） |
| 只读参考 | `hermes-studio`（不修改） |
| 状态 | 已评审，待工程师分批实现 |

---

## 0. 决策基线（实现时不得违背）

### 0.1 用户裁定 D1~D4

| 编号 | 裁定内容 | 对实现的约束 |
|---|---|---|
| **D1** | Skill 市场修 4 个技术 bug（ST-01~04）＋ 统一业务口径 | bug 修复以后端真实契约为准，不得反向改后端迎合前端 |
| **D2** | Plugins / Channels 本次**新建后端对齐**：`GET /api/plugins` 聚合路由 ＋ Channels 复用 `routes/config.ts` 扩 platform section | 不新开独立 channels 路由文件；plugins 走新建聚合器 |
| **D3** | 会话目录 = workspace（作为第 4 分组）；列表维度仅 `source` / `pinned` / `workspace` | 不得引入第四个分组维度 |
| **D4** | `source` / `pinned` 后端已有可直接用；`category` **本次不做** | 前端不得预埋 category 筛选 UI |

### 0.2 主理人裁定 L1~L4

| 编号 | 裁定内容 | 对实现的约束 |
|---|---|---|
| **L1** | 置顶保留 kmaster 后端**三态**（`resolveTriStateFlag()`），**不对齐** hermes 的 localStorage 方案 | `SessionPatch.pinned: boolean \| null` 三态必须保留；前端严禁用 localStorage 存置顶 |
| **L2** | 执行模式 `ask` / `plan` / `craft` 已存在，本次**只收敛不新建** | 不得新增第四种模式；`MODE_TO_HERMES_APPROVAL` 映射不变 |
| **L3** | `context_tokens` 挂**现有** run WS 事件推送（**不新增事件类型**）；前端公式 `min(totalTokens / contextLength * 100, 100)`；缺数据**隐藏** | `WS_EVENTS` 注册表零新增；UI 缺数据不渲染 0% |
| **L4** | **不引入** hermes skills 的 `target` 维度，kmaster 保持单 target | 技能相关类型/UI 不得出现 target 字段 |

### 0.3 硬约束 G4（🔴 红线）

> **外部数据源的请求链路与返回结构逐字节不变。触碰需单独评审。**

冻结清单（请求参数、请求头、返回结构、缓存策略全部冻结）：

| # | 链路 | 文件 |
|---|---|---|
| 1 | COS 三种 manifest | `packages/server/src/services/cos-cache.ts` |
| 2 | SkillHub 在线代理 | `packages/server/src/routes/skillhub.ts` |
| 3 | Skills 候选聚合（依赖 COS） | `packages/server/src/services/hermes/aggregate/skills.ts` |
| 4 | MCP 候选聚合（依赖 COS） | `packages/server/src/services/hermes/aggregate/mcp.ts` |

**执行纪律**：提交前 `git diff --stat` 中上述四路径必须为空。如确需修改 → **停手、上报 team-lead、走单独评审**，不得自行决定。

---

## 1. 实现方案与框架选型

### 1.1 核心技术难点与对策

| # | 难点 | 判断与对策 |
|---|---|---|
| **N1** | **前后端契约漂移**（ST-01/02/03 三个 bug 全部是「前端假设的接口形状 ≠ 后端真实返回」） | 根因是 `api/client.ts` 手写解构、与 `routes/*.ts` 无单一真源。对策：**以后端为准**修正前端，并在 `types/chat.ts` / `protocol.ts` 补齐响应类型，让 TS 在编译期兜住第二次漂移。不引入 codegen（成本 > 收益）。 |
| **N2** | **上下文用量实时推送**（CH-01 / L3） | 后端 `bridge.ts` 的 `estimateContext()`、`run-chat.ts` 的 `getContextEstimate()` ＋ `estimateCache` **已具备估算能力**，缺的只是「推给前端」。L3 裁定不新增事件类型 → **在现有 `usage.updated` / `run.completed` 载荷上挂可选字段**，前端 `dispatch()` 顺带消费。零新增事件、零新增订阅、向后兼容（旧前端忽略未知字段）。 |
| **N3** | **分组逻辑不可测**（SL-01） | `useSessionList.ts` 中 `computeRecent` / `computeByWorkspace` / `getGroupedSessions` 是 composable 内闭包方法，依赖 `ref`，无法单测也无法被别处复用。对策：**下沉为无副作用纯函数模块**（入参 `Session[]` + 配置，出参分组结果），composable 只做 `computed()` 包装。 |
| **N4** | **三态置顶/归档的语义保持**（SL-02 / L1） | kmaster 后端 `mergeSession()` + `resolveTriStateFlag()` 已实现 `NULL → 回落 hermes` / `0\|1 → 显式覆盖`，语义**强于** hermes 的 localStorage 方案。L1 裁定保留 → 前端**只对齐 UI 表现，不对齐存储实现**。 |
| **N5** | **模型数据双源不同步**（MD-01） | hermes 用 `useModelsStore`（列表真源）+ `useAppStore.modelGroups`（选择器视图）同源拉取 + 写后 `reloadModels()`。kmaster 目前是单 `useModelConfigStore` 巨石（526 行，混了 providers / defaults / usage）。对策：**新增薄 `stores/models.ts` 作为「可用模型列表」只读真源**，`modelConfig.ts` 保留配置写操作并在写成功后回调 `models.reload()`。不做大重构，避免波及 provider 配置表单。 |
| **N6** | **新建后端聚合而不破坏外部源**（ST-07/08 / D2 / G4） | Plugins 走**新建 `GET /api/plugins`**（新增聚合器，只读 hermes 本地配置，不触 COS / SkillHub）；Channels 走**扩 `routes/config.ts` 的 platform section**（配置域内追加；该文件注释禁止的是「追加技能/MCP/模型枚举端点」，platform 配置不在禁列）。两者均**不经过** `cos-cache.ts` / `skillhub.ts` / `aggregate/mcp.ts` 的 candidates 链路 → **不触碰 G4 红线**。 |
| **N7** | **多 agent 增强与 hermes 单 agent 模型共存**（CH-05/07 / L4） | kmaster 的 `agentStates` / `activeAgentId` 是自有增强，hermes 无对应概念。对策：**hermes 对齐只作用于「单 agent 视角内的数据来源」**，多 agent Tab 层作为外壳保留；L4 裁定不引入 hermes skills 的 `target` 维度。 |

### 1.2 框架选型（**不引入任何新框架 / 新依赖**）

| 层 | 选型 | 说明 |
|---|---|---|
| 前端框架 | Vue 3（`<script setup>` + Composition API） | 现状，沿用 |
| UI 组件 | Naive UI | 现状，沿用；**默认保持 kmaster 现有视觉风格**，仅对齐数据来源与交互语义 |
| 状态管理 | Pinia | 现状；本次仅新增 1 个薄 store（`stores/models.ts`） |
| 实时通信 | Socket.IO（`/chat-run` 命名空间） | 现状；**本次不新增事件类型**（L3） |
| 后端框架 | Koa2 + TypeScript | 现状；新增 1 个路由文件 + 1 个聚合器 |
| 存储 | hermes `state.db` + kmaster 侧车 `kmaster.db` | 现状；三态 flag 语义保留（L1） |
| 构建 | pnpm workspace monorepo | 现状 |

**架构模式**
- 前端：`View → Composable（视图逻辑）→ Store（状态真源）→ api/client（传输层）`
- 后端：`Route（HTTP 契约）→ Service/Aggregate（数据合并）→ Bridge（hermes 进程桥）`

本次所有改动**严格落在既有分层内**，不新增层次、不做架构重构。

---

## 2. 文件列表（相对仓库根 `kmaster-studio/`）

标记说明：🆕 新建 ｜ ✏️ 修改 ｜ 👁 只读复用（不改）｜ ⚠️🔴 G4 红线禁改

### 2.1 后端 `packages/server/`

| 文件 | 标记 | 改动要点 | 关联需求 |
|---|---|---|---|
| `src/protocol.ts` | ✏️ | 在 `UsageUpdatedPayload` / `RunCompletedPayload` 追加可选 `context_tokens`；导出新接口 `ContextTokensPayload`；**不新增事件枚举** | CH-01 / L3 |
| `src/run-chat.ts` | ✏️ | `executeRun().onEvent` 中，`usage.updated` 与 `run.completed` 两处 `ns.emit` 前注入 `context_tokens`（复用 `getContextEstimate()` 缓存） | CH-01 |
| `src/bridge.ts` | 👁 | 复用 `estimateContext()` / `charsToTokens()` / `Bridge.contextEstimate`，**不改** | CH-01 |
| `src/routes/plugins.ts` | 🆕 | `GET /api/plugins` → `{ plugins: PluginItem[] }`，字段对齐 hermes `GET /api/hermes/plugins`（`kind` / `source` / `effectiveStatus` / `providesTools`） | ST-07 / D2 |
| `src/services/hermes/aggregate/plugins.ts` | 🆕 | 读 hermes 本地插件配置并归一化；**不读 COS、不读 SkillHub** | ST-07 / D2 |
| `src/routes/config.ts` | ✏️ | 追加 `GET/PUT /api/config/platform`（Channels 配置 section），沿用文件既有 providers/profiles 的读写范式 | ST-08 / D2 |
| `src/routes/skills.ts` | ✏️ | 明确响应契约 `{ installed, candidates, categories }` 并补类型标注；可选：显式忽略未知 query 并在 dev 下 warn。⚠️ 内部调用的 `mergeSkillLists()` **不得修改** | ST-01 / ST-02 / D1 |
| `src/services/hermes/aggregate/skills.ts` | ⚠️🔴 | **G4 红线，本次不改**（COS manifest 链路） | ST-05 |
| `src/services/hermes/aggregate/mcp.ts` | ⚠️🔴 | **G4 红线，本次不改**（COS candidates 链路） | ST-06 |
| `src/routes/skillhub.ts` | ⚠️🔴 | **G4 红线，本次不改**（SkillHub 在线代理）；前端改为调用其**正确路径** | ST-03 |
| `src/services/cos-cache.ts` | ⚠️🔴 | **G4 红线，本次不改** | — |
| `src/routes/sessions.ts` | 👁 | `mergeSession()` / `resolveTriStateFlag()` / `PATCH` / `PUT` 已满足 SL-02/04/05、CH-04，**无需改动** | SL-02/04/05、CH-04 |
| `src/routes/models.ts` | 👁 | `GET /api/models → { providers, usage }` 已满足 MD-01/03，**无需改动** | MD-01 / MD-03 |
| `src/routes/mcp.ts` | 👁 | `GET /api/mcp → { deployed, candidates }` 已对齐，**无需改动** | ST-06 |
| 路由注册入口（`src/app.ts` 或 `src/routes/index.ts`，实现时 grep `router.use(` 确认） | ✏️ | 挂载 `plugins.ts` 新路由 | ST-07 |

### 2.2 前端 `packages/client/`

| 文件 | 标记 | 改动要点 | 关联需求 |
|---|---|---|---|
| `src/types/chat.ts` | ✏️ | 与 `protocol.ts` 同步 `ContextTokensPayload`；`WS_EVENTS` 注册表**不变**；补 `SkillsResponse` / `PluginItem` / `PlatformChannelConfig` | CH-01、ST-01、ST-07/08 |
| `src/api/client.ts` | ✏️ | **修 ST-01**：`getSkills()` 由 `const { skills } = ...` 改为返回 `{ installed, candidates, categories }`；新增 `getPlugins()` / `getPlatformConfig()` / `savePlatformConfig()` | ST-01、ST-07、ST-08 |
| `src/composables/useSkillList.ts` | ✏️ | **修 ST-02**：去掉 `?source=candidates` 幽灵参数；**修 ST-03**：`searchSkillHub()` 路径 `/api/skills/search?q=` → `/api/skillhub/skills?q=` | ST-02、ST-03 |
| `src/utils/sessionGrouping.ts` | 🆕 | **SL-01**：纯函数 `computeRecent` / `computeByWorkspace` / `getGroupedSessions`，无 ref 依赖、可单测 | SL-01 |
| `src/composables/useSessionList.ts` | ✏️ | 改为 `computed()` 调用纯函数；`runningIds` 保持以 `chatStore.runState` 为真源；归档开关、workspace 第 4 分组接线 | SL-01/03/04/05 |
| `src/stores/chat.ts` | ✏️ | `dispatch()` 消费 `context_tokens` 写入 `contextBySession`（幂等）；`modeBySession` 收敛到 `CHAT_MODES` 三值；`togglePin` / `archiveSession` / `setWorkspace` 三态语义不动 | CH-01/02/04/06、SL-02 |
| `src/stores/models.ts` | 🆕 | **MD-01**：薄只读 store，`providers` / `loading` / `load()` / `reload()`，唯一数据源 `GET /api/models` | MD-01 |
| `src/stores/modelConfig.ts` | ✏️ | 写操作（保存 provider / 设默认 / 连通性测试）成功后调用 `useModelsStore().reload()`；`modelUsage` 读取保持不变 | MD-01/02/03 |
| `src/views/SettingsView.vue` | ✏️ | `plugins` / `channel` 路由由 `PlaceholderSection` 换成真实 section；market 类沿用 `MarketLayout` + `NTabs` | ST-07/08/09 |
| `src/components/settings/PluginsSection.vue` | 🆕 | 插件列表页（kind / source / effectiveStatus / providesTools） | ST-07 |
| `src/components/settings/ChannelSection.vue` | 🆕 | 渠道 / 平台配置页（读写 `/api/config/platform`） | ST-08 |
| `src/components/settings/SkillManageSection.vue` | ✏️ | **修 ST-04**：删除 `MOCK_SKILLS` 残留注释与死代码（第 9、37 行附近） | ST-04 |
| `src/components/market/MarketModuleCard.vue` | 🆕 | **ST-09**：双模块卡片公共组件，供 skills / mcp / agent-role 复用 | ST-09 |
| `src/components/chat/ContextUsageBar.vue` | 🆕 | **CH-01**：会话头上下文进度条，缺数据时整条隐藏 | CH-01 |
| 会话列表组件 `src/components/session/*.vue`（实现时按现有目录确认） | ✏️ | 归档开关、置顶区、workspace 分组渲染 | SL-02/04/05 |
| 会话交互组件（模式切换器 / agent Tab / 会话头，实现时确认） | ✏️ | CH-03 UI 收敛、CH-05 角色来源、CH-07 多 agent Tab | CH-03/05/07 |
| `src/components/settings/PlaceholderSection.vue` | 👁 | 保留（仍有其他 P2 占位使用），仅解除 plugins / channel 的引用 | ST-07/08 |

---

## 3. 数据结构与接口

类图见同目录 `class-diagram-pages-data-alignment.mermaid`。

### 3.1 新增 / 修改的类型定义

```ts
// packages/server/src/protocol.ts  ＋  packages/client/src/types/chat.ts（双端同步）

/** CH-01 / L3：上下文用量。作为可选字段挂在现有 run 事件载荷上，不新增事件类型 */
export interface ContextTokensPayload {
  total_tokens: number;    // 当前会话已占用 token（来自 bridge.estimateContext 的 context_used）
  context_length: number;  // 模型上下文窗口（来自 context_max）
}

export interface UsageUpdatedPayload {
  session_id: string;
  input_tokens: number;
  output_tokens: number;
  context_tokens?: ContextTokensPayload;   // ← 新增（可选，向后兼容）
}

export interface RunCompletedPayload {
  session_id: string;
  message_id: string;
  message: ChatMessage;
  usage: { input_tokens: number; output_tokens: number };
  context_tokens?: ContextTokensPayload;   // ← 新增（可选，向后兼容）
}

/** ST-07：与 hermes GET /api/hermes/plugins 字段对齐 */
export interface PluginItem {
  id: string;
  name: string;
  kind: string;              // 插件种类
  source: string;            // 来源（本地 / hermes 内置）
  effectiveStatus: string;   // 生效状态
  providesTools: number;     // 提供的工具数
  description?: string;
}

/** ST-08：Channels（platform section）最小可用形态，字段随需求补（见 Q3） */
export interface PlatformChannelConfig {
  id: string;
  type: string;
  enabled: boolean;
  credentials: Record<string, string>;
}

/** ST-01：后端真实返回形状（前端此前误解构为 { skills }） */
export interface SkillsResponse {
  installed: Skill[];
  candidates: Skill[];
  categories: string[];
}
```

### 3.2 契约变更清单（工程师逐条核对）

| 类型 | 契约 | 变更 | 兼容性 |
|---|---|---|---|
| WS | `usage.updated` | 载荷追加可选 `context_tokens: { total_tokens, context_length }` | 向后兼容 |
| WS | `run.completed` | 同上 | 向后兼容 |
| WS | 事件枚举 `WS_EVENTS` | **无新增**（L3 硬要求） | — |
| HTTP | `GET /api/plugins` | **新增** → `{ plugins: PluginItem[] }` | 新端点 |
| HTTP | `GET /api/config/platform` | **新增** → `PlatformChannelConfig[]` | 新端点 |
| HTTP | `PUT /api/config/platform` | **新增** | 新端点 |
| HTTP | `GET /api/skills` | 契约**不变**（`{ installed, candidates, categories }`），仅补类型标注；前端改为按真实形状解构 | 无破坏 |
| HTTP | `GET /api/skillhub/skills` | **不变**（前端改为调用正确路径） | 无破坏 |
| HTTP | `GET /api/mcp` | **不变** | 无破坏 |
| HTTP | `GET /api/models` | **不变** | 无破坏 |
| HTTP | `GET/PATCH/PUT /api/sessions*` | **不变**（三态语义保留，L1） | 无破坏 |

---

## 4. 程序调用流程

时序图见同目录 `sequence-diagram-pages-data-alignment.mermaid`，共 4 张：

1. **CH-01 / L3** — `context_tokens` 推送链（hermes → run-chat → WS → dispatch → ContextUsageBar）
2. **MD-01** — 模型双 store 同步链（写操作后 `modelConfig` 回调 `models.reload()`）
3. **ST-07 / ST-08** — Plugins 与 Channels 新后端聚合链（明确标注不触 COS / SkillHub）
4. **ST-01/02/03** — Skills 数据链修正前后对比（三处 bug 的错误路径 vs 正确路径）

---

## 5. 任务列表（T01 ~ T05，按实现顺序，含依赖）

> 共 **5 批**。T01 为契约/基座批，必须最先完成；T02 为前端传输层修复批；T03 / T04 / T05 三个业务域批在依赖满足后**可并行**分配给不同工程师。
> 🔴 = 触碰或邻近 G4 外部源链路，**必须单独评审**。

---

### T01 — 后端契约与数据基座  `P0`

**需求编号**：CH-01（L3）、ST-07（D2）、ST-08（D2）、ST-01 后端侧类型标注、ST-02 后端侧

**源文件**
- ✏️ `packages/server/src/protocol.ts`
- ✏️ `packages/server/src/run-chat.ts`
- 🆕 `packages/server/src/routes/plugins.ts`
- 🆕 `packages/server/src/services/hermes/aggregate/plugins.ts`
- ✏️ `packages/server/src/routes/config.ts`
- ✏️ `packages/server/src/routes/skills.ts`（仅补类型标注 / 幽灵参数 warn）
- ✏️ 路由注册入口（Q1 确认后）
- ✏️ `packages/client/src/types/chat.ts`（双端契约一次性同步）

**依赖**：无（起始任务，阻塞 T02~T05）

**验收标准**
1. `usage.updated` / `run.completed` 载荷含 `context_tokens`，且 **`WS_EVENTS` 事件枚举无新增**（L3 硬要求）。
2. `GET /api/plugins` 返回结构化列表，**日志中不出现任何 COS / SkillHub 请求**（G4 自证）。
3. `GET/PUT /api/config/platform` 读写闭环，不影响既有 providers / profiles 端点。
4. `packages/client/src/types/chat.ts` 与 `protocol.ts` 字段逐一对齐，前后端 `tsc` 零错。
5. 🔴 `aggregate/skills.ts`、`aggregate/mcp.ts`、`routes/skillhub.ts`、`cos-cache.ts` **四文件 git diff 必须为空** —— 提交前 `git status` 自查。

**风险**：Q2（hermes 插件配置源）未定 → 开工首步先确认；若 hermes 侧无本地插件概念，降级为「返回空数组 + 前端空态」并回报 team-lead。

---

### T02 — 前端 API 层与类型对齐（三个 bug 修复）  `P0`

**需求编号**：ST-01、ST-02、ST-03、ST-04

**源文件**
- ✏️ `packages/client/src/api/client.ts`
- ✏️ `packages/client/src/composables/useSkillList.ts`
- ✏️ `packages/client/src/components/settings/SkillManageSection.vue`
- ✏️ `packages/client/src/types/chat.ts`（若 T01 未覆盖则在此补齐）

**依赖**：**T01**（需要新端点的类型定义与后端就绪）

**验收标准**
1. 技能市场页不再白屏 / 报错，已安装与候选两栏均有数据。
2. 全仓 grep `source=candidates` 与 `/api/skills/search` **零命中**。
3. 全仓 grep `MOCK_SKILLS` **零命中**（含注释）。
4. 🔴 ST-03 **只改前端调用路径**，`routes/skillhub.ts` 一个字符都不动 —— 属邻近 G4 改动，**需在提交说明中显式声明「未修改代理实现」**。

---

### T03 — 会话列表域  `P0`

**需求编号**：SL-01、SL-02（L1）、SL-03、SL-04、SL-05（D3）

**源文件**
- 🆕 `packages/client/src/utils/sessionGrouping.ts`
- ✏️ `packages/client/src/composables/useSessionList.ts`
- ✏️ `packages/client/src/components/session/*.vue`（Q4 确认后定位）
- 👁 `packages/client/src/stores/chat.ts`（`togglePin` / `archiveSession` / `setWorkspace` 已就绪，只读不改）

**依赖**：**T01**（弱依赖，仅类型）— 可与 T04 / T05 并行

#### 条目明细

| 编号 | 标题 | 涉及文件 | 改动要点 | 验收标准 |
|---|---|---|---|---|
| **SL-01** | 分组逻辑抽为纯函数 | 🆕 `packages/client/src/utils/sessionGrouping.ts`；✏️ `packages/client/src/composables/useSessionList.ts` | 把 `computeRecent(sessions, now, days)` / `computeByWorkspace(sessions)` / `getGroupedSessions(sessions, opts)` 从 composable 闭包下沉为独立纯函数模块；composable 改为 `computed()` 包装 | 纯函数模块内**零 `ref` / `computed` / `store` 引用**；同一入参恒等出参；`useSessionList` 行为与改造前完全一致（无回归） |
| **SL-02** | 置顶展示对齐（保留后端三态） | ✏️ `useSessionList.ts`、会话列表组件；👁 `stores/chat.ts` | UI 层对齐 hermes 的置顶区表现；**存储实现不动**，仍走 `patchSession({ pinned })` → 后端 `resolveTriStateFlag()` | `SessionPatch.pinned` 保持 `boolean \| null` 三态；**前端无任何 localStorage 置顶写入**（L1 硬要求）；取消置顶后能正确回落 hermes 侧值 |
| **SL-03** | 运行中会话标识 | ✏️ `useSessionList.ts` | `runningIds` 真源保持为 `chatStore.runState`，不得改回轮询 | 会话运行中/结束时列表标识与 `runState` 同步，无轮询请求 |
| **SL-04** | 归档会话开关 | ✏️ `useSessionList.ts`、会话列表组件 | 增加 `showArchived` 开关；关闭时归档会话不出现在任何分组；开启时以独立分组展示 | 开关切换即时生效；归档动作走 `archiveSession` → `patchSession({ archived: 0/1 })`；不触发全量重新拉取 |
| **SL-05** | workspace 作为第 4 分组 | 🆕 `sessionGrouping.ts`；✏️ `useSessionList.ts`、会话列表组件 | 会话目录 = workspace（D3）；`computeByWorkspace` 产出分组列表 | 分组维度仅 `source` / `pinned` / `workspace`；**不引入 category**（D4）；recent / pinned / byWorkspace 三段保持**非互斥**语义（一个会话可同时出现在多段），不得改成互斥 |

---

### T04 — 单 agent 会话交互域  `P0`

**需求编号**：CH-01（L3）、CH-02、CH-03、CH-04、CH-05、CH-06（L2）、CH-07（L4）

**源文件**
- 🆕 `packages/client/src/components/chat/ContextUsageBar.vue`
- ✏️ `packages/client/src/stores/chat.ts`
- ✏️ 会话交互组件（模式切换器 / agent Tab / 会话头，Q4 确认后定位）
- 👁 `packages/client/src/types/chat.ts`（T01 已同步）

**依赖**：**T01**（强依赖，后端须先推 `context_tokens`）— 可与 T03 / T05 并行

#### 条目明细

| 编号 | 标题 | 涉及文件 | 改动要点 | 验收标准 |
|---|---|---|---|---|
| **CH-01** | 会话头上下文用量进度条 | 🆕 `packages/client/src/components/chat/ContextUsageBar.vue`；✏️ `packages/client/src/stores/chat.ts`；✏️ 会话头组件；（后端侧在 T01：`packages/server/src/run-chat.ts`、`protocol.ts`） | 后端在 `usage.updated` / `run.completed` 载荷注入 `context_tokens`；前端 `dispatch()` 写入 `contextBySession[sessionId]`；组件用 Naive UI `NProgress` 渲染 | 公式严格为 `Math.min(total_tokens / context_length * 100, 100)`；`context_tokens` 缺失或 `context_length <= 0` 时**整条隐藏**（不渲染 0%）；**不新增 WS 事件类型**（L3） |
| **CH-02** | 消息流 reducer 幂等 | ✏️ `packages/client/src/stores/chat.ts` | `dispatch()` 对同一 session 的重复 `usage.updated` 采用**覆盖写**而非累加；重连补发事件不产生重复消息 | 同一事件重复投递 N 次，`contextBySession` 与消息列表结果与投递 1 次一致；断线重连后消息不重复、不丢失 |
| **CH-03** | 会话交互 UI 收敛 | ✏️ 会话交互组件（输入区 / 工具条） | 对齐 hermes 的交互信息架构，去除冗余入口；**保持 kmaster 现有视觉风格** | 无功能回归；不做视觉改版（配色/圆角/间距沿用现状） |
| **CH-04** | workspace 变更即时生效 | ✏️ `packages/client/src/stores/chat.ts`、会话头组件；👁 `packages/server/src/routes/sessions.ts`（后端已就绪，不改） | 前端 `setWorkspace` → `PUT /api/sessions/:id`；成功后即时更新本地会话对象，不做本地缓存拦截 | 修改 workspace 后，会话列表分组**无需刷新页面**即重新归组；后端 `routes/sessions.ts` 零改动 |
| **CH-05** | Agent 角色数据来源对齐 | ✏️ `packages/client/src/stores/agentRoles`（或对应 store）、会话交互组件；👁 `packages/client/src/api/client.ts` 的 `getAgents(source)` | 角色列表统一走 `getAgents(source)`（支持 `installed` / `candidates` / `all`），不再本地硬编码 | 角色下拉数据来自后端；切换 source 参数返回对应集合；无 mock 数据残留 |
| **CH-06** | 执行模式收敛 | ✏️ `packages/client/src/stores/chat.ts`（`modeBySession`）、模式切换器组件；👁 `types/chat.ts` 的 `CHAT_MODES`、`protocol.ts` 的 `MODE_TO_HERMES_APPROVAL` | 模式取值统一收敛到 `CHAT_MODES` 的 `ask` / `plan` / `craft` 三值，清理散落的字面量 | **不新建任何模式**（L2 硬要求）；`CHAT_MODES` 双端一致；`MODE_TO_HERMES_APPROVAL` 映射不变；全仓无游离模式字面量 |
| **CH-07** | 多 agent Tab 保留与对齐边界 | ✏️ agent Tab 组件；👁 `packages/client/src/stores/chat.ts` 的 `agentStates` / `activeAgentId` | 多 agent Tab 作为 kmaster 自有增强**保留**；hermes 对齐只作用于「单 agent 视角内的数据来源」，不下沉到 Tab 外壳 | 多 agent 切换功能无回归；**不引入 hermes skills 的 `target` 维度**，kmaster 保持单 target（L4 硬要求）；技能相关类型/UI 中无 `target` 字段 |

---

### T05 — 设置页新页面 + 市场卡片 + 模型管理双 store  `P1`

**需求编号**：ST-05、ST-06、ST-07、ST-08、ST-09、MD-01、MD-02、MD-03

**源文件**
- 🆕 `packages/client/src/components/settings/PluginsSection.vue`
- 🆕 `packages/client/src/components/settings/ChannelSection.vue`
- 🆕 `packages/client/src/components/market/MarketModuleCard.vue`
- 🆕 `packages/client/src/stores/models.ts`
- ✏️ `packages/client/src/stores/modelConfig.ts`
- ✏️ `packages/client/src/views/SettingsView.vue`
- 👁 `packages/client/src/components/settings/PlaceholderSection.vue`（保留供其他 P2 占位）

**依赖**：**T01**（新端点）＋ **T02**（新 API 方法）— 可与 T03 / T04 并行

#### 条目明细

| 编号 | 标题 | 涉及文件 | 改动要点 | 验收标准 |
|---|---|---|---|---|
| **ST-05** | Skills 市场数据逻辑对齐 | ✏️ `packages/client/src/composables/useSkillList.ts`、`views/SettingsView.vue`；⚠️🔴 `packages/server/src/services/hermes/aggregate/skills.ts`（**禁改**） | 仅做**前端消费逻辑对齐**：按 `{ installed, candidates, categories }` 分栏渲染，分类来自后端 `categories` | 🔴 后端聚合器**一行不改**；若发现前端对齐必须改后端 → **停手上报 team-lead 走单独评审**（G4） |
| **ST-06** | MCP 市场数据逻辑对齐 | ✏️ MCP 市场组件；👁 `packages/server/src/routes/mcp.ts`；⚠️🔴 `aggregate/mcp.ts`（**禁改**） | 前端按 `{ deployed, candidates }` 分栏渲染 | 🔴 后端聚合器与 COS candidates 链路**零改动**；同上停手规则 |
| **ST-07** | Plugins 设置页（替换占位） | 🆕 `components/settings/PluginsSection.vue`；✏️ `views/SettingsView.vue`（365-366 行附近路由映射）；（后端在 T01：🆕 `routes/plugins.ts`、`aggregate/plugins.ts`） | 路由 `plugins` 由 `PlaceholderSection` 换为真实页；展示 `kind` / `source` / `effectiveStatus` / `providesTools` | 页面有真实数据与空态；数据源为 `GET /api/plugins`；**日志无 COS / SkillHub 请求** |
| **ST-08** | Channels 设置页（替换占位） | 🆕 `components/settings/ChannelSection.vue`；✏️ `views/SettingsView.vue`（382-384 行附近）；（后端在 T01：✏️ `routes/config.ts` 扩 platform section） | 路由 `channel` 换为真实页；读写 `GET/PUT /api/config/platform` | 读写闭环；保存后刷新页面配置仍在；不影响 providers / profiles 端点 |
| **ST-09** | 市场双模块卡片公共组件 | 🆕 `components/market/MarketModuleCard.vue`；✏️ skills / mcp / agent-role 三处市场页 | 抽出公共卡片组件，三处复用；沿用现有 `MarketLayout` + `NTabs` 骨架 | 组件被三处引用；视觉沿用 kmaster 现有风格，不做改版；（**Q6 待确认**「双模块」确切定义） |
| **MD-01** | 模型双 store 同步 | 🆕 `packages/client/src/stores/models.ts`；✏️ `packages/client/src/stores/modelConfig.ts`；👁 `packages/server/src/routes/models.ts`（不改） | 新增薄只读 store 作为「可用模型列表」真源；`modelConfig` 的 `saveProvider` / `setDefault` / 连通性测试成功后回调 `useModelsStore().reload()` | 保存 provider 或设默认后，模型选择器**无需刷新页面**即更新；`models.ts` 内无写操作 |
| **MD-02** | 模型管理 UI 对齐 | ✏️ 模型管理页组件 | 仅对齐**信息架构与字段展示**，不改视觉风格（Q7 边界） | 无视觉改版；字段展示与 hermes 信息架构一致 |
| **MD-03** | usage 统计独立 Tab | ✏️ 模型管理页组件；👁 `routes/models.ts` | usage 统计从配置表单中拆出为独立 Tab，数据源仍为 `GET /api/models` 的 `usage` 字段 | usage Tab 独立可切换；不额外新增后端端点 |

---

### 5.1 任务依赖与并行调度

```
T01 ──┬──> T02 ──┐
      ├──> T03   │
      ├──> T04   │
      └──────────┴──> T05
```

| 阶段 | 可并行任务 | 建议人力 |
|---|---|---|
| 第 1 批 | T01（后端为主） | 1 人 · 阻塞全部后续 |
| 第 2 批 | T02（前端传输层） | 1 人 · 阻塞 T05 |
| 第 3 批 | **T03 ‖ T04 ‖ T05 三路并行** | 最多 3 人 |

**串行退化路径（单工程师）**：`T01 → T02 → T04 → T03 → T05`
（T04 优先，因 CH-01 是本次最显性的用户可感知价值）

---

## 6. 依赖包

**本次不新增任何三方依赖。** 全部改动基于仓库现有依赖完成。

```
# 前端 packages/client（现有，版本以仓库 pnpm-lock.yaml 为准）
- vue@^3.x               : 框架
- naive-ui@^2.x          : UI 组件库（NTabs / NProgress / NSwitch / NCard 均已可用）
- pinia@^2.x             : 状态管理（新增 stores/models.ts 复用现有 defineStore）
- socket.io-client@^4.x  : WS 客户端（不新增事件订阅）

# 后端 packages/server（现有）
- koa@^2.x               : HTTP 框架
- @koa/router@^12.x      : 路由（新增 plugins.ts 复用）
- socket.io@^4.x         : WS 服务端
- typescript@^5.x        : 类型

# 说明
- ContextUsageBar 用 Naive UI 的 NProgress，无需引入图表库
- 纯函数单测若要补，用仓库已有测试运行器；若仓库无测试基建，本期不新增测试框架（需 team-lead 裁定）
```

---

## 7. 共享知识（横切约定）

### 7.1 G4 红线 —— 外部数据源链路逐字节不变 🔴

```
以下四类链路本次严禁修改（请求参数、请求头、返回结构、缓存策略全部冻结）：
  1. COS 三种 manifest：packages/server/src/services/cos-cache.ts
  2. SkillHub 在线代理：packages/server/src/routes/skillhub.ts
  3. Skills 候选聚合：packages/server/src/services/hermes/aggregate/skills.ts（依赖 COS）
  4. MCP  候选聚合：packages/server/src/services/hermes/aggregate/mcp.ts（依赖 COS）

提交前自查：git diff --stat 中这四个路径必须为空。
如确需修改 → 停手，上报 team-lead，走单独评审，不得自行决定。
```

### 7.2 置顶 / 归档三态约定（L1）

```
kmaster 使用 kmaster.db 侧车列 + resolveTriStateFlag()：
  NULL → 回落 hermes state.db 的值
  0/1  → kmaster 显式覆盖

SessionPatch.pinned   : boolean | null            （null = 清除覆盖，回落 hermes）
SessionPatch.archived : boolean | number | null

前端严禁引入 localStorage 存置顶状态（不对齐 hermes 的 localStorage 实现）。
```

### 7.3 WS 事件约定（L3）

```
- 本次不新增任何 WS 事件类型，WS_EVENTS 注册表保持不变
- context_tokens 作为可选字段挂在 usage.updated / run.completed 载荷上
- 载荷形状：{ total_tokens: number, context_length: number }
- 前端百分比：percent = Math.min(total_tokens / context_length * 100, 100)
- 数据缺失（字段不存在 / context_length <= 0）→ UI 整条隐藏，不渲染 0%
- dispatch() reducer 必须幂等：同 session 覆盖写，禁止累加
```

### 7.4 API 响应形状（以后端为准，前端不得臆测）

```
GET /api/skills          → { installed: Skill[], candidates: Skill[], categories: string[] }
                           （注意：没有 skills 字段；query 参数被后端忽略）
GET /api/mcp             → { deployed: McpItem[], candidates: McpItem[] }
GET /api/models          → { providers: ModelProvider[], usage: ModelUsage }
GET /api/plugins         → { plugins: PluginItem[] }              ← 本次新增
GET /api/config/platform → PlatformChannelConfig[]                ← 本次新增

SkillHub 搜索正确路径：GET /api/skillhub/skills?q=
  （不是 /api/skills/search，不是 /api/skills?source=candidates）
```

### 7.5 会话列表维度（D3 / D4）

```
- 列表分组维度仅三个：source / pinned / workspace
- 会话目录 = workspace，作为第 4 分组
- category 维度本次不做（后端已有 source/pinned，category 暂缓）
- 分组语义：recent / pinned / byWorkspace 三段非互斥（一个会话可同时出现在多段）
```

### 7.6 执行模式与 target（L2 / L4）

```
- 执行模式只有 ask / plan / craft 三值，已存在于 CHAT_MODES，本次只收敛不新建
- MODE_TO_HERMES_APPROVAL 映射保持不变
- 不引入 hermes skills 的 target 维度，kmaster 保持单 target
```

### 7.7 通用工程约定

```
- 双端类型改动必须同时更新 packages/server/src/protocol.ts 与 packages/client/src/types/chat.ts
- 新增 store 遵循 setup 语法：defineStore('name', () => { ... })
- UI 默认保持 kmaster 现有风格（Naive UI + 现有 MarketLayout / NTabs），本次不做视觉改版
- 本次不引入任何新的三方依赖
```

### 7.8 环境铁律

```
- Node：C:/Users/towyq/.workbuddy/binaries/node/versions/22.22.2/node.exe
- 前端命令走相对路径 ../../node_modules/.bin/，禁止 /d/... 绝对路径
- 联调一律 localhost（非 127.0.0.1）+ NO_PROXY=localhost,127.0.0.1
```

### 7.9 Git 铁律

```
❌ 严禁：git stash / git gc / git repack / git prune / git worktree
✅ 允许：git add / commit / log / diff / status / show
对照基线用 git diff <hash>，不要动工作区快照。
（原因：本仓 .git 曾被 git stash -u 触发的自动 gc + 安全删除垫片联合损坏，已人工还原并加固）
```

---

## 8. 开放项（Anything UNCLEAR）

| # | 事项 | 现状 / 建议 | 阻塞级别 |
|---|---|---|---|
| **Q1** | 后端路由注册入口文件名未核实（`src/app.ts` 还是 `src/routes/index.ts`） | 实现 T01 时 grep `router.use(` 确认后挂载 `plugins.ts` | 低（实现期 1 分钟解决） |
| **Q2** | **hermes 本地插件配置的物理位置与字段**（`aggregate/plugins.ts` 的数据源） | 需比对 hermes `GET /api/hermes/plugins` 实现读的是 `config.yaml` 哪个 section。若 hermes 侧无本地插件配置而是运行时枚举，则 `providesTools` 可能需从 MCP deployed 推导 | **中 · 阻塞 T01，开工前需确认** |
| **Q3** | Channels（platform）配置的字段 schema | PRD 未给出渠道类型枚举。建议先落「通用 KV + enabled 开关」最小可用形态，字段随需求补 | 中 |
| **Q4** | 会话列表 / 会话交互组件的确切文件名 | `components/session/*`、模式切换器、agent Tab 未逐个定位。T03 / T04 开工首步为定位 | 低 |
| **Q5** | **`context_length` 的取值来源** | `bridge.ts` 的 `estimateContext()` 返回 `context_max`，但该值是否随「当前会话选中模型」变化需确认；若为全局常量，则切模型后进度条不准 | **中 · 影响 CH-01 准确性** |
| **Q6** | **ST-09「双模块卡片」的确切定义** | 推断为「已安装 / 候选」两栏卡片布局，需 PM（Alice）确认 | **中 · 影响 T05** |
| **Q7** | MD-02「UI 对齐」的对齐边界 | 项目基调是「UI 默认保持 kmaster 风格」，若涉及视觉改版需单独确认。本设计按「仅对齐信息架构与字段展示，不改视觉风格」处理 | 中 |
| **Q8** | 归档会话的分页 / 性能 | SL-04 打开归档后若会话量大，`getGroupedSessions` 全量计算可能卡顿。纯函数化后可加 memo，本次不做虚拟列表 | 低 |

**已做的关键假设**
- **A1**：`usage.updated` 在一次 run 中会多次触发，前端 reducer 采用**覆盖写**而非累加（幂等，CH-02）。
- **A2**：`GET /api/plugins` 为**只读**端点，本次不实现插件启停写操作。
- **A3**：`stores/models.ts` 与 `modelConfig.ts` 共用同一 HTTP 端点，接受一次首屏的重复请求（可后续加 60s 去重，不在本期）。

---

## 9. 交付前总检查清单

- [ ] `git diff --stat` 中 `cos-cache.ts` / `skillhub.ts` / `aggregate/skills.ts` / `aggregate/mcp.ts` **四路径为空** 🔴
- [ ] `WS_EVENTS` 注册表无新增事件（L3）
- [ ] `SessionPatch.pinned` 仍为三态 `boolean | null`（L1）
- [ ] 无 localStorage 存置顶（L1）
- [ ] 无新增执行模式（L2）
- [ ] 无 `target` 维度（L4）
- [ ] 无 `category` 列表维度（D4）
- [ ] `package.json` 无新增依赖
- [ ] 全仓 grep：`MOCK_SKILLS` / `source=candidates` / `/api/skills/search` 均零命中
- [ ] 前后端 `tsc` 零错误

---

## 附录 A：需求编号总览

| 域 | 编号 | 归属任务 |
|---|---|---|
| **A · 会话列表** | SL-01 分组纯函数化 | T03 |
| | SL-02 置顶展示对齐（保留三态） | T03 |
| | SL-03 运行中会话标识 | T03 |
| | SL-04 归档会话开关 | T03 |
| | SL-05 workspace 第 4 分组 | T03 |
| **B · 单 agent 会话交互** | CH-01 上下文用量进度条 | T04（+ T01 后端） |
| | CH-02 消息流 reducer 幂等 | T04 |
| | CH-03 会话交互 UI 收敛 | T04 |
| | CH-04 workspace 变更即时生效 | T04 |
| | CH-05 Agent 角色数据来源对齐 | T04 |
| | CH-06 执行模式收敛 | T04 |
| | CH-07 多 agent Tab 保留与对齐边界 | T04 |
| **C · 设置页** | ST-01 修 `getSkills()` 解构 | T02 |
| | ST-02 去 `?source=candidates` 幽灵参数 | T02 |
| | ST-03 SkillHub 搜索路径改 `/api/skillhub/skills` | T02 |
| | ST-04 清 `MOCK_SKILLS` 死注释 | T02 |
| | ST-05 Skills 市场数据逻辑对齐 🔴 | T05 |
| | ST-06 MCP 市场数据逻辑对齐 🔴 | T05 |
| | ST-07 Plugins 设置页（新建后端） | T05（+ T01 后端） |
| | ST-08 Channels 设置页（扩 config platform） | T05（+ T01 后端） |
| | ST-09 市场双模块卡片公共组件 | T05 |
| **D · 模型管理** | MD-01 双 store 同步 | T05 |
| | MD-02 模型管理 UI 对齐 | T05 |
| | MD-03 usage 统计独立 Tab | T05 |

## 附录 B：关联文档

- `docs/design/class-diagram-pages-data-alignment.mermaid` — 数据结构与接口类图
- `docs/design/sequence-diagram-pages-data-alignment.mermaid` — 4 张调用流程时序图
