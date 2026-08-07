# kmaster-studio 全项目缺陷与 Bug 体检报告

- **体检日期**：2026-08-05
- **体检人**：严过关（QA 工程师）
- **代码基线**：`27b7783`（HEAD，工作区干净，仅 `__pycache__/` 与 `tmp2/` 未跟踪）
- **门禁基线（已复验）**：`vue-tsc --noEmit` 0 error；`vitest run` 139/139 全过（9 文件，4.11s）
- **体检定位**：找出**类型检查与现有单测抓不到**的问题，重点验证「kmaster-studio 作为 hermes-agent 加强客户端」的数据主权是否成立

---

## 一、执行摘要

### 1.1 缺陷统计

| 级别 | 数量 | 说明 |
|---|---|---|
| **P0 阻断** | 5 | 产品定位不成立 / 核心链路开箱即假 |
| **P1 严重** | 10 | 功能空壳 / 数据双真源 / 静默失效 / profile 路径分裂 / 孤儿 worker |
| **P2 一般** | 9 | 竞态、错误处理、死代码 |
| **P3 优化** | 4 | 测试盲区、组织问题 |
| **合计** | **28** | 含 PM 追补「默认 mock 置顶」(D-04) 与体检追加 D-27 / D-28 |

### 1.2 最致命的问题（PM 指定最高危置顶）

> 🔴 **PM 许清楚在体检复核中指定最高危（置于顶，严重度高于 D-01）**：**D-04｜`HERMES_BRIDGE_MOCK` 默认值为 mock**。不设环境变量即走 `MockBridge`，开箱即假的聊天界面，极易被误判为「功能已完成」。当前运行实例因显式设 `=0` 才是真的，但**默认值决定所有新环境 / CI / 他人 clone 的开箱体验**。

1. **【D-04 / P0 · PM 指定最高危】对话主链路默认就是 Mock**
   `bridge.ts:463` `const mock = (process.env.HERMES_BRIDGE_MOCK ?? '1') !== '0'` —— 不设环境变量即走 `MockBridge`。`MockBridge.chat()` 用 `sleep()` 逐字吐固定文案，连计划卡 / 工具卡 / 授权卡 / Artifact 都是编造的，正文明写「这是来自 kmaster-studio（Mock 模式）的回复」。这是**整条对话主链路**开箱即假，比单页假数据更致命——它会让所有人（含新同事、CI、演示观众）误以为「对话已打通」。

2. **【D-01 / P0】市场三大页 100% 假数据，零 API 调用**
   `ExpertsView` / `SkillsView` / `McpView` 直接 `import MOCK_*` 渲染，全程不发一个请求。真实 hermes 有 **161 个 SKILL.md**（47 个技能组），UI 却在展示 20 条编造的技能。这不是「加强客户端」，是「贴了 hermes 皮的独立 Demo」。

3. **【D-02 / P0】`/api/skills` 静默降级为 6 条硬编码假数据**
   实测 `curl /api/skills` 只返回 6 条，真实为 161。根因：`runPython()` 不设 `cwd`、不用 hermes venv 解释器，`import hermes_cli` 必然 `ModuleNotFoundError`，被 `catch {}` 无日志吞掉后回退 `SKILLS_SNAPSHOT`。**用户和开发者都无从察觉数据是假的。**

4. **【D-03 / P0】桌面壳 preload 根本没实现文件系统桥**
   `packages/desktop/src/preload/index.ts` 暴露的 `desktopApi` 只有 `isDesktop/platform/version/windowControl/onServerStatus/onUpdateStatus/retryServer/checkForUpdates/pickFolder` —— **完全没有** `readTextFile` / `listDir` / `openPath` / `pathExists`。而客户端 4 处依赖它们。后果：日志页在**桌面端也永远是 mock**、定时任务产物全文永远为空、「打开文件」按钮是死的。

### 1.3 需要澄清的既有判断（体检发现与初始假设不符，已取证纠正）

> 这些点主理人初始扫描判断有偏差，按证据更正，避免后续设计走错方向：

| 初始判断 | 实际情况（证据） | 结论 |
|---|---|---|
| 「没有 skills / mcp / models 路由」 | **存在**，但错置在 `routes/sessions.ts:44/49/54`（`/api/models`、`/api/skills`、`/api/mcp`），且 `config.ts:7` 明确注释禁止在别处重复添加 | 部分证伪 → 降级为 P3 组织问题（D-25）；真正缺失的是 **agents / logs** |
| 「Python bridge 的 interrupt/steer/title 仍是空壳」 | **证伪**。`bridge_gateway.py:470-483` 全部实到 pool；`bridge_pool.py:240` 真实 `from run_agent import AIAgent`；`bridge_protocol.py:81-86` 已为 Node 的 dot-case action 建了别名 | 基本健康，仅 `plan_respond` 有缺口（D-08） |
| 「better-sqlite3 未编译会静默回退内存」 | **证伪**。`db.ts:3` 注明 M5/Q4 已修复静默问题，回退时 `console.warn` + 经 `/api/health` 暴露 `db_kind`/`db_error`。实测本机 `db_kind:"sqlite"`，未降级 | 已修复，不计缺陷 |
| 「API-key 明文存 localStorage」 | **证伪**。`modelConfig.ts:434-437` persist 前强制 `apiKey:''`；服务端 DTO 层无明文字段，只有 `configured`/`masked`（`hermes-proxy.ts:1200`） | 设计正确，不计缺陷 |
| 「HERMES_BRIDGE_MOCK 默认 mock」 | **属实且危险**（`bridge.ts:463`），但当前**运行实例**已设 `=0`（实测 `/api/health` 返回 `bridge_mock:false`） | 仍记 P0（D-04），因为默认值决定开箱体验 |

---

## 二、数据主权违规矩阵

> 判定标准：凡「Agents / 资源 / 配置 / 数据 / 状态 / 会话」类实质数据，真源必须是 hermes；客户端只应持有 hermes 不具备的**纯表现层**状态（如栏宽、主题、折叠态）。

