# 已完成变更记录

> 测试通过后，由 changing-log.md 迁移至此。

## C-2026-07-30-M1 · M1 聊天闭环（实现 + 验证）
- 类型：里程碑 M1（F1-F3）新增
- 范围：脚手架 + 服务端 + 客户端 + 验证脚本，全部首次落地
- 变更集：
  - 根：`package.json`(workspaces) / `tsconfig.base.json`
  - server：`src/index.ts`(Koa+Socket.IO+静态托管) / `src/protocol.ts`(事件契约) / `src/db.ts`(sqlite+内存兜底持久层) / `src/bridge.ts`(Mock+Real TCP Bridge) / `src/run-chat.ts`(/chat-run 编排) / `src/routes/sessions.ts`(REST 子集) / `src/services/hermes/bridge/bridge_server.py`(Python 真实接入骨架) / `package.json` / `tsconfig.json`
  - client：`src/main.ts`/`router`/`types/chat.ts`/`api/client.ts`/`api/hermes/chat.ts`/`stores/chat.ts`(纯 reducer + 暴露 dispatch) / `styles/*` / `App.vue`/`views/ChatView.vue` / `components/chat/*` / `package.json`/`vite.config.ts`/`tsconfig.json`/`vitest.config.ts`/`src/stores/chat.test.ts`
  - `scripts/smoke-chat.mjs`（聊天闭环烟雾测试）
- 验证结果（Phase 4）：
  - ✅ `scripts/smoke-chat.mjs`：run.started→tool.started→usage.updated→message.delta→run.completed 全链路 PASS（Mock 模式）
  - ✅ Vitest：`src/stores/chat.test.ts` 12/12 PASS（reducer 状态机）
  - ✅ 客户端：`vue-tsc --noEmit` + `vite build` PASS，产出 `packages/client/dist/`
  - ✅ 服务端：`tsc --noEmit` PASS
  - ✅ 生产 server 托管 `client/dist`，`GET /` 返回 SPA、assets 200
- 环境校正（本次发现，已落地）：
  1. `koa-static` 无 5.0.1，修正为 `^5.0.0`
  2. 本地 NekoBox 为 TUN 代理会拦截 `127.0.0.1`；smoke 脚本与 vite proxy 全部改用 `localhost`(→::1) 绕过
  3. 沙箱拦截 better-sqlite3/esbuild 安装脚本：`db.ts` 已内置内存 Map 兜底；esbuild 平台包随 optionalDependency 安装故 vite build 可用
  4. Vitest 写 `node_modules/.vite/vitest/results.json` 报 EPERM → `vitest.config.ts` 设 `cache:false`
  5. client `tsconfig.json` 缺 `baseUrl` 导致 `paths` 报错 → 补 `baseUrl: "."`
- 遗留/待办：
  - 未 `git init`，故未做原子提交（需用户确认是否初始化仓库）
  - Playwright E2E 未安装（Vitest + smoke 已覆盖闭环逻辑，E2E 可延后到 M2）
  - 真实 hermes-agent 链路（`HERMES_BRIDGE_MOCK=0`）待手动验收

## C-2026-07-30-M2 · M2 主界面完整版（F4/F5/F6/F7/F10）
- 类型：里程碑 M2（权限/澄清/计划卡片 + 会话管理完整 + Artifact 预览）新增
- 范围：在 M1 骨架上补齐交互卡片、会话 CRUD、Artifact 预览
- 变更集：
  - server：`src/protocol.ts`（新增 plan/artifact 事件 + PlanChoice/Artifact 类型 + BridgeEvent plan/artifact）`src/bridge.ts`（MockBridge 放出 F4/F5/F6/F10 脚本流 + respondApproval/Clarify/Plan；RealBridge 经 TCP 转发 respond）`src/run-chat.ts`（翻译 plan/artifact 事件 + plan.respond 转发）`src/db.ts`（新增 deleteSession，sqlite+内存一致）`src/routes/sessions.ts`（新增 DELETE /api/sessions/:id）
  - client：`src/types/chat.ts`（PlanChoice/PlanRequest/Artifact）`src/stores/chat.ts`（pendingPlans/artifactsBySession reducer + respondPlan/deleteSession/renameSession）`src/api/hermes/chat.ts`（respondPlan）`components/chat/PlanCard.vue`(新增) `SessionList.vue`(改名/删除) `ArtifactPanel.vue`(真实预览 markdown/code/text/image) `MessageItem.vue`(渲染 PlanCard)
  - `scripts/smoke-chat.mjs`（断言 plan/approval/clarify/artifact 事件）`src/stores/chat.test.ts`（+4 例：plan/artifact/deleteSession/renameSession）
  - `docs/design/{REQUIREMENT,TECHNICAL-SOLUTION,TEST-PLAN}-M2.md`
- 验证结果（Phase 4）：
  - ✅ `scripts/smoke-chat.mjs`：单轮收到 run.started / plan.requested / approval.requested / clarify.requested / artifact.created / message.delta / run.completed 全链路 PASS（Mock 模式）
  - ✅ Vitest：`src/stores/chat.test.ts` 16/16 PASS（M1 12 + M2 4）
  - ✅ 客户端：`vue-tsc --noEmit` + `vite build` PASS，产出 `packages/client/dist/`
  - ✅ 服务端：`tsc --noEmit` PASS
  - ✅ 生产 server 托管新 `client/dist`（index.html 引用新 asset hash）
- 环境校正（M2 新增）：
  1. vite 构建清空 `dist` 被本地「安全删除」垫片拦截（rm→回收站，回收站失败）→ `vite.config.ts` 的 `emptyOutDir` 改由 `KMASTER_NO_EMPTY_DIST=1` 关闭，本沙箱构建带该变量
  2. 旧 M1 server 进程仍占 6648 致新实例 EADDRINUSE → PowerShell 强杀占用进程后重启
