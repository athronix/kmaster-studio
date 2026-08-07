# 项目开发状态

## 当前阶段
**UI 重设计 V3 已交付并复验通过（HEAD `27b7783`，vue-tsc 0 错误 / vitest 139/139 / 工作树干净）；DDD 索引欠账已于 2026-08-05 完成回填（Scenario F）。下一步进入 hermes-native 架构升级 —— kmaster-studio 与真实 hermes-agent 联动（DDD Scenario B：项目升级，Phase 1-7 全执行）**

## 阶段进度
| Phase | 状态 | 说明 |
|-------|------|------|
| 1 调研 | ✅ 完成 | 参考文档 00-03 + hermes-studio 架构 + hermes-agent 本地可用确认；R1-R4 已确认。**hermes-native 升级需重启 Phase 1** |
| 2 设计 | ✅ 完成 | M1–M5 + kmaster-bridge M1/M2 + UI V1/V2/V3 设计文档齐备（docs/design/ 共 37 份） |
| 3 实现 | ✅ 完成 | M1–M5 全量 + kmaster-bridge 8 模块 + WorkBuddy 对标 R1~R4 + UI 重设计 V1/V2/V3 |
| 4 验证 | ✅ 完成 | M3 20/20 · M4 61/61 + 独立探针 21/21 · M5 44/47（3 项 spawn EINVAL 环境噪声已复验）· UI V3 vue-tsc 0 错 + vitest 139/139 |
| 5 迭代 | 🟡 进行中 | 已归集 6 项文档-代码不一致 + M4/M5 遗留（详见下方「已知遗留」），待主理人统一排期 |
| 6 配套 | ✅ 完成 | 三平台 electron-builder 打包 + release CI 矩阵 + README 桌面/Web 双模式部署指南 |
| 7 交付 | ✅ 完成 | 索引已回填至真实现状（v0.6.0），22 个欠账提交 + 13 份设计文档全部入索引 |

## 下一步
- **进入 hermes-native 架构升级（DDD Scenario B）**：kmaster-studio 与真实 hermes-agent 联动
  - 前置条件已满足：文档-逻辑一致性基线于 2026-08-05 恢复
  - PRD 已定稿：`docs/design/hermes-native-prd.md`（31 条需求，P0 19 / P1 7 / P2 5）
  - 🔴 最高优先级 `HN-P000`：反转 `HERMES_BRIDGE_MOCK` 默认值（当前开箱即假）
  - ⚠️ 动工前须先厘清遗留 #12：hermes-agent 是 ACP stdio 接入面，RealBridge 是 TCP 客户端，二者如何衔接决定 HN-P000 能否真正生效
  - 需重点消化：M5 errata 4.1.0/4.1.1 两条长期约束 + `CONCURRENCY-DESKTOP-WEB.md` 并发模型
- 并行：清理已知遗留 6 项文档-代码不一致

