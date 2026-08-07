# kmaster-studio

> **hermes-agent 前端 Studio**：展现与交互对齐 WorkBuddy 桌面端，技术架构复用 hermes-studio，后端完全由 hermes-agent 提供服务。

---

## 项目定位

一款**全平台 Agent 工作台**：在一个应用内完成「聊天 + 看产物 + 敲命令 + 调配置」的完整闭环，支持两种宿主形态：

| 形态 | 入口 | 适用场景 |
|------|------|---------|
| 🌐 **Web 版** | 浏览器打开 `http://<host>:6648` | 本地、局域网、服务器部署，无需安装 |
| 🏠 **桌面版** | Electron 双击图标启动 | Windows/macOS/Linux 原生体验，托盘常驻 |

**核心设计原则：同一份 SPA + 同一份 server，Web 与桌面功能等价。** 桌面壳只是多了一层 Electron 宿主（系统托盘、原生对话框、自动更新），所有桌面专属功能在 Web 下均有优雅降级。

| 能力 | 说明 |
|------|------|
| 💬 **聊天** | 流式对话 + 思考块 + 工具调用卡片 + 子代理卡 + 压缩横幅 + 权限/澄清卡 |
| 🧠 **记忆** | 会话级记忆管理（`/memory` 整页） |
| ⏰ **自动化** | Cron 定时任务 + 子代理编排 + 队列管理 |
| 📊 **用量** | UsageBar + `/usage` 整页统计 |
| 🖥️ **内置终端** | 右侧面板 xterm 终端（`node-pty` 起本机 shell），实时回显、尺寸自适应 |
| ⚙️ **设置页** | 整页 `/settings`：Provider/Model/Profile/主题/终端/技能/MCP/诊断集中管理 |
| 🏠 **桌面壳** | Electron 薄壳：双击图标启动，自动拉起 server + 加载 SPA |
| 📦 **打包分发** | `electron-builder` 三平台（Windows NSIS / macOS DMG / Linux AppImage） |

---

## 技术架构

```
┌─ Electron 壳 (packages/desktop)      ← 进程宿主 + 最小桥接
├─ SPA (packages/client)               ← Vue 3 + Pinia + Naive UI + vue-router
├─ Koa Server (packages/server)        ← REST + socket.io + better-sqlite3
└─ hermes-agent (外部 Python)          ← Bridge TCP 16765
```

- **前端**：Vue 3 `<script setup lang="ts">` + Pinia + vue-router + Naive UI + SCSS
- **服务端**：Koa + @koa/router + socket.io（`/chat-run` + `/terminal` 双命名空间）+ better-sqlite3 + pino
- **终端**：`node-pty@^1.1.0` + `@xterm/xterm@^6`（懒加载 + 优雅降级）
- **桌面壳**：Electron 42（轻壳重服务：spawn 独立 Node 子进程跑 server）
- **Agent 接入**：AgentBridge（Node 客户端 → TCP 16765 → Python `run_agent.AIAgent`）

---

## 环境要求

- **Node.js** >= 20.0.0（推荐 22）
- **npm** >= 10
- **Python** >= 3.10（hermes-agent 运行时依赖）
- **hermes CLI**：已安装并可用（`hermes --version`）
- **Windows**：PowerShell 5.1+
- **macOS / Linux**：bash/zsh

---

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 开发模式（Web：server :6648 + Vite proxy :6649）
npm run dev
# 浏览器打开 http://localhost:6648 或 http://localhost:6649

# 3. 生产构建
npm run build
npm start                    # 浏览器打开 http://localhost:6648
```

---

## Web 部署

kmaster-studio 是 **Web-first** 架构——server 自带 SPA 托管（`koa-static`），无需 Nginx 或其他 Web 服务器。

### 本地使用
```bash
npm run build                # 构建 client + server
npm start                    # 启动 server → 浏览器打开 http://localhost:6648
```

### 局域网 / 服务器部署
```bash
# server 默认监听 localhost（安全）。如需局域网访问，设 PORT 和 HOST：
HOST=0.0.0.0 PORT=6648 npm start
# 其他设备浏览器打开 http://<your-ip>:6648
```
⚠️ 若部署到公网，请在前面加 Nginx/Caddy 反代 + HTTPS，server 本身不提供 TLS。

### Web 版与桌面版的差异

| 功能 | Web 版 | 桌面版 |
|------|--------|--------|
| 聊天 / 终端 / 设置 / 记忆 / 自动化 | ✅ | ✅ |
| 系统托盘（最小化到托盘） | ❌ 浏览器无托盘 | ✅ |
| 原生文件夹选择对话框 | ❌ 退化为文本输入 | ✅ |
| 自动更新 | ❌ 无需（刷新浏览器即可） | ✅ electron-updater |
| 窗口状态记忆 | ❌ 依赖浏览器 | ✅ 自动保存/恢复 |

> 所有桌面专属 API 经 `packages/client/src/utils/desktop-bridge.ts` 统一探测——Web 下返回安全默认值，不会报错或白屏。

---

## 桌面壳开发

```bash
# 首次：安装依赖 + 构建 desktop 包
npm install
npm run build:desktop