- 遗留/待办：
  - 真实 hermes-agent 链路（`HERMES_BRIDGE_MOCK=0` + bridge_server.py）待手动验收（respond 的 TCP 转发已接，但未在真链路跑通）
  - Playwright E2E 仍未安装（Vitest + smoke 已覆盖卡片状态机与闭环）

## C-2026-07-31-M3 · M3 模式/模型/技能/MCP/上传（F8/F9/F11/F12/F19）
- 类型：里程碑 M3 新增（增量于 M2）
- 范围：聊天输入区能力扩展（模式三态映射 hermes 审批策略 / 模型动态枚举 / 技能抽屉 / MCP 管理 / 文件上传 @路径注入）
- 变更集：
  - 设计：`docs/design/REQUIREMENT-M3.md`、`docs/design/TECHNICAL-SOLUTION-M3.md`
  - server：`src/protocol.ts`(ChatMode/HermesMode/CHAT_MODES/ModelInfo/ProviderGroup/Skill/McpServer/UploadRef/Settings；StartRunRequest.mode?；ChatOptions.mode?)、`src/bridge.ts`(ChatOptions.mode?；RealBridge.chat 透传 mode；MockBridge 回显 mode)、`src/db.ts`(SessionRow 增 mode?/model?；新增 settings 表 + getSetting/setSetting；setSessionModeModel；getOrCreateSession 继承默认)、`src/run-chat.ts`(解析有效 mode/model：req>session>全局默认；持久化)、`src/hermes-proxy.ts`(新增：getModels/getSkills 经 Python subprocess + 静态 fallback 5min TTL；listMcp/addMcp/removeMcp 读写 ~/.hermes/config.yaml.mcp_servers；getSettings/setSettings)、`src/routes/sessions.ts`(新增 REST：GET /api/models,/api/skills,/api/mcp；POST/DELETE /api/mcp；POST /api/upload；GET/PUT /api/settings；PATCH /api/sessions/:id 支持 mode/model)、`package.json`(新增 js-yaml + @types/js-yaml)
  - client：`src/types/chat.ts`(对齐 CHAT_MODES/类型)、`src/api/client.ts`(getModels/getSkills/getMcp/postMcp/deleteMcp/uploadFile/getSettings/putSettings)、`src/api/hermes/chat.ts`(startRun 透传 mode?/model?；invokeSkill=sendMessage('/skill '+name))、`src/stores/chat.ts`(globalSettings/modeBySession/modelBySession/models/skills/mcpServers/uploads + 动作；sendMessage 携带 mode/model + 追加 @<path>)、`components/chat/ChatInput.vue`(底部工具栏：模式/模型/技能/@文件 + 设置齿轮 + 附件 chip)、`components/chat/SkillPanel.vue`(新增)、`components/chat/McpManager.vue`(新增)、`components/chat/SettingsDrawer.vue`(新增)、`ChatView.vue`(挂载三个抽屉)、`MessageItem.vue`(解析 @<path> 为可点击 chip)、`stores/chat.test.ts`(+7 例 M3)
  - `scripts/smoke-chat.mjs`(断言 run 携带 mode/model 被服务端接受)、`scripts/qa-verify-m3.mjs`(新增：单脚本 REST 全量验收)
- 验证结果（独立 QA 验收，凭据 .dev/QA-M3-REPORT.md）：
  - ✅ REST 20/20 PASS：health/models/skills/mcp/settings/settings(PUT)/upload/mcp(POST+DELETE)
  - ✅ upload 真实落盘 `AppData\Local\kmaster\uploads\qa-verify\qa.txt`，内容精确
  - ✅ settings roundtrip 一致；PATCH /api/sessions/:id 每会话 mode/model 落库回读正确
  - ✅ MCP 增删后 ~/.hermes/config.yaml 全等还原（备份/还原保护 + 事后独立复核）
  - ✅ `scripts/smoke-chat.mjs` PASS（mode=dont_ask/model=gpt-4o 被服务端接受）
  - ✅ server `tsc --noEmit` 0 错误
  - ✅ client `vitest run` 23/23 PASS（M1 12 + M2 4 + M3 7）
  - ✅ client `vue-tsc --noEmit` 0 错误；`vite build` 干净（gzip 524.94 kB）
  - ✅ 额外加测：目录穿越防护（path.basename 归一）、入参校验（缺字段 400）、F8/F9 每会话覆盖
- 环境校正（M3 新增）：
  1. 上传落点优先 env `KMASTER_HOME`（本机=AppData\Local\kmaster），遵循设计文档 env 优先原则
  2. REST 契约以设计文档为准：`PUT /api/settings`、`upload` 字段 {session_id, filename, content_base64}（非 POST/sessionId/content）
  3. QA 验收须走 `localhost`（非 127.0.0.1）避开 NekoBox TUN 401；设 `NO_PROXY=localhost,127.0.0.1`
- 遗留/待办：
  - 真实 hermes-agent 链路（`HERMES_BRIDGE_MOCK=0`）待手动验收
  - Playwright E2E 仍未安装
  - M4（#8：F13/F15/F16/F17/F18/F22）、M5（#6：F20/F21/Electron）待启动