## 最近更新
- 2026-07-31：M3 实现完成并独立 QA 验收通过（详见 changed-log.md C-2026-07-31-M3 与 .dev/QA-M3-REPORT.md）。M3 原子提交 + 推送 GitHub athronix/kmaster-studio。
- 2026-07-31：M4 实现完成并独立 QA 验收通过 IS_PASS:YES（路由 NoOne），详见 changed-log.md C-2026-07-31-M4 与 .dev/QA-M4-REPORT.md / .dev/QA-M4-INDEPENDENT-REPORT.md。M4 原子提交 + 推送 GitHub + .dev 同步至 v0.3.0。遗留 3 项非阻塞跟进（1×P1 补 sqlite 实跑、2×P2 cron 解析/验收脚本）转 M5 排期。
- 2026-07-31：**默认端口迁移** 8648/8649/18765 → **6648/6649/16765**（避让 hermes-studio），`5e13ecc` 改代码/脚本、`5e03ee1` 统一 `.dev/` 历史引用。详见 changed-log.md C-2026-07-31-PORT。
- 2026-08-01：**M5 交付**（F20 内置终端 / F21 设置页 / Electron 桌面壳），10 个提交。QA 44/47（3 项 `spawn EINVAL` 为环境噪声）。产出 **2 份实现期勘误**：4.1.0「Bridge 无子进程 + 两个 RealBridge 隐患」、4.1.1「Electron 壳不得自算 HERMES_HOME」。详见 changed-log.md C-2026-08-01-M5。
- 2026-08-01：**WorkBuddy 对标补齐轮次 R1~R4**（9 个提交），41 gaps → 最终对齐度 **> 95%**；同步明确 Web 部署模式（web-first + 双模式对等 + 局域网部署指南）。详见 changed-log.md C-2026-08-01-WB-R1R4。
- 2026-08-03：**kmaster-bridge 完整实现 + M1/M2/M3 并发加固**（2 个提交，Python 侧 8 模块约 9000 行）。RealBridge 改为按 sessionId 路由连接表，顺带修掉 errata 4.1.0 隐患①。详见 changed-log.md C-2026-08-03-BRIDGE。
- 2026-08-04：**UI 重设计 V1 / V2 / V3 交付**（6 个提交），全屏沉浸式 Agent 工作站 → 卡片市场 → 三栏框架 + 设置分导航路由化 + 弹窗体系。详见 changed-log.md C-2026-08-04-UI-V1V3。
- 2026-08-05：**DDD 索引欠账回填（Scenario F）**：补齐 M4 之后 22 个提交 / 13 份设计文档的索引；UI V3 四份文档由 `packages/client/docs/` 迁入 `docs/design/` 并对齐命名约定（修正 3 处引用）。复验 `TSC_EXIT=0` + `vitest 139/139`。详见 changed-log.md C-2026-08-05-BACKFILL。

## ⚠️ 编号体系澄清（避免误读 git log）
项目历史中存在**两套互不相关的 "V1/V2/V3" 编号**，按日期区分：

| 日期 | 编号 | 含义 | 索引记法 |
|------|------|------|----------|
| 2026-08-01 | 提交信息里的 V1/V2/V3/V4 | **WorkBuddy 对标补齐轮次** | 统一记为 **R1~R4** |
| 2026-08-04 | 提交信息里的 V1/V2/V3 | **UI 重设计轮次** | 保留 **UI V1/V2/V3** |

## 已知遗留（待主理人统一排期，均未擅自改代码）
| # | 类型 | 内容 |
|---|------|------|
| 1 | 文档滞后 | `ChatHeader.vue` 已于 `77bfc9c` 删除（并入 `PageHeader.vue`），但 8 份 UI 设计文档仍描述为在世组件 |
| 2 | 文档滞后 | M5 errata 4.1.0 隐患①（`RealBridge.chat()` 未 destroy）**已由 `2c208de` 修复**，errata 原文未回写 |
| 3 | 真实隐患 | M5 errata 4.1.0 隐患②仍在：`bridge.ts:301` 端点写死 `tcp://127.0.0.1:16765`，NekoBox TUN 拦截致 real-bridge 连不通（改 `localhost` 需先确认 Python 侧 bind 地址，**不可盲改**） |
| 4 | 声明不符 | `.dev/README.md` 技术架构列「vue-i18n」，实际无该依赖；为手写 `useI18n.ts`（reactive + localStorage），`main.ts` 未挂载 i18n 插件 |
| 5 | 命名歧义 | `docs/design/{class-diagram,sequence-diagram}.mermaid` 实属 kmaster-bridge，但命名缺后缀 |
| 6 | 工程卫生 | `.gitignore` 未覆盖 `**/__pycache__/` 与根 `tmp2/` |
| 7 | M4 遗留 | P1 补真实 sqlite 落盘验收；P2 cron 历史 status/job_name 解析；P2 qa-verify-m4 real cron 清理 |
| 8 | M5 遗留 | AC5 Electron 壳 15 项人工验收清单（GUI 面不可自动化） |
| 9 | 🔴 真实缺陷 | **`bridge.ts:463` 默认 MockBridge**（`HERMES_BRIDGE_MOCK ?? '1'`）—— 对话主链路开箱即假，回复由进程内合成、不经真实模型。已由 hermes-native PRD `HN-P000` 与 QA 健康盘点 `D-04` 双向立项 |
| 10 | 文档滞后 | `CONCURRENCY-DESKTOP-WEB.md` 的 **F15**（RealBridge 单例 `this.sock` 并发串台）**已被 `2c208de` 修复**（改 `Map<sessionId, Socket>`），文档仍列为在世缺陷 |
| 11 | 行号漂移 | 同上文档代码引用已失效：`bridge.ts:402-405` → 实际 **463**；`bridge.ts:296 private sock?` → 实际 **307 `private socks = new Map`** |
| 12 | ⚠️ 架构风险 | 同上文档 **F11**：hermes-agent 真实接入面是 **ACP stdio**（每客户端 spawn 独立进程，天然一对一），**不是 TCP daemon**；而 `RealBridge` 是 TCP 客户端。hermes-native 升级须先厘清 Python bridge 如何完成 TCP→ACP 转译，否则仅反转 mock 默认值不足以获得真实对话 |

