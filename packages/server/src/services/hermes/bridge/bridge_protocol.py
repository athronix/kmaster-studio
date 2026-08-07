"""bridge_protocol.py — kmaster-bridge 契约映射层（Q1=B：自有协议 + worker 内映射）。

所有 camelCase↔snake_case 转换、hermes→kmaster 事件映射、字段白名单、
错误码常量集中在此文件。其他模块禁止越界做命名转换。
"""

from __future__ import annotations

from typing import Any

# ═══════════════════════════════════════════════════════════════════════
# 错误码常量
# ═══════════════════════════════════════════════════════════════════════

ERROR_UNKNOWN_ACTION = "UNKNOWN_ACTION"
ERROR_UNSUPPORTED_ACTION = "UNSUPPORTED_ACTION"
ERROR_SESSION_NOT_FOUND = "SESSION_NOT_FOUND"
ERROR_AGENT_SPAWN_FAILED = "AGENT_SPAWN_FAILED"
ERROR_WORKER_UNAVAILABLE = "WORKER_UNAVAILABLE"
ERROR_FRAME_TOO_LARGE = "FRAME_TOO_LARGE"
ERROR_BAD_REQUEST = "BAD_REQUEST"
ERROR_INTERNAL_ERROR = "INTERNAL_ERROR"
# ── M2 新增错误码 ──
ERROR_MCP_CONFIG_INVALID = "MCP_CONFIG_INVALID"
ERROR_MCP_CONFIG_LOCKED = "MCP_CONFIG_LOCKED"
ERROR_MCP_SERVER_NOT_FOUND = "MCP_SERVER_NOT_FOUND"
ERROR_SKILLS_RELOAD_FAILED = "SKILLS_RELOAD_FAILED"
ERROR_MODEL_NOT_AVAILABLE = "MODEL_NOT_AVAILABLE"
ERROR_UNKNOWN_COMMAND = "UNKNOWN_COMMAND"

# ═══════════════════════════════════════════════════════════════════════
# Action 别名归一表：Node camelCase / dot-notation → worker snake_case
# ═══════════════════════════════════════════════════════════════════════

ACTION_ALIASES: dict[str, str] = {
    # ── ① 对话主链路 ──
    "chat":                      "chat",
    "chatStream":                "chat_stream",
    "getOutput":                 "get_output",
    "getResult":                 "get_result",
    "getSessionTitle":           "get_session_title",
    "getHistory":                "get_history",
    "statusIfLoaded":            "status_if_loaded",
    # ── ② 运行控制 ──
    "interrupt":                 "interrupt",
    "steer":                     "steer",
    # ── ③ 交互控制 ──
    "approvalRespond":           "approval_respond",
    "clarifyRespond":            "clarify_respond",
    # ── ④ 生命周期 ──
    "destroy":                   "destroy",
    "destroyAll":                "destroy_all",
    # ── ⑤ 配置热切换（worker 侧已具备，本里程碑 gateway 暴露部分）──
    "switchSessionModel":        "switch_session_model",
    "reloadSkills":              "skills_reload",
    # ── ⑤ MCP（worker 侧已具备）──
    "mcpList":                   "mcp_list",
    "mcpAdd":                    "mcp_server_add",
    "mcpUpdate":                 "mcp_server_update",
    "mcpRemove":                 "mcp_server_remove",
    "mcpTest":                   "mcp_server_test",
    "mcpTools":                  "mcp_tools_list",
    "mcpReload":                 "mcp_reload",
    # ── M2 新增 MCP 操作族（5 action 方案）──
    "mcpStart":                  "mcp_start",
    "mcpStop":                   "mcp_stop",
    "mcpRestart":                "mcp_restart",
    "mcpConfig":                 "mcp_config",
    # ── ⑥ 命令与后台 ──
    "command":                   "command",
    "backgroundPoll":            "background_poll",
    "completeBackgroundNotification": "complete_background_notification",
    # ── ⑦ 压缩 ──
    "compressionRespond":        "compression_respond",
    "contextEstimate":           "context_estimate",
    # ── 通用 ──
    "ping":                      "ping",
    "status":                    "status",
    "list":                      "list",

    # ── Node 现网别名（RealBridge 实际发送的 action 名）──
    "title":                     "get_session_title",
    "approval.respond":          "approval_respond",
    "clarify.respond":           "clarify_respond",
    "context.estimate":          "context_estimate",
    "plan.respond":              "plan_respond",
}