## C-2026-07-31-M4 · M4 记忆/自动化/子代理/队列/压缩/用量（F13/F15/F16/F17/F18/F22）
- 类型：里程碑 M4 新增（增量于 M3）
- 范围：服务端新增 memory/cron/queue/usage 持久层与 REST；客户端新增 Memory/Jobs/Queue/Usage 视图 + 子代理卡片 + 顶部导航
- 变更集（37 文件：13 修改 + 24 新增）：
  - 设计：`docs/design/REQUIREMENT-M4.md`、`docs/design/TECHNICAL-SOLUTION-M4.md`
  - server：`src/protocol.ts`（MemoryEntry/CronJob/QueueItem/UsageStat/ContextEstimate + 扩展 BridgeEvent/ServerToClientEvents：subagent.start/tool/text/thinking/progress/complete、delegation.updated、compression.started/completed、run.queued、queue.updated）、`src/bridge.ts`（MockBridge 合成 2 并行子代理序列 + compression 序列 + contextEstimate()）、`src/db.ts`（新增 queue/usage 两表 + 9 方法 + reduceUsage 共享聚合器 + KMASTER_DB=memory 逃生阀）、`src/hermes-proxy.ts`（resolveHermesHome 修复 M3 目录 bug + memory 适配层 id=group:sha1[:8] + cron CLI 包装 + ProxyError）、`src/run-chat.ts`（executeRun 抽取 + 队列编排 + usage.updated 落库 + subagent/compression 转译）、`src/index.ts`（注册 4 新 router）、`src/routes/sessions.ts`（新增 GET /api/sessions/:id/context-length）
  - server 新增 routes：`src/routes/error.ts`（统一 failWith/badRequest/notFound）、`memory.ts`、`jobs.ts`、`queue.ts`、`usage.ts`
  - client：`src/App.vue`（挂 router-view + AppNav）、`src/router/index.ts`（4 新路由）、`src/types/chat.ts`（14 共享类型 + WS_EVENTS 注册表）、`src/api/client.ts`（memory/jobs/queue/usage/context-length REST 封装）、`src/stores/chat.ts`（+9 事件 reducer）、`src/stores/chat.test.ts`（+29 → 共 29）
  - client 新增：`components/AppNav.vue`、`components/chat/SubagentCard.vue`、`views/{MemoryView,JobsView,QueueView,UsageView}.vue`、`stores/{jobs,memory,usage}.ts`、`stores/{jobs,memory,usage}.test.ts`
  - `scripts/qa-verify-m4.mjs`（单脚本 61 项验收）、`scripts/qa-probe-m4.mjs`、`scripts/qa-probe-db.mjs`（独立 QA 探针）
- 验证结果（独立 QA 验收，凭据 .dev/QA-M4-REPORT.md 与 .dev/QA-M4-INDEPENDENT-REPORT.md）：
  - ✅ server `tsc --noEmit` 0 错误
  - ✅ client `vitest run` 57/57 PASS（jobs 10 / memory 8 / chat 29 / usage 10）
  - ✅ client `vue-tsc --noEmit` 0 错误；`vite build` 经全新目录证伪 EPERM 为环境噪声（12/12 产物哈希一致）
  - ✅ `scripts/qa-verify-m4.mjs` 61/61 PASS（AC0–AC8 全达标），独立 QA 自建实例完全复现
  - ✅ 独立探针 `qa-probe-m4.mjs` 21/21 与报告零偏差（13 端点 + 8 结构/还原性断言），反作弊证据链确认无缓存/硬编码
  - ✅ 修复 M3 遗留缺陷：F12 MCP 写死 `~/.hermes` 致 Windows 读错目录 → `resolveHermesHome()` 改为 `HERMES_HOME`→win32 `%LOCALAPPDATA%/hermes`→`~/.hermes`
  - ✅ 修复 3 项真实缺陷：cron CLI 失败静默 / run 同步超时 / activeRuns 残留
- 环境校正（M4 新增）：
  1. `better-sqlite3` 原生绑定在本沙箱未编译 → `db.ts` 静默回退内存实现（KMASTER_DB=memory 逃生阀）；sqlite 落盘分支零覆盖（见遗留 P1）
  2. QA 验收须走 `localhost` + `NO_PROXY=localhost,127.0.0.1`，server 起停前后释放 6648
- 遗留/待办（独立 QA 非阻塞跟进，路由 NoOne 不打回）：
  - **P1**：补真实 sqlite 验收实跑（`npm rebuild better-sqlite3`），消 F17/F22 落盘零覆盖；持久层降级加显式 WARN + `/api/health` 暴露 storage 模式
  - **P2**：`hermes-proxy.ts:976-984` 修正 agent 模式 cron 历史 status/job_name 解析（标题 `(FAILED)` / `## Error` → `status=failed`，剥离后缀）；同步修订 `TECHNICAL-SOLUTION-M4.md:44`
  - **P2**：`scripts/qa-verify-m4.mjs` real cron 模式补 output 目录清理 + 历史轮询断言（或统一 `KMASTER_CRON_MOCK=1`）
  - M5（#6：F20/F21/Electron）待启动

## C-2026-07-31-PORT · 默认端口迁移（8648/8649/18765 → 6648/6649/16765）
- 类型：配置变更（避让 hermes-studio 端口占用）
- 范围：全仓端口常量 + 历史文档端口引用统一
- 提交：`5e13ecc`（代码/脚本，17 文件 31+/31-）、`5e03ee1`（.dev 历史文档，4 文件 9+/9-）
- 变更集：
  - server：`src/index.ts`(PORT 默认 6648)、`src/hermes-proxy.ts`(health.port)、`src/bridge.ts`(RealBridge 端点默认 `tcp://127.0.0.1:16765`)
  - client：`vite.config.ts`(dev server 6649；`/api` 与 `/socket.io` 代理指向 `localhost:6648`)
  - scripts：`smoke-chat.mjs` / `qa-verify-m3.mjs` / `qa-verify-m4.mjs` 默认端口同步
  - `5e03ee1` 回填 `.dev/QA-M4-REPORT.md`、`.dev/changed-log.md` 中的历史 8648 引用
