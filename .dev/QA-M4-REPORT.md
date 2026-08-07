# QA M4 独立验收报告（REST + WS 实测）

- 生成时间：2026-07-31T08:26:06.287Z
- 目标：http://localhost:6648（HERMES_BRIDGE_MOCK=1）
- 契约基准：docs/design/TECHNICAL-SOLUTION-M4.md §3.6；验收基准：docs/design/REQUIREMENT-M4.md §8 AC1-AC8
- 合计 61 项 | 通过 61 | 失败 0
- AC1（构建/单测）由 `npx vitest run` + `npx vue-tsc --noEmit` + `npx vite build` 独立覆盖，不在本脚本内

## 分项汇总

| AC | 范围 | 通过 | 失败 |
|----|------|------|------|
| AC0 | 前置（健康检查 / 会话） | 2 | 0 |
| AC2 | F13 记忆管理 | 12 | 0 |
| AC3 | F15 自动化任务 | 13 | 0 |
| AC4 | F16 子代理事件流 | 6 | 0 |
| AC5 | F17 消息队列 | 12 | 0 |
| AC6 | F18 压缩 + 上下文估算 | 5 | 0 |
| AC7 | F22 用量统计 | 7 | 0 |
| AC8 | 导航与路由 | 4 | 0 |

## 逐项结果

