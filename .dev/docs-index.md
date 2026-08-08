# 文档索引

## 调研阶段 (docs/research/)
| 文档 | 说明 | 版本 |
|------|------|------|
| PROJECT-OVERVIEW.md | 项目总览：定位/架构/对齐策略/功能全集/路线/风险 | v0.1 |
| CONTEXT-ANALYSIS-kmaster-studio.md | 现状分析：hermes-agent / hermes-studio / WorkBuddy / 参考文档 | v0.1 |
| TASK-UNDERSTANDING-kmaster-studio.md | 任务理解：三大需求 + F1-F22 映射 + 布局决策 | v0.1 |
| CHANGE-OBJECTIVE-kmaster-studio.md | 变更目标：M1-M5 路线 + 交付物 + 待确认项 | v0.1 |

## 设计阶段 (docs/design/) — 共 37 份

### 里程碑 M1–M5（功能主线）
| 文档 | 说明 | 里程碑 | 版本 |
|------|------|--------|------|
| REQUIREMENT-M1.md | M1 需求（F1-F3 功能/非功能/验收基线） | M1 | v0.1 |
| TECHNICAL-SOLUTION-M1.md | M1 技术方案（monorepo/Koa/Bridge/socket/客户端/协议） | M1 | v0.1 |
| TEST-PLAN-M1.md | M1 测试方案（Vitest/Playwright/构建） | M1 | v0.1 |
| REQUIREMENT-M2.md | M2 需求（F4-F6/F7/F10 功能/非功能/验收） | M2 | v0.1 |
| TECHNICAL-SOLUTION-M2.md | M2 技术方案（plan/artifact 协议/MockBridge/db.deleteSession/组件） | M2 | v0.1 |
| TEST-PLAN-M2.md | M2 测试方案（Vitest 新用例/构建/smoke 断言新事件） | M2 | v0.1 |
| REQUIREMENT-M3.md | M3 需求（F8/F9/F11/F12/F19 模式/模型/技能/MCP/上传） | M3 | v0.1 |
| TECHNICAL-SOLUTION-M3.md | M3 技术方案（枚举代理/hermes-proxy/REST 扩展/三态映射/抽屉组件） | M3 | v0.1 |
| REQUIREMENT-M4.md | M4 需求（F13/F15/F16/F17/F18/F22 记忆/自动化/子代理/队列/压缩/用量） | M4 | v0.1 |
| TECHNICAL-SOLUTION-M4.md | M4 技术方案（resolveHermesHome 修目录 bug / mock 子代理+压缩序列 / queue+usage 持久层 / cron CLI 包装 / 扩展 Bridge 协议） | M4 | v0.1 |
| REQUIREMENT-M5.md | M5 需求（F20 内置终端 / F21 设置页 / Electron 壳；§8 AC1-AC9 验收契约） | M5 | v0.1 |
| TECHNICAL-SOLUTION-M5.md | M5 技术方案（node-pty + xterm / 两级 HERMES_HOME / Electron server 进程宿主 / 端口复用）**含 2 份实现期勘误：§4.1.0 Bridge 无子进程、§4.1.1 壳不得自算 HERMES_HOME** | M5 | v0.1 |
| M5-VS-WORKBUDDY-DIFF.md | M5 AC9：kmaster 桌面壳与 WorkBuddy 的差异清单 | M5 | v0.1 |

### kmaster-bridge（Python 真实接入层）
| 文档 | 说明 | 里程碑 | 版本 |
|------|------|--------|------|
| REQUIREMENT-kmaster-bridge.md | bridge 需求（M1 基线：协议/会话/事件流） | bridge M1 | v0.1 |
| TECHNICAL-SOLUTION-kmaster-bridge.md | bridge 技术方案（broker/pool/gateway/runtime/transport 五层分解） | bridge M1 | v0.1 |
| REQUIREMENT-kmaster-bridge-m2.md | bridge M2 需求（MCP / 技能 / 模型切换 / 后台委派 / 压缩） | bridge M2 | v0.1 |
| TECHNICAL-SOLUTION-kmaster-bridge-m2.md | bridge M2 技术方案（协议扩展 + 文件锁互斥） | bridge M2 | v0.1 |
| CONCURRENCY-DESKTOP-WEB.md | 桌面/Web 双模式并发模型：连接池 / 文件锁 / 会话隔离。**另含 F10–F15 拓扑与代码级缺陷盘点**（含 F11「hermes-agent 真实接入面是 ACP stdio 而非 TCP daemon」）⚠️ 其中 F15 已被 `2c208de` 修复、行号引用已漂移，见 changed-log 遗留项 | bridge M1-M3 | v0.1 |
| class-diagram.mermaid | ⚠️ 归属 **kmaster-bridge**（命名缺后缀，非全局类图） | bridge M1 | v0.1 |
| sequence-diagram.mermaid | ⚠️ 归属 **kmaster-bridge**（命名缺后缀，非全局时序图） | bridge M1 | v0.1 |