- **现行端口约定（长期事实，后续所有文档/脚本以此为准）**：
  | 用途 | 端口 | 出处 |
  |------|------|------|
  | kmaster-server（REST + Socket.IO） | **6648** | `packages/server/src/index.ts` `PORT ?? 6648` |
  | client dev server（Vite） | **6649** | `packages/client/vite.config.ts` `server.port` |
  | kmaster-bridge TCP（外部 Python bridge） | **16765** | `packages/server/src/bridge.ts` `HERMES_AGENT_BRIDGE_ENDPOINT` |
- 验证结果：全仓 grep 确认无 8648/8649/18765 残留；smoke/QA 脚本按新端口跑通

## C-2026-08-01-M5 · M5 内置终端 / 设置页 / Electron 桌面壳（F20/F21）
- 类型：里程碑 M5 新增（增量于 M4）
- 范围：F20 内置终端（node-pty + xterm）、F21 设置页（两级 HERMES_HOME + profile 切换 + provider Key）、Electron 薄壳（server 进程宿主 + 生命周期）、三平台打包与发布 CI
- 提交（10 个，2026-07-31 ~ 2026-08-01）：
  | 提交 | 内容 | 规模 |
  |------|------|------|
  | `72aa231` | T1 基础设施：依赖 / 终端协议类型 / desktop 骨架 / sqlite 兜底 | 16 文件 1840+ |
  | `558189c` | T1 fix：移除 desktop main/preload 的 `@ts-nocheck`，修 10 处真实类型错误 | — |
  | `5ab14b1` | T2 F20 内置终端：node-pty manager / `/terminal` 命名空间 / xterm 面板 / ArtifactPanel 页签 | 7 文件 1699+ |
  | `4213577` | docs：`REQUIREMENT-M5.md` + `TECHNICAL-SOLUTION-M5.md` | — |
  | `0aed807` | **errata 4.1.1**（见下） | 1 文件 20+ |
  | `d8f3926` | T3 F21 设置页：两级 HERMES_HOME / profile 切换 / provider Key | 14 文件 1785+ |
  | `beca80c` | **errata 4.1.0**（见下） | 1 文件 13+ |
  | `8b5a864` | T4 Electron 壳：server 进程宿主 / 端口复用 / 生命周期清理 / 窗口状态 | 3 文件 639+ |
  | `96ef58c` | T5-A：WorkBuddy 差异文档（AC9）+ release CI 矩阵 + README 桌面指南 | — |
  | `ff52b63` | T5-B：electron-builder 配置（三平台）+ 应用图标 | — |
  | `a57d84e` | QA：`scripts/qa-verify-m5.mjs`（44/47）+ QA 报告 | — |
- 变更集：
  - server 新增：`src/services/terminal.ts`（node-pty 管理器）、`src/terminal-ns.ts`（`/terminal` Socket.IO 命名空间）、`src/routes/config.ts`（providers/profiles REST）
  - client 新增：`src/api/terminal.ts`、`src/stores/terminal.ts`、`components/preview/TerminalPane.vue`、`views/SettingsView.vue`、`components/settings/{GeneralSection,ProviderSection,ProfileSection,DiagnosticsSection}.vue`、`src/utils/desktop-bridge.ts`
  - desktop 新增（新 workspace `packages/desktop`）：`src/main/{index,server-process,updater,window-state}.ts`、`src/main/loading.html`、`src/preload/index.ts`、`electron-builder.yml`、`build/icon.{ico,icns,png}`、`scripts/{copy-assets,generate-icons,verify-server-process}`
  - 设计：`docs/design/{REQUIREMENT-M5,TECHNICAL-SOLUTION-M5,M5-VS-WORKBUDDY-DIFF}.md`
  - 根 `package.json`：workspaces 纳入 `packages/desktop`，新增 `dev:desktop` / `build:desktop` / `dist:{win,mac,linux}` 脚本
- **M5 两份勘误（实现期裁定，结论为长期约束）**：
  1. **errata 4.1.0（`beca80c`，T3 期）— 「重启 Bridge 子进程」在本仓库不存在**
     - kmaster-server **从不 spawn Bridge 子进程**：`MockBridge`（默认，`HERMES_BRIDGE_MOCK !== '0'`）完全进程内；`RealBridge` 是连外部 Python bridge 的 TCP 客户端，且**每次 `chat()` 现连现用**，构造时不建连。
     - 故设计文档 §0.2.1 ② 的等价落地是 `run-chat.ts` 的 `restartBridge()`（丢弃旧实例、重建客户端），外部 bridge 进程仍需用户自行重启 —— 这正是 `PUT /api/profiles/active` 返回 `restart_required: true` 的语义（诚实告知，不假装已完成）。
     - 同时记录两个**先于 M5 存在**的 RealBridge 隐患：① `chat()` 在 `completed` 后未 `sock.destroy()` 会累积半开 socket；② 默认端点写死 `tcp://127.0.0.1:16765`，本机 NekoBox TUN 会拦截裸 TCP，改 `localhost` 需先确认 Python bridge 实际 bind 地址，**不可盲改**。
     - ⚠️ 隐患①**已在 `2c208de`（kmaster-bridge 并发加固）修复**（`chat()` 内 `release()` + `finally` 幂等释放），但 errata 原文未回写「已修复」，见 C-2026-08-05-BACKFILL 遗留项。隐患②**至今仍在**。
  2. **errata 4.1.1（`0aed807`，T4 期）— Electron 壳不得自行计算 `HERMES_HOME`**
     - `HERMES_HOME` 的解析权**唯一归 server 的 `hermes-proxy.ts`**，Electron 壳只透传 `process.env`。
     - 根因：`HERMES_HOME` 在 server 语义中是**「根」而非「激活目录」**。壳若注入 `resolveActiveHermesHome()` 的结果（`root/profiles/<name>`）会触发双层嵌套塌方 —— `listProfiles()` 扫空、`active_profile` 写歪，桌面壳内 F21 profile 功能**整体报废且静默无报错**。
     - 约束：壳的 spawn 只做 `{ ...process.env, ELECTRON_RUN_AS_NODE:'1', PORT:'6648', …extraEnv }`；`extraEnv` 若确需注入 `HERMES_HOME`，**只允许 root 级路径**；`server-process.ts` spawn 处须保留反向注释防后人「修回去」。