## 关键环境校正（累计）
**依赖与运行时**
- `koa-static` 无 5.0.1 → `^5.0.0`
- **Node 可执行文件**：`C:/Users/towyq/.workbuddy/binaries/node/versions/22.22.2/node.exe`
- **`vue-tsc` / `vitest` 被 hoist 到仓库根 `node_modules`**。在 `packages/client` 下**必须用相对路径**调用：
  ```bash
  NODE=C:/Users/towyq/.workbuddy/binaries/node/versions/22.22.2/node.exe
  cd /d/Users/towyq/Documents/Projects/kmaster-studio/packages/client
  $NODE ../../node_modules/vue-tsc/bin/vue-tsc.js --noEmit
  $NODE ../../node_modules/vitest/vitest.mjs run
  ```
  ⚠️ 用 `/d/...` **绝对路径**会被 Git Bash 二次转换成 `D:\d\...`，导致 `MODULE_NOT_FOUND`。
- `better-sqlite3` 原生绑定在沙箱**未编译时会静默回退内存实现**（`KMASTER_DB=memory` 为显式逃生阀）；宿主环境 QA 实测 `db_kind=sqlite`
- 沙箱拦截 better-sqlite3/esbuild 安装脚本；esbuild 平台包随 optionalDependency 安装故 vite build 可用

**网络与端口**
- 本地 NekoBox 为 TUN 代理会拦截 `127.0.0.1`：smoke 脚本与 vite proxy 全部改用 `localhost`(→::1) 绕过
- QA 验收须走 `localhost` 并设 `NO_PROXY=localhost,127.0.0.1`；server 起停前后释放 **6648**
- 现行端口：server **6648** / client dev **6649** / kmaster-bridge TCP **16765**

**构建与测试**
- Vitest 写 `node_modules/.vite/vitest/results.json` 报 EPERM → `vitest.config.ts` 设 `cache:false`
- client `tsconfig.json` 缺 `baseUrl` 导致 `paths` 报错 → 补 `baseUrl: "."`
- vite 构建清空 `dist` 被本地「安全删除」垫片拦截 → `emptyOutDir` 由 `KMASTER_NO_EMPTY_DIST=1` 关闭
- M5 QA 脚本内 `spawn` 子进程会报 `EINVAL`（沙箱限制），构建类断言须在宿主环境手工复验

**契约约定**
- 上传落点优先 env `KMASTER_HOME`（本机 = `AppData\Local\kmaster`）
- REST 契约以设计文档为准：`PUT /api/settings`、upload 字段 `{session_id, filename, content_base64}`
- `HERMES_HOME` 解析权**唯一归 server 的 `hermes-proxy.ts`**，语义是**「根」而非「激活目录」**；Electron 壳只透传 `process.env`（errata 4.1.1）
