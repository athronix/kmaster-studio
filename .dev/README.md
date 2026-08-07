# kmaster-studio 开发说明

> 本文档由 DDD-Skill 管理，仅在项目信息变更时更新，不参与常规原子变更流程。

## 项目定位
一款**展现与交互对齐 WorkBuddy 桌面端**、**技术架构复用 hermes-studio**、**后端完全由 hermes-agent 提供服务**的 Agent 前端 Studio。

## 技术架构（hermes-studio 骨架）
- 前端：Vue 3 `<script setup lang="ts">` + Pinia + vue-router + Naive UI + vue-i18n + SCSS
- 实时通信：Socket.IO 客户端（命名空间 `/chat-run`），REST 走 `/api/*`
- 服务端：Koa + @koa/router + socket.io + better-sqlite3 + pino
- Agent 接入：AgentBridge（Node 客户端 + Python bridge 子进程，连接 hermes-agent 的 `run_agent.AIAgent`）
- 桌面化（后期）：Electron 薄壳

## 关键约束
- `hermes-agent` 与 `hermes-studio` 为**只读参考**；kmaster-studio 是独立新工程。
- 所有写 hermes 数据的操作只经 CLI（`hermes config set` 等）或 `~/.hermes` 用户数据目录，不改源码。
- 「前端展示/操作几乎与 WorkBuddy 一致」，调整需经用户审核（R1–R4 确认机制）。

## 开发规范
- 严格遵循 DDD-Skill（七阶段 + 文档先行 + 变更原子化 + 索引即时同步）。
- 严格遵循 plan-first Skill（先规划后执行、任务树追踪、执行-验证-反馈闭环）。
- 视图层零网络调用：所有请求经 `api/` → server；socket 事件在 `api/hermes/chat.ts` 全局注册后按 session 分发到 store。
