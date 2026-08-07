"""bridge_gateway.py — kmaster-bridge northbound gateway.

Persistent NDJSON push gateway.  Connects Node RealBridge (Map<sessionId,Socket>)
to the broker/worker pool.  Each client connection gets:
  - a LineReader for NDJSON frame reassembly
  - a command read loop (one thread)
  - per-run RunPump threads for pull→push event delivery

Architecture:
  Node ──TCP:16765──> ClientConn ──> _dispatch ──> broker.handle()
                           ↑                          │
                           └── emit() ←── RunPump ←──┘
"""

from __future__ import annotations

import atexit
import json
import os
import socket
import sys
import threading
import time
import traceback
from typing import Any

from bridge_broker import BridgeBroker
from bridge_protocol import (
    ACTION_ALIASES,
    ERROR_BAD_REQUEST,
    ERROR_INTERNAL_ERROR,
    ERROR_SESSION_NOT_FOUND,
    ERROR_UNKNOWN_ACTION,
    ERROR_UNKNOWN_COMMAND,
    ERROR_WORKER_UNAVAILABLE,
    error as _mk_error,
    is_exposed_action,
    map_delta,
    map_event,
    normalize_action,
    result_event,
    to_worker_request,
)
from bridge_transport import LineReader, _make_listen_socket


# ── tunables ─────────────────────────────────────────────────────────

_POLL_MIN_MS = float(os.environ.get("KMASTER_BRIDGE_POLL_MIN_MS", "20")) / 1000.0
_POLL_MAX_MS = float(os.environ.get("KMASTER_BRIDGE_POLL_MAX_MS", "200")) / 1000.0
_ABORT_TIMEOUT = float(os.environ.get("KMASTER_BRIDGE_ABORT_TIMEOUT_MS", "10000")) / 1000.0
_IDLE_TTL = float(os.environ.get("KMASTER_BRIDGE_IDLE_TTL_MS", "1800000")) / 1000.0
_MAX_WORKERS = int(os.environ.get("KMASTER_BRIDGE_MAX_WORKERS", "8"))


# ── ClientConn ───────────────────────────────────────────────────────

class ClientConn:
    """Persistent NDJSON connection with line-buffered read and RLock-guarded write."""

    def __init__(self, sock: socket.socket) -> None:
        self.sock = sock
        self.reader = LineReader()
        self._wlock = threading.RLock()
        self.sessions: set[str] = set()  # sessionIds active on this connection

    def read_lines(self):
        """Generator yielding parsed JSON dicts, one per NDJSON line."""
        buf = self.reader
        while True:
            try:
                chunk = self.sock.recv(65536)
            except OSError:
                return
            if not chunk:
                return
            try:
                lines = buf.feed(chunk)
            except RuntimeError as exc:
                # FRAME_TOO_LARGE etc.
                try:
                    self.send(_mk_error("", ERROR_BAD_REQUEST, str(exc)))
                except Exception:
                    pass
                return
            for line in lines:
                try:
                    yield json.loads(line.decode("utf-8"))
                except json.JSONDecodeError:
                    # malformed line → skip (don't kill connection)
                    pass

    def send(self, obj: dict[str, Any]) -> None:
        """Thread-safe NDJSON write."""
        payload = json.dumps(obj, ensure_ascii=False, default=str) + "\n"
        with self._wlock:
            try:
                self.sock.sendall(payload.encode("utf-8"))
            except OSError:
                pass

    def close(self) -> None:
        try:
            self.sock.shutdown(socket.SHUT_RDWR)
        except OSError:
            pass
        try:
            self.sock.close()
        except OSError:
            pass


# ── RunPump ──────────────────────────────────────────────────────────