| # | AC | 检查项 | 结果 | 实测详情 |
|---|----|--------|------|----------|
| 1 | AC0 | GET /api/health → 200 | PASS | `status=200 body={"ok":true,"service":"kmaster-server","ts":1785486340340}` |
| 2 | AC2 | GET /api/memory → 200 且 entries 为数组 | PASS | `status=200 count=9 sample={"id":"memory:e85dd29a","group":"memory","content":"Hermes config.yaml 安全守卫：必须用 `hermes config set <key> <value>`（dot-notation，value 支持 JSON` |
| 3 | AC2 | GET /api/memory?group=非法 → 400 | PASS | `status=400 body={"error":"bad_request","message":"group must be one of memory \| user"}` |
| 4 | AC2 | POST /api/memory 新增 → 200 且返回内容寻址 id | PASS | `status=200 entry={"id":"memory:27c6b1b2","group":"memory","content":"QA-M4 验收临时条目 1785486340345：本条由 scripts/qa-verify-m4.mjs 自动创建并删除。","index":5,"updated_at":1785486340380}` |
| 5 | AC2 | GET /api/memory?q= 服务端过滤可见新条目 | PASS | `status=200 hits=1` |
| 6 | AC2 | POST /api/memory 缺 content → 400 | PASS | `status=400 body={"error":"bad_request","message":"content required"}` |
| 7 | AC2 | PUT /api/memory/:id 编辑生效且 id 随内容变化（内容寻址） | PASS | `status=200 oldId=memory:27c6b1b2 newId=memory:b6d0c723` |
| 8 | AC2 | 回读：新 id 可见、旧 id 消失 | PASS | `ids=["memory:b6d0c723"]` |
| 9 | AC2 | PUT 用已失效的旧 id → 409 stale_id | PASS | `status=409 body={"error":"stale_id","message":"memory entry not found (content changed elsewhere)"}` |
| 10 | AC2 | DELETE /api/memory/:id → 200 且返回真实存在的备份文件 | PASS | `status=200 backup=C:\Users\towyq\AppData\Local\kmaster\backups\memory\MEMORY.20260731-162542-033.md exists=true` |
| 11 | AC2 | 删除后 backups/memory/ 备份数增加（17 → 18） | PASS | `dir=C:\Users\towyq\AppData\Local\kmaster\backups\memory before=17 after=18` |
| 12 | AC2 | 删除后条目消失（无残留，环境已还原） | PASS | `remaining=[]` |
| 13 | AC2 | DELETE 不存在条目 → 404 | PASS | `status=404 body={"error":"not_found","message":"memory entry not found"}` |
| 14 | AC3 | GET /api/cron-status → 200（调度器状态可查，O-2 兜底） | PASS | `status=200 body={"running":true,"raw":"✓ Gateway is running — cron jobs will fire automatically\r\n  PID: 6784\r\n  Ticker heartbeat: 17s ago\r\n\r\n  2 active job(s)\r\n  Next run: 2026-07-31T20:00:00+08:00"}` |
| 15 | AC3 | GET /api/jobs → 200 且 jobs 为数组 | PASS | `status=200 count=2 sample={"id":"0dc043cb5a2b","name":"scan-agents-skills-update-hermes-skills-link","prompt":"Scan ~/.agents/skills and create missing symlinks in hermes skills director` |
| 16 | AC3 | POST /api/jobs 新建 → 200 且返回 { ok, job, jobs } | PASS | `status=200 jobId=922bcc6eefbf name=qa-m4-1785486340345 schedule=0 9 * * *` |
| 17 | AC3 | POST /api/jobs 缺 schedule → 400 | PASS | `status=400 body={"error":"bad_request","message":"schedule required (e.g. \"30m\", \"every 2h\", \"0 9 * * *\")"}` |
| 18 | AC3 | GET /api/jobs 可见新建任务 | PASS | `ids=["0dc043cb5a2b","7d3fb46d25e2","922bcc6eefbf"]` |
| 19 | AC3 | PATCH /api/jobs/:id { enabled:false } → 映射 pause，enabled 落为 false | PASS | `status=200 enabled=false state=paused` |
| 20 | AC3 | PATCH /api/jobs/:id { name, enabled:true } → 改名 + resume 生效 | PASS | `status=200 name=qa-m4-1785486340345-renamed enabled=true` |
| 21 | AC3 | PATCH /api/jobs/:id 空补丁 → 400 | PASS | `status=400 body={"error":"bad_request","message":"at least one field required"}` |
| 22 | AC3 | POST /api/jobs/:id/run → 202 且 { ok, note, scheduler_running } | PASS | `status=202 body={"ok":true,"note":"任务已触发，正在后台执行；结果请查看运行历史","scheduler_running":true}` |
| 23 | AC3 | POST /api/jobs/:id/run 不存在任务 → 404 | PASS | `status=404 body={"error":"not_found","message":"job not-exist-id not found"}` |
| 24 | AC3 | GET /api/cron-history → 200 且 runs 为数组 | PASS | `status=200 count=0` |
| 25 | AC3 | DELETE /api/jobs/:id → 200 且列表不再包含（环境已还原） | PASS | `status=200 body={"ok":true}` |
| 26 | AC3 | 删除后 GET /api/jobs 不含该任务 | PASS | `ids=["0dc043cb5a2b","7d3fb46d25e2"]` |
| 27 | AC0 | POST /api/sessions → 200（验收用会话已建立） | PASS | `session={"id":"35162460-a830-4103-878a-e47661ba6df3","title":"新会话","profile":null,"created_at":1785486357760,"updated_at":1785486357760,"archived":0,"mode":null,"model"` |
| 28 | AC4 | WS /chat-run 连接建立 | PASS | `connected=true url=http://localhost:6648/chat-run` |
| 29 | AC5 | WS run → run.started 广播（executeRun 走 ns.emit） | PASS | `run.started=1` |
| 30 | AC5 | run 进行中连发 2 条 → 收到 2 次 run.queued（载荷含 item + pending） | PASS | `count=2 last={"session_id":"35162460-a830-4103-878a-e47661ba6df3","item":{"id":"2649d328-0ac0-4928-b777-45db8f9613f9","session_id":"35162460-a830-4103-878a-e47661ba6df3","message":"QA-M4 排队消息 2","mode":null,"model` |
| 31 | AC5 | GET /api/queue?session_id= → 长度 = 2 且按 position 升序 | PASS | `status=200 items=[{"id":"3b862c64","pos":1,"msg":"QA-M4 排队消息 1"},{"id":"2649d328","pos":2,"msg":"QA-M4 排队消息 2"}]` |
| 32 | AC5 | GET /api/queue（不带过滤）→ 200 且包含本会话排队项 | PASS | `status=200 total=2` |
| 33 | AC5 | DELETE /api/queue/:id → 200 且队列长度回落到 1 | PASS | `delete=200 remaining=1` |
| 34 | AC5 | DELETE /api/queue/:id 不存在 → 404 | PASS | `status=404 body={"error":"not_found","message":"queue item not-exist-id not found"}` |
| 35 | AC5 | POST /api/queue/:id/send 不存在 → 404 | PASS | `status=404 body={"error":"not_found","message":"queue item not-exist-id not found"}` |
| 36 | AC5 | run#1 完成（run.completed 广播） | PASS | `run.completed=1` |
| 37 | AC5 | run 完成后自动出队第 1 条并触发新 run.started（F17 续发） | PASS | `run.started=2 queue.updated=4` |
| 38 | AC5 | 出队后广播 queue.updated 且队列被清空 | PASS | `queue.updated payloads=[1,2,1,0]` |
| 39 | AC4 | Mock 触发词命中 → 收到 ≥2 个子代理的事件序列 | PASS | `subagents=2 events=18` |
| 40 | AC4 | subagent.start/tool/text/thinking/progress/complete 六类事件齐备 | PASS | `counts={"start":2,"tool":5,"text":5,"thinking":2,"progress":2,"complete":2}` |
| 41 | AC4 | 每个子代理事件均带 session_id + message_id 锚点与 subagent_id | PASS | `sample={"session_id":"35162460-a830-4103-878a-e47661ba6df3","message_id":"d0d607cc-163e-4270-aa5f-f6dfce05b66b","preview":"检索与「QA-M4：请委派两个子代理并行处理，并压缩上下」相关的公开资料并汇总要点","subagent_id":"60883f23-aa91-4fe9-b890-1f96d488e293","parent_id":"a8c28487-3716-4` |
| 42 | AC4 | subagent.complete 状态流转到完成（status=ok 且带 duration_seconds） | PASS | `completes=[{"id":"60883f23","status":"ok","dur":1.2},{"id":"cfec3f4f","status":"ok","dur":2}]` |
| 43 | AC4 | subagent 身份字段对齐 delegate_tool.py（goal/task_index/task_count/tool_count） | PASS | `identity={"session_id":"35162460-a830-4103-878a-e47661ba6df3","message_id":"d0d607cc-163e-4270-aa5f-f6dfce05b66b","preview":"检索与「QA-M4：请委派两个子代理并行处理，并压缩上下」相关的公开资料并汇总要点","subagent_id":"60883f23-aa91-4fe9-b890-1f96d488e293","parent_id":"a8c28487-3716-4` |
| 44 | AC6 | compression.started + compression.completed 事件均已收到 | PASS | `started=1 completed=1` |
| 45 | AC6 | compression.completed 携带 tokens_before/tokens_after/compression_count | PASS | `payload={"session_id":"35162460-a830-4103-878a-e47661ba6df3","old_session_id":"65484c8a-1107-4231-b872-2ae070bffbbc","in_place":true,"compression_count":1,"tokens_before":100000,"tokens_after":42000}` |
| 46 | AC5 | POST /api/queue/:id/send（会话忙）→ 200 且 started=false（提到队首） | PASS | `status=200 body={"ok":true,"started":false,"note":"会话正在运行，已提到队首，当前 run 结束后优先发送"}` |
| 47 | AC5 | 全过程无 run.failed | PASS | `run.failed=0 detail=null` |
| 48 | AC6 | GET /api/sessions/:id/context-length → 200 且返回 used/max/percent + estimated 标记 | PASS | `status=200 body={"context_used":230,"context_max":128000,"context_percent":0.2,"estimated_total":230,"model":"","categories":[{"id":"system","label":"系统指令","tokens":0,"color":"#8b5cf6"},{"id":"user","label":"用户消息","tokens":15,"color":"#3b82f6"},{"id":"assi` |
| 49 | AC6 | GET /api/sessions/:id/context-length?force=1 → 200（强制重算） | PASS | `status=200 used=230 categories=4` |
| 50 | AC6 | GET context-length 不存在会话 → 404 | PASS | `status=404 body={"error":"not_found","message":"session not-exist-session not found"}` |
| 51 | AC7 | GET /api/usage/stats?group=day → 200 且聚合非空 | PASS | `status=200 rows=1 totals={"input_tokens":360,"output_tokens":540,"cost":0.0063,"sessions":1}` |
| 52 | AC7 | usage totals 与逐行求和一致（DB 聚合自洽） | PASS | `sumIn=360 sumOut=540 totals={"input_tokens":360,"output_tokens":540,"cost":0.0063,"sessions":1}` |
| 53 | AC7 | GET /api/usage/stats?group=model → 200 | PASS | `status=200 rows=1 sample={"key":"","input_tokens":360,"output_tokens":540,"cost":0.0063,"runs":3}` |
| 54 | AC7 | GET /api/usage/stats?group=session → 200 且包含本次验收会话 | PASS | `status=200 rows=1 hitSID=true` |
| 55 | AC7 | GET /api/usage/stats?group=非法 → 400 | PASS | `status=400 body={"error":"bad_request","message":"group must be one of day \| model \| session"}` |
| 56 | AC7 | GET /api/usage/stats?from=非 YYYY-MM-DD → 400 | PASS | `status=400 body={"error":"bad_request","message":"from must be YYYY-MM-DD"}` |
| 57 | AC7 | GET /api/usage/stats 带合法 from/to → 200 | PASS | `status=200 rows=1` |
| 58 | AC8 | router/index.ts 声明 /memory /jobs /usage /queue 四条整页路由 | PASS | `missing=[] hashHistory=true` |
| 59 | AC8 | App.vue 已挂载 AppNav + <router-view>（router 不再空转） | PASS | `routerView=true appNav=true` |
| 60 | AC8 | AppNav.vue 包含五个入口且带队列徽标（queuedTotal） | PASS | `entriesOk=true badge=true` |
| 61 | AC8 | 四个整页视图文件均存在 | PASS | `missing=[]` |

## 附注

- cron 后端模式：真实 hermes cron 目录 + CLI
- 未植入历史样本（真实 cron 模式或写入失败），仅校验 /api/cron-history 契约形状
- WS 事件统计：run.started=3 run.completed=3 run.queued=3 queue.updated=7 usage.updated=3 subagent.*=18 compression.*=2
- 验收会话已清理：35162460-a830-4103-878a-e47661ba6df3 → status=200
