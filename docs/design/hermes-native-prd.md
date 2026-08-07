# kmaster-studio「hermes 加强客户端」定位重塑 —— 增量 PRD

| 项 | 值 |
|---|---|
| 文档类型 | 增量 PRD（V3 基线之上的差量，不重复 V3 已有内容） |
| 基线文档 | `docs/design/REQUIREMENT-ui-v3.md`、`docs/design/TECHNICAL-SOLUTION-ui-v3.md` |
| 继承约束 | `docs/design/TECHNICAL-SOLUTION-M5.md` §4.1.0 / §4.1.1 勘误、`docs/design/CONCURRENCY-DESKTOP-WEB.md` |
| 语言 | 简体中文 |
| 项目名 | `kmaster_studio_hermes_native` |
| 作者 | 许清楚（产品经理） |
| 状态 | 待评审（架构师接手做技术方案） |
| 核心诉求来源 | 主理人原话，见 §0 |

---

## 0. 原始需求（逐字保留）

> 「配置了 HERMES_HOME 和 HERMES_AGENT_DIR 环境变量后，我们的 kmaster-studio 项目必须要与真实的 hermes-agent 联动，体现 kmaster-studio 仅仅是一个 hermes-agent 的加强客户端而已。Agents、资源、配置、数据、状态、会话等实质性东西其实都是源自和操作 hermes 系统后端而来，客户端仅仅拥有 hermes 后端没有或不能操控的东西。」

---

## 1. 定位声明

### 1.1 一句话定位

> **kmaster-studio 是 hermes-agent 的图形化加强客户端**——它不拥有任何实质性数据，只负责把 hermes 后端已有的 Agent、技能、MCP、模型、会话、记忆、任务、日志以更好的方式**呈现与操作**；hermes 是唯一真源，客户端是可随时删除重装的视图层。

### 1.2 产品原则

| 编号 | 原则 | 含义 | 违反示例（现存） |
|---|---|---|---|
| **P-1** | **数据主权归属 hermes** | Agents / 技能 / MCP / 模型与 Provider / 会话 / 记忆 / 定时任务 / 日志 / 账号 / 配置，真源一律是 hermes 后端。客户端不得自建、不得篡改语义、不得用假数据冒充 | `types/market.ts` 自造 70 条实体；`stores/agentRoles.ts` 注释写明「localStorage 是**唯一真源**」 |
| **P-2** | **客户端只做「加强」** | 客户端合法拥有的，只有 hermes **没有或不能操控**的东西——纯呈现层状态 | 客户端把 Provider 配置、账号 profile 也当自有资产 |
| **P-3** | **操作即写回 hermes** | 客户端的增删改必须落到 hermes 真实存储，而非 localStorage | 添加 Agent 角色只写 `km.v3.agentRoles`，hermes 完全不知情 |
| **P-4** | **降级要诚实** | hermes 不可用时必须显式告知（空态 / 错误态 / 离线徽标）。**严禁用 mock 假数据伪装成真实数据** | 🔴 `bridge.ts:463` **默认** `MockBridge`，对话回复根本没经过真实模型；`getSkills()` 失败静默返回 6 条假技能；`stores/logs.ts` 读不到就 `applyMock()` |

> **P-4 补充裁定（本 PRD 新增强约束）**：
> 「诚实降级」不区分前端与后端。**服务端的静默 fallback 快照与前端 mock 同罪**——因为它对调用方伪装成了成功响应（HTTP 200 + 合法结构），比前端 mock 更隐蔽、危害更大。

### 1.3 资产边界清单

#### ✅ 客户端合法资产（hermes 没有 / 不能操控，允许存 localStorage）

| 资产 | 存储键 | 理由 |
|---|---|---|
| 三栏布局宽度、折叠态 | `km.v3.layout` | hermes 是 CLI/TUI，无此概念 |
| 左栏双导航态（当前导航模式） | `km.v3.layout` | 纯 UI 骨架状态 |
| 右栏 9 态当前选中标签页 | `km.v3.layout` | 纯 UI 骨架状态 |
| 设置页「最后一次访问的类别」 | `km.v3.settings` | 纯 UI 导航记忆 |
| 卡片市场浏览态（搜索词 / 过滤 / 排序 / 网格-列表切换） | 新增 `km.v4.marketView` | 浏览态，非数据 |
| 领域标签点击频度（本地排序权重） | 新增 `km.v4.tagFreq` | 客户端个性化统计 |
| 未发送的输入框草稿 | 新增 `km.v4.draft` | hermes 无草稿概念 |
| 客户端自身的一次性引导已读标记 | 新增 `km.v4.onboarding` | 与 hermes `config.yaml` 的 `onboarding.seen` 是两套东西，不得混用 |
| 客户端 UI 主题 / 暗色模式 | 新增 `km.v4.theme` | ⚠️ 见待确认 Q-6（hermes `display.skin` 是 TUI 皮肤，语义不同） |

#### ❌ 必须归还 hermes 的资产（禁止 localStorage 作为真源）

| 资产 | 现存违规键 | 归还目标 |
|---|---|---|
| Agent 角色 / 专家定义（含 agentMd / skills / mcp） | `km.v3.agentRoles` | hermes（具体载体见 Q-1） |
| 模型与 Provider 配置 | `km.v3.modelConfig` | `config.yaml` `model` / `custom_providers` |
| **API Key** | `km.v3.modelConfig`（已脱敏但结构仍在） | `auth.json` `credential_pool` + `.env` 环境变量 |
| 账号 profile | `km.v3.profile` | `auth.json` / hermes profile 机制 |
| 日志 | `km.v3.logs` | `$HERMES_HOME/logs/*.log` |
| 会话 / 消息 | —（部分在 `km.v3.session`） | `$HERMES_HOME/state.db` |
| 运行状态 | `stores/status.ts` 硬编码 | `gateway_state.json` + `/api/health` |

#### 🔍 会话资产字段级归属（`state.db` `sessions` 表 48 列 vs kmaster `db.ts:188`）

> 资产边界在「会话」这一项上须细化到字段。以 `PRAGMA table_info(sessions)` 对照 hermes `state.db`（48 列）与 kmaster `db.ts:188` 承载，逐字段裁定如下（实测样本：37 个会话）：

| 字段 | hermes `state.db` 实测 | kmaster 承载 | 归属裁定 | 标记 |
|---|---|---|---|---|
| `archived` | 37/37 非空（全部有值） | 读取并展示 | 🔴 **双真源违规 → 归 hermes**；kmaster 不得自建或另存一份 | 双真源 |
| `title` | 29/37 非空 | 读取并展示 | 🔴 **双真源违规 → 归 hermes** | 双真源 |
| `pinned` | hermes 有字段且 37/37 有值 | **kmaster 无此字段，从未读取** | 🟡 **hermes 独有 → kmaster 漏读**；UI 置顶功能当前是纯本地态，须改为读 hermes `pinned` | kmaster 漏读 |
| `workspace` | hermes 无同名，但存在 `cwd` 字段（语义等价） | `workspace` 字段独有，hermes 侧无同名 | 🟡 **语义等价 → 应映射 hermes `cwd`**，非 kmaster「增强字段」 | 等价于 cwd |
| `profile` / `profile_name` | hermes 有字段，但实测 **0/37 全空**（hermes 自己没在写） | 由 kmaster 承载 | ⚠️ **例外单列**：不能按 P-1 简单判给 hermes——hermes 字段是预留位、当前为空，实际 profile 归属由 kmaster 承载。**单列为「hermes 预留字段 / 当前由 kmaster 承载」** | 例外 |
| `mode` | hermes 无 | kmaster 独有 | ✅ 经逐字段核实，**真正合法的 kmaster 增强字段目前只剩 `mode` 一个**；其余所谓「kmaster 增强」均能在 hermes 侧找到对应真源或被其语义覆盖 | 唯一合法 kmaster 增强 |

> **据此收紧 P-2 表述**：客户端会话侧「加强」白名单收窄为 `mode`（及纯 UI 态，如置顶本地缓存、折叠态）。`archived` / `title` 归 hermes、`pinned` 须改读 hermes、`workspace` 须映射 `cwd`、`profile` 为 hermes 预留位（当前由 kmaster 承载）。任何以「增强」为由僭越上述字段的实现均违反 P-1，须驳回。

