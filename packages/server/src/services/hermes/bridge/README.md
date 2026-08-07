# kmaster-bridge

kmaster-studio 的 AgentBridge Python 进程。连接 hermes-agent，为 Node 端提供 Agent 能力。

## 启动

```bash
# broker 模式（默认）：监听 16765，持久 NDJSON 推送
python kmaster_bridge.py

# 自定义端点
python kmaster_bridge.py --endpoint tcp://127.0.0.1:16999
# 或环境变量
HERMES_AGENT_BRIDGE_ENDPOINT=tcp://127.0.0.1:16999 python kmaster_bridge.py

# worker 模式（通常由 broker 自动 spawn，无需手动）
python kmaster_bridge.py --worker-profile myprofile
```

## 环境变量

| 变量 | 默认 | 说明 |
|---|---|---|
| `HERMES_AGENT_BRIDGE_ENDPOINT` | `tcp://127.0.0.1:16765` | 北向监听端点 |
| `KMASTER_BRIDGE_WORKER_PORT_BASE` | `16880` | worker 端口基址 |
| `KMASTER_BRIDGE_KILL_PORT_OCCUPANT` | `0` | 启动时是否 taskkill 端口占用者（默认关） |
| `KMASTER_BRIDGE_POLL_MIN_MS` | `20` | 事件泵最小轮询间隔(ms) |
| `KMASTER_BRIDGE_POLL_MAX_MS` | `200` | 事件泵最大轮询间隔(ms) |
| `KMASTER_BRIDGE_ABORT_TIMEOUT_MS` | `10000` | interrupt 超时(ms) |
| `KMASTER_BRIDGE_APPROVAL_TIMEOUT_MS` | `300000` | 审批挂起超时(ms) |
| `KMASTER_BRIDGE_IDLE_TTL_MS` | `1800000` | worker 空闲回收(ms) |
| `KMASTER_BRIDGE_MAX_WORKERS` | `8` | worker 数量上限 |
| `HERMES_AGENT_ROOT` | 自动发现 | hermes-agent 源码根目录 |
| `HERMES_HOME` | `~/.hermes` | hermes 配置目录 |

## 与 hermes-studio 共存

- kmaster-bridge 默认监听 **16765**，hermes-studio bridge 监听 **18765**，端口互不冲突
- worker 端口基址 **16880**，hermes-studio 为 **18780**，互不冲突
- `KMASTER_BRIDGE_KILL_PORT_OCCUPANT` 默认关闭，不会误杀同机 hermes-studio 进程

## 架构

```
Node (RealBridge) ──TCP:16765──> bridge_gateway.py (RunPump push)
                                    │
                              bridge_broker.py (route by session/profile)
                                    │
                              WorkerProcess ──subprocess──> bridge_server.py (worker)
                                                              │
                                                        AgentPool → AIAgent (import)
```

## 依赖

- Python ≥ 3.10
- hermes-agent（可 import `run_agent.AIAgent`）
- 零额外 pip 依赖（仅 Python 标准库）

## 排障

- `AGENT_SPAWN_FAILED`: hermes-agent 未安装或 `run_agent` 不可 import。检查 `HERMES_AGENT_ROOT` 或 `pip install hermes-agent`
- `FRAME_TOO_LARGE`: 单条 NDJSON 超过 8MB 上限
- `SESSION_NOT_FOUND`: interrupt/steer/destroy 目标 session 不存在
- `WORKER_UNAVAILABLE`: worker 进程崩溃，next chat 自动重建

## hermes-agent 版本

本 bridge 通过 `from run_agent import AIAgent` 进程内导入 hermes-agent。
AIAgent 构造 API 与 hermes 版本强耦合。当前联调版本见 T05 联调记录。