| # | 数据项 | 当前实现位置 | 当前来源 | 应有 hermes 来源 | 违规级别 |
|---|---|---|---|---|---|
| 1 | **技能列表（市场页）** | `views/SkillsView.vue:23` | `MOCK_SKILLS`（20 条编造） | `$HERMES_HOME/skills/**/SKILL.md`（**161 个**） | 🔴 严重 |
| 2 | **技能列表（后端枚举）** | `hermes-proxy.ts:161-182` | 失败静默回退 `SKILLS_SNAPSHOT`（6 条） | 同上；或修复 `hermes_cli` 导入 | 🔴 严重 |
| 3 | **专家 / 专家团** | `views/ExpertsView.vue:25` | `MOCK_EXPERTS`(30) + `MOCK_TEAMS`(5) | hermes 无对应概念 → 应基于 `$HERMES_HOME/hermes-agent/optional-skills`（20 类）或明确定义为客户端增强并标注 | 🔴 严重 |
| 4 | **Agents（@提及列表）** | `types/agent.ts:79`；`ChatInput.vue:62,337` | `MOCK_AGENTS`（5 条硬编码，`status` 恒 `idle`） | `$HERMES_HOME/hermes-agent/agent/`；无 `/api/agents` 路由 | 🔴 严重 |
| 5 | **MCP 服务器（市场页）** | `views/McpView.vue:22` | `MOCK_MCPS`（15 条编造） | `$HERMES_HOME/config.yaml` → `mcp_servers`（实测端点已能返回真数据） | 🔴 严重 |
| 6 | **模型列表 / 鉴权态** | `hermes-proxy.ts:96-108,120-134` | 失败静默回退 `MODELS_SNAPSHOT`，且 `authenticated:true` 硬编码 | `hermes_cli.inventory.build_models_payload()` / `$HERMES_HOME/.env` | 🔴 严重 |
| 7 | **会话** | `db.ts` + `routes/sessions.ts:116` | kmaster 自有 SQLite（实测 10 条） | `$HERMES_HOME/sessions/`（实测 28 条），两套互不相通 | 🔴 严重 |
| 8 | **日志** | `stores/logs.ts:294-296` | 无桥即 `mockEntries()`；**无 `/api/logs` 路由** | `$HERMES_HOME/logs/`（实测 13 个文件，含 `agent.log`） | 🔴 严重 |
| 9 | **Agent 角色** | `stores/agentRoles.ts:4` | `localStorage['km.v3.agentRoles']` 自称「唯一真源，不与后端同步」 | hermes 侧角色/子代理配置 | 🟠 中 |
| 10 | **账号 Profile** | `stores/status.ts:44,156` | `localStorage['km.v3.profile']` | `$HERMES_HOME/auth.json` | 🟠 中 |
| 11 | **模型配置** | `stores/modelConfig.ts:443` | `localStorage['km.v3.modelConfig']` | `$HERMES_HOME/config.yaml` + `.env`（Key 已正确走后端） | 🟠 中 |
| 12 | **记忆库 seed** | `hermes-proxy.ts:361-375` | 真目录缺失时播种 3+2 条假记忆 | `$HERMES_HOME/memories/` | 🟡 轻 |
| 13 | **定时任务沙箱** | `hermes-proxy.ts:706-712` | CLI 不可用时落 `~/.kmaster-studio/mock/cron` | `$HERMES_HOME/cron/` | 🟡 轻 |
| 14 | 布局 / 主题 / 语言 | `stores/layout.ts`、`useI18n.ts` | localStorage | —（hermes 无此概念） | ✅ 合规 |

**统计**：违规数据项 **13 / 14**，其中 🔴 严重 8 项。**唯一合规的只有纯表现层状态。**

---

## 三、分级缺陷清单

### P0 — 阻断级（5）

---

> 🔴 **本表置顶项（PM 指定最高危）**：**D-04｜`HERMES_BRIDGE_MOCK` 默认值为 mock**（`bridge.ts:463`）。产品经理在体检复核中明确要求「严重度高于 D-01，直接置顶」——理由：它是**对话主链路**开箱即假，会让所有新环境 / CI / 他人 clone 误判为「功能已完成」。完整条目见下方 **D-04｜…** 一节（缺陷编号保持稳定，避免全文 35 处交叉引用失配）。

---

**D-01｜市场三大页 100% mock，零 API 调用**
- **级别**：P0
- **文件**：`packages/client/src/views/SkillsView.vue:14,23,69`；`views/ExpertsView.vue:15-16,25,39-40,80-81`；`views/McpView.vue:14,22,62`
- **现象**：三个市场页全部 `import { MOCK_* } from '../types/market'` 并直接 `computed(() => MOCK_SKILLS)` 渲染，整个组件生命周期内不发起任何 HTTP 请求。
- **取证**：
  ```
  grep -rn "MOCK_" views/ → SkillsView:23 / ExpertsView:25 / McpView:22
  grep -rn "/api/" views/  → 三个文件均无任何 /api 引用
  真实 find $HERMES_HOME/skills -name SKILL.md | wc -l → 161
  UI 展示 MOCK_SKILLS.length → 20
  ```
- **根因**：V2「卡片市场」按纯 UI 稿实现，从未接线；`api/client.ts` 里的 `getSkills/getMcp/getModels` 只被 `stores/chat.ts` 与设置页使用，市场页走了另一条假数据路径。
- **影响**：产品核心定位（hermes 加强客户端）不成立。用户在市场页安装/召唤的一切对象在 hermes 侧都不存在。
- **修复建议**：
  1. `SkillsView` 改用 `useSkillList()`（已存在，接 `store.skills` ← `/api/skills`）；
  2. `McpView` 改用 `useMcpList()`（已存在且 add/delete 是真实的）；
  3. `ExpertsView`：先决策「专家」概念映射（建议映射到 `$HERMES_HOME/hermes-agent/optional-skills` 的 20 个领域包），再新增 `/api/experts`；
  4. 删除 `types/market.ts` 中 `MOCK_EXPERTS`/`MOCK_TEAMS`/`MOCK_SKILLS`/`MOCK_MCPS`（1467 行中约 1300 行），仅保留类型与 `isExpert/isSkill` 等守卫函数。

---

**D-02｜`/api/skills` 与 `/api/models` 静默降级为硬编码快照**
- **级别**：P0
- **文件**：`packages/server/src/hermes-proxy.ts:52-58`（`runPython`）、`:96-117`（快照）、`:120-134`（`getModels`）、`:161-182`（`getSkills`）
- **现象**：`/api/skills` 只返回 6 条；`/api/models` 只返回 openai/anthropic/local 三组共 5 个模型。
- **取证**：
  ```
  curl localhost:6648/api/skills | grep -o '"name"' | wc -l   → 6
  find $HERMES_HOME/skills -name SKILL.md | wc -l              → 161

  # 复现根因
  $ python3 -c "from hermes_cli.banner import get_available_skills"
  ModuleNotFoundError: No module named 'hermes_cli'

  # 用 hermes venv 且 cwd 正确时可导入
  $ cd $HERMES_HOME/hermes-agent && venv/Scripts/python.exe -c "..."
  IMPORT OK, skills= 0     # 注意：即使导入成功该 API 也返回 0
  ```
- **根因**：三重叠加——
  1. `runPython` 用 `process.env.HERMES_PYTHON ?? 'python3'`（PATH 里的系统 python，非 hermes venv）；
  2. `spawn` 未传 `cwd`，`hermes_cli` / `tools` 不在 `sys.path`；
  3. `catch { return SKILLS_SNAPSHOT }` 为**裸 catch 且无任何日志**，故障完全不可观测。
- **影响**：所有依赖枚举的功能（模型切换、技能面板、Provider 鉴权态）全部基于假数据；且失败无声，排障成本极高。
- **修复建议**：
  1. `resolveHermesPython()`：优先 `$HERMES_HOME/hermes-agent/venv/Scripts/python.exe`（win）/ `venv/bin/python`，回退 `HERMES_PYTHON` → `python3`；
  2. `runPython` 增加 `cwd: path.join(resolveHermesHome(), 'hermes-agent')` 与 `env.PYTHONPATH`；
  3. **技能枚举改为直接扫盘**：`glob($HERMES_HOME/skills/**/SKILL.md)` 解析 front-matter（`get_available_skills()` 实测返回 0，不可依赖）；
  4. 所有 `catch` 改为 `catch (e) { console.warn('[hermes-proxy] getSkills fallback:', e); ... }`，并在返回值上带 `degraded:true` 标志，前端显式提示「降级数据」。

---