# 启动桌面壳（自动拉起 server + 打开窗口）
npm run dev:desktop

# 壳内调试
# - F12 / Ctrl+Shift+I：开发者工具
# - Ctrl+R：重载页面
```

### 壳启动流程

1. 主进程启动 → 显示 loading 页（「正在启动 kmaster 服务…」）
2. 探测 `http://localhost:6648/api/health`
   - **已有 server**（200）：直接复用，`loadURL(:6648)`
   - **无 server**：spawn 独立 Node 子进程运行 `packages/server/dist/index.js`
3. 探活成功 → `loadURL('http://localhost:6648')` → 显示 SPA
4. 30s 超时 → 显示错误页（错误摘要 + 重试按钮 + 日志路径）

### 端口复用机制

- 若 `:6648` 已被外部 `npm run dev:server` 占用，壳**不重复拉起 server**
- 关闭壳时，外部 server **不被误杀**（`spawnedByMe=false` 标记）
- 壳自己拉起的 server 在退出时 **级联 kill 进程树**（Windows `taskkill /T /F`）

---

## 终端功能

### 打开终端

点击右侧面板「终端」Tab → 惰性创建 pty 会话 → 显示本机 shell 提示符。

### Shell 探测规则

| 平台 | 优先级 |
|------|--------|
| Windows | `powershell.exe` |
| macOS / Linux | `$SHELL` → `/bin/zsh` → `/bin/bash` |

### 当前工作目录

终端 cwd 取 `设置页 → 通用 → 终端默认工作目录`；未配置时回落 server 启动 cwd。

### node-pty 不可用时

终端 Tab 显示「终端不可用：node-pty 加载失败」提示，其余功能（聊天/记忆/设置等）**不受影响**。查看「设置 → 诊断」获取详细错误信息。

---

## 设置页

访问 `#/settings`（或点击导航栏 ⚙️ 按钮）进入设置页。

| 分组 | 功能 |
|------|------|
| **通用** | 主题（暗/亮）、语言（简中）、终端默认工作目录 |
| **Agent 默认** | 默认模式（Craft/Plan/Ask）、默认模型 |
| **Provider & Model** | Provider 列表 + API Key 填入（只写不回显）+ 默认模型下拉 |
| **Profile** | hermes profile 列表 + 激活切换（切换后自动重启 Bridge） |
| **技能** | 内嵌 SkillPanel（类目树 + 卡片 + 搜索） |
| **MCP** | 内嵌 McpManager（列表 + 添加 + 移除） |
| **诊断** | server 版本/端口/Bridge 状态/pty 可用性 + 一键复制（自动脱敏） |

> 聊天页的 `SettingsDrawer`（快捷设置 mode/model）**保留不动**，底部新增「更多设置 →」链接跳 `/settings`。

---

## 打包命令

```bash
# Windows（NSIS 安装包 + portable）
npm run dist:win

# macOS（DMG）
npm run dist:mac

# Linux（AppImage）
npm run dist:linux

# ⚠️ macOS/Linux 产物需在对应平台构建（node-pty 原生模块 ABI）
# CI 方式：推送 tag v* 触发 GitHub Actions matrix 构建
git tag v1.0.0
git push origin v1.0.0
```

### 环境变量

| 变量 | 默认 | 说明 |
|------|------|------|
| `KMASTER_NO_EMPTY_DIST` | `0` | 设为 `1` 时构建不允许空 dist 目录 |
| `KMASTER_MAX_TERMS` | `8` | 最大终端并发数 |

---

## 排障指南

### ELECTRON_RUN_AS_NODE 泄漏

**现象**：全局 `ELECTRON_RUN_AS_NODE=1` 导致 `electron` 命令退化为 Node 运行��。

**原因**：壳的 `server-process.ts` 用 `ELECTRON_RUN_AS_NODE=1` 让 Electron 以纯 Node 模式跑 server 入口。若该环境变量泄漏到系统级，则所有 `electron .` 命令都会变成 `node .`。

**解决**：

```bash
# Windows PowerShell
[Environment]::SetEnvironmentVariable('ELECTRON_RUN_AS_NODE', $null, 'User')

# macOS / Linux
unset ELECTRON_RUN_AS_NODE
```

