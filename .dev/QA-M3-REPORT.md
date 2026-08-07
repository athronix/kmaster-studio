# QA M3 独立验收报告

> **IS_PASS: YES** — REST 实测 20/20 通过；server tsc / client vue-tsc / vite build / vitest(23) / smoke-chat 全绿。
> **未发现源码 bug（P0/P1/P2 均无）**。智能路由决策：**NoOne**。轮次：Round 1 一次通过。
> 复现方式：`NO_PROXY=localhost,127.0.0.1 node scripts/qa-verify-m3.mjs`（需先起 mock server）。

## 一、REST 实测部分

- 生成时间：2026-07-31T01:58:13.665Z
- 目标：http://localhost:6648（HERMES_BRIDGE_MOCK=1）
- 契约基准：docs/design/TECHNICAL-SOLUTION-M3.md API 表（147-154 行）
- 合计 20 项 | 通过 20 | 失败 0

## 逐项结果

| # | 检查项 | 结果 | 实测详情 |
|---|--------|------|----------|
| 1 | GET /api/health → 200 | PASS | `status=200 body={"ok":true,"service":"kmaster-server","ts":1785463092339}` |
| 2 | GET /api/models → 200 且 providers 为非空数组 | PASS | `status=200 providers=3 models=5 sample={"provider":"openai","label":"OpenAI","authenticated":true,"models":[{"id":"gpt-4o","name":"GPT-4o","provider":"openai","context":128000},{"id":"gpt-4o-mini","name":"GPT-4o mini","provider":"openai","context":128000}]}` |
| 3 | GET /api/skills → 200 且 skills 为非空数组 | PASS | `status=200 count=6 sample={"name":"summarize","category":"writing","description":"将长文本压缩为结构化摘要","enabled":true}` |
| 4 | GET /api/mcp → 200 且 servers 为数组 | PASS | `status=200 count=5 body={"servers":[{"name":"hermes-studio-api","command":"d:\\nvm4w\\nodejs\\node.exe","args":["d:\\home\\yqwang\\.npm-global\\node_modules\\hermes-web-ui\\bin\\hermes-studio-mcp.mjs","api"],"env":{"HERMES_WEB_UI_URL":"http://1` |
| 5 | GET /api/settings → 200 | PASS | `status=200 body={"settings":{"default_mode":"default","default_model":""}}` |
| 6 | PUT /api/settings {plan, gpt-4o-mini} → 200 | PASS | `status=200 body={"settings":{"default_mode":"plan","default_model":"gpt-4o-mini"}}` |
| 7 | settings roundtrip：回读与写入一致 | PASS | `readback={"default_mode":"plan","default_model":"gpt-4o-mini"}` |
| 8 | POST /api/upload → 200 且返回 upload 元信息 | PASS | `status=200 body={"upload":{"filename":"qa.txt","path":"C:\\Users\\towyq\\AppData\\Local\\kmaster\\uploads\\qa-verify\\qa.txt","size":8,"created_at":1785463093558}}` |
| 9 | 上传文件真实落盘且内容正确 | PASS | `path=C:\Users\towyq\AppData\Local\kmaster\uploads\qa-verify\qa.txt content="hello qa"` |
| 10 | POST /api/upload 缺失契约字段 → 400（入参校验生效） | PASS | `status=400 body={"error":"session_id, filename and content_base64 required"}（说明：sessionId/content 非契约字段，契约为 session_id/content_base64）` |
| 11 | 上传防目录穿越（basename 归一） | PASS | `path=C:\Users\towyq\AppData\Local\kmaster\uploads\qa-verify\evil.txt` |
| 12 | POST /api/mcp 新增 qa-test-srv → 200 | PASS | `status=200 body={"ok":true,"servers":[{"name":"hermes-studio-api","command":"d:\\nvm4w\\nodejs\\node.exe","args":["d:\\home\\yqwang\\.npm-global\\node_modules\\hermes-web-ui\\bin\\hermes-studio-mcp.mjs","api"],"env":{"HERMES_WEB_UI_URL"` |
| 13 | config.yaml 已写入 mcp_servers.qa-test-srv | PASS | `entry={"command":"npx","args":["-y","@modelcontextprotocol/server-everything"],"env":{}}` |
| 14 | GET /api/mcp 可见新增项 | PASS | `names=["hermes-studio-api","hermes-studio-devices","hermes-studio-use","agentmemory","codegraph","qa-test-srv"]` |
| 15 | DELETE /api/mcp/qa-test-srv → 200 | PASS | `status=200 body={"ok":true}` |
| 16 | config.yaml 已移除 qa-test-srv | PASS | `remaining=["hermes-studio-api","hermes-studio-devices","hermes-studio-use","agentmemory","codegraph"]` |
| 17 | GET /api/mcp 不再包含被删项 | PASS | `names=["hermes-studio-api","hermes-studio-devices","hermes-studio-use","agentmemory","codegraph"]` |
| 18 | POST /api/mcp 缺 command → 400 | PASS | `status=400 body={"error":"name and command required"}` |
| 19 | ~/.hermes/config.yaml 已还原为初始状态 | PASS | `restored=true bytes=11270` |
| 20 | PATCH /api/sessions/:id 回写 mode/model 并可回读 | PASS | `session={"id":"96055c6e-944f-4482-818a-27e4aac84d04","title":"新会话","profile":null,"created_at":1785463093663,"updated_at":1785463093664,"archived":0,"mode":"plan","model":"gpt-4o-mini"}` |

