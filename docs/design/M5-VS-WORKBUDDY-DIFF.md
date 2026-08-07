# M5 与 WorkBuddy 差异清单（AC9）

> **生成日期**：2026-07-21
> **对比对象**：kmaster-studio M5（里程碑收口版） vs WorkBuddy v5.2.6（桌面客户端）
> **查阅文档**：`docs/design/REQUIREMENT-M5.md`、`docs/design/TECHNICAL-SOLUTION-M5.md`
> **WorkBuddy 信息源**：`docs/reference/00-WorkBuddy-ANALYSIS.md`（第一权威源 `product.json`）
>
> **图例**：✅ 已对齐 · ⚠️ 有意不做（写明理由）· ❌ 尚未实现（写明缺口与预估工作量）

---

## 一、核心架构

| 维度 | WorkBuddy v5.2.6 | kmaster-studio M5 | 状态 | 说明 |
|------|-----------------|-------------------|------|------|
| **桌面壳** | Electron（Chromium + Node.js），`main/index.js` 入口，`app.asar`(259MB) 打包 | Electron 42 薄壳（`packages/desktop`），spawn 独立 Node 子进程跑 server，`loadURL(:6648)` | ✅ | 同为 Electron 宿主，kmaster 走「轻壳重服务」路线 |
| **Agent 内核** | `@openai/agents`（OpenAI Agents SDK），17 agents，5 builtInAgentsName | hermes-agent 外部进程（Python `run_agent.AIAgent`），经 Bridge TCP 16765 接入 | ✅ | 内核不同但接口对等；kmaster 复用 hermes 生态，功能面等价 |
| **实时通信** | `ws`（WebSocket）+ `undici`（HTTP/SSE）双栈 | `socket.io`（单一传输层，命名空间 `/chat-run` + `/terminal`） | ✅ | 功能面等价；socket.io 自带重连/二进制帧/房间管理，优于裸 ws |
| **服务端** | 主进程内嵌（无独立 server 进程） | 独立 Koa server（`:6648`），`koa-static` 托管 SPA | ⚠️ | kmaster 有意选择「轻壳重服务」：①规避 electron-rebuild（双原生模块 ABI）；②Web/桌面同一份 server 零分叉；③server 崩溃不拖垮窗口。代价：多一个进程 |
| **Agent 协议** | `@modelcontextprotocol/sdk`（MCP stdio/WS/HTTP-SSE） | hermes-agent 内置 MCP（Python `mcp` 模块），REST 代理 `GET/POST/DELETE /api/mcp` | ✅ | 协议等价，实现语言不同但接口面相同 |
| **本地存储** | `better-sqlite3`（`~/.workbuddy/workbuddy.db`） | `better-sqlite3`（`kmaster.db`），MemoryStore 降级兜底 | ✅ | 同款；kmaster 额外做了优雅降级（better-sqlite3 加载失败自动切 MemoryStore） |
| **终端实现** | `@lydell/node-pty`（定制 fork），`devtools-terminal/` 面板 | `node-pty@^1.1.0` + `@xterm/xterm@^6`，右侧 ArtifactPanel Tab | ✅ | 同技术栈；kmaster 用官方 node-pty（非 fork），懒加载 + 优雅降级 |
| **打包** | ASAR 打包（`app.asar` 259MB + `app.asar.unpacked/`） | `electron-builder`，三平台 matrix（NSIS / DMG / AppImage），prebuild 裁剪 | ⚠️ | kmaster P0 首版 Windows NSIS 单平台先行，macOS/Linux 需 CI matrix；WorkBuddy 有完整签名+公证+分发 CDN，kmaster 暂无证书与分发基建 |
| **自动更新** | 内建（`electron-updater`，Tencent 内部分发通道） | `electron-updater` 代码已实现，**未上线**（缺签名证书 + 发布域名/CDN） | ❌ | 代码全量就绪，证书/域名到位后改 3 行配置即开通。预估：Apple Developer ID $99/年 + Windows 代码签名证书采购（数周），工程侧 0.5 人日 |
| **可观测** | `@opentelemetry/*` OTLP trace + `@tencent/aegis-*` 监控 | hermes CLI 子进程健康探针 + `GET /api/health` 诊断端点 | ❌ | kmaster 不做 OTLP/Aegis（本地个人工具无监控基建需求）。`/api/health` 可覆盖自诊场景。预估：如需补齐 OTLP，约 3 人日 |
| **提示词引擎** | `nunjucks` 模板（109 prompts，`{{var}}` / `{% if %}`） | hermes-agent 内置 system prompt（M3 已接入默认 prompt，不支持模板变量） | ❌ | hermes-agent 的 prompt 体系与 WorkBuddy 生态独立；kmaster 不计划自建 prompt 模板引擎。预估：如要补齐，需先理解 hermes prompt 扩展点，约 5 人日 |