**D-03｜桌面壳 preload 未实现文件系统桥，4 处调用全为死路**
- **级别**：P0
- **文件**：`packages/desktop/src/preload/index.ts:128-175`（`desktopApi` 定义）；消费方 `client/src/stores/logs.ts:266,272,313,318`、`stores/chat.ts:157`、`components/layout/RightPanel.vue:83`
- **现象**：客户端 `utils/desktop-bridge.ts:68-74` 声明了 `readTextFile/listDir/openPath/pathExists`，但桌面壳从未实现。
- **取证**：
  ```
  grep -nE "readTextFile|listDir|openPath|pathExists" desktop/src/preload/index.ts → 无匹配
  grep -nE "ipcMain.(handle|on)" desktop/src/main/index.ts
    → 仅 WINDOW_CONTROL / RETRY_SERVER / CHECK_UPDATES / PICK_FOLDER
  ```
  代码自证：`stores/logs.ts:163` 的 mock 条目文案就是
  `'preload 未暴露 readTextFile，日志读取降级'` —— 开发者已知此事。
- **根因**：`desktop-bridge.ts` 的接口按「预期契约」写死，desktop 包未同步实现，且**无任何契约测试**（desktop 包零测试）。
- **影响**：
  - 日志页在 Web **和桌面端**都恒为 mock（`hasFileSystemBridge()` 恒 false）；
  - `openJobArtifact` 的 `readTextFile` 恒返回 `null` → 定时任务产物全文永远为空；
  - `RightPanel.vue:83` 的「打开文件」按钮点击无任何反应，也无错误提示。
- **修复建议**：
  1. 短期（推荐，兼顾 web-first 定位）：**改走服务端**，新增 `GET /api/logs`、`GET /api/fs/read?path=`（带白名单：仅允许 `$HERMES_HOME` 子树，`path.resolve` 后校验 `startsWith`），让 Web / 桌面同源；
  2. 长期：在 `preload/index.ts` 补 4 个方法 + `main/index.ts` 补对应 `ipcMain.handle`，并加路径白名单校验；
  3. 无论哪条路，补一个 **preload 契约测试**：断言 `desktop-bridge.ts` 声明的方法集 ⊆ preload 实际导出集。

---

**D-04｜`HERMES_BRIDGE_MOCK` 默认值为 mock，开箱即假**
- **级别**：P0
- **文件**：`packages/server/src/bridge.ts:463`、`hermes-proxy.ts:1490`、`index.ts:76`
- **现象**：`const mock = (process.env.HERMES_BRIDGE_MOCK ?? '1') !== '0'` —— 不设环境变量即走 `MockBridge`。
- **取证**：`bridge.ts:230-283` 的 `MockBridge.chat()` 用 `sleep()` 逐字吐固定文案，连计划卡/工具卡/授权卡/Artifact 都是编造的；回复正文里明写「这是来自 kmaster-studio（Mock 模式）的回复」。当前运行实例因显式设了 `=0` 才是真的（`/api/health` → `bridge_mock:false`）。
- **根因**：M1 开发期为脱离 hermes 独立调试而设的默认值，交付前未反转。
- **影响**：任何新环境（新机器、CI、他人 clone）默认得到一个**会假装工作的**聊天界面，极易误判为「功能已完成」。
- **修复建议**：默认反转为 `'0'`（真实优先），Mock 需显式 `HERMES_BRIDGE_MOCK=1` 开启；同时在 `MockBridge` 激活时于启动日志打 `console.warn('⚠️ MOCK BRIDGE ACTIVE')`，并让 `/api/health` 的 `bridge_mock:true` 在 UI StatusBar 上显示醒目角标。

---

**D-05｜Agents 数据完全由客户端编造，且无 `/api/agents` 路由**
- **级别**：P0
- **文件**：`packages/client/src/types/agent.ts:79-115`；`components/chat/ChatInput.vue:26,62,337`
- **现象**：`MOCK_AGENTS` 5 条硬编码（KMaster 助手/架构师/工程师/Code Reviewer/测试专家），`status` 恒为 `'idle'`，永不更新。ChatInput 的 `@` 提及下拉直接遍历它。
- **取证**：`curl localhost:6648/api/agents` → `HTTP 404 Not Found`（text/plain）。服务端 7 个路由文件中无 agents。
- **根因**：Agent 概念在设计阶段被当作纯 UI 装饰，未定义与 hermes 的映射。
- **影响**：用户 `@架构师` 后，消息实际发给默认 agent，**行为与 UI 承诺不符**——这是会产生错误预期的静默偏差。
- **修复建议**：先做概念对齐（hermes 侧对应 `agent/` 子代理还是 skills 组合？），再新增 `GET /api/agents`；在对齐完成前，应**移除** ChatInput 的 `@` 提及入口而非展示假数据。

---

### P1 — 严重（8）

---

**D-06｜`authenticated: true` 硬编码，虚假鉴权状态**
- **级别**：P1
- **文件**：`packages/server/src/hermes-proxy.ts:97,101`（快照）→ `:1274`（`authenticated: g.authenticated ?? false`）
- **现象**：`MODELS_SNAPSHOT` 中 OpenAI / Anthropic 两组写死 `authenticated: true`。D-02 降级触发时，`listProviders` 直接透传该值。
- **取证**：`curl /api/models` → `{"provider":"openai","authenticated":true,...}`（当前正处于降级态）。
- **影响**：设置页会显示 OpenAI/Anthropic「已鉴权」，**即使用户从未配置过 Key**。用户据此判断配置完成，实际调用必失败。
- **修复建议**：快照中一律改为 `authenticated: false`；`listProviders` 的 `authenticated` 改为由 `configured`（读 `.env` 实算，`:1266` 已有）推导，不信任枚举来源。

---

**D-07｜技能安装 / 卸载是纯空壳**
- **级别**：P1
- **文件**：`packages/client/src/composables/useSkillList.ts:35-42`
- **现象**：
  ```ts
  async function install(_skillName: string) {
    // 技能安装逻辑 — 当前通过 store.invokeSkill 触发
    await store.loadSkills();          // 只是重新拉列表
  }
  async function uninstall(_skillName: string) {
    // 卸载当前为占位
    await store.loadSkills();
  }
  ```
  参数名带 `_` 前缀（未使用），函数体只重新拉取列表。
- **根因**：从 `SkillPanel.vue` 提取逻辑时未实现真实动作，注释写了「占位」但无 TODO 标记，`vue-tsc` 与 lint 均无告警。
- **影响**：`SkillManageSection.vue` 点「安装」→ loading 转一圈 → 列表刷新 → **看起来成功了，实际什么都没发生**。这是最具欺骗性的一类空壳（有反馈但无效果）。
- **修复建议**：Python 侧已有 `skills_reload`（`bridge_protocol.py:55`）与 `agent.skill_bundles`（`bridge_pool.py:1460`）能力。应新增 `POST /api/skills/:name/install` 与 `DELETE /api/skills/:name`，经 bridge 的 `reloadSkills` action 落地；在后端能力就绪前，UI 按钮应置 `disabled` 并标注「即将支持」。

---

**D-08｜`plan_respond` 未在 gateway 白名单，计划卡批准/拒绝静默失效**
- **级别**：P1
- **文件**：`bridge/bridge_protocol.py:86`（有别名）vs `:90-101`（`EXPOSED_ACTIONS` 无 `plan_respond`）；`bridge_gateway.py:459-464`；`server/src/run-chat.ts:344-345`
- **现象**：TS 发 `action:'plan.respond'` → `normalize_action` 成功映射为 `plan_respond` → `is_exposed_action('plan_respond')` 返回 **False** → gateway 回 `ERROR_UNKNOWN_ACTION`。
- **取证**：
  ```
  ACTION_ALIASES 含 "plan.respond": "plan_respond"        (bridge_protocol.py:86)
  EXPOSED_ACTIONS = {chat, interrupt, steer, get_session_title, get_history,
                     get_output, get_result, status_if_loaded, approval_respond,
                     clarify_respond, destroy, status, ping, list, mcp_*,
                     skills_reload, switch_session_model, command,
                     background_poll, complete_background_notification,
                     compression_respond, context_estimate}
  → 无 plan_respond                                        (bridge_protocol.py:90-101)
  ```
  且 `run-chat.ts:345` 为 `try { ... } catch { /* ignore */ }`，错误被吞。