# 本里程碑 gateway 暴露的 action 白名单（不在名单内的返回 UNSUPPORTED_ACTION）
EXPOSED_ACTIONS: set[str] = {
    # ── M1 已暴露 ──
    "chat", "interrupt", "steer", "get_session_title",
    "get_history", "get_output", "get_result", "status_if_loaded",
    "approval_respond", "clarify_respond", "destroy", "status",
    "ping", "list",
    # ── M2 新增 ──
    "mcp_list", "mcp_start", "mcp_stop", "mcp_restart", "mcp_config",
    "skills_reload", "switch_session_model", "command",
    "background_poll", "complete_background_notification",
    "compression_respond", "context_estimate",
    # ── T03/U-29 ──
    "plan_respond",
}

# ═══════════════════════════════════════════════════════════════════════
# 字段白名单：Node→Python chat 请求只允许这些字段过桥
# ═══════════════════════════════════════════════════════════════════════

CHAT_FIELD_WHITELIST: set[str] = {
    "session_id", "message", "instructions", "profile",
    "model", "attachments", "options", "provider",
    "workspace", "source", "reasoning_effort",
    "storage_message", "conversation_history", "force_compress",
}

# ═══════════════════════════════════════════════════════════════════════
# hermes → kmaster 事件映射表
# ═══════════════════════════════════════════════════════════════════════

# Map of (hermes_event_name) → (kmaster_type, field_renames)
# field_renames: {hermes_field: kmaster_field}
HERMES_EVENT_MAP: dict[str, tuple[str, dict[str, str]]] = {
    "stream.delta":            ("message.delta",           {}),
    "reasoning.delta":         ("reasoning.delta",         {}),
    "thinking.delta":          ("thinking.delta",          {}),
    "tool.started":            ("tool.started",            {"tool_call_id": "toolCallId", "tool_name": "tool"}),
    "tool.completed":          ("tool.completed",          {"tool_call_id": "toolCallId", "tool_name": "tool"}),
    "model.usage":             ("usage.updated",           {}),
    "approval.requested":      ("approval.requested",      {"approval_id": "approvalId",
                                                             "command": "tool"}),
    "approval.resolved":       ("approval.resolved",       {"approval_id": "approvalId"}),
    "clarify.requested":       ("clarify.requested",       {"clarify_id": "clarifyId"}),
    "session.title.updated":   ("session.title.updated",   {}),
    "bridge.compression.requested":  ("compression.started",     {}),
    "bridge.compression.completed":  ("compression.completed",   {}),
    "bridge.compression.failed":     ("compression.failed",      {}),
    # ── M2 新增/升级显式映射 ──
    "mcp.status.changed":      ("mcp.status.changed",      {}),
    "session.command":         ("session.command",         {}),
    "subagent.start":          ("subagent.start",          {"subagent_id": "subagentId"}),
    "subagent.tool":           ("subagent.tool",           {"subagent_id": "subagentId", "tool_name": "tool"}),
    "subagent.text":           ("subagent.text",           {"subagent_id": "subagentId"}),
    "subagent.progress":       ("subagent.progress",       {"subagent_id": "subagentId"}),
    "subagent.complete":       ("subagent.complete",       {"subagent_id": "subagentId"}),
    "delegation.updated":      ("delegation.updated",      {"delegation_id": "delegationId"}),
    "background.notification": ("background.notification", {"notification_id": "notificationId"}),
    "compression.requested":   ("compression.requested",   {}),
    # ── 兜底事件 ──
    "status":                  ("agent.event",             {}),
    "turn.boundary":           ("agent.event",             {}),
    "bridge.context.ready":    ("agent.event",             {}),
    "reasoning.available":     ("agent.event",             {}),
    "moa.reference":           ("agent.event",             {}),
    "moa.aggregating":         ("agent.event",             {}),
    "subagent.thinking":       ("agent.event",             {}),
}

# Events that signal a tool failure (tool.completed with error)
TOOL_FAILED_EVENTS = {"tool.completed"}


# ═══════════════════════════════════════════════════════════════════════
# Public API
# ═══════════════════════════════════════════════════════════════════════

