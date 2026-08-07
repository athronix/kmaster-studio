# 项目目录索引

## 版本信息
- 当前版本: v0.6.0 (UI 重设计 V3 已交付并复验通过；HEAD `27b7783`)
- 最后更新: 2026-08-05（DDD Scenario F 索引回填，按实扫结果重建）

## 目录结构
| 目录 | 说明 | 关键文件 |
|------|------|----------|
| .dev/ | DDD 索引与状态 | README / project-dev-status / docs-index / changing-log / changed-log / project-dir-file-index / QA-M3-REPORT / QA-M4-REPORT / QA-M4-INDEPENDENT-REPORT / QA-M5-REPORT |
| docs/reference/ | 用户已有分析草稿（只读参考） | 00-03 四篇 |
| docs/research/ | 本项目调研文档 | PROJECT-OVERVIEW / CONTEXT-ANALYSIS / TASK-UNDERSTANDING / CHANGE-OBJECTIVE |
| docs/design/ | 设计文档（Phase 2 产出，37 份） | M1-M5 系列 · kmaster-bridge 系列 · WorkBuddy 对标 3 篇 · UI V1/V2/V3 系列 |
| packages/client/ | 前端（Vue 3 + Naive UI + Pinia + vue-router + Vite） | src/ · index.html · vite.config.ts · vitest.config.ts · tsconfig.json · env.d.ts |
| packages/server/ | 服务端（Koa + Socket.IO + better-sqlite3） | src/ · test_bridge.mjs · tsconfig.json |
| packages/desktop/ | **M5 新增**：Electron 桌面壳 | src/main/ · src/preload/ · electron-builder.yml · build/ · scripts/ |
| scripts/ | 验证脚本 | smoke-chat · qa-verify-m3/m4/m5 · qa-probe-m4 · qa-probe-db |
| packages/client/dist/ | vite 构建产物（生产 server 托管） | index.html · assets/* |

## packages/client/src/ 明细（按实扫）
| 子目录 | 文件 | 引入轮次 |
|--------|------|----------|
| （根） | `App.vue` · `main.ts` | M1 |
| api/ | `client.ts` · `hermes/chat.ts` | M1/M3/M4 |
| api/ | `terminal.ts` | **M5** |
| router/ | `index.ts`（chat / experts / skills / mcp / memory / jobs / usage / queue / settings / `settings/:category`） | M4 + UI V3 路由化 |
| components/ | `AppNav.vue` | M4 |
| components/chat/ | `AgentMarkdown` · `ApprovalCard` · `ArtifactPanel` · `ChatInput` · `ChatPanel` · `ClarifyCard` · `MessageItem` · `MessageList` · `PlanCard` · `SessionList` · `SettingsDrawer` · `SkillPanel` · `McpManager` · `SubagentCard` · `ThoughtBlock` · `ToolCallCard` · `UsageBar` | M1–M4 |
| components/chat/ | `ContextRing.vue` · `OutputPanel.vue` · `ShareDialog.vue` | **UI V1** |
| components/layout/ | `LayoutShell.vue` · `LeftSidebar.vue` | **UI V1** |
| components/layout/ | `PageHeader.vue` · `ResizeHandle.vue` · `RightPanel.vue` · `SettingsNav.vue` · `StatusBar.vue` | **UI V3** |
| components/market/ | `CardMarketLayout.vue` · `EntityCard.vue` · `ExpertDetail.vue` · `McpDetail.vue` · `SkillDetail.vue` · `TeamDetail.vue` | **UI V2** |
| components/market/ | `InstalledCard.vue` | **UI V3** |
| components/dialog/ | `NewTaskDialog.vue` | **UI V2** |
| components/dialog/ | `AddModelDialog.vue` · `LogDetailDialog.vue` · `MemberDetailDialog.vue` · `ResultDialog.vue` · `SchemaDialog.vue` | **UI V3** |
| components/settings/ | `GeneralSection.vue` · `ProviderSection.vue` · `ProfileSection.vue` · `DiagnosticsSection.vue` | **M5**（F21） |
| components/settings/ | `AgentRoleSection.vue` · `ModelManageSection.vue` · `MonitorSection.vue` · `ToolsSection.vue` | **UI V1** |
| components/settings/ | `AgentRoleDetail.vue` · `ExpertPickerPanel.vue` · `LogSection.vue` · `McpManageSection.vue` · `PlaceholderSection.vue` · `SkillManageSection.vue` | **UI V3** |
| components/preview/ | `TerminalPane.vue` | **M5**（F20） |
| components/preview/ | `FileTreePane.vue` | **对标 R3** |
| composables/ | `useMcpList.ts` · `useSessionList.ts` · `useSkillList.ts` | **UI V1** |
| composables/ | `useDomainTags.ts` | **UI V2** |
| composables/ | `useKeyboard.ts` | **对标 R3** |
| composables/ | `useI18n.ts` | **对标 R4**（手写骨架，非 vue-i18n） |
| constants/ | `layout.ts` · `providers.ts` | **UI V3** |
| locales/ | `zh-CN.ts` · `en.ts` | **对标 R4** |
| stores/ | `chat.ts` · `jobs.ts` · `memory.ts` · `usage.ts`（+ 同名 `.test.ts`） | M1–M4 |
| stores/ | `terminal.ts` | **M5** |
| stores/ | `agentRoles.ts` · `layout.ts` · `logs.ts` · `modelConfig.ts` · `status.ts`（+ 同名 `.test.ts`） | **UI V3** |
| styles/ | `theme.ts` · `variables.scss`（`--km-*` 双主题变量） | M1 / UI V1 |
| types/ | `chat.ts` | M1–M4 |
| types/ | `agent.ts` | **UI V1** |
| types/ | `market.ts` · `newTask.ts` | **UI V2** |
| types/ | `settings.ts` | **UI V3** |
| utils/ | `desktop-bridge.ts`（Electron preload 契约，Web 端静默降级） | **M5** |
| views/ | `ChatView.vue` · `MemoryView.vue` · `JobsView.vue` · `QueueView.vue` · `UsageView.vue` | M1 / M4 |
| views/ | `SettingsView.vue` | **M5**（F21） |
| views/ | `ExpertsView.vue` · `McpView.vue` · `SkillsView.vue` | **UI V1** |

> ⚠️ `components/chat/ChatHeader.vue` 由 UI V1 引入，已于 `77bfc9c`（UI V3 p1）**删除**，职责并入 `layout/PageHeader.vue`。多份设计文档仍描述该组件，属已知文档滞后。

## packages/server/src/ 明细（按实扫）
| 文件 | 说明 | 引入/改造轮次 |
|------|------|----------------|
| `index.ts` | Koa 入口 + Socket.IO + 静态托管（`PORT ?? 6648`） | M1（M4/bridge 扩展） |
| `protocol.ts` | 事件契约与共享类型 | M1–M5 + bridge |
| `db.ts` | sqlite + 内存兜底持久层（queue/usage 两表） | M1 / M4 |
| `bridge.ts` | AgentBridge：Mock（默认）+ Real(TCP→Python)；按 sessionId 路由连接表 | M1 / bridge 加固 |
| `run-chat.ts` | `/chat-run` 编排 + 队列 + usage 落库 + restartBridge() | M1 / M4 |
| `hermes-proxy.ts` | 枚举代理 / memory 适配 / cron CLI 包装 / resolveHermesHome | M3 / M4 |
| `terminal-ns.ts` | `/terminal` Socket.IO 命名空间 | **M5** |
| `services/terminal.ts` | node-pty 管理器（不可用时降级 `pty_unavailable`） | **M5** |
| `routes/sessions.ts` | 会话 REST 子集（对标 R2/R3 两轮扩展） | M1–M4 + R2/R3 |
| `routes/{memory,jobs,queue,usage,error}.ts` | 记忆/自动化/队列/用量 REST + 统一错误映射 | M4 |
| `routes/config.ts` | F21 providers / profiles REST（DTO 不含明文 Key） | **M5** |

### packages/server/src/services/hermes/bridge/（Python，kmaster-bridge）
| 文件 | 说明 | 轮次 |
|------|------|------|
| `bridge_server.py` | bridge 服务入口（M1 骨架 → 完整重写） | M1 → bridge M1/M2 |
| `bridge_broker.py` | 消息 broker | **bridge M1** |
| `bridge_gateway.py` | 网关层（M2 扩 MCP/技能/模型切换/委派/压缩） | **bridge M1/M2** |
| `bridge_pool.py` | 连接池 / 并发加固（最大模块） | **bridge M1** |
| `bridge_protocol.py` | 协议编解码 | **bridge M1/M2** |
| `bridge_runtime.py` | 运行时（会话生命周期） | **bridge M1** |
| `bridge_transport.py` | 传输层 | **bridge M1** |
| `kmaster_bridge.py` | 对外聚合入口 | **bridge M1** |
| `README.md` | bridge 模块说明 | **bridge M1** |

## packages/desktop/ 明细（M5 新增 Electron 壳）
| 文件 | 说明 |
|------|------|
| `src/main/index.ts` | 主进程入口（窗口 / 托盘 / 生命周期） |
| `src/main/server-process.ts` | server 子进程宿主（端口复用、进程树级联清理）⚠️ 按 errata 4.1.1，spawn **不得**自算 `HERMES_HOME` |
| `src/main/updater.ts` | 自动更新 |
| `src/main/window-state.ts` | 窗口状态持久化 |
| `src/main/loading.html` | 启动加载页 |
| `src/preload/index.ts` | preload 契约（对应 client `utils/desktop-bridge.ts`） |
| `electron-builder.yml` | 三平台打包配置 |
| `build/icon.{ico,icns,png}` | 应用图标 |
| `scripts/copy-assets.mjs` · `generate-icons.py` · `verify-server-process.mjs` | 构建与验收脚本 |
| `tsconfig.json` · `package.json` | 工程配置 |

## 关键文件索引
| 文件 | 用途 | 状态 |
|------|------|------|
| package.json | 依赖管理（workspaces: client/server/**desktop**；`dev:desktop`/`build:desktop`/`dist:{win,mac,linux}`） | 已落地 |
| tsconfig.base.json | TS 基线配置 | 已落地 |
| .gitignore | 忽略规则 ⚠️ 未覆盖 `**/__pycache__/` 与 `tmp2/` | 已落地 |
| packages/client/vite.config.ts | dev server **6649**；`/api` 与 `/socket.io` 代理 → `localhost:6648`；`emptyOutDir` 可由 `KMASTER_NO_EMPTY_DIST=1` 关闭 | 已落地 |
| packages/client/vitest.config.ts | 单测配置（node / cache:false） | 139/139 ✅ |
| packages/client/tsconfig.json | 补 baseUrl 以支持 `@/*` 别名 | 已落地 |
| packages/server/tsconfig.json | ESM 输出（支持顶层 await） | 已落地 |
| packages/server/src/bridge.ts | RealBridge 默认端点 `tcp://127.0.0.1:16765` ⚠️ 本机 NekoBox TUN 会拦截 | 已落地 ✅ |
| packages/desktop/scripts/verify-server-process.mjs | M5 AC6：端口复用 / 不误杀 / 进程树级联清理断言 | 已落地 ✅ |
| scripts/qa-verify-m5.mjs | M5 REST 全量验收（47 项） | 44/47 ✅ |

## 端口约定（现行）
| 用途 | 端口 | 出处 |
|------|------|------|
| kmaster-server（REST + Socket.IO） | **6648** | `packages/server/src/index.ts` |
| client dev server（Vite） | **6649** | `packages/client/vite.config.ts` |
| kmaster-bridge TCP（外部 Python bridge） | **16765** | `packages/server/src/bridge.ts` |

> 历史端口 8648/8649/18765 已于 `5e13ecc` 全量迁出（避让 hermes-studio），`5e03ee1` 统一了 `.dev/` 历史引用。

## 外部只读参考
- D:\Users\towyq\Documents\Projects\hermes-agent  (后端源码)
- D:\Users\towyq\Documents\Projects\hermes-studio  (架构参考)
- D:\program files\WorkBuddy\  (UI 参考，只读部署目录)