## 附注

- POST /api/settings 探测（设计文档未定义此动词）→ status=405 body=null
- settings 还原后={"default_mode":"default","default_model":""}（原始={"default_mode":"default","default_model":""}）
- ~/.hermes/config.yaml 存在=true 备份字节=11270

## 二、静态检查 / 单测 / 构建 / 冒烟

| 检查 | 命令 | 结果 | 证据 |
|------|------|------|------|
| server 类型检查 | `packages/server && npx tsc --noEmit` | PASS | exit=0，0 条诊断输出 |
| client 单元测试 | `packages/client && npx vitest run` | PASS | `src/stores/chat.test.ts (23 tests)`，Test Files 1 passed，Tests **23 passed (23)**，耗时 3.19s |
| client 类型检查 | `packages/client && KMASTER_NO_EMPTY_DIST=1 npx vue-tsc --noEmit` | PASS | exit=0，无类型错误 |
| client 生产构建 | `packages/client && npx vite build` | PASS | `✓ 3159 modules transformed`、`✓ built in 33.59s`；产物 index.html 0.40 kB / CSS 13.92 kB / JS 1,575.87 kB (gzip 524.94 kB) |
| 端到端冒烟 | `packages/server && npx tsx ../../scripts/smoke-chat.mjs` | PASS | `[smoke] PASS ✅ full chat loop verified (mode/model carried through /chat-run)`；run.started 确认 mode=dont_ask / model=gpt-4o 被服务端接受；plan/tool/approval/clarify/artifact/usage 事件齐全 |

## 三、环境与方法学说明（避免误判为 bug）

1. **一律使用 host `localhost`**：本机 NekoBox TUN 代理会拦截 `127.0.0.1` 并返回 401，属测试环境假象，非源码缺陷。所有 node 进程均设置 `NO_PROXY=localhost,127.0.0.1`。
2. **上传落盘根目录**：实际落到 `C:\Users\towyq\AppData\Local\kmaster\uploads\qa-verify\`，而非 `~/.kmaster-studio/uploads/`。原因是本机环境变量 `KMASTER_HOME=C:\Users\towyq\AppData\Local\kmaster` 生效。这**符合设计**（TECHNICAL-SOLUTION-M3.md:325 规定 `process.env.KMASTER_HOME ?? path.join(homedir,'.kmaster-studio')`，env 优先），判定 PASS。
3. **MCP 配置文件位置与还原验证**：同理 `HERMES_HOME=C:\Users\towyq\AppData\Local\hermes`，操作对象为该目录下 config.yaml。测试前全文备份、测试后以**全等字符串比较**确认还原（`finalRaw === backup` → true）。
   - 事后独立复核：YAML 可正常解析；`mcp_servers` 恰为原始 5 项（hermes-studio-api / hermes-studio-devices / hermes-studio-use / agentmemory / codegraph）；全文不含 `qa-test-srv`；顶层键 26 个。
   - 说明：报告中 `bytes=11270` 是 JS 字符串长度，`wc -c` 显示 11317 字节，差异 47 来自文件中的非 ASCII（中文）字符占多字节，**并非内容被改动**；文件 mtime 亦停在 QA 还原那一刻（09:58:13 +0800），其后无任何写入。
4. **契约动词/字段以设计文档为准**：任务简报中写的 `POST /api/settings` 与 upload 字段 `sessionId/content`，与设计文档（`PUT /api/settings`、`{session_id, filename, content_base64}`，TECHNICAL-SOLUTION-M3.md:152-154）不一致。实测确认实现遵循**设计文档**，简报表述为笔误。两种偏差均已显式测试：`POST /api/settings` 返回 405（koa-router allowedMethods 的正确行为），错误字段的 upload 返回 400 并给出清晰错误信息——属于健壮的入参校验，非缺陷。

## 四、缺陷清单

无。P0 / P1 / P2 均为空。

## 五、附加正向发现（超出简报要求的加测项）

- **目录穿越防护有效**：`filename: "../../evil.txt"` 被 `path.basename` 归一，文件被约束在 `uploads/<sid>/` 内，未逃逸到上传根目录之外（sessions.ts:60）。
- **入参校验完备**：`POST /api/mcp` 缺 `command` → 400；`POST /api/upload` 缺必填字段 → 400，错误信息明确。
- **MCP 增删幂等且列表一致**：写入 config.yaml 后 `GET /api/mcp` 立即可见，删除后立即消失，与磁盘状态严格同步。
- **F8/F9 每会话覆盖落库**：`PATCH /api/sessions/:id {mode, model}` 写入后 `GET /api/sessions/:id` 可正确回读 `mode=plan, model=gpt-4o-mini`。

## 六、环境清理

- mock server 已关闭，端口 6648 已释放（`PORT_6648_RELEASED`）。
- `~/.hermes/config.yaml`（实为 `$HERMES_HOME/config.yaml`）已还原并复核无残留。
- 全局设置已还原为初始值 `{default_mode: "default", default_model: ""}`。
- 测试产生的会话已 DELETE；目录穿越测试产物 `evil.txt` 已删除；仅保留 `uploads/qa-verify/qa.txt` 作为落盘证据。