- **影响**：真实 bridge 模式下，用户点击计划卡的「批准/拒绝」**毫无反应且无任何错误提示**，agent 永久等待。Mock 模式下反而"正常"（`bridge.ts:289` 直接 resolve），因此该缺陷只在接真 hermes 后暴露。
- **修复建议**：`EXPOSED_ACTIONS` 补 `"plan_respond"`；`bridge_gateway.py:_dispatch` 走 `_on_respond` 分支（与 approval/clarify 同构，第 476 行条件扩为 `("approval_respond","clarify_respond","plan_respond")`）；`run-chat.ts:345` 的 catch 改为回传 `error` 事件给前端。

---

**D-09｜会话双真源：kmaster.db 与 hermes sessions 互不相通**
- **级别**：P1
- **文件**：`packages/server/src/db.ts`；`routes/sessions.ts:116-131`
- **现象**：kmaster 用自有 SQLite 存会话，与 hermes 的会话存储完全隔离。
- **取证**：
  ```
  curl /api/sessions | grep -o '"id"' | wc -l          → 10   (kmaster.db)
  ls $HERMES_HOME/sessions | wc -l                     → 28   (hermes)
  ```
  两边 ID 体系不同（kmaster 用 `randomUUID()`，hermes 为 `request_dump_<ts>_<hash>.json`）。
- **影响**：在 hermes CLI 里的历史会话在 kmaster 中不可见，反之亦然。「加强客户端」应当能看到 hermes 的全部会话。
- **修复建议**：明确分层——kmaster.db 只保留**客户端增强字段**（workspace 绑定、UI 折叠态、置顶），会话主体（id/title/messages）改为经 bridge 的 `get_history` 读 hermes；`GET /api/sessions` 改为合并视图（hermes 为准 + kmaster 增强字段 left join）。

---

**D-10｜日志功能全链路缺失：无 `/api/logs` 路由，Web/桌面均恒 mock**
- **级别**：P1
- **文件**：`packages/client/src/stores/logs.ts:252,294-296`；服务端无对应路由
- **现象**：`logs.ts` 只经 desktop bridge 读文件（因 D-03 恒失败）→ 落 `mockEntries()` 并置 `isMock=true`。
- **取证**：
  ```
  curl localhost:6648/api/logs   → HTTP 404
  ls $HERMES_HOME/logs | wc -l   → 13   (agent.log, agent.log.1, desktop.log, curator/ ...)
  grep -n "fetch\|/api/" stores/logs.ts → 仅注释中出现，无真实调用
  ```
- **影响**：诊断能力为零。用户在「日志」页看到的 15 条是编造的，其中一条还写着「preload 未暴露 readTextFile」，会让用户误以为是真实告警。
- **修复建议**：新增 `GET /api/logs?file=&tail=`，服务端读 `$HERMES_HOME/logs/`（路径白名单 + `tail` 上限）；`stores/logs.ts` 改为 API 优先、desktop bridge 次之、mock 仅在开发环境启用（`import.meta.env.DEV`）。

---

**D-11｜`python_ok` 健康信号误导**
- **级别**：P1
- **文件**：`packages/server/src/hermes-proxy.ts:1462-1474`（`probePythonOk`）→ `:1492`
- **现象**：`probePythonOk()` 只执行 `runPython('print(1)')`，只要系统有任意 python 就返回 `true`。
- **取证**：实测 `/api/health` 返回 `python_ok:true`，但同一环境下 `import hermes_cli` 失败（见 D-02）。**健康检查绿灯，功能实际降级。**
- **影响**：诊断页 / StatusBar 显示一切正常，掩盖了 D-02 的降级。
- **修复建议**：改探 `import hermes_cli, run_agent; print("ok")`，并在 `HealthInfo` 增补 `hermes_module_ok` 与 `skills_source: 'real' | 'snapshot'` 字段，让降级态在 UI 上可见。

---

**D-12｜`agentRoles` / `profile` 以 localStorage 为唯一真源**
- **级别**：P1
- **文件**：`stores/agentRoles.ts:4`（注释明写「唯一真源，不与后端同步」）；`stores/status.ts:44,152-165`
- **现象**：Agent 角色定义、账号 profile 只存浏览器本地。
- **影响**：换浏览器 / 清缓存即全部丢失；Web 多端不同步；与 hermes 的 `auth.json`、角色配置完全脱节。这是客户端越权持有实质数据的典型。
- **修复建议**：`profile` 改读 `$HERMES_HOME/auth.json`（经新增 `GET /api/profile`）；`agentRoles` 待 D-05 概念对齐后落 hermes 侧；localStorage 降级为**离线缓存**而非真源（保留读取加速，但以服务端响应为准覆盖）。

---

**D-13｜`resetPassword` 返回假成功**
- **级别**：P1
- **文件**：`packages/client/src/stores/status.ts:141-147`
- **现象**：
  ```ts
  return { ok: true, message: `重置链接已发送至 ${target}（本地模式为模拟结果）` };
  ```
  不做任何网络请求，恒返回成功。
- **影响**：虽然括号里标了「模拟结果」，但 `ok:true` 会驱动 UI 走成功态（绿色 ResultDialog）。用户可能真的去等邮件。
- **修复建议**：本地模式下该入口应直接隐藏或 `disabled`；若必须保留，返回 `ok:false` + 明确文案「本地模式不支持密码重置」。

---

### P2 — 一般（9）

---

**D-14｜health 轮询无并发守卫、无超时，存在请求堆叠与过期覆写**
- **级别**：P2
- **文件**：`packages/client/src/stores/status.ts:79-104`
- **现象**：`startPolling` 每 10s 无条件 `void refreshHealth()`，`refreshHealth` 内无 in-flight 标志、无 `AbortController`。
- **根因**：`getHealth()` 最终走 `api/client.ts:33` 的裸 `fetch`，无 timeout。
- **影响**：服务端慢/挂起时（>10s），请求无限堆叠；且**先发后到**的旧响应会覆写新响应，`serverOnline` 可能在 online/offline 间抖动。
- **修复建议**：加 `let inflight = false` 早退；或加单调递增 `seq`，回写前校验 `seq === latestSeq`；`getHealth` 传 `AbortSignal.timeout(5000)`。

---

**D-15｜`http()` 无超时控制**
- **级别**：P2
- **文件**：`packages/client/src/api/client.ts:32-52`
- **现象**：所有 REST 调用共用的 `http<T>()` 直接 `fetch(...)`，无 `signal`。
- **影响**：任一后端挂起会让对应 UI 永久 loading（无 spinner 超时兜底）。`stores/modelConfig.ts:288` 单独用了 `withTimeout`，说明团队已意识到问题但只打了局部补丁。
- **修复建议**：在 `http()` 内统一 `signal: opts?.signal ?? AbortSignal.timeout(15000)`，并把 `AbortError` 归一为 `HttpError(408, 'timeout')`。

