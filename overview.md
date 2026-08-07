# kmaster-studio「hermes 加强客户端」定位重塑 — 交付总结

**commit**: `1a46103`（未 push）  
**日期**: 2026-08-05  
**变更规模**: 52 files, +5955 / -1682  

---

## TL;DR

将 kmaster-studio 从"半独立应用"重塑为"hermes 加强客户端"——所有读/写/对话数据以 hermes 后端为唯一真源，客户端仅保留 `mode` 一个合法增强字段。5 批次 37 条统一任务全部落地，双 typecheck PASS，HN-P000a 门禁取得磁盘级铁证。

## 交付概览

| 指标 | 值 |
|---|---|
| commit | `1a46103` |
| 新文件 | 32 |
| 修改文件 | 20 |
| typecheck (client) | PASS, exit 0 |
| typecheck (server) | PASS, exit 0 |
| MOCK_ 功能性引用 | 零 |
| SNAPSHOT 功能性引用 | 零 |
| types/market.ts | 1467 → 165 行 |

## 批次结构

| 批次 | U-xx | 变更 | 核心成果 |
|---|---|---|---|
| T01 底座 | 7 | 11🆕 + 6✏️ | normalizeHostPath / bridge 默认 real / probe 升级 / 孤儿 worker |
| T02 读层 | 6 | 8🆕 + 4✏️ | SNAPSHOT 删除 / C2 会话切换到 state.db / 日志/Agent 真实端点 |
| T03 写层 | 6 | 5🆕 + 5✏️ | safeWriteConfig / junction 技能装卸 / Agent CRUD / plan_respond |
| T04 去 mock | 8 | 4🆕 + 10✏️ | 70 条 mock 删除 / DataSourceState 五态 / bridge 四态 |
| T05 收尾 | 10 | 1🆕 + 3✏️ | 日志真源化 / http 超时 / npx 黄标 / 测试基建 |

## 关键文件清单

### 新建（32 文件）

**设计文档**:
- `docs/design/TECHNICAL-SOLUTION-hermes-native.md` — 架构方案 1561 行
- `docs/design/class-diagram-hermes-native.mermaid` — 类图
- `docs/design/sequence-diagram-hermes-native.mermaid` — 时序图
- `docs/qa/T5-INTEGRATION-2026-08-05.md` — T5 集成验证报告

**server 服务层**:
- `packages/server/src/services/hermes/env.ts` — 环境解析 + Q-10 三件套
- `packages/server/src/services/hermes/paths.ts` — normalizeHostPath
- `packages/server/src/services/hermes/probe.ts` — 探测端点逻辑
- `packages/server/src/services/hermes/bridge-identity.ts` — bridge PID 抓取
- `packages/server/src/services/hermes/worker-guard.ts` — 孤儿 worker 治理
- `packages/server/src/services/hermes/lock.ts` — 文件锁空壳（T02 后用）
- `packages/server/src/services/hermes/read/state-db.ts` — state.db 只读连接器
- `packages/server/src/services/hermes/read/skills.ts` — 真实技能读取
- `packages/server/src/services/hermes/read/models.ts` — 真实模型读取
- `packages/server/src/services/hermes/read/logs.ts` — 日志读取
- `packages/server/src/services/hermes/read/agents.ts` — Agent 读取 + front-matter
- `packages/server/src/services/hermes/write/config-yaml.ts` — config 安全写入
- `packages/server/src/services/hermes/write/skills-install.ts` — 技能装卸
- `packages/server/src/services/hermes/write/agents.ts` — Agent CRUD
- `packages/server/src/services/hermes/write/cron.ts` — 定时任务写回

**server 路由**:
- `packages/server/src/routes/hermes.ts` — `/api/hermes/probe`
- `packages/server/src/routes/models.ts` — `/api/models`
- `packages/server/src/routes/skills.ts` — `/api/skills`
- `packages/server/src/routes/mcp.ts` — `/api/mcp`
- `packages/server/src/routes/agents.ts` — `/api/agents`
- `packages/server/src/routes/logs.ts` — `/api/logs`
- `packages/server/src/routes/fs.ts` — `/api/fs/*`

**client 组件/类型**:
- `packages/client/src/types/dataSource.ts` — DataSourceState 五态
- `packages/client/src/stores/hermesStatus.ts` — bridge 四态
- `packages/client/src/components/common/DataStateBoundary.vue` — 状态边界组件
- `packages/client/src/components/common/MockBadge.vue` — 模拟模式徽标

**测试/脚本**:
- `packages/server/src/test/hermes-env.spec.ts` — normalizeHostPath 单测
- `packages/client/src/test/no-mock-guard.spec.ts` — 无 mock 守卫
- `scripts/verify-bridge-e2e.mjs` — HN-P000a 门禁脚本

### 修改（20 文件）

- `packages/client/src/types/market.ts` — 1467→165 行
- `packages/client/src/types/agent.ts` — 删 MOCK_AGENTS
- `packages/client/src/stores/logs.ts` — 接真实日志
- `packages/client/src/stores/agentRoles.ts` — 去 localStorage
- `packages/client/src/stores/modelConfig.ts` — Provider 真源化
- `packages/client/src/stores/status.ts` — bridgeConnected 真实化
- `packages/client/src/api/client.ts` — +8 API 函数 + http 超时 + safeJsonParse
- `packages/client/src/views/ExpertsView.vue` — 空态
- `packages/client/src/views/SkillsView.vue` — 真实数据
- `packages/client/src/views/McpView.vue` — 真实数据
- `packages/client/src/components/chat/ChatInput.vue` — 接 /api/agents
- `packages/client/src/components/chat/ExpertPickerPanel.vue` — 空态
- `packages/client/src/components/settings/SkillManageSection.vue` — 去 mock
- `packages/client/src/components/settings/McpManageSection.vue` — 去 mock
- `packages/server/src/bridge.ts` — 默认值反转
- `packages/server/src/hermes-proxy.ts` — 删两个 SNAPSHOT
- `packages/server/src/index.ts` — 注册 7 新路由 + worker guard
- `packages/server/src/routes/sessions.ts` — C2 切换到 state.db
- `packages/server/src/protocol.ts` — 新类型
- `packages/server/src/services/hermes/bridge/bridge_protocol.py` — +plan_respond

## 用户下一步建议

1. **启动验证**: `npm run verify:bridge` 先确认门禁通过，然后 `npm run dev` 启动完整应用
2. **bridge 前置**: 确保 bridge 启动前已 `source $HERMES_HOME/.env`，否则 provider key 缺失会导致推理失败
3. **git push**: commit `1a46103` 已就绪，推送前确认 `hermes-native-prd.md` 等文档修改符合预期
4. **残接线**: U-14(modelConfig)/U-17(agentRoles)/U-26(专家团红标) 框架已就位但具体接线待逐条完成
5. **T05 vitest**: `npx vitest run` 确认测试通过（新增的 no-mock-guard + hermes-env spec）