- 验证结果（凭据 `.dev/QA-M5-REPORT.md`）：
  - ✅ `scripts/qa-verify-m5.mjs` 47 项 / 44 PASS / 3 FAIL，AC0–AC9 覆盖
  - ✅ AC2/AC3 终端：`term.opened` 携带 term_id/shell/cwd/pid；echo 回显 31ms（< 500ms 门槛）；`term.close → term.exit` 后 pty 进程已从系统进程表消失（无孤儿）
  - ✅ AC4 node-pty 降级：`terminal_available=false` + `node_pty_error` 暴露，其余 REST 不受影响，连 `/terminal` 收到 `code=pty_unavailable`
  - ✅ AC6 端口复用不误杀 + 进程树级联清理断言齐备
  - ✅ AC7 F21：`/api/health` 含 version/bridge_mock/hermes_home/terminal_available/db_kind；Provider DTO **不含明文 Key**（🔒 NFR-M5-5，仅 masked/configured）；profiles/settings roundtrip 正常
  - ⚠️ 3 项 FAIL 均为 `spawn EINVAL`（QA 脚本在本沙箱内无法 spawn 子进程执行 client 单测 / server tsc / client vue-tsc），**属环境噪声而非产品缺陷**；三项已于 2026-08-05 由工程师在宿主环境独立复验通过（见 C-2026-08-05-BACKFILL）
- 环境校正（M5 新增）：
  1. `better-sqlite3` 在本沙箱未编译时 `db.ts` 静默回退内存实现；QA 实测 `db_kind=sqlite`（宿主环境可用）
  2. QA 验收须走 `localhost` + `NO_PROXY=localhost,127.0.0.1`
- 遗留/待办：
  - AC5 Electron 壳 15 项为**人工验收**清单，GUI 面不可自动化
  - errata 4.1.0 隐患② （RealBridge 端点 TUN 拦截）未解

## C-2026-08-01-WB-R1R4 · WorkBuddy 对标补齐轮次 R1~R4 + Web 部署模式
- 类型：UI/交互对标补齐（增量于 M5）
- ⚠️ **编号歧义警示（重要，勿混淆）**：本批次提交信息中的 "V1/V2/V3/V4" 指**「WorkBuddy 对标补齐轮次」**，本索引统一记为 **R1~R4**；与 2026-08-04 的 **「UI 重设计 V1/V2/V3」**（见 C-2026-08-04-UI-V1V3）是**两套完全独立的编号体系**，二者无继承关系。阅读 git log 时务必按日期区分：**08-01 = 对标轮次 R1~R4；08-04 = UI 重设计 V1~V3**。
- 范围：以 WorkBuddy 桌面端为基准做 41 项差距补齐，分四轮推进，最终对齐度 > 95%
- 提交（9 个，均 2026-08-01）：
  | 提交 | 轮次 | 内容 | 规模 |
  |------|------|------|------|
  | `6edaff7` | 基线 | 差异分析报告：41 gaps（P0 4 人日 / P1 7 人日 / P2 6 人日） | — |
  | `39059c4` | **R1**（P0） | SubagentCard / 压缩 / 搜索 / 滚动 / 流式 / 时间戳 / 对比度 / 复制 / 上下文 / loading | 6 文件 339+ |
  | `ad1478b` | **R2**（P1） | 复制 / 编辑重发 / 面板缩放 / header 模式 / HTML 预览 / 错误态 / 动效 / 导出 / 主题平滑 | 11 文件 617+ |
  | `22dc545` | 复查 | 差异复查 V2：26/26 验证到位，7 项剩余差距，对齐度 92% | — |
  | `77d6715` | **R3** | 工作区绑定 / 系统托盘 / 面板折叠 / 键盘快捷键 / 右键菜单 / 无障碍 / 文件树 | 18 文件 1005+ |
  | `5908f85` | R3 补 | 系统托盘接线：hide-on-close / before-quit / quit 时 destroy | — |
  | `6866344` | **R4** | flex 预览 / 全文搜索 / 代码复制 / diff 视图 / 拖拽排序 / 消息右键菜单 / i18n 骨架 | 13 文件 661+ |
  | `bcda815` | 结论 | 最终对比报告：UI/交互/功能 **> 95% 对齐** | — |
  | `8ac926b` | 配套 | 明确 Web 部署模式：web-first 架构 / 双模式对等 / 局域网部署指南（README +40 行） | 1 文件 |
- 变更集（关键新增）：
  - client：`components/preview/FileTreePane.vue`、`composables/useKeyboard.ts`（R3）；`composables/useI18n.ts`、`locales/{zh-CN,en}.ts`（R4 i18n 骨架）
  - server：`src/routes/sessions.ts` 两轮扩展（R2 +50 行 / R3 +46 行）
  - 设计：`docs/design/{KMASTER-VS-WORKBUDDY-UI-GAPS,KMASTER-VS-WORKBUDDY-UI-GAPS-V2,KMASTER-VS-WORKBUDDY-FINAL}.md`