---

**D-16｜`api/client.ts:51` 裸 `JSON.parse` 可抛非受控异常**
- **级别**：P2
- **文件**：`packages/client/src/api/client.ts:51`
- **现象**：成功分支 `return JSON.parse(raw) as T` 未包 try-catch（失败分支 `:41` 反而包了）。
- **影响**：若某端点返回 200 但非 JSON（如误命中静态资源、代理插入的 HTML），抛出的是裸 `SyntaxError` 而非 `HttpError`，调用方的 `instanceof HttpError` 分支失效，错误提示退化为「Unexpected token '<'」。
- **修复建议**：包 try-catch，转 `HttpError(res.status, 'invalid_json', ...)`。

---

**D-17｜`openJobArtifact` 竞态守卫按 `file` 比对，判据不唯一**
- **级别**：P2
- **文件**：`packages/client/src/stores/chat.ts:148-164`
- **现象**：`stillCurrent()` 判据是 `jobArtifact.value?.run.file === run.file`。
- **影响**：同一定时任务的两次运行若产物路径相同（覆写型输出），或两条记录 `file` 均为空串，守卫会误判为「仍是当前」，把旧内容写进新面板。属低频但真实的竞态。
- **修复建议**：改用单调递增 token：`let artifactSeq = 0`，`openJobArtifact` 内 `const my = ++artifactSeq`，回写前判 `my === artifactSeq`。这是通用且无歧义的做法。

---

**D-18｜`RealBridge` 事件解析大量 `as any`，缺字段校验**
- **级别**：P2
- **文件**：`packages/server/src/bridge.ts:353-364`
- **现象**：`(ev as any).runId`、`(ev as any).message`、`(ev as any).code`、`(ev as any).text` 共 5 处。
- **影响**：Python 侧事件契约变更（字段改名）时，TS 侧静默得到 `undefined` → `full` 变 `"undefined"` 或空串，且类型系统完全无法拦截。这正是「类型检查过了但仍有缺陷」的典型来源。
- **修复建议**：为 `BridgeEvent` 建判别联合类型（按 `type` 字段），用类型守卫 `isRunStarted(ev)` 替代 `as any`；`bridge_protocol.py` 的事件映射表应与 TS 类型定义做**契约测试**双向校验。

---

**D-19｜`@deprecated` 组件仍在被引用**
- **级别**：P2
- **文件**：`components/AppNav.vue`（← `App.vue`）、`components/chat/SessionList.vue`（← `layout/LeftSidebar.vue`、`composables/useSessionList.ts`）、`components/chat/ArtifactPanel.vue`（← `components/preview/TerminalPane.vue`）
- **现象**：三个组件标注 `@deprecated`（V1 遗留），但仍被现役文件引用。
- **影响**：新人无法判断哪套是现役实现；两套并存易产生行为分叉；打包体积虚增。
- **修复建议**：逐个确认引用是否为「实际渲染」还是「仅 import 未用」；确认无用后删除组件与引用；确有使用则移除 `@deprecated` 标记并纳入维护。

---

**D-20｜`bridgeConnected` 恒 false 导致大片死分支**
- **级别**：P2
- **文件**：`packages/client/src/stores/status.ts:22,33,53,58,64`
- **现象**：`const BRIDGE_ACCOUNT_ENABLED = false` → `bridgeConnected` 恒 false → `loggedIn` 恒 false → `statusTone` 永不返回 `'online'`，`statusText` 永不显示 `account.name`。
- **影响**：`'online'` 分支、`account.name` 显示分支、以及 StatusBar 对应的绿色样式全是不可达代码。`status.test.ts` 的 9 个测试也无法覆盖这些分支（因为常量写死）。
- **修复建议**：接入真实 hermes 鉴权态（`auth.json` / `/api/health` 的 `authenticated`）后打开；在此之前，删除不可达分支与对应 SCSS，避免维护幻觉。

---

**D-21｜`run-chat.ts` 交互响应错误被静默吞掉**
- **级别**：P2
- **文件**：`packages/server/src/run-chat.ts:345`（`plan.respond`），同文件其余 `approval/clarify` 响应处同构
- **现象**：`try { await bridge.respondPlan(...) } catch { /* ignore */ }`。
- **影响**：D-08 之所以「静默失效」正源于此。任何 bridge 侧拒绝都不会到达前端，用户只看到按钮点了没反应。
- **修复建议**：catch 内 `socket.emit('error', { code:'respond_failed', action:'plan.respond', message })`，前端在卡片上显示失败态并允许重试。

---

**D-22｜关键降级路径均为裸 `catch {}`，故障不可观测**
- **级别**：P2
- **文件**：`hermes-proxy.ts:131,179`（枚举降级）、`:311`（`readConfig`）、`bridge.ts:366,445`（malformed 行）、`constants/layout.ts:265,281`（localStorage）
- **现象**：全项目大量 `catch { /* ignore */ }`，不记录任何日志。
- **影响**：D-02 能长期潜伏正是因为此。生产环境无从判断当前是真实数据还是降级数据。
- **修复建议**：建立分级约定——**表现层**降级（localStorage、UI 偏好）可静默；**数据层**降级（枚举、配置读取、协议解析）必须 `console.warn` 并在 `/api/health` 暴露降级计数（如 `degraded_sources: ['skills','models']`）。

---

### P3 — 优化（4）

---

**D-23｜测试覆盖存在整层空白**（详见第四章）
- **级别**：P3（因其放大了上述所有 P0/P1 的潜伏期，实际优先级应提升）
- **文件**：`packages/client/src/stores/*.test.ts`（9 个，全部）
- **修复建议**：见第四章优先级清单。

---

**D-24｜`types/market.ts` 1467 行假数据进入生产包**
- **级别**：P3
- **文件**：`packages/client/src/types/market.ts:127-1436`
- **现象**：`MOCK_EXPERTS`(30) / `MOCK_TEAMS`(5) / `MOCK_SKILLS`(20) / `MOCK_MCPS`(15) 共约 1300 行常量，被 `views/*` 直接 import，会被 Vite 完整打进生产 bundle。
- **修复建议**：随 D-01 一并删除；若需保留供 Storybook/测试用，移至 `src/__fixtures__/` 并确保不被生产代码引用（可加 ESLint `no-restricted-imports` 规则）。

---

**D-25｜`/api/models|skills|mcp` 错置在 `routes/sessions.ts`**
- **级别**：P3
- **文件**：`packages/server/src/routes/sessions.ts:44-66`
- **现象**：模型/技能/MCP 三组端点定义在「会话」路由文件里，且 `routes/config.ts:7` 用注释禁止他人在别处添加，形成反直觉约定。
- **影响**：路由发现性差——本次体检初期即误判为「这些端点不存在」，说明该组织方式确实会误导人。
- **修复建议**：拆出 `routes/inventory.ts`（models/skills/mcp/后续 agents），`index.ts` 注册；更新 `config.ts:7` 的注释指向。

---

**D-26｜记忆库与定时任务的沙箱回退会播种假数据**
- **级别**：P3
- **文件**：`hermes-proxy.ts:361-375`（`MEMORY_SEED`）、`:706-712`（cron 沙箱）
- **现象**：真实目录缺失时落到 `~/.kmaster-studio/mock/`，并写入 3 条 memory + 2 条 user 假记忆。
- **影响**：用户可能误以为这是自己的真实记忆（内容还很像真的，如「用户偏好使用中文交流」）。本机因真实目录存在未触发。
- **修复建议**：沙箱模式下返回空列表 + 顶部醒目 banner「未检测到 hermes 记忆目录，当前为沙箱模式」，不播种任何内容。