### WorkBuddy 对标补齐轮次 R1~R4（2026-08-01）
> ⚠️ 本组的 R1~R4 对应提交信息里的 "V1/V2/V3/V4"，与下方「UI 重设计 V1/V2/V3」**是两套独立编号**。

| 文档 | 说明 | 轮次 | 版本 |
|------|------|------|------|
| KMASTER-VS-WORKBUDDY-UI-GAPS.md | 差异分析基线：41 gaps（P0 4 人日 / P1 7 人日 / P2 6 人日） | R1 前基线 | v0.1 |
| KMASTER-VS-WORKBUDDY-UI-GAPS-V2.md | 差异复查：26/26 验证到位，7 项剩余差距，对齐度 92% | R2 后复查 | v0.2 |
| KMASTER-VS-WORKBUDDY-FINAL.md | 最终对比报告：UI/交互/功能 **> 95% 对齐** | R4 后结论 | v0.3 |

### UI 重设计 V1 / V2 / V3（2026-08-04）
> ⚠️ 与上方「对标轮次 R1~R4」**无继承关系**，是独立的前端重构编号。

| 文档 | 说明 | 轮次 | 版本 |
|------|------|------|------|
| REQUIREMENT-ui-redesign.md | UI V1 需求：全屏沉浸式 Agent 工作站 | UI V1 | v0.1 |
| TECHNICAL-SOLUTION-ui-redesign.md | UI V1 技术方案：LayoutShell / LeftSidebar / OutputPanel | UI V1 | v0.1 |
| class-diagram-ui-redesign.mermaid | UI V1 类图 | UI V1 | v0.1 |
| sequence-diagram-ui-redesign.mermaid | UI V1 时序图 | UI V1 | v0.1 |
| REQUIREMENT-ui-v2.md | UI V2 需求：新建任务弹窗 / 卡片市场 / 详情页 / 设置覆盖 / 右栏避让 | UI V2 | v0.2 |
| TECHNICAL-SOLUTION-ui-v2.md | UI V2 技术方案：市场卡片体系 + 弹窗层级 | UI V2 | v0.2 |
| class-diagram-ui-v2.mermaid | UI V2 类图 | UI V2 | v0.2 |
| sequence-diagram-new-task.mermaid | UI V2 时序：新建任务 | UI V2 | v0.2 |
| sequence-diagram-market-detail.mermaid | UI V2 时序：市场详情 | UI V2 | v0.2 |
| sequence-diagram-settings-overlay.mermaid | UI V2 时序：设置覆盖层 | UI V2 | v0.2 |
| REQUIREMENT-ui-v3.md | UI V3 需求（原 `packages/client/docs/ui-v3-prd.md`，2026-08-05 迁入并改名） | UI V3 | V3.0 |
| TECHNICAL-SOLUTION-ui-v3.md | UI V3 系统设计 + 任务分解 T1–T5（原 `ui-v3-design.md`，2026-08-05 迁入并改名）：CSS Grid 三栏 / 原生 resize / 设置子路由 / `--km-*` 双主题 / 零新增后端路由 | UI V3 | V3.0 |
| class-diagram-ui-v3.mermaid | UI V3 类图：类型层 + Store 层（原 `class-diagram.mermaid`） | UI V3 | V3.0 |
| component-contract-ui-v3.mermaid | UI V3 组件契约图：props / emits / slots（原 `component-contract.mermaid`） | UI V3 | V3.0 |