---

## 2. 现状事实基线（已实地核查，可直接采信）

> 本节是迁移矩阵的事实依据。**架构师请以本节为准，本节修正了立项时的若干误判。**

### 2.1 环境变量实况

| 变量 | 值 | 状态 |
|---|---|---|
| `HERMES_HOME` | `C:\Users\towyq\AppData\Local\hermes` | ✅ 已配置 |
| `HERMES_CONFIG_PATH` | `%HERMES_HOME%\config.yaml` | ✅ 已配置 |
| `HERMES_WEBUI_AGENT_DIR` | `%HERMES_HOME%\hermes-agent` | ✅ 已配置 |
| `HERMES_WORKSPACE` | `D:\Users\towyq\Documents\Projects` | ✅ 已配置 |
| `HERMES_AGENT_DIR` | — | ⚠️ **本机不存在**，需求原文提到但实际未设置 |
| `HERMES_AGENT_ROOT` | — | ⚠️ **本机不存在**。**第三个同义变量**，仅 Python bridge 读取（`bridge_runtime.py:250/405/471`），Node 侧完全不认。缺失时由 `_find_agent_root()` 自动发现源码根目录 |

> ⚠️ **三个同义环境变量并存的风险（HN-P001 必须消解）**：
> `HERMES_AGENT_DIR`（需求原文提及，未设置）、`HERMES_WEBUI_AGENT_DIR`（本机已设置，Node 侧候选）、`HERMES_AGENT_ROOT`（Python bridge 唯一认的，未设置、靠自动发现）。
> 三者指向同一个目录概念却**由不同进程各自解析**，一旦解析结果分歧，就会出现「Node 以为 agent 在 A，bridge 实际从 B 导入」的错位——这本身就是 P-1「单一真源」的违反。HN-P001 须给出**跨进程一致**的解析方案，而非只修 Node 侧。

### 2.1.2 集成方式的既有分歧（需架构师裁定）

`REQUIREMENT-kmaster-bridge.md:157` 要求 bridge worker 以 **ACP stdio JSON-RPC** subprocess 调用 `run_agent.py`，并明写要取代「直接 `from run_agent import AIAgent`（**未验证可 import**）」的旧假设。
但 `bridge_runtime.py:484` 实测仍为 `sys.path.insert` + 直接 import。**需求要求替换掉的方案仍是现行实现。**

这不是本 PRD 能裁定的技术选型，但它直接决定 HN-P000a 门禁能否通过，故在此登记，请架构师在 T3 一并处置。

### 2.1.1 ⚠️ 路径语义：`HERMES_HOME` 是「根」，不是「数据目录」

本节修正本 PRD 早期草稿的一处记法错误，**架构师与工程师请严格遵守**。

依 `TECHNICAL-SOLUTION-M5.md` §4.1.1 勘误与 `hermes-proxy.ts` 实现，存在**两个不同层级**：

| 概念 | 函数 | 语义 | 当前实测值 |
|---|---|---|---|
| **根**（profile 枚举锚点） | `resolveHermesRoot()`（= `resolveHermesHome()`） | `HERMES_HOME` 环境变量在 server 眼里**就是根** | `C:\Users\towyq\AppData\Local\hermes` |
| **激活目录**（子进程真正该用的） | `resolveActiveHermesHome()` | `active === 'default' ? root : root/profiles/<active>` | 同上（因当前 `active_profile` 不存在 → 回落 `default`） |

**因此**：本 PRD 后文所有写作 `$HERMES_HOME/xxx` 的路径，其**准确含义**一律是 **`<activeHermesHome>/xxx`**。
二者当前恰好相等**仅仅因为激活 profile 是 `default`**——一旦用户切到非 default profile，全部数据路径将平移到 `root/profiles/<name>/`。任何把 `HERMES_HOME` 直接当数据目录拼接的实现都会在 profile 场景下静默读错目录。

**继承 M5 §4.1.1 的三条硬约束（本轮不得违反）**：
1. `HERMES_HOME` 的解析权**唯一归** server 的 `hermes-proxy.ts`；Electron 壳只透传 `process.env`，🚫 不得自行计算。
2. 壳若确需注入 `HERMES_HOME`，**只允许 root 级路径，绝不允许 profile 级**——注入 profile 级会触发双层嵌套塌方（`root/profiles/work/profiles/…`），导致 F21 profile 功能**整体报废且静默无报错**。
3. 涉及 profile 的代码读 **root**，涉及子进程 / 数据读写的一律读 **activeHome**。

### 2.2 hermes 真实存储布局（已逐一确认存在）

| 路径 | 内容 | 实测规模 |
|---|---|---|
| `state.db`（SQLite） | `sessions` / `messages` / `session_model_usage` 表 | **90 MB**，37 会话 / 8168 消息 / 38 用量行（会话与消息数随使用持续增长，验收以 `state.db` 实际为准；当前实测 37/8168/38） |
| `config.yaml` | `model` / `custom_providers` / `mcp_servers` / `agent.personalities` / `memory` / `display` / `platform_toolsets` | 11 KB，`_config_version: 32` |
| `auth.json` | `credential_pool`（凭据池） | 10 个 provider 条目 |
| `cron/jobs.json` | 定时任务全量定义 | 含 `schedule` / `next_run_at` / `last_status` / `last_error` |
| `memories/` | `MEMORY.md`、`USER.md`（各带 `.lock`） | 2 个真实文件 |
| `logs/` | **扁平** 13 个 `.log` 文件 + `curator/` 子目录 | `agent.log` / `errors.log` / `gateway.log` / `desktop.log` … |
| `skills/` | 真实技能目录 | **47 个** |
| `hermes-agent/skills/` | 内置技能 | 18 个 |
| `hermes-agent/optional-skills/` | 可选技能 | 20 个 |
| `hermes-agent/optional-mcps/` | 可选 MCP | 3 个（linear / n8n / unreal-engine） |
| `gateway_state.json` | 网关运行态 | `pid: 48564`, `gateway_state: running`, `active_agents: 0` |
| **不存在** | `agents/`、`mcp/`、`experts/` 目录 | Agent 定义须另寻载体（见 Q-1） |

**config.yaml 关键结构（实测）**：
- `model.default: glm-5.2`，`model.provider: custom:ark-coding-plan-anthropic`
- `custom_providers[]`：**7 个** provider，每个含 `base_url` / `api_mode` / `models{}`（多者 13 个模型）/ `api_key`
- **`api_key` 的值一律是 `${ENV_VAR}` 形式的环境变量引用**（如 `${ARK_CODING_PLAN_API_KEY}`），**不是明文**
- `mcp_servers{}`：**5 个**（hermes-studio-api / -devices / -use / agentmemory / codegraph）
- `agent.personalities{}`：**14 个人格（当前实测；随用户编辑 `config.yaml` 变化，验收以 `agent.personalities` 实际键数为准）**（helpful / concise / technical / creative / teacher / kawaii / catgirl / pirate / …）

### 2.3 kmaster-studio 现状 —— 修正立项误判

> ⚠️ **立项时认为「server 缺 agents / skills / mcp / models / logs 路由」，实测不成立。**
> 服务端已有 `hermes-proxy.ts`（**1510 行**）承担真实 hermes 适配，**23 个 REST 端点**已上线。

**已存在且已真连 hermes 的端点**：

| 端点 | 真源 | 读写 |
|---|---|---|
| `GET /api/models` | `hermes_cli.inventory.build_models_payload()` | 只读 |
| `GET /api/skills` | `hermes_cli.banner.get_available_skills()` + `tools.skills_tool._find_all_skills()` | 只读 |
| `GET/POST/DELETE /api/mcp` | **直读写 `config.yaml` `mcp_servers`** | ✅ 读写 |
| `GET/POST/PUT/DELETE /api/memory` | `memories/MEMORY.md`、`USER.md` | ✅ 读写 |
| `GET/POST/DELETE /api/jobs`、`/api/cron-*` | `cron/jobs.json`（经 hermes CLI） | ✅ 读写 |
| `GET/PUT /api/config/providers` | 经 `hermes config set` CLI 写 | ✅ 读写，🔒 只写不回显 |
| `GET /api/profiles`、`PUT /api/profiles/active` | hermes profile 机制 | ✅ 读写 |
| `GET/PUT /api/settings` | `config.yaml` | ✅ 读写 |
| `GET/POST/PUT/DELETE /api/sessions`、`/messages` | `state.db` | ✅ 读写 |
| `GET /api/health` | 探活 | 只读 |
| `GET /api/usage/stats` | `session_model_usage` | 只读 |