- 验证结果：
  - ✅ R2 复查 26/26 验证到位（`22dc545`），对齐度 92%
  - ✅ R4 后最终对比 `bcda815` 判定 **> 95% 对齐**，7 项剩余差距转后续排期
- 遗留/待办：
  - i18n 为**手写轻量骨架**（`useI18n.ts` = reactive + localStorage），**未引入 vue-i18n**，且 `main.ts` 未挂载任何 i18n 插件，仅 4 个组件调用 `t()`；与 `.dev/README.md` 技术架构中「vue-i18n」的表述不符（见 C-2026-08-05-BACKFILL 遗留项）

## C-2026-08-03-BRIDGE · kmaster-bridge 完整实现 + M1/M2/M3 并发加固
- 类型：功能新增（Python 侧真实 Agent 接入层）
- 范围：`packages/server/src/services/hermes/bridge/` 由单文件骨架扩为 8 模块完整 bridge；协议扩展 MCP/技能/模型切换/后台委派/压缩；并发加固（连接池 / 文件锁 / broker）
- 提交（2 个，均 2026-08-03）：
  | 提交 | 内容 | 规模 |
  |------|------|------|
  | `2c208de` | kmaster-bridge 完整实现 + M1/M2/M3 并发加固 | 21 文件 7684+/179- |
  | `a0c8f4b` | M2：MCP / 技能 / 模型切换 / 后台委派 / 压缩 + 文件锁 | 7 文件 1380+/17- |
- 变更集：
  - Python bridge 新增 7 模块：`bridge_broker.py`(424)、`bridge_gateway.py`(668→+199)、`bridge_pool.py`(1835)、`bridge_protocol.py`(345→+77)、`bridge_runtime.py`(891)、`bridge_transport.py`(413)、`kmaster_bridge.py`(86)；`bridge_server.py` 重写扩容（763+ → +124）；新增 `README.md`
  - server（TS）：`src/bridge.ts`（+120，RealBridge 按 sessionId 路由连接表 `socks: Map`，替代原单例 `sock`；行缓冲下沉为 `chat()` 局部变量；TCP keepalive 30s）、`src/protocol.ts`(+35→+7)、`src/index.ts`(+17)、`package.json`
  - client：`components/chat/MessageList.vue`(+52)、`stores/chat.ts`(+62)
  - 测试：`packages/server/test_bridge.mjs`（331 行 → +120）
  - 设计：`docs/design/{REQUIREMENT-kmaster-bridge,TECHNICAL-SOLUTION-kmaster-bridge,REQUIREMENT-kmaster-bridge-m2,TECHNICAL-SOLUTION-kmaster-bridge-m2,CONCURRENCY-DESKTOP-WEB}.md`、`docs/design/{class-diagram,sequence-diagram}.mermaid`
- 关键设计决策：
  - **并发安全**：原单例 `this.sock` 在并发会话下会把 interrupt/steer/审批一律发往「最后建连的会话」→ 改为按 `sessionId` 路由的连接表；行缓冲共享会互相截断半行 JSON → 下沉为 run 级局部变量
  - **连接释放**：`chat()` 内 `release()` 幂等摘表 + `finally` 兜底，杜绝 Map 泄漏与串台（**顺带修掉 M5 errata 4.1.0 记录的隐患①**）
  - **文件锁**（`a0c8f4b`）：桌面/Web 双模式并发写 hermes 用户数据的互斥，详见 `CONCURRENCY-DESKTOP-WEB.md`
- 验证结果：`packages/server/test_bridge.mjs` 覆盖 M1/M2 协议往返
- 遗留/待办：
  - `docs/design/{class-diagram,sequence-diagram}.mermaid` 命名**无后缀**（其余图表均带 `-ui-v2` / `-ui-v3` 等后缀），实际归属 kmaster-bridge，易被误读为全局类图/时序图
  - `packages/server/src/services/hermes/bridge/__pycache__/` 未纳入 `.gitignore`

## C-2026-08-04-UI-V1V3 · kmaster-studio UI 重设计 V1 / V2 / V3
- 类型：项目升级（前端整体重构为全屏沉浸式 Agent 工作站）
- ⚠️ **编号歧义警示**：此处 **UI V1/V2/V3** 与 2026-08-01 的 **对标轮次 R1~R4**（见 C-2026-08-01-WB-R1R4）**不是同一套编号**，互不继承。
- 范围：三栏框架 + 左栏双态导航 + 设置分导航路由化 + 卡片市场 + 弹窗体系 + 定时任务联动
- 提交（6 个，均 2026-08-04）：
  | 提交 | 轮次 | 内容 | 规模 |
  |------|------|------|------|
  | `1218e64` | **UI V1** | UI 全面重设计 — 全屏沉浸式 Agent 工作站 | 32 文件 5577+/622- |
  | `5b417ec` | **UI V2** | 新建任务弹窗 + 卡片市场 + 详情页 + 设置覆盖 + 右栏避让 | 25 文件 5319+/661- |
  | `77bfc9c` | **UI V3**(p1) | 设置分导航 + 左栏双态 + 路由化 | — |
  | `03c6fb7` | **UI V3** | 三栏框架 + 左栏导航 + 设置分导航 + 各详情页 | 14 文件 349+/49- |
  | `8754d8e` | UI V3 补 | 收口 JobsView/MemoryView 未提交改动 | — |
  | `27b7783` | **UI V3**(p2) | 弹窗体系 + 定时任务联动 + 全链路 | 3 文件 127+/34- |