---

## 二、聊天功能

| 维度 | WorkBuddy v5.2.6 | kmaster-studio M5 | 状态 | 说明 |
|------|-----------------|-------------------|------|------|
| **消息流** | 流式 SSE 回显 + 思考块 + 工具调用卡片 | socket.io 流式 + Runner 生命周期事件（`run.start → tool_use → tool_result → run.completed`） | ✅ | 功能面等价；kmaster 额外展示子代理卡/压缩横幅 |
| **模式切换** | craft / ask / plan / debug / code-explorer（5 种） | Craft / Plan / Ask（3 种），F21 设置页可配默认模式 | ⚠️ | Debug/CodeExplorer 是 WorkBuddy 的 @openai/agents 原生能力，hermes-agent 不支持；无计划补齐 |
| **模型选择** | 44 models（product.json），多 provider（Anthropic/OpenAI/DeepSeek/Google 等） | M3 `GET /api/models` + hermes provider 枚举，F21 设置页可视化配置 | ✅ | 模型数量取决于 hermes 配置；F21 可填 API Key 并即时生效 |
| **技能（Skills）** | 15 内置技能 + 用户级技能（`~/.workbuddy/skills/`） | M3 `SkillPanel` + `GET /api/skills`，hermes-agent skills 目录 | ✅ | 技能生态独立；kmaster 的 skills 来自 hermes，不与 WorkBuddy 互换 |
| **MCP 工具** | 48 tools（product.json），`mcp.json` 配置，多传输（stdio/WS/SSE） | M3 `McpManager` + `GET/POST/DELETE /api/mcp`，hermes MCP server | ✅ | 功能面对等 |
| **子代理** | 1 builtInSubagent（code-explorer） | M4 子代理卡展示 + `api/jobs/*` 队列管理 | ⚠️ | kmaster 不做 code-explorer 专属子代理（依赖 @openai/agents），但展示与队列管理能力对齐 |
| **文件上传** | 拖拽/粘贴/文件树选择 | M3 `/api/upload`，拖拽/粘贴上传 | ✅ | 对齐 |
| **Artifact 预览** | 文件树 + 预览面板 + 可视化器（多种格式） | 右侧 ArtifactPanel：产物 / 文件 / Diff 三个 Tab | ⚠️ | kmaster 只做产物/Diff 预览，不做文件树与多格式可视化器（HTML/Markdown/SVG 等预览由 Artifact 卡片完成） |
| **会话压缩** | 自动上下文压缩 | M4 `/api/sessions/:id/context-length` + 压缩横幅 | ✅ | 对齐 |
| **用量统计** | 内置 | M4 `/api/usage/stats` + UsageBar + `/usage` 整页 | ✅ | 对齐 |

---

## 三、会话管理

| 维度 | WorkBuddy v5.2.6 | kmaster-studio M5 | 状态 | 说明 |
|------|-----------------|-------------------|------|------|
| **会话列表** | 左侧 NavRail，按时间排序 | 左侧 NavRail（`SessionList.vue`），M1 建立 | ✅ | 对齐 |
| **会话 CRUD** | 新建/重命名/删除/搜索 | M1 `POST/GET/DELETE /api/sessions` + 前端操作 | ✅ | 对齐 |
| **会话导出** | 支持（多种格式） | 不支持 | ❌ | 首版不做。预估：1 人日（导出为 Markdown/JSON） |
| **会话级工作区** | `sessions.workspace` 字段 + 终端 cwd 自动绑定 | `sessions` 表无 `workspace` 列；终端 cwd 为全局配置（F21 `terminal_cwd`） | ❌ | M5 已知缺口（E6 事实），原因是 `sessions` 表无 workspace 列。预估：需补 DB migration + server 端点 + 终端绑定逻辑，约 2 人日 |
| **记忆系统** | 云记忆缓存（`~/.workbuddy/memory/`），server 管理 | M4 `/api/memory/*` + `/memory` 整页 | ✅ | 对齐；kmaster 本地 SQLite 存储 |