`resolveHermesHome()` 已实现三级兜底：`HERMES_HOME` → win32 的 `%LOCALAPPDATA%/hermes` → `~/.hermes`，且所有 hermes 子进程 spawn 时**显式注入** `HERMES_HOME`（修复过 F12 缺陷）。

**因此本轮的真实缺口是以下 5 类，而非「后端没做」**：

**① 服务端静默 mock fallback（最高危，P-4 直接违反）**

| 位置 | 假数据 | 真实值 | 后果 |
|---|---|---|---|
| `hermes-proxy.ts:110` `SKILLS_SNAPSHOT` | 6 条假技能（summarize / translate / code-review / web-search / pdf-extract / data-clean） | **47 个真实技能** | `runPython` 一失败就静默返回假技能，HTTP 200，前端无从分辨 |
| `hermes-proxy.ts:96` `MODELS_SNAPSHOT` | 5 个假模型（gpt-4o / claude-3-5-sonnet / qwen2.5-7b），且 `authenticated: true` | 7 个 provider、数十个真实模型 | 同上，且假 provider 显示为「已认证」 |

**② 前端 mock 数据（70 + 5 条）**

| 文件 | 内容 | 被谁消费 |
|---|---|---|
| `types/market.ts`（1467 行） | `MOCK_EXPERTS`(30) / `MOCK_TEAMS`(5) / `MOCK_SKILLS`(20) / `MOCK_MCPS`(15) | `ExpertsView.vue`、`ExpertPickerPanel.vue`、`SkillManageSection.vue`（当市场候选池）、`McpManageSection.vue`（当市场候选池） |
| `types/agent.ts` | `MOCK_AGENTS`(5) | `ChatInput.vue`（3 处，Agent 下拉选择器） |
| `stores/logs.ts` | `mockEntries()` | 读不到即 `applyMock()` |

**③ 日志读取路径根本性错误**

`constants/layout.ts:205` 定义 `DEFAULT_LOG_DIR = '~/.kmaster/logs'`，并期望其下有 `hermes-agent/` `bridge/` `kmaster-server/` `cron/` **4 个子目录**。
**该目录结构完全不存在**——真实日志在 `$HERMES_HOME/logs/` 且是**扁平**结构。
后果：日志页 **100% 必然** 走 `applyMock()`，用户看到的永远是假日志。且**服务端无 `/api/logs` 端点**。

**④ localStorage 僭越真源**

`stores/agentRoles.ts:4` 注释明写「`localStorage['km.v3.agentRoles']` 是**唯一真源**，不与后端同步」。
`stores/status.ts:5` 注释明写 `bridgeConnected` 恒为 false。

**⑤ 对话主链路默认就是 Mock（🔴 本轮最高危，优先级高于 ①；对应 QA 健康盘点 D-04，已置顶为最高危缺陷）**

`packages/server/src/bridge.ts:463`：
```ts
const mock = (process.env.HERMES_BRIDGE_MOCK ?? '1') !== '0';
return mock ? new MockBridge() : new RealBridge();
```

**默认值是 `'1'`，即默认走 `MockBridge`**——除非显式设置 `HERMES_BRIDGE_MOCK=0`，否则 kmaster-studio 的**核心能力（与 Agent 对话）本身就是假的**，模型不会被真实调用，回复由进程内模拟流式输出生成。

这意味着：即便把 §① ~ §④ 的所有假数据全部清除干净，**用户看到的对话依然是假的**。这是「hermes 加强客户端」定位在最核心链路上的根本性落空，危害超过任何一处列表假数据。

**🚦 反转默认值之前必须先确认链路真的通——三点实测事实**：

1. **16765 端口不是 hermes-agent 监听的**。`grep -rn "16765" --include=*.py` 在 hermes-agent 侧**零命中**；实际监听方是 kmaster **自己的** Python bridge（`packages/server/src/services/hermes/bridge/bridge_gateway.py:308-343`，`Node ──TCP:16765──> ClientConn ──> broker.handle()`）。所以「连真实 hermes」这条链路是 `Node → TCP → kmaster bridge → hermes-agent`，中间那一跳是我们自己的代码。

2. **中间跳的实现方式与设计要求不一致（⚠️ 需架构师裁定）**。`REQUIREMENT-kmaster-bridge.md:157` 明确要求 worker 以 **ACP stdio JSON-RPC** subprocess 方式调用 `run_agent.py`，并指名要「取代当前『直接 `from run_agent import AIAgent`（**未验证可 import**）』的假设」。但实测 `bridge_runtime.py:484` 仍是 `sys.path.insert(0, root_s)` + 直接 import（`from agent import prompt_builder`、`sys.modules.get("run_agent")`）——**即需求要求替换掉的那个未验证方案，至今仍是现行实现**。

3. **kmaster-server 不 spawn 这个 bridge**（Node 侧 grep 无任何 spawn python bridge 的代码，与 M5 §4.1.0 一致），故用户必须**手动启动**它。这是 HN-P000b 的隐性前置条件，也是 US-A4 / S3 引导文案必须覆盖的场景。

**结论**：`HERMES_BRIDGE_MOCK=0` 这条路**尚无端到端验收证据**（`test_bridge.mjs` 覆盖的是协议往返，不等于接真实模型）。若直接反转默认值而链路不通，用户体验将**比 Mock 更差**（Mock 至少有回复）。故拆为 HN-P000a（门禁）/ HN-P000b（反转）两步。

相关既有约束（`TECHNICAL-SOLUTION-M5.md` §4.1.0）与两个已登记隐患：
- kmaster-server **从不 spawn Bridge 子进程**。`RealBridge` 是连**外部** Python bridge（`HERMES_AGENT_BRIDGE_ENDPOINT`，默认 `tcp://127.0.0.1:16765`）的 TCP 客户端，且**每次 `chat()` 现连现用**，构造时不建连。
- 「重启 Bridge」在本仓库的等价物仅为 `run-chat.ts` 的 `restartBridge()`（丢弃旧实例重建客户端）；**外部 bridge 进程仍须用户自行重启**——这正是 `PUT /api/profiles/active` 返回 `restart_required: true` 的诚实语义。
- ✅ 隐患 1（**经 QA 健康盘点 D-06 证伪，无需排期**）：原 M5 errata 称 `RealBridge.chat()` 未 `sock.destroy()` 致半开 socket 泄漏。QA 实测 `bridge.ts` 的 `finally { release(); }` 在 completed / error / 异常 / 对端断开**均调 `sock.destroy()`**，**无泄漏**。本 PRD 据此**删除 HN-P018**（不立修复、不立回归护栏）；`finally + release()` 清理机制本身正确，保留。⚠️ M5 errata 原文**未回写「已修复/证伪」**，后续读者易被误导——此为文档缺陷，已由 software-engineer 记入遗留 #2。
- 🐛 隐患 2：默认端点写死 `tcp://127.0.0.1:16765`。**早期假设「NekoBox TUN 拦截 127.0.0.1 裸 TCP」经 QA 探针（报告附录 C）证伪**；实测观察到的根因是 **hermes 侧 MCP stdio 被 Windows `.cmd` 版权横幅污染**（属 hermes 侧问题，不影响本 bridge 端点）。结论：**端点维持 `127.0.0.1`，不要改为 `localhost`**（后者解析到 `::1`，bridge 未必监听 IPv6）。

**已做对的部分（勿推翻）**：`stores/modelConfig.ts:435` persist 时已剔除明文 `apiKey` 只留 `keyMasked`，写入走 `putProvider()` → `/api/config/providers` → hermes CLI。方向正确，保留。

---

## 3. 数据主权迁移矩阵（本 PRD 核心）

> 「迁移方式」定义：**只读** = 客户端仅展示；**读写** = 客户端可改且已有写回通道；**写回** = 本轮需新建写回通道。