---

## 四、测试覆盖盲区分析

### 4.1 现状

```
vitest run → Test Files 9 passed (9) / Tests 139 passed (139) / 4.11s
```

| 测试文件 | 用例数 |
|---|---|
| `stores/chat.test.ts` | 35 |
| `stores/modelConfig.test.ts` | 20 |
| `stores/layout.test.ts` | 17 |
| `stores/agentRoles.test.ts` | 15 |
| `stores/logs.test.ts` | 15 |
| `stores/jobs.test.ts` | 10 |
| `stores/usage.test.ts` | 10 |
| `stores/status.test.ts` | 9 |
| `stores/memory.test.ts` | 8 |

**全部 9 个文件都在 `stores/`。**

### 4.2 盲区矩阵

| 层 | 文件数 / 规模 | 测试数 | 覆盖 |
|---|---|---|---|
| Pinia stores | 9 个（9/11 有测试） | 139 | 🟢 好 |
| **Vue 组件** | **62 个 `.vue`** | **0** | 🔴 零 |
| **服务端 TS** | **15 个（约 2900 行）** | **0** | 🔴 零 |
| **Python bridge** | **8 个（5674 行）** | **0** | 🔴 零 |
| **desktop 主/预加载** | **5 个** | **0** | 🔴 零 |
| composables | 6 个 | 0 | 🔴 零 |
| `api/client.ts` | 1 个（约 300 行） | 0（仅被 mock） | 🔴 零 |
| `utils/desktop-bridge.ts` | 1 个 | 0 | 🔴 零 |
| router / 路由守卫 | 1 个 | 0 | 🔴 零 |
| E2E / 集成 | — | 0 | 🔴 零 |

**未被测试覆盖的代码占比估算：约 78%**（按文件数 9/108 客户端文件 + 0/15 服务端 + 0/8 Python）。

### 4.3 为什么 139 个测试全绿却漏掉了 5 个 P0

这是本次体检最重要的结论：

1. **stores 测试全程 mock `api/client`** → 永远测不到「后端返回的是降级假数据」（D-02、D-06）。测试断言的是「store 正确处理了返回值」，而非「返回值本身是真的」。
2. **零组件测试** → `views/*.vue` 直接 import MOCK 常量这件事，没有任何测试会失败（D-01）。
3. **零服务端测试** → `runPython` 的 cwd/解释器问题、路由契约、错误分支全无覆盖（D-02、D-11）。
4. **零跨包契约测试** → `desktop-bridge.ts` 声明的接口与 preload 实现之间没有任何校验（D-03）；TS `bridge.ts` 与 Python `bridge_protocol.py` 的 action 契约也无校验（D-08）。
5. **零 Python 测试** → 5674 行 bridge 代码完全未验证（D-08 的白名单遗漏正藏于此）。

> **一句话**：现有测试验证的是「代码按写的那样运行」，而非「代码做了该做的事」。要抓住本报告的缺陷，必须补**契约测试**与**集成测试**，而不是继续加 store 单测。

### 4.4 建议补测优先级

| 优先 | 测试类型 | 目标缺陷 | 建议做法 |
|---|---|---|---|
| 1 | **跨包契约测试** | D-03、D-08、D-18 | ① 断言 `desktop-bridge.ts` 声明方法集 ⊆ preload 导出集；② 断言 TS `RealBridge` 发出的每个 `action` 都 ∈ Python `EXPOSED_ACTIONS`（可用脚本解析两侧源码） |
| 2 | **服务端路由集成测试** | D-02、D-06、D-11 | supertest 起 Koa，断言 `/api/skills` 返回数 > 20、`/api/models` 的 `authenticated` 与 `.env` 一致 |
| 3 | **「无 mock 残留」守卫测试** | D-01、D-24 | 扫描 `src/views/**` 与 `src/components/**`，断言不出现 `MOCK_` 标识符（CI 红线） |
| 4 | **Python bridge 单测** | D-08 | pytest 覆盖 `normalize_action` / `is_exposed_action` / `to_worker_request` 三个纯函数，成本极低、收益高 |
| 5 | 组件冒烟测试 | D-07、D-13 | `@vue/test-utils` 挂载各 View，断言首屏发起了预期的 API 调用 |

---

## 五、体检结论与优先修复顺序

### 5.1 结论

**门禁绿灯（vue-tsc 0 error / vitest 139 全绿）具备误导性。** 两项门禁只能证明「代码语法自洽、store 逻辑自洽」，无法证明「数据是真的、功能是通的」。本次体检的 5 个 P0 全部落在门禁盲区内。

就核心质疑给出明确回答：

> **kmaster-studio 当前不是 hermes-agent 的加强客户端，而是一个「部分接线的独立应用」。**

- **已真实打通**（约 40%）：聊天主链路（Python bridge → `run_agent.AIAgent` 是真的）、MCP 读写（`config.yaml`）、记忆库（`memories/`）、定时任务（hermes CLI）、Provider Key（经 hermes CLI 写 `.env`）、会话持久化（SQLite 正常）。
- **假数据 / 空壳**（约 60%）：专家市场、技能市场、MCP 市场、Agents、日志、技能安装卸载、账号体系。
- **数据主权违规**：14 个数据项中 13 项违规，其中 8 项严重。

值得肯定的是：Python bridge 层（5674 行）质量明显高于前端市场层——协议别名、竞态防护、文件锁、会话路由都做得扎实。**缺陷高度集中在「UI 层与后端的接线」，而非底层能力缺失。** 这意味着修复的主要工作是「接线」而非「重建」，实际工作量可控。

### 5.2 优先修复顺序（建议分三批）

**第一批：止血 —— 消除「假装能用」（预计 1-2 天）**

> 原则：**宁可显示「未接入」，也不能显示假数据。** 先让系统诚实，再让系统完整。

| 序 | 缺陷 | 动作 |
|---|---|---|
| 1 | D-04 | `HERMES_BRIDGE_MOCK` 默认反转为真实；Mock 激活时启动告警 + UI 角标 |
| 2 | D-02 | 修 `runPython` 的解释器与 cwd；技能改为扫盘 `skills/**/SKILL.md` |
| 3 | D-06 | 快照 `authenticated` 改 false，由 `.env` 实算 |
| 4 | D-22 / D-11 | 降级路径加日志；`/api/health` 暴露 `degraded_sources` 与 `hermes_module_ok` |
| 5 | D-07 / D-13 | 空壳按钮一律 `disabled` + 「即将支持」，停止伪成功反馈 |

**第二批：接线 —— 让数据回归 hermes（预计 3-5 天）**

| 序 | 缺陷 | 动作 |
|---|---|---|
| 6 | D-01 | 三大市场页接真实 API（`useSkillList`/`useMcpList` 已就绪，直接换源） |
| 7 | D-10 / D-03 | 新增 `GET /api/logs` + `GET /api/fs/read`（路径白名单），日志页改走服务端 |
| 8 | D-08 | `EXPOSED_ACTIONS` 补 `plan_respond`；gateway 分支扩展 |
| 9 | D-09 | 会话改为 hermes 为主源 + kmaster 增强字段合并 |
| 10 | D-05 / D-12 | 定义 Agent 概念映射 → 新增 `/api/agents`；profile 改读 `auth.json` |