- 变更集：
  - **UI V1 新增（21 文件 4619+）**：`components/layout/{LayoutShell,LeftSidebar}.vue`、`components/chat/{ChatHeader,ContextRing,OutputPanel,ShareDialog}.vue`、`components/settings/{AgentRoleSection,ModelManageSection,MonitorSection,ToolsSection}.vue`、`composables/{useMcpList,useSessionList,useSkillList}.ts`、`types/agent.ts`、`views/{ExpertsView,McpView,SkillsView}.vue`
  - **UI V2 新增（16 文件 4535+）**：`components/dialog/NewTaskDialog.vue`、`components/market/{CardMarketLayout,EntityCard,ExpertDetail,McpDetail,SkillDetail,TeamDetail}.vue`、`composables/useDomainTags.ts`、`types/{market,newTask}.ts`
  - **UI V3 新增（34 文件 10051+）**：`components/dialog/{AddModelDialog,LogDetailDialog,MemberDetailDialog,ResultDialog,SchemaDialog}.vue`、`components/layout/{PageHeader,ResizeHandle,RightPanel,SettingsNav,StatusBar}.vue`、`components/market/InstalledCard.vue`、`components/settings/{AgentRoleDetail,ExpertPickerPanel,LogSection,McpManageSection,PlaceholderSection,SkillManageSection}.vue`、`constants/{layout,providers}.ts`、`stores/{agentRoles,layout,logs,modelConfig,status}.ts` + 同名 `.test.ts`、`types/settings.ts`
  - **删除**：`components/chat/ChatHeader.vue`（`77bfc9c` 删除，职责并入 `layout/PageHeader.vue`）
  - 设计文档：UI V1 `docs/design/{REQUIREMENT-ui-redesign,TECHNICAL-SOLUTION-ui-redesign}.md` + `{class,sequence}-diagram-ui-redesign.mermaid`；UI V2 `docs/design/{REQUIREMENT-ui-v2,TECHNICAL-SOLUTION-ui-v2}.md` + `class-diagram-ui-v2.mermaid` + `sequence-diagram-{new-task,market-detail,settings-overlay}.mermaid`；UI V3 原置于 `packages/client/docs/`，已由 C-2026-08-05-BACKFILL 迁入 `docs/design/`
- 关键设计决策（UI V3，摘自 `TECHNICAL-SOLUTION-ui-v3.md`）：
  - 不引入任何新框架：沿用 Vue 3.5 + TS 5.7 + Naive UI 2.41 + Pinia 2.3 + vue-router 4.5 + Vite 5
  - 三栏布局由 shell 层 **CSS Grid** 承载；拖拽 resize 用**原生 mouse 事件**抽成 `ResizeHandle.vue`，不引 `splitpanes`
  - 设置子路由 `settings/:category` 实现 URL 直达 + 前进后退（R-38）
  - 新增样式**禁止硬编码色值**，一律走 `--km-*` 双主题变量
  - 日志/产物文件读取扩展 `utils/desktop-bridge.ts`（Electron preload 契约），**零新增后端路由**；Web 环境静默降级为 mock + 空态
- 验证结果（2026-08-05 由工程师在宿主环境独立复验）：
  - ✅ HEAD = `27b7783`，工作树干净
  - ✅ `vue-tsc --noEmit` **0 错误**
  - ✅ `vitest run` **139/139 全通过**（9 文件：chat 35 / modelConfig 20 / layout 17 / logs 15 / agentRoles 15 / jobs 10 / usage 10 / status 9 / memory 8）
- 遗留/待办：
  - 8 份 UI 设计文档（ui-redesign / ui-v2 / ui-v3 三套）仍将 `ChatHeader` 描述为在世组件，实际已删除（见 C-2026-08-05-BACKFILL 遗留项）

## C-2026-08-05-BACKFILL · DDD 索引欠账回填（Scenario F）+ 统一 UI V3 文档位置
- 类型：Backlog Remediation（DDD 场景 F）—— 历史变更已提交但未进入索引，补齐 DDD 文档
- 背景：索引自 M4（2026-07-31）后冻结，其后 **22 个提交、13 份设计文档**全部未入索引；对 `.dev/*.md` grep `ui-v2|ui-v3|bridge-m2|CONCURRENCY` 命中数为 **0**。为即将开展的 hermes-native 架构升级（DDD 场景 B）恢复「文档-逻辑一致性」硬前置基线。
- 范围：**纯文档/索引维护，零源码逻辑变更**
- 变更集：
  1. **UI V3 文档归位**（`git mv`，4 文件）—— 对齐 V1/V2 既有命名约定：
     | 原路径 | 新路径 |
     |--------|--------|
     | `packages/client/docs/ui-v3-prd.md` | `docs/design/REQUIREMENT-ui-v3.md` |
     | `packages/client/docs/ui-v3-design.md` | `docs/design/TECHNICAL-SOLUTION-ui-v3.md` |
     | `packages/client/docs/class-diagram.mermaid` | `docs/design/class-diagram-ui-v3.mermaid` |
     | `packages/client/docs/component-contract.mermaid` | `docs/design/component-contract-ui-v3.mermaid` |
     - 同步修正 **3 处**跨文档引用（`TECHNICAL-SOLUTION-ui-v3.md` 头部输入声明、两份 `.mermaid` 的「来源」注释）
     - `packages/client/docs/` 迁空后已删除
  2. **五大索引回填**：`changed-log.md`（+6 条变更记录，覆盖端口迁移 / M5 / 对标 R1~R4 / kmaster-bridge / UI V1~V3 / 本次回填）、`docs-index.md`（收录 `docs/design/` 全 37 份 + `.dev/QA-M5-REPORT.md`）、`project-dir-file-index.md`（按实扫结果重建目录树，补 `packages/desktop/`、Python bridge 8 模块、client 三轮 UI 新增）、`project-dev-status.md`（阶段刷新至 UI V3 已交付 + 累计环境校正）、`changing-log.md`（登记后迁移）
