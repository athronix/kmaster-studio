# 变更目标（CHANGE-OBJECTIVE-kmaster-studio）

> 阶段：Phase 1 调研 · 版本：v0.1

## 1. 总体目标
从零构建 **kmaster-studio**：一个完全操作/管理/使用 hermes-agent 的前端 Studio，UI 与 WorkBuddy 桌面端一致，技术架构复用 hermes-studio，开发全程遵循 DDD + plan-first。

## 2. 里程碑路线（M1-M5）
| 阶段 | 范围 | 交付里程碑 | 备注 |
|------|------|------------|------|
| **M1** | server 骨架 + AgentBridge 打通 + F1/F2/F3 | 能连真实 hermes-agent 流式对话、停止 | 最小可运行闭环 |
| **M2** | F4/F5/F6 卡片 + F7 会话管理 + F10 Artifact 面板 | WorkBuddy 式主界面完整 | 三栏常驻 + 卡片体系 |
| **M3** | F8/F9/F11/F12/F19 模式/模型/技能/MCP/上传 | 管理面完整 | |
| **M4** | F13/F15/F16/F17/F18/F22 记忆/自动化/子代理/队列/压缩/用量 | 全功能对齐 | |
| **M5** | F20 终端 / F21 Profile / Electron 桌面壳 / 打包分发 | 桌面化 | Web 优先，壳后置 |

## 3. 交付物定义（每里程碑）
- 源码：`packages/client/src/**`、`packages/server/src/**`、`bin/`、`scripts/`。
- 文档：DDD 六索引 + 设计/测试/配套文档；每个里程碑含 `docs/design/` 与 `docs/research/` 对应文档。
- 验证：Vitest 单测 + Playwright E2E（聊天/路由/认证回归）；每里程碑测试通过率纳入交付报告。
- 审核件：与 WorkBuddy 的差异清单（供用户 R1-R4 审核）。

## 4. 关键非目标（本期不做）
- 不复制 WorkBuddy 云端专属能力（OneID 登录、云 Agent、IM 通道、腾讯文档、专家市场）。
- 不修改 hermes-agent / hermes-studio 源码（只读参考）。
- 首版默认 Web 优先，Electron 桌面壳留到 M5。

## 5. 待用户确认（R1-R4）
1. **R2 范围**：第一迭代做 M1？还是 M1+M2？
2. **R3 后端模式**：M1 直接对接真实 hermes-agent（Bridge）？还是先用 Mock 契约服务前端先行？
3. **R1 UI 对齐深度**：仅布局/交互范式对齐（推荐）；还是额外对齐云端专属（需 mock）；或像素级复刻？
4. **R4 交付**：每里程碑产出差异清单供审核 + DDD 文档；是否需额外交付报告落盘？

> 以上确认后将进入 Phase 2 设计（需求基线化 → 技术方案 → 测试方案），并用 plan-first 建立完整任务树。