**第三批：加固 —— 防止复发（预计 2-3 天）**

| 序 | 缺陷 | 动作 |
|---|---|---|
| 11 | D-23 | 补契约测试（优先级 1、2、3、4，见 §4.4） |
| 12 | D-14 ~ D-17 | 竞态守卫、超时、JSON 解析加固 |
| 13 | D-24 / D-19 / D-20 | 删除 mock 常量、废弃组件、死分支 |
| 14 | D-25 / D-26 | 路由重组；沙箱不再播种假数据 |
| 15 | D-18 / D-21 | 事件判别联合类型；交互错误回传前端 |

### 5.3 给下游（架构师 / PM / 工程师）的关键提示

- **架构师**：设计 hermes 联动方案时，请优先明确 **Agent / 专家（Expert）两个概念在 hermes 侧的映射**（D-05）。这是目前唯一「hermes 无对应物」的数据项，也是唯一需要真正设计决策的地方——其余 12 项都是「接线」而非「设计」。同时建议明确**分层契约**：hermes 为数据主源，kmaster.db 仅存增强字段（D-09、D-12）。
- **PM**：写增量 PRD 时请把「诚实降级」列为验收标准——任何无法接通 hermes 的功能，UI 必须显式标注，不得以假数据占位（D-01、D-07、D-13、D-26）。
- **工程师**：`useSkillList` / `useMcpList` 已经是接好线的，市场页换源成本很低（D-01 第一步可能只需改 3 行 import）。请从这里开始拿快速收益。另请注意 D-02 的修复要同时解决「解释器」和「cwd」两件事，只改一个仍会失败。

---

## 附录 A：取证命令清单（可复现）

```bash
# 环境
export NODE="C:/Users/towyq/.workbuddy/binaries/node/versions/22.22.2/node.exe"
export H="/c/Users/towyq/AppData/Local/hermes"
export NO_PROXY=localhost,127.0.0.1

# 门禁复验
cd packages/client
$NODE ../../node_modules/vue-tsc/bin/vue-tsc.js --noEmit -p tsconfig.json   # 0 error
$NODE ../../node_modules/vitest/vitest.mjs run                              # 139/139

# D-01：市场页零 API
grep -rn "MOCK_" packages/client/src/views/          # SkillsView:23 ExpertsView:25 McpView:22
grep -rn "/api/" packages/client/src/views/          # 三个市场页无匹配

# D-02：技能数量对比
curl -s localhost:6648/api/skills | grep -o '"name"' | wc -l   # 6
find "$H/skills" -name SKILL.md | wc -l                        # 161
python3 -c "from hermes_cli.banner import get_available_skills" # ModuleNotFoundError

# D-03：preload 缺方法
grep -nE "readTextFile|listDir|openPath|pathExists" packages/desktop/src/preload/index.ts  # 无匹配
grep -nE "ipcMain\.(handle|on)" packages/desktop/src/main/index.ts                          # 仅 4 个

# D-04：mock 默认值
grep -n "HERMES_BRIDGE_MOCK" packages/server/src/bridge.ts     # :463 ?? '1'

# D-05 / D-10：缺失路由
curl -s -o /dev/null -w "%{http_code}\n" localhost:6648/api/agents   # 404
curl -s -o /dev/null -w "%{http_code}\n" localhost:6648/api/logs     # 404

# D-08：白名单缺口
grep -n "plan_respond" packages/server/src/services/hermes/bridge/bridge_protocol.py
# :86 在 ACTION_ALIASES；:90-101 的 EXPOSED_ACTIONS 无此项

# D-09：会话双真源
curl -s localhost:6648/api/sessions | grep -o '"id"' | wc -l   # 10
ls "$H/sessions" | wc -l                                        # 28

# 运行态健康
curl -s localhost:6648/api/health
# {"bridge_mock":false,"python_ok":true,"hermes_cli_ok":true,"db_kind":"sqlite",...}
```

## 附录 B：本次体检覆盖的 10 个维度

| # | 维度 | 结论 | 对应缺陷 |
|---|---|---|---|
| 1 | 数据主权违规 | 🔴 13/14 违规 | D-01,02,05,06,09,10,12,24,26 |
| 2 | 空壳功能 | 🔴 4 处确认（已追调用链，非仅看 TODO） | D-03,07,13，D-05 |
| 3 | 错误处理缺失 | 🟠 裸 catch 泛滥、无超时 | D-15,16,21,22 |
| 4 | 并发与竞态 | 🟡 2 处（轮询守卫、artifact token） | D-14,17 |
| 5 | 类型漏洞 | 🟡 `as any` 集中在 bridge 事件解析 | D-18 |
| 6 | 测试盲区 | 🔴 组件/服务端/Python 全零 | D-23 |
| 7 | 后端 server | 🟢 路由错误处理良好；SQLite 降级已修复 | D-25（组织问题） |
| 8 | bridge Python | 🟢 真实接 `run_agent`，非空壳；仅白名单缺口 | D-08 |
| 9 | 安全 | 🟢 API Key 处理正确；⚠️ 新增 fs 端点需路径白名单 | （D-03/D-10 修复时须注意） |
| 10 | 一致性/死代码 | 🟡 废弃组件仍被引用、死分支 | D-19,20,24 |

---

# 附录 C：real-bridge 连通性探针（T1.2 收尾项，应 PM 请求追加）

> 目的：确认 `HERMES_BRIDGE_MOCK=0` 下真实对话链路能否走通——结论直接决定 **T5 联动验证能否开展**。
> 所有进程已在探针结束后清理，环境已还原（`/api/health` 复验通过）。

## C.1 结论速览

**❌ 当前环境下真实对话链路走不通，T5 无法按原计划执行。**
但阻断原因**不是** NekoBox（该假设已证伪），而是下面 4 层递进的真实原因。

| 层 | 探针结果 | 判定 |
|---|---|---|
| ① 进程 | 16765 无任何监听 | Python bridge **根本没在运行** |
| ② 网络 | 三种 loopback 均 **4-16ms ECONNREFUSED** | 非拦截（拦截应为 TIMEOUT）→ **NekoBox 无关** |
| ③ 进程管理 | 杀 gateway 后 worker 存活并继续占端口 | **孤儿 worker 缺陷（新 D-28）** |
| ④ 运行时 | 干净 venv worker 下 chat **45s 零事件挂死** | MCP stdio 通道被 CMD banner 污染（环境级阻断） |

## C.2 逐层取证

**① 进程层：bridge 从未运行**
```
netstat -ano | grep ":16765"     → NOTHING LISTENING
```
此前 `/api/health` 返回 `bridge_mock:false`，服务端自认为处于真实模式，但对端不存在。
→ **`bridge_mock:false` 并不代表链路可用**，这是又一个健康信号误导（与 D-11 同类）。

**② 网络层：NekoBox 假设证伪**
```
127.0.0.1:16765  ->  ERROR ECONNREFUSED  (4ms)
::1      :16765  ->  ERROR ECONNREFUSED  (5ms)
localhost:16765  ->  ERROR ECONNREFUSED  (16ms)
[control] 127.0.0.1:6648 -> ERROR ECONNREFUSED (0ms)
[control] ::1      :6648 -> CONNECTED     (1ms)
```
- 16765 三种写法**一致快速拒绝**（4-16ms）。TUN 黑洞的特征是 **TIMEOUT**，不是即时 RST → 排除拦截。
- 对照组更关键：6648 的 `127.0.0.1` 也被拒、`::1` 却连通。这**不是** NekoBox，而是 `index.ts:27` `HOST = process.env.HOST ?? '::1'` —— 服务只绑了 IPv6 回环。
- 实测 bridge 启动后绑定的是 **`127.0.0.1:16765`（IPv4）**，与 `bridge.ts:301` 默认端点完全一致。

