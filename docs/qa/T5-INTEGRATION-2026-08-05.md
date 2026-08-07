# T5 联动验证与回归测试报告

- **日期**：2026-08-05
- **执行人**：严过关（QA 工程师）
- **代码基线**：`27b7783`（HEAD）
- **验证环境**：hermes bridge（`127.0.0.1:16765`，hermes-agent venv python）+ kmaster server（`localhost:6648`，`HERMES_BRIDGE_MOCK=0`）+ hermes `$HERMES_HOME`
- **纪律**：未改 `docs/qa/HEALTH-CHECK-2026-08-05.md`，未 git 提交，未给其他成员发消息；新结论独立成报告。

---

## 0. 复现前提（影响所有结论，先说）

- hermes 的 `.env`（`$HERMES_HOME/.env`，24KB）含 `ARK_CODING_PLAN_API_KEY` / `ALI_CODING_PLAN_API_KEY` / `MINIMAX_CODING_PLAN_API_KEY` 等自定义 provider key，但**不会自动进入我方非交互 shell**。首次直接起 bridge → worker 直接报 `No inference provider configured`。必须 `source $HERMES_HOME/.env` 后再起 bridge，key 才会注入 worker 环境。
- **发现 F0（复现门禁的隐藏前提 / 部署健壮性缺口）**：kmaster bridge **不会**为 spawn 的 worker 自动加载 `$HERMES_HOME/.env`。即「开箱即真实对话」依赖运维手动 `source .env`——CI / 他人 clone 若省略这步，必然 `No inference provider configured`。建议写入 T4/T5 清单（bridge 启动脚本应 `source $HERMES_HOME/.env` 或把这些 key 显式 `export`）。

---

## 1. T5.1 — HN-P000a 门禁判定：**FAIL**（无法独立复现真实 `completed`）

### 判定：FAIL
kmaster↔hermes bridge **管道本身验证可用**（connect → chat → `run.started` → `agent.event` → `thinking.delta` → `completed` 全事件流正常）。但**所有可用模型 provider 都在 hermes 模型 API 层失败**，拿不到语义正确的真实回答。工程师报告的 `glm-5.2`「好」在本环境配置下**不可独立复现**。

### 三次实测（非平凡 prompt：「请计算 123 加 456 等于多少？只输出最终数字。」期望 579）

| # | model 参数 | 解析到 provider | 结果（completed 事件的 text） | elapsed |
|---|---|---|---|---|
| 1（冷启动） | `undefined` → `glm-5.2` | `custom:ark-coding-plan-anthropic` | `COMPLETED` 但 `text="HTTP 400: model field is required"` | 15271ms |
| 2 | `doubao-seed-code` | ark | `COMPLETED` 但 `text="HTTP 404: 404 page not found"` | 16612ms |
| 3 | `kimi-k2.5` | `Coding.dashscope.aliyuncs.com` | `COMPLETED` 但 `text="HTTP 404: 404 page not found"` | 25819ms |

- openrouter 尝试：`.env` 无 `OPENROUTER_API_KEY`，不可用。
- 三次均收到 `completed` 事件（bridge 管道正常），但语义内容全是 provider 错误串 → 门禁按「语义正确」标准判 **FAIL**。
- 稳定性观察：三次失败**确定性强**（每次都在 ~15–26s 内拿到 completed，只是内容是错误的 provider 响应），说明 bridge 稳定、provider 配置**均匀损坏**，并非偶发。

### 根因（hermes 侧，非 kmaster bug）
1. 默认模型 `config.yaml:1-3` `model.default: glm-5.2` + `provider: custom:ark-coding-plan-anthropic`，但该 provider 的 `models:` 列表（config 207–219）**不含 glm-5.2** → agent 发出空 model → HTTP 400。
2. ark（`https://ark.cn-beijing.volces.com/api/coding`）与 dashscope（`https://coding.dashscope.aliyuncs.com/v1`）`base_url` 实际返回 **HTTP 404**（路径错误）→ 即便用 provider 内合法 model（doubao-seed-code / kimi-k2.5）也 404。
3. openrouter key 缺失。
→ 本环境**没有任何可用 provider 能完成一次真实推理**。

### 与工程师报告的矛盾（需 lead 裁定）
工程师宣称 `chat-e2e.mjs` 真实收到 `completed("好")`，`model=glm-5.2`。但本配置下 `glm-5.2 → ark` 必 400。差异只能来自**工程师环境的 hermes provider 配置/代码与我手上的 `config.yaml` 不同**（如 ark `base_url` 正确、或 `glm-5.2` 映射到可用 provider、或有 openrouter key）。**结论：HN-P000a 在我方配置态下不能判 PASS；门禁被 hermes provider 配置卡住，不是 bridge 问题。**

### 给 lead 的建议
- HN-P000a 放行前，先由工程师核实 hermes provider 配置（`base_url` / `api_mode` / model→provider 映射 / API key）能真实出 token；工程师的「通过」可能依赖了未落在当前 `config.yaml` 的环境态。
- 顺带：工程师说的「首次 0 事件超时、重启 worker 才通」的不稳定，本轮回测未见——我三次均在 ~15–26s 内拿到 completed（ albeit 错误内容）。原「不稳定」更可能是 provider/model 解析失败被误读为超时，而非 bridge 竞态。