class RunPump:
    """Pull→push event pump for one active run.

    Polls broker.get_output() at adaptive intervals.  Maps hermes events
    through bridge_protocol and pushes them to the owning connection.

    Terminates when:
      - record.done == True  → emit 'completed'
      - worker error         → emit 'error' + 'completed'
      - _stop is set         → stop without emitting
    """

    def __init__(self, run_id: str, session_id: str, conn: ClientConn,
                 broker: BridgeBroker, gateway: BridgeGateway) -> None:
        self.run_id = run_id
        self.session_id = session_id
        self._conn = conn
        self._broker = broker
        self._gateway = gateway
        self._cursor = 0
        self._event_cursor = 0
        self._interval = _POLL_MIN_MS
        self._stop = threading.Event()
        self._done = False

    def run(self) -> None:
        """Main pump loop.  Runs in its own daemon thread."""
        try:
            while not self._stop.is_set():
                done = self._poll_once()
                if done:
                    self._done = True
                    return
                time.sleep(self._interval)
        except Exception:
            # pump crash → error + completed so run doesn't hang forever
            try:
                self._conn.send(_mk_error(self.session_id, ERROR_INTERNAL_ERROR,
                                          "event pump crashed"))
            except Exception:
                pass
        finally:
            if not self._done:
                self._emit_completed("")

    def stop(self) -> None:
        self._stop.set()

    def _poll_once(self) -> bool:
        """Poll one cycle. Returns True when the run is finished."""
        try:
            resp = self._broker.handle({
                "action": "get_output",
                "run_id": self.run_id,
                "cursor": self._cursor,
                "event_cursor": self._event_cursor,
            })
        except Exception:
            # Worker unavailable → error + complete
            self._conn.send(_mk_error(self.session_id, ERROR_WORKER_UNAVAILABLE,
                                      "worker unavailable"))
            self._emit_completed("")
            return True

        if not resp.get("ok"):
            err = resp.get("error", "unknown")
            self._conn.send(_mk_error(self.session_id, ERROR_WORKER_UNAVAILABLE, str(err)))
            self._emit_completed("")
            return True

        # Push new delta
        delta = str(resp.get("delta") or "")
        if delta:
            self._conn.send(map_delta(delta, self.session_id, self.run_id))

        # Push new events
        for raw_ev in resp.get("events") or []:
            if not isinstance(raw_ev, dict):
                continue
            mapped = map_event(raw_ev, self.session_id, self.run_id)
            if mapped is not None:
                self._conn.send(mapped)

        # Advance cursors
        self._cursor = int(resp.get("cursor") or self._cursor)
        self._event_cursor = int(resp.get("event_cursor") or self._event_cursor)

        # Adaptive backoff: speed up when data is flowing, slow down when idle
        if delta or (resp.get("events") and len(resp.get("events") or []) > 0):
            self._interval = max(_POLL_MIN_MS, self._interval * 0.5)
        else:
            self._interval = min(_POLL_MAX_MS, self._interval * 1.5)

        # Check completion
        if resp.get("done"):
            status = resp.get("status", "complete")
            result = resp.get("result") or {}
            if status == "error" or resp.get("error"):
                err_msg = str(resp.get("error") or result.get("error") or "run failed")
                self._conn.send(_mk_error(self.session_id, ERROR_INTERNAL_ERROR, err_msg))
            text = "".join(resp.get("output") or result.get("output") or
                           result.get("final_response") or result.get("response") or "")
            self._emit_completed(text)
            return True

        return False

    def _emit_completed(self, text: str) -> None:
        self._conn.send({
            "type": "completed",
            "sessionId": self.session_id,
            "runId": self.run_id,
            "text": text,
        })


# ── BackgroundPump ────────────────────────────────────────────────────