def normalize_action(raw: str) -> str:
    """Resolve action aliases. Returns the canonical snake_case action name.

    Raises KeyError for truly unknown actions.
    """
    if not raw:
        raise KeyError("empty action")
    # Direct lookup
    if raw in ACTION_ALIASES:
        return ACTION_ALIASES[raw]
    # Case-insensitive fallback (e.g. "Chat" → "chat")
    lower = raw.lower()
    for key in ACTION_ALIASES:
        if key.lower() == lower:
            return ACTION_ALIASES[key]
    raise KeyError(raw)


def to_worker_request(action: str, msg: dict[str, Any]) -> dict[str, Any]:
    """Build a worker-side request dict from a northbound message.

    For 'chat': applies CHAT_FIELD_WHITELIST and camelCase→snake_case.
    For others: passes through with session_id mapped.
    """
    req: dict[str, Any] = {"action": action}

    sid = msg.get("sessionId") or msg.get("session_id") or ""
    if sid:
        req["session_id"] = str(sid)

    if action == "chat":
        _copy_whitelisted(msg, req)
    elif action == "interrupt":
        req["message"] = msg.get("message") or msg.get("text") or "user requested interrupt"
    elif action == "steer":
        req["text"] = str(msg.get("text") or msg.get("message") or "")
    elif action == "approval_respond":
        req["approval_id"] = str(msg.get("approvalId") or msg.get("approval_id") or "")
        req["choice"] = str(msg.get("choice") or "deny")
    elif action == "clarify_respond":
        req["clarify_id"] = str(msg.get("clarifyId") or msg.get("clarify_id") or "")
        req["response"] = str(msg.get("response") or "")
    elif action == "get_session_title":
        req["profile"] = msg.get("profile")
    elif action == "get_output":
        req["run_id"] = str(msg.get("runId") or msg.get("run_id") or "")
        req["cursor"] = int(msg.get("cursor") or 0)
        req["event_cursor"] = int(msg.get("eventCursor") or msg.get("event_cursor") or 0)
    elif action == "get_result":
        req["run_id"] = str(msg.get("runId") or msg.get("run_id") or "")
    elif action == "get_history":
        req["session_id"] = str(sid)
    elif action == "destroy":
        req["session_id"] = str(sid)
        req["force"] = bool(msg.get("force") or False)
    elif action == "ping":
        pass  # no extra fields needed
    # ── M2 新增 action 字段映射 ──
    elif action == "command":
        req["command"] = str(msg.get("command") or "").strip()
        if msg.get("args") is not None:
            req["args"] = msg.get("args")
    elif action == "compression_respond":
        choice = str(msg.get("choice") or "").strip().lower()
        if choice not in ("allow", "deny"):
            raise ValueError(f"compressionRespond choice must be 'allow' or 'deny', got: {choice}")
        req["request_id"] = str(msg.get("compressionId") or msg.get("compression_id") or "").strip()
        req["choice"] = choice
    elif action == "switch_session_model":
        req["model"] = str(msg.get("model") or "").strip()
        req["provider"] = str(msg.get("provider") or "").strip()
    elif action == "skills_reload":
        pass  # profile handled generically below
    elif action.startswith("mcp_"):
        if msg.get("name"):
            req["name"] = str(msg.get("name")).strip()
        if msg.get("config") is not None:
            req["config"] = msg.get("config")
    elif action == "background_poll":
        pass  # no extra fields
    elif action == "complete_background_notification":
        req["notification_id"] = str(
            msg.get("notificationId") or msg.get("notification_id") or ""
        ).strip()
    elif action == "context_estimate":
        if msg.get("messages") is not None:
            req["messages"] = msg.get("messages")
        if msg.get("instructions") is not None:
            req["instructions"] = str(msg.get("instructions"))

    # Copy model/profile for non-chat actions that may need it
    if action not in {"chat", "ping", "get_output", "get_result"}:
        if msg.get("model") and "model" not in req:
            req["model"] = str(msg.get("model"))
        if msg.get("profile") and "profile" not in req:
            req["profile"] = str(msg.get("profile"))

    return req