### UI/UX v2 整改（2026-08-07，已收口）
| 文档 | 说明 | 状态 | 版本 |
|------|------|------|------|
| kmaster-studio-ui-ux.v2.md | UI/UX v2 设计规范（13 章 + 附录 ABC，整改面 148 位点） | 已定稿 | v1.0 |
| kmaster-studio-ui-ux-v2-implementation-plan.md | gap 矩阵 + B1–B5 分批实现计划 | 已定稿 | v1.0 |
| ui-ux-current-state-v2-2026-08-07.md | v2 现状审计 | 已验收 | v1.0 |
| uiux-metrics-baseline-2026-08-07.md | UI/UX 度量基线报告 | 已固化 | v1.0 |
| scripts/uiux-audit.mjs | **可执行验收脚本**（12 指标 + `--fail-on-regression` 回归门禁） | 已验收 | v1.0 |

> 验收铁律：`scripts/uiux-audit.mjs` 是本项目 UI/UX 验收的**唯一事实来源**；完成判定须 `node scripts/uiux-audit.mjs --fail-on-regression` 退出 0 并给出指标前后对比，不接受主观描述式验收。

### hermes-native 架构升级（进行中，DDD Scenario B）
| 文档 | 说明 | 状态 | 版本 |
|------|------|------|------|
| hermes-native-prd.md | hermes-native 需求：kmaster-studio 与真实 hermes-agent 联动。需求池 **31 条**（P0 19 / P1 7 / P2 5），优先级 `HN-P000` > `HN-P003/P004` > 其余。§2.1.1 固化 root vs activeHermesHome 语义；继承 `TECHNICAL-SOLUTION-M5.md` §4.1.0/§4.1.1 与 `CONCURRENCY-DESKTOP-WEB.md` | 已定稿 | v0.1 |

## 验证阶段（QA 报告）
| 文档 | 说明 | 结论 |
|------|------|------|
| docs/qa/HEALTH-CHECK-2026-08-05.md | 全项目健康度盘点（独立 QA） | 含 D-04「`HERMES_BRIDGE_MOCK` 默认 mock，开箱即假」等 P0 缺陷 |
| .dev/QA-M3-REPORT.md | M3 独立 QA 验收 | REST 20/20 PASS |
| .dev/QA-M4-REPORT.md | M4 QA 验收（AC0–AC8） | 61/61 PASS |
| .dev/QA-M4-INDEPENDENT-REPORT.md | M4 独立 QA 反作弊复核（探针 21/21） | IS_PASS:YES |
| .dev/QA-M5-REPORT.md | M5 独立 QA 验收（AC0–AC9，47 项） | 44 PASS / 3 FAIL（3 项均为 `spawn EINVAL` 环境噪声，已于 2026-08-05 宿主环境复验通过） |

## 参考文档（只读，docs/reference/）
| 文档 | 说明 |
|------|------|
| 00-WorkBuddy-ANALYSIS.md | WorkBuddy 技术分析与组件拆解 |
| 01-WorkBuddy桌面前端深度分析.md | WorkBuddy 前端深度分析 |
| 02-kmaster-studio设计方案.md | kmaster-studio 设计方案（F1-F22 + 协议 + M1-M5） |
| 03-hermes-studio前端深度分析.md | hermes-studio 前端深度分析 |