> **给工程师的结论**：`RealBridge` 端点**不需要**改成 `localhost`。真按 PM 担心的那样盲改成 `localhost` 反而会解析到 `::1`，而 bridge 绑的是 IPv4 → 立刻连不通。**保持 `127.0.0.1` 是正确的。**

**③ 进程管理层：孤儿 worker（新缺陷 D-28）**
第一次用系统 python 启动 gateway → 生成 worker（占 17567）。`taskkill` 掉 gateway 后：
```
tasklist | grep python
  python3.exe   28572        ← 孤儿 worker，仍存活
netstat | grep 17567
  TCP 127.0.0.1:17567  LISTENING  28572
```
随后用 venv python 重启 gateway，新 gateway **复用了这个旧的系统-python worker**，于是报
`WORKER_UNAVAILABLE: No module named 'yaml'`（系统 python 无 yaml；venv 有 yaml 6.0.3）。
→ 这一度把我引向错误的根因，必须记为缺陷（详见 D-28）。

**④ 运行时层：MCP stdio 通道被污染（真正的阻断点）**
彻底清理孤儿后用 venv 干净启动，chat 不再报错，但 **45016ms 内零事件**。worker 日志显示无限循环：
```
[worker:default] Failed to parse JSONRPC message from server
pydantic_core.ValidationError: 1 validation error for JSONRPCMessage
  Invalid JSON: input_value='Microsoft Windows [Version 10.0.26200.8973]\r'
  Invalid JSON: input_value='(c) Microsoft Corporation. All rights reserved.\r'
```
根因：`$HERMES_HOME/config.yaml` 中 `agentmemory` 用 `command: npx`、`codegraph` 用 `command: codegraph`。
Windows 上二者是 `.cmd` 批处理垫片，被 stdio MCP 客户端直接 spawn 时会把 **CMD 版权横幅打进 stdout**，
污染 JSONRPC 通道 → MCP 握手永不完成 → agent 初始化卡死 → chat 无任何事件返回。

**这属于 hermes 侧环境/配置问题，不是 kmaster 代码缺陷**，但它 100% 阻断 T5。

## C.3 对既有结论的影响（重要）

PM 提出「此前的联动验证可能都是 mock 下跑的」——**该担心成立，且比预想更彻底**：
real bridge 在本机**从未成功完成过一次端到端对话**（连 MCP 握手都过不去）。
凡历史文档中「对话链路已打通」的结论，若未注明 `HERMES_BRIDGE_MOCK=0`，都应视为 **mock 下的结论**。

但需澄清：**T1.2 主报告的结论不受影响**。因为 D-01~D-26 全部基于
①静态代码取证、②`hermes-proxy` 的 Python 子进程链路（不经过 bridge）、③HTTP 端点实测——
这三条路径都与 `bridge_mock` 无关。主报告中我从未声称「对话能通」。

## C.4 解除阻断的最短路径（给工程师）

1. **先修环境**（否则 T5 无法开始）：把 `config.yaml` 里 `agentmemory` / `codegraph` 两个 MCP 临时 `enabled: false`，或将 `npx` 改为 `npx.cmd` 并用 `shell=True` 方式 spawn；重跑本附录 C.2④ 的探针确认 chat 能返回 `completed`。
2. **再修 D-28**（孤儿 worker），否则每次调试都会被陈旧 worker 误导。
3. **然后才谈 T5**。在 1、2 未完成前，任何「联动验证通过」的结论都不可信。

复现脚本已留在 `tmp2/probe16765.mjs`（TCP 三写法 + 对照组）与 `tmp2/chat-e2e.mjs`（端到端 chat，45s 超时）。

---

# 附录 D：本轮追加的 2 个缺陷

**D-27｜profile 路径分裂：5 处用 root 而非 activeHome（P1）**
- **文件**：`hermes-proxy.ts:305`（`configPath`）、`:316`（`writeConfig`）、`:379`（`memoriesDir`）、`:633`（`resolveHermesBin`）、`:697`（`cronContext`）
- **现象**：这 5 处调用 `resolveHermesHome()`（**root**），而 `hermesChildEnv():285` 正确注入 `resolveActiveHermesHome()`（**profile 感知**）。
- **取证**：
  ```
  grep -n "resolveHermesHome()" hermes-proxy.ts
    → :305 configPath / :316 writeConfig / :379 memoriesDir / :633 bin / :697 cron
  resolveActiveHermesHome():263  →  active==='default' ? root : root/profiles/<active>

  # 当前为何看不出问题：
  ls $HERMES_HOME/active_profile   → 不存在 → 回落 'default' → root === activeHome
  ls $HERMES_HOME/profiles         → 目录不存在
  ```
- **影响**：一旦切到非 default profile，将出现**脑裂**——Python 子进程按 `profiles/<name>/` 运行，而 Node 侧直读的 config.yaml / memories / cron / hermes bin 仍指向 root。后果不止读错：`writeConfig`（:316）会把 MCP 配置**写进错误的 profile**，属数据损坏级。
- **为何现有测试测不到**：本机 `active_profile` 缺失使两者恰好相等，是**巧合而非正确性**。
- **修复建议**：5 处全部改为 `resolveActiveHermesHome()`；`resolveHermesRoot()` 仅保留给 profile 枚举与 `active_profile` 文件本身。**必须补一条非 default profile 下的路径平移用例**（建议：置 `active_profile=test` 并建 `profiles/test/`，断言 configPath 落在 `profiles/test/config.yaml`）。

**D-28｜gateway 退出后 worker 成为孤儿，且会被下个 gateway 复用（P1）**
- **文件**：`bridge_transport.py:87-124`（`WorkerProcess.start`）；`kmaster_bridge.py:40`（仅 `atexit.register(gateway.stop)`）
- **现象**：kill gateway 后 worker 进程存活并继续 LISTEN 其端口；新 gateway 启动时复用该陈旧 worker。
- **取证**：见 C.2③——孤儿 `python3.exe 28572` 持有 17567，导致 venv gateway 仍走系统-python worker 并报 `No module named 'yaml'`。
- **根因**：`atexit` 在 `SIGKILL` / `taskkill /F` 下不执行；worker 无「父进程存活」心跳自检（虽然 spawn 时已传 `HERMES_AGENT_BRIDGE_BROKER_PID`，但 worker 侧未使用）。
- **影响**：开发与 CI 中极易出现「改了代码/换了解释器但行为不变」的幽灵现象，排障成本极高——本次探针即被它误导一轮。
- **修复建议**：worker 侧起一个轻量守护线程，定期 `os.kill(broker_pid, 0)` 探测父进程（该 PID 已由 `bridge_transport.py:108` 传入），失联即自退；gateway 启动时对目标 worker 端口做「陈旧监听探测」（发 `ping`，校验响应中的 `broker_pid` 是否为自己，不符则强杀重建）。

> 追加后缺陷总数由 26 → **28**（P0 5 / P1 10 / P2 9 / P3 4）。

---

*报告完 — 严过关 / QA，2026-08-05（含附录 C/D 追加）*