def _copy_whitelisted(src: dict[str, Any], dst: dict[str, Any]) -> None:
    """Copy whitelisted fields from camelCase Node msg to snake_case worker req."""
    # Direct field mapping
    _field_map = {
        "message":         ("message", str),
        "model":           ("model", str),
        "profile":         ("profile", str),
        "provider":        ("provider", str),
        "instructions":    ("instructions", str),
        "workspace":       ("workspace", str),
        "source":          ("source", str),
        "reasoning_effort": ("reasoning_effort", str),
    }

    for src_key, (dst_key, cast) in _field_map.items():
        if src_key in src:
            val = src[src_key]
            if val is not None:
                dst[dst_key] = cast(val)

    # camelCase aliases
    if "sessionId" in src:
        dst["session_id"] = str(src["sessionId"])
    if "attachments" in src:
        dst["attachments"] = src["attachments"]
    if "options" in src:
        dst["options"] = src["options"]
    if "conversationHistory" in src:
        dst["conversation_history"] = src["conversationHistory"]
    if "forceCompress" in src:
        dst["force_compress"] = bool(src["forceCompress"])


def map_event(raw: dict[str, Any], session_id: str, run_id: str) -> dict[str, Any] | None:
    """Map a single hermes event dict to a kmaster event dict.

    Returns None if the event should be silently dropped.
    Returns a dict with at least {"type", "sessionId"} for valid events.
    """
    event_type = str(raw.get("event") or raw.get("type") or "")

    # Handle tool.completed with error → tool.failed
    if event_type == "tool.completed":
        result = raw.get("result")
        if isinstance(result, dict) and result.get("error"):
            return _mk_event("tool.failed", session_id, run_id, {
                "toolCallId": str(raw.get("tool_call_id") or ""),
                "tool": str(raw.get("tool_name") or ""),
                "error": str(result.get("error") or "unknown error"),
            })

    # Lookup in explicit map
    mapped = HERMES_EVENT_MAP.get(event_type)
    if mapped is None:
        # Fallback: agent.event{raw} — never drop
        return _mk_event("agent.event", session_id, run_id, {"raw": raw})

    km_type, renames = mapped
    payload: dict[str, Any] = {}

    # Apply field renames
    for hermes_field, km_field in renames.items():
        if hermes_field in raw:
            payload[km_field] = raw[hermes_field]

    # Copy common fields verbatim
    for key in ("delta", "text", "args", "result", "tool", "toolCallId",
                "question", "options", "choice", "title",
                "input_tokens", "output_tokens", "cost", "model",
                "usage", "description", "command", "choices",
                "allow_permanent", "timeout_ms", "pattern_keys",
                "risk", "approvalId", "clarifyId",
                # ── M2: subagent / delegation / compression / MCP fields ──
                "subagentId", "task", "percent", "summary", "preview",
                "status", "progress", "server", "notificationId",
                "payload", "output", "estimated_savings",
                "before_tokens", "after_tokens", "saved_tokens",
                "ok", "error", "createdAt", "delegationId"):
        if key in raw and key not in payload:
            payload[key] = raw[key]

    # For agent.event fallback, include the raw
    if km_type == "agent.event":
        if "raw" not in payload:
            payload["raw"] = raw

    return _mk_event(km_type, session_id, run_id, payload)


def map_delta(delta: str, session_id: str, run_id: str) -> dict[str, Any]:
    """Map a raw text delta (from get_output) into a message.delta event."""
    return _mk_event("message.delta", session_id, run_id, {"delta": delta})


def error(session_id: str, code: str, message: str, request_id: str | None = None) -> dict[str, Any]:
    """Build a standard error event."""
    ev: dict[str, Any] = {
        "type": "error",
        "sessionId": session_id,
        "code": code,
        "message": message,
    }
    if request_id:
        ev["requestId"] = request_id
    return ev


def result_event(session_id: str, ok: bool, data: Any = None,
                 error_msg: str | None = None, request_id: str | None = None) -> dict[str, Any]:
    """Build a synchronous result response."""
    ev: dict[str, Any] = {
        "type": "result",
        "sessionId": session_id,
        "ok": ok,
    }
    if data is not None:
        ev["data"] = data
    if error_msg is not None:
        ev["error"] = error_msg
    if request_id is not None:
        ev["requestId"] = request_id
    return ev


def is_exposed_action(action: str) -> bool:
    """Check if the given snake_case action is enabled for northbound use."""
    return action in EXPOSED_ACTIONS


# ═══════════════════════════════════════════════════════════════════════
# Internal helpers
# ═══════════════════════════════════════════════════════════════════════

def _mk_event(etype: str, session_id: str, run_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    """Build a kmaster event dict.  sessionId is mandatory on every event."""
    ev: dict[str, Any] = {
        "type": etype,
        "sessionId": session_id,
    }
    if run_id:
        ev["runId"] = run_id
    ev.update(payload)
    return ev