class BackgroundPump:
    """Global background notification pump (M2).

    Polls broker for background notifications at 500ms intervals.
    Deduplicates via _known_ids (LRU-capped at 10_000).
    Emits to the owning gateway's emit() for directed delivery.
    """

    _MAX_KNOWN_IDS = 10_000

    def __init__(self, gateway: BridgeGateway) -> None:
        self._gateway = gateway
        self._interval = 0.5  # 500ms
        self._stop = threading.Event()
        self._known_ids: set[str] = set()

    def run(self) -> None:
        """Main loop — runs in its own daemon thread."""
        try:
            while not self._stop.is_set():
                self._poll_once()
                time.sleep(self._interval)
        except Exception:
            pass  # pump crash is non-fatal; next poll retries

    def stop(self) -> None:
        self._stop.set()

    def _poll_once(self) -> None:
        try:
            resp = self._gateway.broker.handle({"action": "background_poll"})
        except Exception:
            return

        if not resp.get("ok"):
            return

        notifications = resp.get("notifications") or []
        if not isinstance(notifications, list):
            return

        for note in notifications:
            if not isinstance(note, dict):
                continue
            nid = str(note.get("notificationId") or note.get("notification_id") or "")
            if not nid:
                continue
            # Dedup
            if nid in self._known_ids:
                continue
            self._known_ids.add(nid)
            # LRU evict
            if len(self._known_ids) > self._MAX_KNOWN_IDS:
                # Evict oldest half
                keep = sorted(self._known_ids)[-(self._MAX_KNOWN_IDS // 2):]
                self._known_ids = set(keep)

            # Determine sessionId from payload or default
            sid = str(note.get("sessionId") or note.get("session_id") or "")
            self._gateway.emit(sid, {
                "type": "background.notification",
                "sessionId": sid,
                "notificationId": nid,
                "payload": note.get("payload"),
                "createdAt": note.get("createdAt") or note.get("created_at"),
            })

    def mark_consumed(self, notification_id: str) -> None:
        """Remove from known_ids so it can reappear if re-sent (at-least-once semantics handled by worker)."""
        self._known_ids.discard(notification_id)


# ── BridgeGateway ────────────────────────────────────────────────────

class BridgeGateway:
    """Northbound gateway: owns the TCP listen socket, ClientConn registry,
    RunPump lifecycle, and command dispatch.
    """

    def __init__(self, endpoint: str, broker: BridgeBroker) -> None:
        self.endpoint = endpoint
        self.broker = broker
        self._conns: dict[str, ClientConn] = {}          # conn_id → ClientConn
        self._session_conn: dict[str, str] = {}           # sessionId → conn_id
        self._pumps: dict[str, RunPump] = {}              # run_id → RunPump
        self._lock = threading.RLock()
        self._stop = threading.Event()
        self._last_gc = time.time()
        self._bg_pump: BackgroundPump | None = None

    # ── lifecycle ──────────────────────────────────────────────────

    def serve_forever(self) -> None:
        endpoint = _resolve_endpoint_with_ipc_fallback(self.endpoint)
        self.endpoint = endpoint
        server = _make_listen_socket(endpoint)
        atexit.register(self.stop)

        # M2: start BackgroundPump daemon
        self._bg_pump = BackgroundPump(self)
        threading.Thread(
            target=self._bg_pump.run,
            daemon=True,
            name="kmaster-bgpump",
        ).start()

        try:
            server.listen(64)
            server.settimeout(0.5)
            host, port = _endpoint_host_port(endpoint)
            print(f"[kmaster-bridge] listening on {host}:{port}", flush=True)

            while not self._stop.is_set():
                try:
                    conn, _addr = server.accept()
                except socket.timeout:
                    self._gc()
                    continue
                except OSError:
                    if self._stop.is_set():
                        break
                    raise

                client = ClientConn(conn)
                conn_id = f"{_addr[0]}:{_addr[1]}" if _addr else str(id(conn))
                with self._lock:
                    self._conns[conn_id] = client
                threading.Thread(
                    target=self._handle_conn,
                    args=(client, conn_id),
                    daemon=True,
                    name=f"kmaster-gw-{conn_id}",
                ).start()
        finally:
            try:
                atexit.unregister(self.stop)
            except Exception:
                pass
            self.stop()
            server.close()
            if self.endpoint.startswith("ipc://"):
                from pathlib import Path
                try:
                    Path(self.endpoint.removeprefix("ipc://")).unlink(missing_ok=True)
                except OSError:
                    pass

    def stop(self) -> None:
        self._stop.set()
        # Stop background pump
        if self._bg_pump:
            self._bg_pump.stop()
        # Stop all pumps
        with self._lock:
            pumps = list(self._pumps.values())
            self._pumps.clear()
        for pump in pumps:
            pump.stop()
        # Close all connections
        with self._lock:
            conns = list(self._conns.values())
            self._conns.clear()
            self._session_conn.clear()
        for c in conns:
            c.close()
        # Stop broker (kills workers)
        self.broker.stop()

    # ── event emission ──────────────────────────────────────────────

    def emit(self, session_id: str, event: dict[str, Any]) -> None:
        """Thread-safe event emission to the connection owning *session_id*."""
        if not session_id:
            # Broadcast to all connections
            with self._lock:
                conns = list(self._conns.values())
            for conn in conns:
                conn.send(event)
            return
        with self._lock:
            conn_id = self._session_conn.get(session_id)
        if conn_id:
            with self._lock:
                conn = self._conns.get(conn_id)
            if conn:
                conn.send(event)

    # ── connection handling ─────────────────────────────────────────

    def _handle_conn(self, conn: ClientConn, conn_id: str) -> None:
        try:
            for msg in conn.read_lines():
                if self._stop.is_set():
                    break
                self._dispatch(conn, conn_id, msg)
        except Exception:
            pass
        finally:
            self._cleanup_conn(conn, conn_id)

    def _cleanup_conn(self, conn: ClientConn, conn_id: str) -> None:
        with self._lock:
            # Remove session→conn mappings
            for sid in list(conn.sessions):
                if self._session_conn.get(sid) == conn_id:
                    self._session_conn.pop(sid, None)
            self._conns.pop(conn_id, None)
        conn.close()

    # ── dispatch ────────────────────────────────────────────────────

    def _dispatch(self, conn: ClientConn, conn_id: str, msg: dict[str, Any]) -> None:
        raw_action = str(msg.get("action") or "").strip()
        request_id = str(msg.get("requestId") or msg.get("request_id") or "").strip() or None

        # Normalize
        try:
            action = normalize_action(raw_action)
        except KeyError:
            conn.send(_mk_error(
                msg.get("sessionId", ""), ERROR_UNKNOWN_ACTION,
                f"unknown action: {raw_action}", request_id,
            ))
            return

        # Check if exposed
        if not is_exposed_action(action):
            conn.send(_mk_error(
                msg.get("sessionId", ""), ERROR_UNKNOWN_ACTION,
                f"action not supported in this milestone: {raw_action}", request_id,
            ))
            return

        # Route
        try:
            if action == "chat":
                self._on_chat(conn, conn_id, msg, action, request_id)
            elif action == "interrupt":
                self._on_interrupt(conn, msg, action, request_id)
            elif action == "steer":
                self._on_steer(conn, msg, action, request_id)
            elif action == "get_session_title":
                self._on_get_session_title(conn, msg, action, request_id)
            elif action in ("approval_respond", "clarify_respond"):
                self._on_respond(conn, msg, action, request_id)
            elif action == "command":
                self._on_command(conn, msg, action, request_id)
            elif action == "compression_respond":
                self._on_compression_respond(conn, msg, action, request_id)
            elif action == "destroy":
                self._on_destroy(conn, msg, action, request_id)
            else:
                self._on_generic(conn, msg, action, request_id)
        except KeyError:
            conn.send(_mk_error(
                str(msg.get("sessionId", "")), ERROR_SESSION_NOT_FOUND,
                f"session not found for action: {action}", request_id,
            ))
        except Exception as exc:
            conn.send(_mk_error(
                str(msg.get("sessionId", "")), ERROR_INTERNAL_ERROR,
                str(exc), request_id,
            ))

    # ── action handlers ──────────────────────────────────────────────

    def _on_chat(self, conn: ClientConn, conn_id: str, msg: dict[str, Any],
                 action: str, request_id: str | None) -> None:
        session_id = str(msg.get("sessionId") or msg.get("session_id") or "").strip()
        if not session_id:
            conn.send(_mk_error("", ERROR_BAD_REQUEST, "sessionId is required", request_id))
            return

        # Register session→conn
        with self._lock:
            self._session_conn[session_id] = conn_id
        conn.sessions.add(session_id)

        # Build and forward
        req = to_worker_request(action, msg)
        try:
            resp = self.broker.handle(req)
        except Exception as exc:
            conn.send(_mk_error(session_id, ERROR_WORKER_UNAVAILABLE, str(exc), request_id))
            conn.send({"type": "completed", "sessionId": session_id, "runId": "", "text": ""})
            return

        if not resp.get("ok"):
            err = resp.get("error", "chat failed")
            conn.send(_mk_error(session_id, ERROR_WORKER_UNAVAILABLE, str(err), request_id))
            conn.send({"type": "completed", "sessionId": session_id, "runId": "", "text": ""})
            return

        run_id = str(resp.get("run_id") or "")
        # Emit run.started
        conn.send({
            "type": "run.started",
            "sessionId": session_id,
            "runId": run_id,
        })

        # Start RunPump
        pump = RunPump(run_id, session_id, conn, self.broker, self)
        with self._lock:
            self._pumps[run_id] = pump
        threading.Thread(
            target=pump.run,
            daemon=True,
            name=f"kmaster-pump-{run_id[:8]}",
        ).start()

    def _on_interrupt(self, conn: ClientConn, msg: dict[str, Any],
                      action: str, request_id: str | None) -> None:
        session_id = str(msg.get("sessionId") or msg.get("session_id") or "").strip()
        if not session_id:
            conn.send(_mk_error("", ERROR_BAD_REQUEST, "sessionId is required", request_id))
            return

        # Look up active run_id
        run_id = ""
        with self._lock:
            for rid, pump in list(self._pumps.items()):
                if pump.session_id == session_id:
                    run_id = rid
                    break

        # Emit abort.started immediately
        conn.send({
            "type": "abort.started",
            "sessionId": session_id,
            "runId": run_id,
        })

        # Forward to broker
        req = to_worker_request(action, msg)
        try:
            resp = self.broker.handle(req)
        except KeyError:
            conn.send(_mk_error(session_id, ERROR_SESSION_NOT_FOUND,
                                f"session not found: {session_id}", request_id))
            return
        except Exception as exc:
            conn.send(_mk_error(session_id, ERROR_INTERNAL_ERROR, str(exc), request_id))
            return

        # Abort watchdog: poll run status until stopped or timeout
        if run_id:
            threading.Thread(
                target=self._abort_watchdog,
                args=(conn, session_id, run_id),
                daemon=True,
                name=f"kmaster-abort-{session_id[:8]}",
            ).start()

        if resp.get("ok"):
            conn.send(result_event(session_id, True, {"interrupted": True},
                                   request_id=request_id))
        else:
            conn.send(_mk_error(session_id, ERROR_INTERNAL_ERROR,
                                resp.get("error", "interrupt failed"), request_id))

    def _abort_watchdog(self, conn: ClientConn, session_id: str, run_id: str) -> None:
        """Monitor run after interrupt. Emit abort.completed or abort.timeout."""
        deadline = time.time() + _ABORT_TIMEOUT
        while time.time() < deadline:
            try:
                resp = self.broker.handle({
                    "action": "get_output",
                    "run_id": run_id,
                    "cursor": 0,
                    "event_cursor": 0,
                })
            except Exception:
                time.sleep(0.2)
                continue

            if resp.get("done"):
                conn.send({
                    "type": "abort.completed",
                    "sessionId": session_id,
                    "runId": run_id,
                })
                return
            time.sleep(0.2)

        # Timeout — force destroy
        conn.send({
            "type": "abort.timeout",
            "sessionId": session_id,
            "runId": run_id,
        })
        try:
            self.broker.handle({"action": "destroy", "session_id": session_id, "force": True})
        except Exception:
            pass
        conn.send({"type": "completed", "sessionId": session_id, "runId": run_id, "text": ""})

    def _on_steer(self, conn: ClientConn, msg: dict[str, Any],
                  action: str, request_id: str | None) -> None:
        session_id = str(msg.get("sessionId") or msg.get("session_id") or "").strip()
        if not session_id:
            conn.send(_mk_error("", ERROR_BAD_REQUEST, "sessionId is required", request_id))
            return
        req = to_worker_request(action, msg)
        try:
            resp = self.broker.handle(req)
        except KeyError:
            conn.send(_mk_error(session_id, ERROR_SESSION_NOT_FOUND,
                                f"session not found: {session_id}", request_id))
            return
        except Exception as exc:
            conn.send(_mk_error(session_id, ERROR_INTERNAL_ERROR, str(exc), request_id))
            return

        if resp.get("ok"):
            conn.send(result_event(session_id, True, resp, request_id=request_id))
        else:
            conn.send(result_event(session_id, False, None,
                                   resp.get("error", "steer failed"), request_id))

    def _on_get_session_title(self, conn: ClientConn, msg: dict[str, Any],
                               action: str, request_id: str | None) -> None:
        session_id = str(msg.get("sessionId") or msg.get("session_id") or "").strip()
        if not session_id:
            conn.send(_mk_error("", ERROR_BAD_REQUEST, "sessionId is required", request_id))
            return
        req = to_worker_request(action, msg)
        try:
            resp = self.broker.handle(req)
        except KeyError:
            conn.send(_mk_error(session_id, ERROR_SESSION_NOT_FOUND,
                                f"session not found: {session_id}", request_id))
            return
        except Exception as exc:
            conn.send(_mk_error(session_id, ERROR_INTERNAL_ERROR, str(exc), request_id))
            return

        title = str(resp.get("title") or "")
        if title:
            conn.send({
                "type": "session.title.updated",
                "sessionId": session_id,
                "title": title,
            })
        conn.send(result_event(session_id, True, {"title": title}, request_id=request_id))

    def _on_respond(self, conn: ClientConn, msg: dict[str, Any],
                    action: str, request_id: str | None) -> None:
        """Unified handler for approvalRespond and clarifyRespond."""
        session_id = str(msg.get("sessionId") or msg.get("session_id") or "").strip()
        req = to_worker_request(action, msg)
        try:
            # For approval_respond / clarify_respond, broker routes by
            # approval_id / clarify_id, not session_id
            resp = self.broker.handle(req)
        except Exception as exc:
            conn.send(_mk_error(session_id or "", ERROR_INTERNAL_ERROR, str(exc), request_id))
            return

        if resp.get("ok"):
            # Emit resolved event
            if action == "approval_respond":
                conn.send({
                    "type": "approval.resolved",
                    "sessionId": session_id,
                    "approvalId": str(msg.get("approvalId") or msg.get("approval_id") or ""),
                    "choice": str(msg.get("choice") or "deny"),
                })
            elif action == "clarify_respond":
                conn.send({
                    "type": "clarify.resolved",
                    "sessionId": session_id,
                    "clarifyId": str(msg.get("clarifyId") or msg.get("clarify_id") or ""),
                })
            conn.send(result_event(session_id, True, resp, request_id=request_id))
        else:
            conn.send(result_event(session_id, False, None,
                                   resp.get("error", f"{action} failed"), request_id))

    def _on_command(self, conn: ClientConn, msg: dict[str, Any],
                    action: str, request_id: str | None) -> None:
        """Handle /command execution. Emits session.command event + result."""
        session_id = str(msg.get("sessionId") or msg.get("session_id") or "").strip()
        if not session_id:
            conn.send(_mk_error("", ERROR_BAD_REQUEST, "sessionId is required", request_id))
            return

        command_name = str(msg.get("command") or "").strip()
        if not command_name:
            conn.send(_mk_error(session_id, ERROR_BAD_REQUEST, "command is required", request_id))
            return

        req = to_worker_request(action, msg)
        try:
            resp = self.broker.handle(req)
        except KeyError:
            conn.send(_mk_error(session_id, ERROR_SESSION_NOT_FOUND,
                                f"session not found for command", request_id))
            return
        except Exception as exc:
            conn.send(_mk_error(session_id, ERROR_INTERNAL_ERROR, str(exc), request_id))
            return

        ok = resp.get("ok") is not False
        # Emit session.command event for frontend command echo area
        conn.send({
            "type": "session.command",
            "sessionId": session_id,
            "command": command_name,
            "ok": ok,
            "output": resp.get("output") or resp.get("message"),
            "error": None if ok else (resp.get("error") or "command failed"),
        })

        if ok:
            conn.send(result_event(session_id, True, resp, request_id=request_id))
        else:
            conn.send(result_event(session_id, False, None,
                                   resp.get("error", "command failed"), request_id))

    def _on_compression_respond(self, conn: ClientConn, msg: dict[str, Any],
                                 action: str, request_id: str | None) -> None:
        """Handle compressionRespond — choice whitelist validation (M2)."""
        session_id = str(msg.get("sessionId") or msg.get("session_id") or "").strip()
        if not session_id:
            conn.send(_mk_error("", ERROR_BAD_REQUEST, "sessionId is required", request_id))
            return

        choice = str(msg.get("choice") or "").strip().lower()
        if choice not in ("allow", "deny"):
            conn.send(_mk_error(session_id, ERROR_BAD_REQUEST,
                                f"compressionRespond choice must be 'allow' or 'deny', got: {choice}",
                                request_id))
            return

        req = to_worker_request(action, msg)
        try:
            resp = self.broker.handle(req)
        except KeyError:
            conn.send(_mk_error(session_id, ERROR_SESSION_NOT_FOUND,
                                "session not found for compression respond", request_id))
            return
        except Exception as exc:
            conn.send(_mk_error(session_id, ERROR_INTERNAL_ERROR, str(exc), request_id))
            return

        if resp.get("ok") is not False:
            conn.send(result_event(session_id, True, resp, request_id=request_id))
        else:
            conn.send(result_event(session_id, False, None,
                                   resp.get("error", "compression respond failed"), request_id))

    def _on_destroy(self, conn: ClientConn, msg: dict[str, Any],
                    action: str, request_id: str | None) -> None:
        session_id = str(msg.get("sessionId") or msg.get("session_id") or "").strip()
        if not session_id:
            conn.send(_mk_error("", ERROR_BAD_REQUEST, "sessionId is required", request_id))
            return

        # Stop any active pump for this session
        with self._lock:
            for rid, pump in list(self._pumps.items()):
                if pump.session_id == session_id:
                    pump.stop()
                    self._pumps.pop(rid, None)

        req = to_worker_request(action, msg)
        try:
            resp = self.broker.handle(req)
        except Exception as exc:
            conn.send(_mk_error(session_id, ERROR_INTERNAL_ERROR, str(exc), request_id))
            return

        if resp.get("ok") or resp.get("destroyed"):
            conn.send(result_event(session_id, True, {"destroyed": True}, request_id=request_id))
        else:
            conn.send(result_event(session_id, False, None,
                                   resp.get("error", "destroy failed"), request_id))

    def _on_generic(self, conn: ClientConn, msg: dict[str, Any],
                    action: str, request_id: str | None) -> None:
        """Handle simple request→response actions (ping, status, get_result, etc.)."""
        session_id = str(msg.get("sessionId") or msg.get("session_id") or "").strip()
        req = to_worker_request(action, msg)
        try:
            resp = self.broker.handle(req)
        except KeyError:
            conn.send(_mk_error(session_id, ERROR_SESSION_NOT_FOUND,
                                f"not found for {action}", request_id))
            return
        except Exception as exc:
            conn.send(_mk_error(session_id, ERROR_INTERNAL_ERROR, str(exc), request_id))
            return

        if resp.get("ok") is not False:
            conn.send(result_event(session_id, True, resp, request_id=request_id))
        else:
            conn.send(result_event(session_id, False, None,
                                   resp.get("error", f"{action} failed"), request_id))

    # ── garbage collection ───────────────────────────────────────────

    def _gc(self) -> None:
        now = time.time()
        if now - self._last_gc < 60:
            return
        self._last_gc = now
        self.broker._gc_idle_workers()


# ── helpers ───────────────────────────────────────────────────────────

def _resolve_endpoint_with_ipc_fallback(endpoint: str) -> str:
    """Resolve endpoint: if ipc:// on Windows, fall back to TCP with log."""
    if endpoint.startswith("ipc://") and os.name == "nt":
        fallback = "tcp://127.0.0.1:16765"
        print("[kmaster-bridge] ipc:// not supported on Windows, falling back to "
              f"{fallback}", file=sys.stderr, flush=True)
        return fallback
    return endpoint


def _endpoint_host_port(endpoint: str) -> tuple[str, int]:
    """Parse tcp://host:port into (host, port)."""
    if endpoint.startswith("tcp://"):
        hp = endpoint[len("tcp://"):]
        if ":" in hp:
            host, port_str = hp.rsplit(":", 1)
            return host, int(port_str)
        return hp, 0
    return "127.0.0.1", 0