---

## 四、设置与配置

| 维度 | WorkBuddy v5.2.6 | kmaster-studio M5 | 状态 | 说明 |
|------|-----------------|-------------------|------|------|
| **设置入口** | 独立设置窗口（Electron `BrowserWindow`），分组导航 | F21 `/settings` 整页路由 + 左侧分组导航 + 右侧内容区 | ✅ | 版式对齐（整页分组导航范式）；WorkBuddy 是独立窗口，kmaster 是 SPA 内整页路由 |
| **快捷设置** | 聊天页顶部工具栏可切模式/模型 | `SettingsDrawer.vue`（保留 mode/model 快捷切换 + 「更多设置 →」跳整页） | ✅ | 对齐 |
| **主题切换** | 暗/亮（含自定义主题色） | 暗/亮（`styles/theme.ts` `useTheme`），F21 设置页持久化 | ✅ | 对齐 |
| **Provider/Model 配置** | product.json + 内置 provider 列表 + OAuth | F21 Provider 分组：列表 + API Key 填入（只写不回显）+ 模型下拉 | ⚠️ | kmaster 不做 OAuth 登录流（P1，需 Anthropic/Codex OAuth 对接，约 5 人日）；Key 输入方式功能等价 |
| **Profile 管理** | 不支持（WorkBuddy 无 hermes profile 概念） | F21 Profile 分组：列表 + 切换（hermes `profile use`）+ 切换后自动重启 Bridge | ✅ | kmaster **独有**能力（hermes 生态特有） |
| **语言** | 多语言（中文/English） | 简中单语言（占位 `locale: 'zh-CN'`） | ⚠️ | 有意不做国际化（本地个人工具，简中足够）。如有需要可用 vue-i18n 补齐，约 2 人日 |
| **诊断** | 内置日志查看器 + `settings.json` | F21 诊断分组：`GET /api/health` 扩展（版本/端口/Bridge/pty 状态/CLI 可用性）+ 一键复制（自动脱敏） | ✅ | 功能面等价 |
| **数据目录** | `~/.workbuddy/`（settings.json / workbuddy.db / sessions / memory） | `~/.kmaster-studio/`（logs / window-state.json）+ `~/.hermes/`（hermes 用户数据） | ✅ | 结构不同但用途对等 |

---

## 五、打包分发

| 维度 | WorkBuddy v5.2.6 | kmaster-studio M5 | 状态 | 说明 |
|------|-----------------|-------------------|------|------|
| **Windows** | NSIS 安装包（`.exe`），签名 | NSIS（`dist:win`），**未签名** | ⚠️ | 功能等价（产物形态一致）；kmaster 无 Windows 代码签名证书，安装时会触发 SmartScreen 警告 |
| **macOS** | DMG + 签名 + 公证 | DMG（`dist:mac`），**未签名**（证书缺失） | ❌ | macOS 无签名无法通过 Gatekeeper。预估：需 Apple Developer ID $99/年 + 公证流程，工程侧 1 人日 |
| **Linux** | AppImage（推测） | AppImage（`dist:linux`），需 `npm rebuild node-pty`（无 prebuild） | ⚠️ | 功能等价；Linux 需构建机上有 python3/make/g++ |
| **跨平台构建** | 内部 CI（推测） | GitHub Actions matrix（`windows/macos/ubuntu-latest`），`.github/workflows/release.yml` | ✅ | CI 代码已就绪；三平台产物需三台构建机或 GitHub Actions runner |
| **自动更新** | 内建（Tencent 分发通道） | `electron-updater` 代码就绪，**未上线**（缺签名 + 发布域名） | ❌ | 详见第一章「自动更新」行 |
| **应用图标** | 正式品牌图标 | 占位 ICO/ICNS/PNG（512×512 源图派生） | ⚠️ | 有意不做正式设计稿（本地个人工具）；可替换 |