| # | 数据项 | 当前 kmaster 实现 | 当前真源 | 应有 hermes 真源（具体路径 / 接口） | 迁移方式 | 客户端可保留部分 | 优先级 |
|---|---|---|---|---|---|---|---|
| 1 | **Agent 角色 / 专家** | `MOCK_AGENTS`(5) + `km.v3.agentRoles` | ❌ localStorage + mock | `config.yaml` `agent.personalities{}`（**当前实测 14 条，随用户编辑 `config.yaml` 变化，验收以 `agent.personalities` 实际键数为准**）；扩展角色载体见 **Q-1** | **写回**（新建通道） | 角色卡片的本地排序 / 收藏 / 最近使用 | **P0**（读）/ **P1**（写） |
| 2 | **专家团** | `MOCK_TEAMS`(5) | ❌ 纯 mock | hermes **无对应概念** → 见 **Q-2**（建议降级为客户端编排概念，但成员必须引用真实 Agent） | 只读 / 客户端自有 | 编排关系（若裁定归客户端） | **P1** |
| 3 | **技能** | `MOCK_SKILLS`(20) 当市场池 + `GET /api/skills`（有假 fallback） | ⚠️ 混合：真端点 + 假兜底 + 假市场池 | `$HERMES_HOME/skills/`(**当前实测 47 个顶层包，验收以磁盘实际为准**)、`hermes-agent/skills/`(18)、`hermes-agent/optional-skills/`(20)；⚠️ **两口径务必分清**：`47` 是顶层包数，架构师闭环算出**单体可用技能 161 个**（174 内置 − 11 平台不符 − 2 条件不满足）——工程师**不得**用 47 去断言 161；QA 报告 `get_available_skills() = 0` 是 Git Bash MSYS 路径改写破坏 `HERMES_HOME` 的**测量假象，非 hermes 缺陷** | **只读**（P0）→ **写回**装卸（P1） | 分类标签、图标、浏览态 | **P0** |
| 4 | **MCP Server** | `MOCK_MCPS`(15) 当市场池 + `/api/mcp` CRUD（已真连） | ⚠️ 混合：真读写 + 假市场池 | `config.yaml` `mcp_servers{}`(5)；候选池 `hermes-agent/optional-mcps/`(3) | **读写**（通道已具备，去 mock 即可） | 图标、描述、浏览态 | **P0** |
| 5 | **模型** | `GET /api/models`（有假 fallback） | ⚠️ 真端点 + 假兜底 | `config.yaml` `custom_providers[].models{}` + `hermes_cli.inventory` | **只读** | 常用模型置顶、本地筛选 | **P0** |
| 6 | **Provider** | `km.v3.modelConfig` + `/api/config/providers` | ⚠️ 混合 | `config.yaml` `custom_providers[]`（**当前实测 7 个，随 `config.yaml` 编辑变化，验收以磁盘实际为准**） | **读写**（通道已具备） | 展示顺序 | **P0** |
| 7 | **API Key** 🔒 | `km.v3.modelConfig`（已脱敏，仅存 `keyMasked`） | ✅ 已基本正确 | `auth.json` `credential_pool`（10 条）+ `.env` 环境变量；config.yaml 内仅存 `${ENV_VAR}` **引用** | **读写**（保持现状，仅补齐校验） | **仅** `keyMasked` 布尔标记 | **P0** |
| 8 | **会话与历史** | `/api/sessions` 已真连 `state.db` | ✅ 已正确 | `state.db` `sessions`(**当前实测 37，随使用持续增长，验收以 `state.db` 实际为准**) / `messages`(**当前实测 8168`) | **读写** | 置顶、本地折叠态、草稿 | **P0**（验证） |
| 9 | **记忆** | `/api/memory` 已真连 | ✅ 已正确 | `memories/MEMORY.md`、`USER.md` | **读写** | 视图过滤 | **P0**（验证） |
| 10 | **定时任务** | `/api/jobs` 已真连 | ✅ 已正确 | `cron/jobs.json` + hermes CLI | **读写** | 列表排序 | **P0**（验证）/ **P1**（新建能力） |
| 11 | **日志** | `~/.kmaster/logs` 4 子目录（**不存在**）→ 必然 mock | ❌ 100% 假数据 | `$HERMES_HOME/logs/*.log`（13 个，**扁平**）+ `logs/curator/` | **只读**（需**新建** `/api/logs`） | 4 维过滤、关键字、时间范围 | **P0** |
| 12 | **账号** | `km.v3.profile` | ❌ localStorage | `auth.json` + hermes profile 机制（`/api/profiles` 已具备） | **读写** | 头像等纯展示偏好 | **P1** |
| 13 | **全局配置** | `/api/settings` 已真连 | ✅ 已正确 | `config.yaml` 全量 | **读写** | — | **P0**（验证） |
| 14 | **运行状态（gateway）** | 无 | ❌ 缺失 | `gateway_state.json`（`pid` / `gateway_state` / `active_agents` / `platforms`） | **只读**（需扩展 `/api/health`） | 徽标展示样式 | **P0** |
| 15 | **运行状态（bridge）** | `bridgeConnected` 硬编码 false | ❌ 硬编码 | Bridge TCP 16765 实际握手结果 | **只读** | — | **P0** |
| 16 | **用量统计** | `/api/usage/stats` 已真连 | ✅ 已正确 | `state.db` `session_model_usage`(38) | **只读** | 图表配置 | **P1**（验证） |
| 17 | **UI 布局 / 主题 / 浏览态** | `km.v3.layout` 等 | ✅ **客户端合法资产** | — | **客户端自有** | 全部 | 保持 |

---

## 4. 用户故事

### 角色 A：首次配置 hermes 的用户

- **US-A1**：作为首次启动的用户，我希望客户端**自动探测** `HERMES_HOME` 并显示探测结果（路径、hermes 版本、gateway 状态），以便确认联动是否成功。
- **US-A2**：作为环境变量不完整的用户（例如只有 `HERMES_WEBUI_AGENT_DIR` 而无 `HERMES_AGENT_DIR`），我希望客户端能按既定优先级自动兜底并**明示实际采用的路径**，而不是直接报错或静默用错目录。
- **US-A3**：作为首次配置成功的用户，我希望立刻看到我 hermes 里**真实的 47 个技能、5 个 MCP、7 个 Provider、34 条历史会话**，而不是一堆我从没见过的示例数据。
- **US-A4**：作为配置了 hermes 但 gateway 未启动的用户，我希望客户端明确告诉我「gateway 未运行」并提供启动指引，而不是显示空列表让我以为数据丢了。

### 角色 B：日常使用者

- **US-B1**：作为日常使用者，我在客户端看到的技能列表必须与 `hermes skills` 命令输出**完全一致**，否则我无法信任这个客户端。
- **US-B2**：作为日常使用者，我在客户端给 Agent **装上一个技能**后，退出客户端、直接用 hermes CLI 也应该能看到该技能已启用（P-3 写回）。
- **US-B3**：作为日常使用者，我在客户端**新增一个 MCP Server**，应写入 `config.yaml` 的 `mcp_servers`，重启 hermes 后依然生效。
- **US-B4**：作为日常使用者，我希望在客户端查看 hermes 的**真实日志**（`agent.log` / `errors.log` / `gateway.log`）并按级别、时间、关键字过滤，这是客户端相对 CLI 的**加强价值**。
- **US-B5**：作为日常使用者，我**不希望**在客户端里重复维护一份 API Key——它应该沿用 hermes 已有的凭据池，客户端只显示「已配置 / 未配置」。
- **US-B6**：作为日常使用者，我调整三栏宽度、切换主题、在市场里筛选排序，这些偏好应保存在本地且**不污染** hermes 配置。
- **US-B7**：作为日常使用者，我在客户端创建的定时任务，应出现在 `cron/jobs.json` 里并被 hermes 的 ticker 真实调度。

### 角色 C：hermes 未安装 / 不可用的用户

- **US-C1**：作为未安装 hermes 的用户，我希望客户端在启动时就明确告知「未检测到 hermes」，并给出安装 / 配置指引，**而不是**展示一个看起来功能完整、实则全是假数据的界面。
- **US-C2**：作为 hermes 目录损坏（`config.yaml` 解析失败）的用户，我希望看到具体的错误原因与文件路径，以便自行修复。
- **US-C3**：作为临时断开 hermes 的用户，我希望客户端保留**只读**的上次快照并**明确标注「离线快照 · 数据截至 XX:XX」**，让我知道这不是实时数据（P2）。
- **US-C4**：作为任何一类用户，我在任何降级场景下都**绝不应该**看到 `summarize` / `translate` / `gpt-4o` 这类我 hermes 里根本不存在的条目。

---

## 5. 需求池

> 编号规则：`HN-<优先级><序号>`。所有验收标准均可直接转写为测试用例。
> 「数据流向」记法：`A → B` 表示读取方向，`A ⇄ B` 表示双向读写。

### 5.1 P0（Must have，本轮必须完成）

| 编号 | 描述 | 验收标准（可执行） | 所属模块 | 数据流向 |
|---|---|---|---|---|
| **HN-P000a** 🚦 | **前置门禁：真实链路端到端连通性实测**（必须先于 P000b） | **复用 `REQUIREMENT-kmaster-bridge.md:159` AC2.1，不新写**：`HERMES_BRIDGE_MOCK=0` 下启动 Python bridge，从前端发一条消息，依次收到 `run.started` → `message.delta`* → `usage.updated` → `completed`，且**最终文本与 hermes CLI 直接运行同一 prompt 语义一致**。附加：② 记录 bridge 启动方式（kmaster-server **不 spawn** 它，须用户自启）；③ 记录 `127.0.0.1:16765` 实际可达性（**QA 探针已证伪 NekoBox 拦截假设**，真实根因为 hermes 侧 MCP stdio `.cmd` 横幅污染；端点维持 `127.0.0.1`，不改为 `localhost`）。**本条不通过则 P000b 不得实施** | server / bridge | client → bridge → hermes |
| **HN-P000b** 🔴 | **对话主链路默认切换为真实 Bridge**（受 P000a 门禁约束） | ① `bridge.ts:463` 默认值反转：无显式配置时**不得**静默使用 `MockBridge`；② `MockBridge` 仅在显式 `HERMES_BRIDGE_MOCK=1` 时启用，且启用时 UI 常驻显著「模拟模式」徽标（P-4）；③ 未显式开 mock 且连不通时走 S4 错误态，**不得**静默回落 Mock；④ `/api/hermes/probe` 返回 `bridgeMode: "real" \| "mock"`；⑤ E2E 断言请求真实到达 Python bridge | server / bridge | client → bridge → hermes |
| **HN-P001** | 统一 hermes 环境解析入口，定义 `HERMES_AGENT_DIR` 优先级链 | ① 解析优先级为 `HERMES_AGENT_DIR` → `HERMES_WEBUI_AGENT_DIR` → `<activeHermesHome>/hermes-agent`，三者皆无则判定「未配置」；② 单测覆盖 4 种组合（全有 / 仅 WEBUI / 仅兜底 / 全无）；③ 本机实测解析结果 = `C:\Users\towyq\AppData\Local\hermes\hermes-agent`；④ 解析结果经 `/api/health` 暴露；⑤ **继承 M5 §4.1.1**：解析权唯一归 `hermes-proxy.ts`，Electron 壳只透传 `process.env`；⑥ 数据路径一律基于 `resolveActiveHermesHome()` 而非裸 `HERMES_HOME`，单测须覆盖「非 default profile 下路径正确平移到 `root/profiles/<name>/`」；⑦ **消解三变量分歧**（见 §2.1.1）：Node 侧解析结果须与 Python bridge 的 `HERMES_AGENT_ROOT` 一致——建议由 Node 解析后**显式注入** `HERMES_AGENT_ROOT` 给 bridge，禁止两侧各自 `_find_agent_root()` 自动发现；验收：`/api/hermes/probe` 返回的 agentDir 与 bridge 实际 import 的路径断言相等 | server / hermes-proxy | env → server |
| **HN-P002** | 新增 hermes 探测端点，返回联动实况 | `GET /api/hermes/probe` 返回 `{ configured, hermesHome, agentDir, configPath, gatewayState, gatewayPid, activeAgents, hermesVersion, checks[] }`；`checks[]` 逐项列出 `config.yaml`/`state.db`/`skills/`/`logs/`/`auth.json` 的 `exists` 与 `readable`；本机实测 `configured: true`、`gatewayState: "running"` | server | hermes → server → client |
| **HN-P003** | **删除服务端 `SKILLS_SNAPSHOT` 静默兜底** | ① `hermes-proxy.ts` 中 `SKILLS_SNAPSHOT` 常量被移除；② `getSkills()` 失败时**抛错**，`/api/skills` 返回 5xx + `{ error, reason, hermesPath }`；③ 正常路径下 `/api/skills` 返回条目数 ≥ 47 且包含 `research`、`ddd-skill`、`quant-data`；④ 断言响应中**不含** `summarize`/`pdf-extract`/`data-clean` | server | hermes → server |
| **HN-P004** | **删除服务端 `MODELS_SNAPSHOT` 静默兜底** | ① `MODELS_SNAPSHOT` 移除（`getModelContextWindow` 的启发式兜底可保留，但须改为纯算法、不引用假模型表）；② `/api/models` 失败返回 5xx；③ 正常路径返回的 provider 包含 `ark-coding-plan-anthropic`，模型含 `glm-5.2`、`doubao-seed-code`；④ 断言**不含** `gpt-4o`/`claude-3-5-sonnet`/`qwen2.5-7b`（除非其真实存在于用户 config） | server | hermes → server |
| **HN-P005** | 新增日志端点，读取**真实扁平**日志目录 | ① 新增 `GET /api/logs?kind=&level=&since=&q=&limit=`；② 数据源为 `$HERMES_HOME/logs/*.log`（扁平，非 4 子目录）；③ 本机实测可返回 `agent.log`/`errors.log`/`gateway.log` 内容；④ 支持按文件名映射 `kind`；⑤ 单文件读取上限与总条数上限可配置，防 OOM | server | hermes → server |
| **HN-P006** | **前端日志改接真实端点，删除 `mockEntries()`** | ① `stores/logs.ts` 的 `mockEntries()` 与 `applyMock()` 被删除；② `isMock` 字段移除；③ 改调 `/api/logs`；④ 废弃 `DEFAULT_LOG_DIR = '~/.kmaster/logs'` 及 `KIND_DIR` 4 子目录假设；⑤ 失败时展示错误态（含原因），**断言 UI 中不出现任何 `mock-log-*` id** | client / logs | server → client |
| **HN-P007** | **清除 `types/market.ts` 全部 70 条 mock 实体** | ① `MOCK_EXPERTS`/`MOCK_TEAMS`/`MOCK_SKILLS`/`MOCK_MCPS` 四个常量删除；② 保留类型定义与 `isExpert`/`isExpertTeam` 判定函数；③ 全仓 grep `MOCK_` 在 `src/`（排除 `*.test.ts`）**零命中**；④ 文件行数从 1467 显著下降 | client / types | — |
| **HN-P008** | 技能市场与已装列表改接真实数据 | ① `SkillManageSection.vue` 的候选池来自 `hermes-agent/optional-skills/`(20) 与 `hermes-agent/skills/`(18)，已装来自 `$HERMES_HOME/skills/`(47)；② 「已安装」标记由真实目录比对得出；③ 无 mock 借用图标逻辑（改为按 category 生成默认图标） | client / settings | hermes → server → client |
| **HN-P009** | MCP 市场与已装列表改接真实数据 | ① `McpManageSection.vue` 已部署列表来自 `GET /api/mcp`（实测 5 条：hermes-studio-api / -devices / -use / agentmemory / codegraph）；② 候选池来自 `hermes-agent/optional-mcps/`（实测 3 条）；③ 删除 `MOCK_MCPS` 引用 | client / settings | config.yaml ⇄ client |
| **HN-P010** | **删除 `MOCK_AGENTS`，Agent 选择器接真实数据** | ① `types/agent.ts` 的 `MOCK_AGENTS` 删除（枚举、图标、颜色映射保留）；② `ChatInput.vue` 3 处引用改为真实 Agent 源（`agent.personalities` 16 条，或 Q-1 裁定的载体）；③ 断言下拉中不出现「架构师」「测试专家」等假角色 | client / chat | hermes → client |
| **HN-P011** | 专家页改接真实数据或明确空态 | ① `ExpertsView.vue`、`ExpertPickerPanel.vue` 不再引用 `MOCK_EXPERTS`/`MOCK_TEAMS`；② 在 Q-1/Q-2 裁定前，展示「hermes 暂无专家定义」空态 + 引导，**不得**展示假专家 | client / experts | hermes → client |
| **HN-P012** | Provider / 模型配置改以 hermes 为真源 | ① `stores/modelConfig.ts` hydrate 时以 `/api/config/providers` + `/api/models` 为准，localStorage 仅作展示顺序缓存；② 实测显示 7 个 provider；③ 当前默认模型显示为 `glm-5.2`（来自 `config.yaml` `model.default`） | client / settings | config.yaml ⇄ client |
| **HN-P013** | **API Key 安全归属校验** 🔒 | ① 全仓断言 localStorage 任何键的序列化结果中**不含**明文 key（正则扫 `sk-`、`${`、长度 >20 的高熵串）；② `/api/config/providers` GET 响应**无**明文字段，只有 `configured`/`masked`；③ 客户端内存中的 `apiKey` 字段在提交后立即清空；④ 文档化：真源为 `auth.json` `credential_pool` + `.env`，`config.yaml` 只存 `${ENV_VAR}` 引用 | client + server | client → hermes CLI → auth.json |
| **HN-P014** | `bridgeConnected` 与 gateway 状态真实化 | ① `stores/status.ts` 删除硬编码 `false`；② `bridgeConnected` 反映 Bridge TCP 16765 真实握手（注意 `RealBridge` **现连现用**、构造不建连，故需独立探活而非依赖构造成功）；③ gateway 状态来自 `gateway_state.json`，本机实测 `running` / `pid 48564`；④ 四态区分：`connected` / `disconnected` / `mock` / `unknown`；⑤ 环境备注：早期「NekoBox 拦截 127.0.0.1」假设**已证伪**（QA 探针 / 报告附录 C），真实根因是 hermes 侧 MCP stdio `.cmd` 版权横幅污染、与 bridge 端点无关；`127.0.0.1:16765` 端点维持不变，不改为 `localhost`（→ `::1`）。另据 QA 建议，新增 `bridge_reachable` 健康字段支撑 S4b 模拟模式徽标 | client / status | gateway_state.json + bridge → client |
| **HN-P015** | Agent 角色去 localStorage 真源化（**只读方向**） | ① `stores/agentRoles.ts` 头部「localStorage 是唯一真源」注释删除并改写；② 角色列表以 hermes 为准加载；③ localStorage 降级为纯缓存，清空后重启能从 hermes 完整恢复 | client / agentRoles | hermes → client |
| **HN-P016** | 诚实降级基础设施 | ① 统一 `DataSourceState` 枚举：`live` / `loading` / `empty` / `error` / `offline`；② 所有数据面板必须声明其一；③ **不存在** `mock` 态；④ 全局离线徽标；⑤ 单测覆盖 5 种态渲染 | client / 通用 | — |
| **HN-P017** | 既有真连端点的联动回归验证 | 对 `/api/sessions`(34)、`/api/memory`(MEMORY.md+USER.md)、`/api/jobs`(cron/jobs.json)、`/api/settings`、`/api/usage/stats`(38 行) 逐一验证读取结果与 hermes 磁盘实际内容一致 | server / 全量 | hermes ⇄ client |

### 5.2 P1（Should have）

| 编号 | 描述 | 验收标准（可执行） | 所属模块 | 数据流向 |
|---|---|---|---|---|
| **HN-P101** | 技能装卸写回 hermes | 客户端装/卸技能后，`$HERMES_HOME/skills/` 目录发生真实变更（**junction**，依 Q-3 裁定；跨盘时退化为复制）；hermes CLI 侧可见；Node 侧用 `fs.symlink(target, path, 'junction')` 实现，**无需管理员权限** | server + client | client → hermes |
| **HN-P102** | Agent 角色增删改写回 hermes | 新增角色后 `config.yaml` `agent.personalities`（或 Q-1 裁定载体）出现对应条目；重启 hermes 后仍在；删除同理 | server + client | client → hermes |
| **HN-P103** | 定时任务创建/编辑写回 | 客户端建任务后 `cron/jobs.json` 出现该条目且 `next_run_at` 被正确计算；ticker 能真实触发 | server | client → cron/jobs.json |
| **HN-P104** | 账号 profile 迁移至 hermes | `km.v3.profile` 废弃，账号信息来自 `/api/profiles`；切 profile 触发 Bridge 重建（既有 `restart_required` 机制） | client / settings | auth.json ⇄ client |
| **HN-P105** | 配置写回并发安全 | 并发写 `config.yaml` 不产生损坏；写前备份（已有 `.bak` 惯例）；校验 `_config_version` | server | client → config.yaml |
| **HN-P106** | 专家团概念裁定后落地 | 依 Q-2 裁定实现；若归客户端，则成员必须引用真实 Agent id，且 hermes 侧无此角色时显式提示失效 | client / experts | — |
| **HN-P107** | 用量统计页真实化验证 | 展示数据与 `state.db` `session_model_usage` 一致（38 行），按 provider/model 聚合正确 | client / usage | state.db → client |

### 5.3 P2（Nice to have）

| 编号 | 描述 | 验收标准（可执行） | 所属模块 | 数据流向 |
|---|---|---|---|---|
| **HN-P201** | 本地缓存加速 | 首屏优先渲染上次缓存并标注「缓存 · 更新中」，拿到实时数据后替换；缓存永不冒充实时 | client | — |
| **HN-P202** | 离线只读快照 | hermes 不可用时可查看上次快照，顶部常驻「离线快照 · 数据截至 HH:MM」，所有写操作禁用置灰 | client | — |
| **HN-P203** | 差异对比 | 客户端缓存与 hermes 实时数据不一致时高亮差异项并提供「以 hermes 为准」刷新 | client | — |
| **HN-P204** | 日志实时跟随 | `/api/logs` 支持 SSE 或轮询增量，日志页支持 tail -f 式跟随 | server + client | hermes → client |
| **HN-P205** | hermes 未安装引导 | 提供一键检测 / 复制安装命令 / 打开配置文档 | client | — |

**统计**：P0 **19** 条 / P1 **7** 条 / P2 **5** 条，合计 **31** 条。
（原 HN-P018「RealBridge socket 释放」经 QA 健康盘点 **D-06 证伪**已删除——`finally { release(); }` 实测无 socket 泄漏，无需修复或回归护栏，故 P0 全 19 条均为实际需修复/新建项。）

> 🚦 **P0 内部排序**：`HN-P000a`（连通性门禁）→ `HN-P000b`（默认值反转）→ `HN-P003/P004`（服务端假数据兜底）→ 其余。
> 理由：P000a 是**排期风险闸门**——若真实链路根本不通，P000b 反转后用户体验比 Mock 更差，且一切依赖真实对话的验收都无法执行。必须先探明，再决定 P000b 是一步走还是拆成「先打通链路 + 后反转」。
> 其后才轮到列表假数据：只做后者的话，用户看到的是**真实的技能列表 + 假的对话**，定位依旧落空。

---

## 6. 降级与错误态设计

**总则（不可协商）**：任何降级路径都**不得**返回或渲染 mock 假数据。
服务端失败必须返回**非 2xx** 状态码；客户端必须渲染**可辨识**的非正常态。

| 场景 | 判定条件 | UI 表现 | 文案 | 可用操作 |
|---|---|---|---|---|
| **S1 hermes 未配置** | 环境变量链全空且默认路径不存在 | 全局阻断页（首屏），非骨架屏 | 「未检测到 hermes<br>kmaster-studio 是 hermes-agent 的图形客户端，需要先安装并配置 hermes 才能使用。<br>已尝试路径：`$HERMES_HOME` / `%LOCALAPPDATA%\hermes` / `~/.hermes`」 | 「查看配置指引」「重新检测」；仅本地偏好设置可用 |
| **S2 目录不存在 / 不可读** | `HERMES_HOME` 有值但路径缺失或无权限 | 全局错误横幅 + 各面板错误态 | 「hermes 目录不可访问：`<实际路径>`<br>原因：`<ENOENT / EACCES>`」 | 「重新检测」「打开所在目录」 |
| **S3 gateway 未运行** | `gateway_state.json` 缺失或 `gateway_state != running`，或 pid 不存活 | 顶部**橙色**离线徽标；**静态数据照常展示**（配置/技能/日志可读） | 「hermes gateway 未运行——历史数据可查看，新对话无法发起」 | 「查看启动指引」；发送按钮禁用并给出 tooltip |
| **S4 Bridge 未连接** | TCP 16765 握手失败 | 对话区顶部提示条 | 「与 hermes 的对话通道未建立，正在重试…（第 N 次）<br>端点：`tcp://127.0.0.1:16765`」<br>⚠️ **不得**因连不通就静默回落 MockBridge（HN-P000） | 「立即重试」；输入框禁用。**须说明外部 bridge 进程由用户自行启动**（kmaster-server 不 spawn 它） |
| **S4b 模拟模式** | 显式 `HERMES_BRIDGE_MOCK=1` | 顶栏 + 对话区**常驻**醒目徽标（非一次性 toast） | 「模拟模式——回复由本地模拟生成，**未经过真实模型**」 | 「切换到真实模式」引导；不得隐藏该徽标 |
| **S5 配置文件损坏** | `config.yaml` YAML 解析异常 | 设置页整页错误态 | 「`config.yaml` 解析失败（第 N 行）：`<解析器原文>`<br>hermes 已有备份：`config.yaml.bak`」 | 「打开文件」「查看备份」；**禁止**任何写操作，防止覆盖损坏文件 |
| **S6 子进程调用失败** | `runPython` / hermes CLI 非零退出或超时 | 对应面板错误态 | 「读取 hermes <数据项> 失败<br>命令：`<脱敏后命令>`<br>退出码：N」 | 「重试」「查看日志」 |
| **S7 数据为空（正常）** | 调用成功但结果为 0 条 | 空态插画 + 引导 | 「hermes 中暂无<数据项>」——**必须**与错误态视觉区分 | 对应的新建 / 安装引导 |
| **S8 部分失败** | 多数据源中部分成功 | 成功面板正常，失败面板独立错误态 | 各自独立提示，**不得**一个失败拖垮整页 | 单面板重试 |

**降级设计红线（转为测试断言）**：
1. 任何 HTTP 200 响应体中不得含有硬编码示例数据；
2. 前端不存在 `isMock` 语义的状态位；
3. 空态（S7）与错误态（S2/S5/S6）在 DOM 上可区分（不同 `data-state`）；
4. S3 场景下只读数据**仍须**正常展示（不可因 gateway 未运行就整页空白）；
5. 所有错误文案必须包含**可操作信息**（路径 / 原因 / 下一步），禁止「加载失败」这类无信息量文案。

---

## 7. UI 影响面

> **🛑 硬约束：本轮不推翻 V3 UI 骨架。**
> 三栏框架、左栏双导航态、设置一类一页、卡片市场、右栏 9 态、弹窗体系**全部保留**。
> 绝大多数改动是**换数据源**（组件 props/store 来源变更），仅少数需要**改交互**（新增状态态）。

| 页面 / 组件 | 影响类型 | 说明 |
|---|---|---|
| `views/ExpertsView.vue` | **换数据源** + 新增空态 | 去 `MOCK_EXPERTS`/`MOCK_TEAMS`；Q-1/Q-2 裁定前走空态。卡片布局不变 |
| `components/settings/ExpertPickerPanel.vue` | **换数据源** | 候选池改真实 Agent 源 |
| `components/settings/SkillManageSection.vue` | **换数据源** + 交互微调 | 候选池/已装均改真实；图标不再从 mock 借用，改按 category 生成；P1 阶段「安装/卸载」按钮由展示态变为真写回（需加二次确认与结果反馈） |
| `components/settings/McpManageSection.vue` | **换数据源** | 已装接 `/api/mcp`（已通），候选接 `optional-mcps` |
| `components/chat/ChatInput.vue` | **换数据源** | 3 处 `MOCK_AGENTS` 引用改真实源；下拉交互不变 |
| 设置 · 日志页 | **换数据源** + **改交互** | 数据源从桌面桥文件遍历改为 `/api/logs`；移除「演示数据」提示条，改为错误/空态；4 维过滤 UI 保留（`kind` 取值需按真实文件名重新映射） |
| 设置 · 模型页 | **换数据源** | Provider/模型列表以 hermes 为准；Key 输入框保持「只写不回显」现状 |
| 设置 · 账号页 | **换数据源**（P1） | 接 `/api/profiles` |
| 右栏状态徽标 / 顶栏 | **改交互** | 新增 gateway/bridge 三态徽标（`connected`/`disconnected`/`unknown`） |
| **全局新增** | **新增组件** | `DataSourceState` 统一状态容器组件（live/loading/empty/error/offline 五态），供所有面板复用 |
| **首屏** | **新增页面** | S1 未配置时的全局阻断页（V3 无此页） |
| 顶栏 + 对话区 | **新增组件** | S4b「模拟模式」常驻徽标（仅当显式 `HERMES_BRIDGE_MOCK=1`），不可隐藏 |
| 布局 / 主题 / 市场浏览态 | **不受影响** | 客户端合法资产，逻辑保持 |

**回归要求**：V3 既有的 UI 交互测试用例应全部继续通过；本轮只允许「数据来源」与「状态态」相关用例变更。

---

## 8. 待确认问题（需主理人 / 架构师拍板）

| # | 问题 | 背景（事实） | 我的建议 |
|---|---|---|---|
| **Q-1** | **Agent 角色 / 专家的 hermes 真源载体到底是什么？** | 实测 `$HERMES_HOME` 下**没有** `agents/` `experts/` 目录。最接近的是 `config.yaml` 的 `agent.personalities{}`（16 条，但只有 name→prompt 字符串，**承载不了** kmaster 的 `agentMd`/`skills[]`/`mcp[]`/`specialties[]` 结构） | **建议**：P0 阶段先只读映射 `agent.personalities`（保证「不造假」）；P1 阶段与 hermes 约定扩展载体，优先争取在 `$HERMES_HOME` 下新增 `agents/*.md`（front-matter 存结构化字段 + 正文即 agentMd），因为这最符合 hermes 的文件化风格且不污染 `config.yaml`。**需 hermes 侧同意此目录约定**，否则客户端自建目录本身就违反 P-1 |
| **Q-2** | **「专家团」在 hermes 里没有对应概念，怎么办？** | `MOCK_TEAMS` 5 条纯属客户端发明 | **建议**：裁定为**客户端合法编排概念**（属 P-2 允许范围），但**强约束**其 `members[]` 必须引用真实存在的 Agent id，且任一成员在 hermes 侧失效时，UI 必须显式标红提示。若不接受，则直接删除该功能 |
| **Q-3** | **技能装卸走什么机制？** | 真实技能分布在 3 个目录：`$HERMES_HOME/skills/`(47)、`hermes-agent/skills/`(18)、`optional-skills/`(20)。hermes 侧确有同步脚本 `$HERMES_HOME/scripts/sync-skills-links.sh`（运行时生成、不在源码仓），其第 64 行注释明写"Create junction via PowerShell (no admin required, unlike SymbolicLink)"、第 74 行实际 `New-Item -ItemType Junction`——**它用的是 JUNCTION 而非 symlink**，作者正是为避开 Windows symlink 提权才选 junction。该脚本 `cron/jobs.json` 记录 `last_status: error`、退出码 127，但**根因不是权限也不是脚本逻辑错误**：hermes 调度器 `shutil.which("bash")` 本机返回 WSL interop shim（`C:/Windows/system32/bash.exe`），拿不到原生 Windows 路径脚本 → "No such file or directory" → 127；用真正 Git Bash 跑 `--dry-run` 即 exit 0（created=60/skipped=30/failed=0，本机 `.agents/skills` 90 个技能目录）。这是 **hermes-agent 上游 bug**（调度器裸用 `shutil.which("bash")`），修复方向是显式探测 Git Bash | **建议**：走 **junction**（与既有 `sync-skills-links.sh` 的 `New-Item -ItemType Junction` 惯例一致），**而非 symlink**。理由：① Windows 下 junction 无需管理员 / 开发者模式，"symlink 提权担忧"对"沿用既有模式"是**伪命题**；② 我们是 Node 侧实现，直接用 `fs.symlink(target, path, 'junction')` 原生建 junction，比 hermes 现有"bash→cygpath→powershell"链路更干净、无提权依赖；③ **复制（copy）仅作跨盘兜底**（junction 不能跨盘）。**修正早前表述**：原 PRD"hermes 已有 symlink 惯例 / 建议走 symlink / 须先验证 symlink 可行性"均不成立，已据实更正。该脚本的 127 失败属 hermes-agent 上游 bug，与 HN-P101 实现解耦（我们不依赖其 bash 脚本），但建议作为上游问题知会 hermes 侧修复 `shutil.which("bash")` 解析 |
| **Q-4** | **走文件直读还是走 hermes CLI / gateway 接口？** | 现状是**混合**：MCP/记忆是**直读写文件**，Provider/cron 是**走 CLI**，models/skills 是**走 `runPython`**。三种风格并存 | **建议**：确立分层原则——**读**优先文件直读（快、无子进程开销、gateway 挂了也能读）；**写**一律走 CLI/gateway（有校验、有锁、有 hooks 副作用）。唯一例外：MCP 写入现已直写 `config.yaml`，建议 P1 改为走 CLI 统一化。请架构师确认 |
| **Q-5** | **API Key 最终归属与校验强度？** | 实测 `config.yaml` 中 `api_key` 全是 `${ENV_VAR}` 引用；真实凭据在 `auth.json` `credential_pool`（10 条）与 `.env`（24 KB）。客户端现已只存 `keyMasked` | **建议**：维持现状（真源在 hermes，客户端零明文），本轮只补**自动化断言**防回归（HN-P013）。**不**引入客户端加密存储——那会重新制造第二真源，违反 P-1 |
| **Q-6** | **UI 主题算客户端资产还是 hermes 资产？** | `config.yaml` 有 `display.skin: default` 与 `display.compact` 等，但语义是 **TUI 终端皮肤**，与 Web UI 主题不是一回事 | **建议**：判定为**客户端资产**（语义不同，hermes 无法操控 Web UI 主题），存 `km.v4.theme`。但 `display.*` 中确实通用的项（如 `show_reasoning`、`streaming`）应从 hermes 读取并写回 |
| **Q-7** | **`config.yaml` 写回的并发安全策略？** | 文件 11 KB，`_config_version: 32`，目录中已存在 `config.yaml.bak` 与 `config.yaml.corrupt.20260717-195724.bak`——**说明历史上真的损坏过**。另：本仓库已有 `docs/design/CONCURRENCY-DESKTOP-WEB.md`（桌面/Web 双模式连接池 + 文件锁 + 会话隔离），kmaster-bridge M2 已落地文件锁 | **建议**：**直接复用 `CONCURRENCY-DESKTOP-WEB.md` 既有模型，不另起炉灶**。在其基础上补三条：写前备份 + 写后立即回读校验 + 校验 `_config_version` 防覆盖他方修改。文件锁复用 hermes 既有 `auth.lock`/`.jobs.lock` 惯例。**且**：配置写入后若 gateway 在运行，须走既有 `restart_required` 通知机制（外部进程须用户自行重启，见 M5 §4.1.0） |
| **Q-9** | **bridge 与 hermes-agent 的集成方式：ACP stdio subprocess 还是直接 import？** | `REQUIREMENT-kmaster-bridge.md:157` 要求 ACP stdio，并明写要取代「直接 import（未验证可 import）」；但 `bridge_runtime.py:484` 实测仍是 `sys.path.insert` + 直接 import。**需求要求替换的方案仍在跑。** 另 `CONCURRENCY-DESKTOP-WEB.md` F11 指出 ACP stdio 是**一客户端一进程、天然一对一**，与 TCP 多路复用模型不同 | **建议**：以 HN-P000a 门禁结果为决策依据——若直接 import 已能端到端跑通真实模型，则**补验收证据并回写需求文档**（承认现状、消除文档-代码不一致）；若跑不通，则按原需求迁移到 ACP stdio。**不建议在门禁结论出来前先动架构**。此题与 Q-4（文件直读 vs CLI）同属「集成方式」族，建议一并裁定 |
| **Q-10** | **`HERMES_AGENT_ROOT` 由谁解析？** | 三个同义变量并存（见 §2.1.1），Python bridge 只认 `HERMES_AGENT_ROOT` 且本机未设置、靠自动发现；Node 侧另有一套链 | **建议**：比照 M5 §4.1.1「解析权唯一」原则，由 **Node 单点解析后显式注入** bridge，禁止两侧各自自动发现。否则就是第二真源，违反 P-1 |
| **Q-8** | **会话真源二义性：`state.db` 还是 `sessions/` 目录？** | `state.db` 有 34 会话 / 8081 消息（**这是真源**）；`sessions/` 目录只有 28 个 `request_dump_*.json` 且时间戳停在 2026-06-30（**调试转储，非真源**） | **建议**：明确以 `state.db` 为**唯一**会话真源，`sessions/` 仅作为可选的「原始请求排查」入口（P2，日志页附属功能）。需在文档中固化，防止后续实现者误读 |

---

## 9. 交付边界（本 PRD 不涉及）

- 技术方案与模块拆分 → 架构师（高见远）
- 具体接口签名、DTO 定义、缓存策略实现 → 架构设计文档
- V3 UI 骨架的任何重构 → **明确排除**
- 竞品 / 市场分析 → 本轮用户未要求，不做

---

## 附录 A：本 PRD 修正的立项误判

| 立项说法 | 实测结论 |
|---|---|
| 「server 只有 7 个路由，缺 agents/skills/mcp/models/logs」 | 路由**文件**7 个，但**端点 23 个**；`/api/skills`、`/api/models`、`/api/mcp` **均已存在且已真连 hermes**。真实缺口只有 **logs** 与 **agents** |
| 「前端 25 个文件含 mock」 | 含 `mock` 字样的 15 个文件中，**8 个是 `*.test.ts`**（测试替身，合理保留）。真正的生产 mock 是 3 处：`types/market.ts`、`types/agent.ts`、`stores/logs.ts` |
| 「mock 只在前端」 | ❌ **服务端也有**：`SKILLS_SNAPSHOT`(6) 与 `MODELS_SNAPSHOT`(5) 静默兜底，伪装成 HTTP 200 成功响应 |
| 「UI 骨架好的，只需换血（数据来源）」 | ⚠️ 部分成立。**但对话主链路本身也是假的**：`bridge.ts:463` 默认 `MockBridge`（`HERMES_BRIDGE_MOCK ?? '1'`）。**这才是本轮最高危发现**——只换列表数据源，得到的是「真实的技能列表 + 假的对话」 |
| 「`$HERMES_HOME/xxx` 即数据路径」 | ⚠️ 仅在 `active_profile == default` 时成立。`HERMES_HOME` 语义是**根**，数据目录应取 `resolveActiveHermesHome()`（非 default 时为 `root/profiles/<name>/`）。见 §2.1.1 |
| 「16765 是 hermes-agent 的端口」 | ❌ hermes-agent 侧 `grep 16765` **零命中**。监听方是 kmaster 自己的 `bridge_gateway.py`。链路是 `Node → TCP → kmaster bridge → hermes-agent`，中间跳是我们自己的代码 |
| 「M5 errata 隐患①（socket 泄漏）待修」 | ❌ **经 QA 健康盘点 D-06 证伪**：`bridge.ts` 现 `finally { release(); }` 在 completed / error / 异常 / 对端断开**均调 `sock.destroy()`**，**无泄漏**。本 PRD 原立 HN-P018（修复→降级护栏）据实**删除**，不占任何排期 |
| 「`km.v3.modelConfig` 存 API-key」 | 部分澄清：persist 时**已剔除**明文，只留 `keyMasked`。方向本就正确，本轮只需补防回归断言 |
| 「HERMES_AGENT_DIR 已配置」 | 本机**不存在**该变量，只有 `HERMES_WEBUI_AGENT_DIR`，故需 HN-P001 的优先级链 |
