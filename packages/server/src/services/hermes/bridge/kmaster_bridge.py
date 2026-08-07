#!/usr/bin/env python3
"""kmaster-bridge — kmaster-studio AgentBridge process entry point.

Two modes:
  broker (default)  → BridgeGateway : persistent NDJSON push on 16765
  worker            → BridgeServer  : one-shot request/response on worker port

Usage:
  python kmaster_bridge.py                                    # broker mode
  python kmaster_bridge.py --worker-profile <name>            # worker mode
  python kmaster_bridge.py --endpoint tcp://127.0.0.1:16999   # custom endpoint
"""

from __future__ import annotations

import argparse
import atexit
import os
import sys
import traceback

# Default northbound endpoint (deliberately different from hermes-studio 18765).
_DEFAULT_ENDPOINT = "tcp://127.0.0.1:16765"


def _resolve_endpoint(args: argparse.Namespace) -> str:
    if args.endpoint:
        return args.endpoint
    return os.environ.get("HERMES_AGENT_BRIDGE_ENDPOINT", _DEFAULT_ENDPOINT)


def _broker_main(endpoint: str, agent_root: str | None, hermes_home: str | None) -> int:
    from bridge_broker import BridgeBroker
    from bridge_gateway import BridgeGateway

    broker = BridgeBroker(endpoint=endpoint, agent_root=agent_root, hermes_home=hermes_home)
    gateway = BridgeGateway(endpoint=endpoint, broker=broker)

    # graceful cleanup
    atexit.register(gateway.stop)
    try:
        gateway.serve_forever()
    except KeyboardInterrupt:
        print("\n[kmaster-bridge] shutting down", file=sys.stderr, flush=True)
    except Exception:
        traceback.print_exc()
        return 1
    return 0


def _worker_main(endpoint: str, profile: str) -> int:
    from bridge_server import BridgeServer

    server = BridgeServer(endpoint=endpoint)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    except Exception:
        traceback.print_exc()
        return 1
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="kmaster_bridge",
        description="kmaster-studio AgentBridge",
    )
    parser.add_argument("--endpoint", default=None, help="Listen endpoint (default tcp://127.0.0.1:16765)")
    parser.add_argument("--worker-profile", default=None, dest="worker_profile",
                        help="Run in worker mode for the given profile")
    parser.add_argument("--agent-root", default=None, help="Path to hermes-agent source root")
    parser.add_argument("--hermes-home", default=None, help="Path to hermes config home (~/.hermes)")

    args = parser.parse_args(argv)
    endpoint = _resolve_endpoint(args)

    if args.worker_profile:
        return _worker_main(endpoint, args.worker_profile)

    return _broker_main(endpoint, args.agent_root, args.hermes_home)


if __name__ == "__main__":
    sys.exit(main())