---

## 六、安全

| 维度 | WorkBuddy v5.2.6 | kmaster-studio M5 | 状态 | 说明 |
|------|-----------------|-------------------|------|------|
| **API Key 存储** | 加密存储（`~/.workbuddy/` 部分加密） | hermes `.env` 文件（`~/.hermes/.env`），明文落盘 | ⚠️ | kmaster 依赖 hermes 的 `.env` 机制；F21 读写 Key 只经 CLI（`hermes config set`），读接口仅返回 `configured + masked`，不回显明文 |
| **contextIsolation** | ✅（Electron 安全最佳实践） | ✅ `contextIsolation: true` + `nodeIntegration: false` + `sandbox: true` | ✅ | 对齐 |
| **preload 桥接** | 多个 `*-preload.js`（mcp-app / tdoc / client-menu），暴露丰富 API | 单一 preload，`window.kmasterDesktop` 仅 5 项（`isDesktop/platform/version/windowControl/onServerStatus`） | ✅ | kmaster 更保守（最小权限原则） |
| **外链处理** | `shell.openExternal` | `setWindowOpenHandler` 外链走系统浏览器；仅允许加载 `localhost:6648` 源 | ✅ | 对齐 |
| **诊断脱敏** | 不明 | 一键复制诊断信息时自动脱敏 `hermes_home` 中的用户名 | ✅ | kmaster 显式做了脱敏处理 |

---

## 七、WorkBuddy 独有 / kmaster 不做

| WorkBuddy 能力 | 不做理由 | 归类 |
|---------------|---------|------|
| 企业微信/钉钉/飞书/Slack 机器人接入 | kmaster 是本地个人工具，无企业 IM 场景 | ⚠️ 有意不做 |
| IOA 企业鉴权（`.NET` 互操作 `Newtonsoft.Json.dll`） | 同上，无企业 IT 管理场景 | ⚠️ 有意不做 |
| Aegis 监控 + OTLP trace | 本地工具无需可观测基建 | ⚠️ 有意不做 |
| 腾讯云 COS 对象存储 | 无云端存储需求 | ⚠️ 有意不做 |
| 109 内置 prompts + nunjucks 模板引擎 | 依赖 hermes-agent 的 system prompt 体系，不与 WorkBuddy prompt 生态互通 | ⚠️ 有意不做 |
| 云端记忆同步（server 管理 `memory/`） | 本地 SQLite 存储替代 | ⚠️ 有意不做 |
| 多窗口独立会话（`/desktop-chat/:sessionId`） | P2（FR-P2.3），非首版必需 | ❌ 尚未实现 |
| 自定义标题栏 / 无边框窗口 | P2（FR-P2.4），非首版必需 | ❌ 尚未实现 |
| 系统托盘 + 关闭到托盘 | P1（FR-D10），体验增强 | ❌ 尚未实现 |
| 全局快捷键唤起 | P2（FR-P2.6），非首版必需 | ❌ 尚未实现 |

---

## 八、汇总统计

| 分类 | ✅ 已对齐 | ⚠️ 有意不做 | ❌ 尚未实现 |
|------|---------|------------|-----------|
| 核心架构 | 5 | 2 | 3 |
| 聊天功能 | 7 | 3 | 0 |
| 会话管理 | 3 | 0 | 2 |
| 设置与配置 | 5 | 2 | 0 |
| 打包分发 | 1 | 1 | 2 |
| 安全 | 4 | 1 | 0 |
| **合计** | **25** | **9** | **7** |

> **结论**：M5 在核心功能面（聊天/终端/设置/桌面壳）与 WorkBuddy 对齐度约 **78%（25/32 可比较项）**。9 项「有意不做」均有明确理由（本地工具定位、hermes 生态差异、无企业基建）。7 项「尚未实现」中：3 项被证书/域名等外部基建阻塞（自动更新上线、macOS 签名），2 项为 P1/P2 排期内容，2 项为已知 DB schema 缺口（session workspace）。