## 实现/验证阶段 (packages/)
| 路径 | 说明 | 验证 |
|------|------|------|
| packages/server/src/ | 服务端源码（Koa + Socket.IO + Bridge + db + hermes-proxy） | tsc --noEmit ✅ |
| packages/server/src/run-chat.ts | /chat-run 命名空间编排（Bridge→WS 事件转译）；M4 队列编排 + usage 落库 | smoke ✅ |
| packages/server/src/bridge.ts | AgentBridge：Mock（默认）+ Real(TCP→Python)；bridge 加固后按 sessionId 路由连接表 | Mock ✅ |
| packages/server/src/hermes-proxy.ts | M3 新增 + M4 修目录 bug：枚举代理 / memory 适配层 / cron CLI 包装 | QA ✅ |
| packages/server/src/routes/{memory,jobs,queue,usage,error}.ts | M4 新增：REST 端点 + 统一错误映射 | 61/61 ✅ |
| packages/server/src/routes/config.ts | M5 新增：F21 providers / profiles REST（DTO 不含明文 Key） | QA ✅ |
| packages/server/src/services/terminal.ts · src/terminal-ns.ts | M5 新增：node-pty 管理器 + `/terminal` 命名空间 | QA ✅ |
| packages/server/src/services/hermes/bridge/*.py | kmaster-bridge 8 模块（broker/pool/gateway/runtime/transport/protocol/server/kmaster_bridge） | test_bridge ✅ |
| packages/server/test_bridge.mjs | bridge M1/M2 协议往返测试 | PASS ✅ |
| packages/client/src/stores/{chat,jobs,memory,usage}.ts | M1–M4 store（chat 为纯 reducer，dispatch 已暴露） | Vitest ✅ |
| packages/client/src/stores/{agentRoles,layout,logs,modelConfig,status}.ts | UI V3 新增：5 个 store | Vitest ✅ |
| packages/client/src/stores/*.test.ts | 9 个测试文件 | 139/139 ✅ |
| packages/client/src/components/layout/*.vue | UI V1/V3：LayoutShell / LeftSidebar / PageHeader / ResizeHandle / RightPanel / SettingsNav / StatusBar | vue-tsc ✅ |
| packages/client/src/components/market/*.vue | UI V2/V3：卡片市场 + 四类详情页 + InstalledCard | vue-tsc ✅ |
| packages/client/src/components/settings/*.vue | M5 + UI V1/V3：设置分区 13 个 Section/Detail | vue-tsc ✅ |
| packages/client/src/components/dialog/*.vue | UI V2/V3：6 个弹窗 | vue-tsc ✅ |
| packages/client/src/components/preview/{TerminalPane,FileTreePane}.vue | M5 终端面板 + R3 文件树 | QA ✅ |
| packages/client/src/utils/desktop-bridge.ts | Electron preload 契约；Web 环境静默降级 mock | vue-tsc ✅ |
| packages/desktop/src/main/*.ts | M5 Electron 主进程：server 进程宿主 / 更新器 / 窗口状态 | 人工 ✅ |
| scripts/smoke-chat.mjs | 聊天闭环烟雾测试（localhost:6648） | PASS ✅ |
| scripts/qa-verify-m3.mjs · qa-verify-m4.mjs · qa-verify-m5.mjs | M3/M4/M5 REST 全量验收 | 20/20 · 61/61 · 44/47 |
| scripts/qa-probe-m4.mjs · qa-probe-db.mjs | M4 独立 QA 探针 | 21/21 ✅ |
| scripts/uiux-audit.mjs | UI/UX 合规度量（12 指标 + 回归门禁） | missingStates 2→0 ✅（对照 2026-08-07 基线无回归） |
| packages/client/dist/ | vite 构建产物（生产 server 托管） | served ✅ |

---

> **当前基线（2026-08-05 复验）**：HEAD = `27b7783`，`vue-tsc --noEmit` 0 错误，`vitest run` **139/139 PASS**，工作树干净。
> M1–M5 全量验证通过；kmaster-bridge M1/M2/M3 已落地；WorkBuddy 对标 > 95%；UI 重设计 V1/V2/V3 已交付。
> **端口约定**：server **6648** / client dev **6649** / kmaster-bridge TCP **16765**。
> 详见 `changed-log.md` C-2026-07-30-M1 → C-2026-08-05-BACKFILL 与 `.dev/QA-M3/M4/M5-*.md`。
> 🔴 **开箱即假**：`bridge.ts:463` `HERMES_BRIDGE_MOCK ?? '1'` → **默认 MockBridge**，对话主链路默认不经真实模型。已由 hermes-native PRD 的 HN-P000 与 QA 健康盘点 D-04 双向立项，为 hermes-native 升级最高优先级。
> ✅ **UI/UX v2 整改已收口（2026-08-07）**：v2 代码固化 + 临时草稿清理 + 缺状态修复（missingStates 2→0），对照基线无回归。详见 changed-log.md C-2026-08-07-UIUX-V2。