- 验证结果：
  - ✅ `vue-tsc --noEmit` → **TSC_EXIT=0**（宿主环境，`C:/Users/towyq/.workbuddy/binaries/node/versions/22.22.2/node.exe`）
  - ✅ `vitest run` → **139/139 PASS**（9 文件）
  - ✅ 全仓 grep 旧路径（`packages/client/docs` / `ui-v3-prd` / `ui-v3-design`）在受控范围内 **0 残留**
  - ✅ 未改动任何 `packages/**` 源码逻辑（`.vue`/`.ts`/`.py` 零改动）
- **回填期发现的文档-代码不一致（仅记录，不擅自改代码）**：
  1. **`ChatHeader.vue` 幽灵组件**：`77bfc9c` 已删除该文件，但 8 份设计文档（`REQUIREMENT-ui-redesign` / `TECHNICAL-SOLUTION-ui-redesign` / `class-diagram-ui-redesign` / `sequence-diagram-ui-redesign` / `REQUIREMENT-ui-v2` / `TECHNICAL-SOLUTION-ui-v2` / `REQUIREMENT-ui-v3` / `TECHNICAL-SOLUTION-ui-v3`）仍将其描述为在世组件。代码注释已确认职责并入 `layout/PageHeader.vue`。
  2. **M5 errata 4.1.0 隐患①已修但文档未回写**：errata 记「`RealBridge.chat()` 未 `sock.destroy()`」，实际 `2c208de` 已用 `release()` + `finally` 幂等释放修复（`bridge.ts:330-333, 373-375`），`TECHNICAL-SOLUTION-M5.md` 的 errata 段落仍显示为未决隐患。
  3. **M5 errata 4.1.0 隐患②仍然存在**：`bridge.ts:301` 默认端点仍写死 `tcp://127.0.0.1:16765`，NekoBox TUN 拦截问题未解，real-bridge 模式在本机连不通。
  4. **i18n 技术栈声明与实现不符**：`.dev/README.md` 技术架构列「vue-i18n」，但 `packages/client/package.json` **无 vue-i18n 依赖**，实为 `6866344` 手写的轻量 `useI18n.ts`（reactive + localStorage）；且 `main.ts` **未挂载任何 i18n 插件**，仅 4 个组件调用 `t()`。
  5. **bridge 图表命名缺后缀**：`docs/design/{class-diagram,sequence-diagram}.mermaid` 由 `2c208de` 引入、实际归属 kmaster-bridge，但命名无后缀（同目录其余图表均带 `-ui-v2`/`-ui-v3` 等后缀），易被误读为全局类图/时序图。
  6. **`.gitignore` 覆盖不全**：`packages/server/src/services/hermes/bridge/__pycache__/` 与根 `tmp2/` 长期以未跟踪状态出现在 `git status`。
- 遗留/待办：
  - 上述 6 项不一致**均未修改代码**，转交主理人纳入全项目缺陷盘点后统一排期

## C-2026-08-05-BACKFILL-2 · 索引补收 hermes-native PRD / QA 健康盘点 + 追加 4 项不一致
- 类型：Backlog Remediation 续（承接 `C-2026-08-05-BACKFILL`）
- 触发：产品经理定稿 `hermes-native-prd.md` 并反馈基线路径已更新；QA 产出全项目健康盘点
- 变更集（**纯索引/文档，零源码改动**）：
  - `docs-index.md`：新增「hermes-native 架构升级」分组收录 `hermes-native-prd.md`（31 条需求）；新增 `docs/qa/HEALTH-CHECK-2026-08-05.md`；`CONCURRENCY-DESKTOP-WEB.md` 条目补注 F10–F15 缺陷盘点与失效提示；页脚 pending 标记替换为「开箱即假」红线提示
  - `project-dev-status.md`：「下一步」补 HN-P000 与 ACP/TCP 前置风险；「已知遗留」由 8 项扩至 **12 项**
- **本轮新增发现的文档-代码不一致（第 9–12 项，仍未改代码）**：
  9. 🔴 **`bridge.ts:463` 默认 MockBridge**：`(process.env.HERMES_BRIDGE_MOCK ?? '1') !== '0'` → 不设环境变量即走 Mock，对话主链路开箱即假。经三方独立确认（产品经理 HN-P000 / QA D-04 / 工程师本次复核）。**注：该缺陷早在 `2c208de`（2026-08-03）的 `CONCURRENCY-DESKTOP-WEB.md` F10 中即已记录，但从未进入索引与排期 —— 正是索引欠账导致已知缺陷被埋没的实例。**
  10. `CONCURRENCY-DESKTOP-WEB.md` **F15**（RealBridge 单例 `this.sock` 并发串台）**已被同一提交 `2c208de` 修复**（改 `Map<sessionId, Socket>` 定向投递，`REQUIREMENT-kmaster-bridge.md:49` 已确认），但该文档仍将其列为在世缺陷 —— 同一提交内自相矛盾。
  11. 同文档代码行号引用全面漂移：`bridge.ts:402-405` → 实际 **463**；`bridge.ts:296 private sock?: net.Socket` → 实际 **307 `private socks = new Map<string, net.Socket>()`**。
  12. ⚠️ **架构层风险（F11）**：`acp_adapter/entry.py` 证实 hermes-agent 的真实接入面是 **ACP stdio**（每客户端 spawn 独立进程，天然一对一），**不是 TCP daemon**；而 `RealBridge` 是连 `tcp://127.0.0.1:16765` 的 TCP 客户端。**仅反转 `HERMES_BRIDGE_MOCK` 默认值不足以获得真实对话**，须先确认 Python bridge 的 TCP→ACP 转译路径是否已落地并可部署。
- 验证：`vue-tsc --noEmit` → **TSC_EXIT=0**；`packages/**` 源码零改动