**预防**：壳的 spawn 只在子进程 `env` 中注入 `ELECTRON_RUN_AS_NODE=1`，不修改 `process.env`。

### NekoBox TUN 拦截 127.0.0.1 连接

**现象**：real-bridge 模式下 `tcp://127.0.0.1:16765` 连不上。

**原因**：NekoBox TUN 模式会拦截 `127.0.0.1` 裸 IPv4 TCP 连接。

**解决**：

- 方案 A：NekoBox 路由规则中排除 `127.0.0.1/32`
- 方案 B：使用 `HERMES_BRIDGE_MOCK=1` 走 Mock Bridge（默认）
- 方案 C：改为 `localhost`（解析到 `::1` 绕 TUN），但**需先确认 Python bridge 实际 bind 地址**，不可盲改

### KMASTER_NO_EMPTY_DIST 构建失败

**现象**：`npm run build` 报 `KMASTER_NO_EMPTY_DIST=1` 错误。

**原因**：client dist 目录为空或构建未完整执行。

**解决**：

```bash
# 分步构建排查
npm run build   # 等价于 npm run build:client && npm run build:server

# 验证 client dist
ls packages/client/dist/
# 应包含 index.html 等文件

# 若 client 构建失败，单独重试
npm -w packages/client run build
```

### 端口占用

```bash
# 检查端口占用
# Windows
netstat -ano | findstr :6648

# macOS / Linux
lsof -i :6648
```

### server 日志

桌面壳启动时 server 的 stdout/stderr 写入：

- **Windows**：`%LOCALAPPDATA%/kmaster-studio/logs/server.log`
- **macOS**：`~/Library/Logs/kmaster-studio/server.log`
- **Linux**：`~/.config/kmaster-studio/logs/server.log`

---

## 端口约定

| 端口 | 用途 | 说明 |
|------|------|------|
| **6648** | Koa server（HTTP + socket.io + koa-static） | 生产端口，壳 loadURL 目标 |
| **6649** | Vite dev server（仅开发模式） | 代理到 6648 |
| **16765** | AgentBridge TCP | hermes-agent Python bridge |

> ⚠️ 壳的 `loadURL`、探活请求、Vite proxy **一律使用 `localhost`**（解析到 `::1`）以绕开 TUN 代理。禁止使用 `127.0.0.1` 或 `0.0.0.0`。

---

## 项目结构

```
kmaster-studio/
├── packages/
│   ├── client/          Vue 3 SPA（Vite + Pinia + Naive UI）
│   │   ├── src/
│   │   │   ├── api/         REST + socket 封装
│   │   │   ├── components/  UI 组件
│   │   │   ├── stores/      Pinia stores
│   │   │   ├── views/       页面视图
│   │   │   ├── router/      路由配置（hash 模式）
│   │   │   ├── styles/      主题 + CSS 变量
│   │   │   └── utils/       工具函数
│   │   └── package.json
│   ├── server/          Koa server（REST + socket.io）
│   │   ├── src/
│   │   │   ├── routes/      API 端点
│   │   │   ├── services/    终端等业务逻辑
│   │   │   ├── bridge.ts    AgentBridge 客户端
│   │   │   ├── hermes-proxy.ts  hermes CLI 代理
│   │   │   ├── db.ts        SQLite 持久化
│   │   │   └── index.ts     server 入口
│   │   └── package.json
│   └── desktop/         Electron 薄壳（进程宿主 + 最小桥接）
│       ├── src/main/        主进程（窗口/生命周期/server 管理/更新）
│       ├── src/preload/     contextBridge 桥接
│       ├── electron-builder.yml
│       └── package.json
├── docs/
│   ├── design/          需求 + 技术方案（M1–M5）
│   ├── reference/       WorkBuddy / hermes-studio 参考分析
│   └── research/        调研文档
├── scripts/             QA 验证脚本
├── .github/workflows/   CI（release matrix）
└── package.json         monorepo root
```

---

## 开发规范

- **分层纪律**：views → stores → api → server（视图层零直接网络调用）
- **零删除**：不改动或删除任何既有组件
- **双宿主等价**：同一份 SPA 同时跑在浏览器与壳内，桌面能力经 `desktop-bridge` 探测
- **优雅降级**：`node-pty` 加载失败时终端提示不可用，其余功能不受影响
- **CSS 变量**：主题走 `--km-*` CSS 变量，暗/亮两套在 `styles/theme.ts` 切换
- **代码风格**：Google-style，TypeScript 严格模式，显式类型注解

---

## 许可

Private — 本地个人工具，不对外分发。