---

## 2. T5.2 — 两个冲突点定案

### C1 技能计数：PM 47 与 QA 161 不矛盾，均已确权
- **PM 47** = `$HERMES_HOME/skills/` 下**顶层技能包目录数**（user-installed，在 `hermes skills list` 中 `Source=local`）。
- **QA 161/167** = 该目录下**全部 `SKILL.md` 文件数**（包内嵌套子技能）。node 实算 = **167**；T1.2 用 `find` 得 161（本 shell 的 `find` 实为 Windows `find.exe` 致计数偏差，Glob/node 复核为 167）。
- 二者粒度不同、互不冲突：**47 包内含 167 个 `SKILL.md`**。
- **权威口径**：agent 自身 `hermes.exe skills list` 按**包**枚举（47 local + builtin）；枚举方法 = 扫 `$HERMES_HOME/skills/**/SKILL.md` 或调 `hermes skills list`。`get_available_skills()` 在 T1.2 返 0，仅因当时用系统 python3、无 cwd、`import hermes_cli` 失败；本次用 venv + 正确 cwd 已可正常枚举（167 / 47）。
- **HN-P003 验收建议**：`/api/skills` 应枚举真实 hermes 技能（包级 ≥47，或 `SKILL.md` 级 167），而非硬编码 6 条。验收「≥47 且含 research/ddd-skill/quant-data」：ddd-skill ✓、quant-data ✓（另有 quant-strategy/quant-research）；「research」在本环境对应 `search/searxng_search`，需 PM 与 architect 确认包名映射。

### C2 会话真源：确认 kmaster 存在第二个会话真源（**P0 数据主权违规**）
- `/api/sessions`（server 实跑，`HERMES_BRIDGE_MOCK=0`）返回 **`{"sessions":[]}`**。
- server 日志：`persistence: better-sqlite3 → C:\Users\towyq\.kmaster-studio\kmaster.db` —— kmaster 读**自己的 SQLite**，不是 hermes `state.db`。
- hermes 侧：当前 `state.db` 不存在、`$HERMES_HOME/sessions/` 为空（相对 T1.2 的 28 文件 / 34 会话已被重置）。
- 即：QA 在 T1.2 测到的 10 条、PM 说的 34 条、本次的 0 条，**全是 kmaster 自有 db 在不同时间的状态**，没有一条来自 hermes。
- **定案**：kmaster 持有独立会话真源（自有 SQLite），违背「会话真源必须 hermes」原则 → **P0 数据主权违规，按 lead 指示需立即升级并通知 architect 改设计**。即便 hermes 有会话数据，kmaster 也不读。

---

## 3. T5.3 — 四条缺陷真实环境复验

| 缺陷 | 复验结论 | 证据 |
|---|---|---|
| **D-02** `/api/skills` 返回 6 条假技能 | **仍成立** | 实跑 `/api/skills` 返回 6 条硬编码（summarize/translate/code-review/web-search/pdf-extract/data-clean），即 `SKILLS_SNAPSHOT`；根因 `runPython` 用系统 python3、无 cwd → `import hermes_cli` 失败 → 裸 catch 回退快照。真实应有 167/47。 |
| **D-08** `plan_respond` 不在 `EXPOSED_ACTIONS` | **仍成立（静态）；动态未验** | `bridge_protocol.py` `ACTION_ALIASES` 有 `"plan.respond":"plan_respond"`（:86），但 `EXPOSED_ACTIONS`（:90–101）未含 `plan_respond`。动态触发计划卡**被 T5.1 同款 provider 失败挡住**（计划需模型 API），待 provider 修通后补验。 |
| **D-11** `probePythonOk` 仅 `print(1)` | **仍成立** | `/api/health` 现返回 `python_ok:true` 但 `hermes_cli_ok:false`；探针只验 python 可跑，不验 hermes CLI 可用。venv 就位后 `python_ok` 变 true，但 `hermes_cli` 仍 false——探针过浅的结论仍成立（server 现已拆出 `hermes_cli_ok` 字段，比 T1.2 描述略好）。 |
| **D-27** 5 处 `resolveHermesHome()` 误用 | **仍成立（静态）；动态未验** | 复测 `hermes-proxy.ts` 305/316/379/633/697 仍用 `resolveHermesHome()`（root）而非 `resolveActiveHermesHome()`。动态「非 default profile 读错目录」未实测：本环境无 `profiles/` 目录、无 `active_profile`（切 profile 会改 hermes 状态，超出验证范围）。逻辑上非 default profile 时这 5 处必读 root 而非 `root/profiles/<name>/`，建议工程师 T4 用 profile 切换实测。 |

---

## 4. 清理与状态
- 已杀本人起的 bridge（含 worker）与 server 进程；16765 / 17567 / 6648 复核无孤儿监听（见末尾复核）。
- 未改 `docs/qa/HEALTH-CHECK-2026-08-05.md`，未 git 提交。
- **T5.1 门禁 FAIL 阻断 19 条 P0 开工**；建议先修 hermes provider 配置（base_url / model→provider 映射 / API key）再重跑 T5.1。
- T5.2-C2 的 P0 数据主权违规（kmaster 自有会话库）需立即升级 architect。

---

*报告完 — 严过关 / QA，2026-08-05（T5 联动验证）*
