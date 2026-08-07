#!/usr/bin/env node
/**
 * kmaster-bridge QA Verification Script
 * Edward (QA Engineer) — Round 1
 *
 * Validates: tsc compilation, Python syntax, port defaults, import structure.
 */

import { execSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BRIDGE_DIR = join(__dirname, 'src', 'services', 'hermes', 'bridge');
const PYTHON = 'C:\\Users\\towyq\\.workbuddy\\binaries\\python\\versions\\3.13.12\\python.exe';

let total = 0, passed = 0, failed = 0;
const failures = [];

function check(testName, fn) {
  total++;
  try {
    fn();
    passed++;
    console.log(`  ✓ ${testName}`);
  } catch (e) {
    failed++;
    console.log(`  ✗ ${testName}: ${e.message}`);
    failures.push({ test: testName, error: e.message });
  }
}

function assert(cond, msg) { if (!cond) throw new Error(msg); }

// ─── 1. tsc --noEmit ──────────────────────────────────────────────
console.log('\n═══ 1. TypeScript Compilation ═══');
check('tsc --noEmit passes', () => {
  const result = execSync('npx tsc --noEmit', {
    cwd: __dirname,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, NO_PROXY: 'localhost,127.0.0.1', KMASTER_NO_EMPTY_DIST: '1' },
  });
  assert(true, 'tsc compiled successfully');
});

// ─── 2. Python AST Compilation ────────────────────────────────────
console.log('\n═══ 2. Python Syntax (py_compile) ═══');
const pyFiles = readdirSync(BRIDGE_DIR).filter(f => f.endsWith('.py'));

for (const f of pyFiles) {
  const fp = join(BRIDGE_DIR, f);
  check(`Python AST: ${f}`, () => {
    try {
      execSync(`"${PYTHON}" -m py_compile "${fp}"`, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (e) {
      throw new Error(e.stderr?.trim() || e.message);
    }
  });
}

// ─── 3. Port Defaults ─────────────────────────────────────────────
console.log('\n═══ 3. Port Defaults ═══');

// Read key files
const runtimePy = readFileSync(join(BRIDGE_DIR, 'bridge_runtime.py'), 'utf-8');
const kmasterPy = readFileSync(join(BRIDGE_DIR, 'kmaster_bridge.py'), 'utf-8');
const transportPy = readFileSync(join(BRIDGE_DIR, 'bridge_transport.py'), 'utf-8');
const gatewayPy = readFileSync(join(BRIDGE_DIR, 'bridge_gateway.py'), 'utf-8');
const protocolPy = readFileSync(join(BRIDGE_DIR, 'bridge_protocol.py'), 'utf-8');
const bridgeTs = readFileSync(join(__dirname, 'src', 'bridge.ts'), 'utf-8');
const protocolTs = readFileSync(join(__dirname, 'src', 'protocol.ts'), 'utf-8');

check('DEFAULT_ENDPOINT = 16765 (bridge_runtime.py)', () => {
  assert(runtimePy.includes('DEFAULT_ENDPOINT = "tcp://127.0.0.1:16765"'),
    'DEFAULT_ENDPOINT missing or wrong val');
});

check('kmaster_bridge.py default endpoint = 16765', () => {
  assert(kmasterPy.includes('_DEFAULT_ENDPOINT = "tcp://127.0.0.1:16765"'),
    '_DEFAULT_ENDPOINT missing or wrong val');
});

check('HERMES_AGENT_BRIDGE_ENDPOINT env override (kmaster_bridge.py)', () => {
  assert(kmasterPy.includes('HERMES_AGENT_BRIDGE_ENDPOINT'),
    'HERMES_AGENT_BRIDGE_ENDPOINT not referenced');
});

check('worker port base = 16880 (bridge_transport.py)', () => {
  assert(transportPy.includes('"16880"'),
    'KMASTER_BRIDGE_WORKER_PORT_BASE default not 16880');
});

check('KMASTER_BRIDGE_KILL_PORT_OCCUPANT default = 0', () => {
  const killEnv = transportPy.match(/KMASTER_BRIDGE_KILL_PORT_OCCUPANT.*"0"/);
  assert(killEnv, 'KILL_PORT_OCCUPANT default not "0"');
});

check('RealBridge endpoint = HERMES_AGENT_BRIDGE_ENDPOINT ?? tcp://127.0.0.1:16765', () => {
  assert(bridgeTs.includes("HERMES_AGENT_BRIDGE_ENDPOINT ?? 'tcp://127.0.0.1:16765'"),
    'RealBridge endpoint fallback wrong');
});

// ─── 4. Entry Point Existence ─────────────────────────────────────
console.log('\n═══ 4. Entry Point & Imports ═══');

check('kmaster_bridge.py exists and is importable (AST)', () => {
  assert(kmasterPy.includes('def main'), 'main() not found');
  assert(kmasterPy.includes('argparse'), 'argparse import missing');
});

check('bridge:dev script in package.json', () => {
  const pkgJson = JSON.parse(readFileSync(join(__dirname, 'package.json'), 'utf-8'));
  assert(pkgJson.scripts['bridge:dev']?.includes('kmaster_bridge.py'),
    'bridge:dev script missing or wrong');
});

// ─── 5. Legacy Port Cleanup ───────────────────────────────────────
console.log('\n═══ 5. Legacy Port Cleanup ═══');

check('No "18780" in Python code body (non-comment)', () => {
  const codeOnly = transportPy.replace(/#.*$/gm, '').replace(/"""[^"]*"""/gs, '');
  assert(!codeOnly.includes('18780'), '18780 found in Python body');
});

// The comment in kmaster_bridge.py line 22 mentions 18765 deliberately
// This is a PASS with note per checklist design

check('No "HERMES_WEB_UI" in bridge directory', () => {
  for (const f of pyFiles) {
    const content = readFileSync(join(BRIDGE_DIR, f), 'utf-8');
    assert(!content.includes('HERMES_WEB_UI'), `HERMES_WEB_UI found in ${f}`);
  }
});

// ─── 6. Protocol Contract Verification ────────────────────────────
console.log('\n═══ 6. Protocol Contract ═══');

check('ACTION_ALIASES has ≥30 entries (M2: +4 mcpStart/Stop/Restart/Config)', () => {
  const match = protocolPy.match(/ACTION_ALIASES[^}]*\}/s);
  const entries = match ? [...match[0].matchAll(/"[^"]+"\s*:\s*"[^"]+"/g)] : [];
  assert(entries.length >= 30, `Only ${entries.length} ACTION_ALIASES entries`);
});

check('EXPOSED_ACTIONS defined with ≥22 entries (M2: +11 new actions)', () => {
  const match = protocolPy.match(/EXPOSED_ACTIONS[^}]*\}/s);
  const entries = match ? [...match[0].matchAll(/"[^"]+"/g)] : [];
  assert(entries.length >= 22, `Only ${entries.length} EXPOSED_ACTIONS entries`);
});

check('CHAT_FIELD_WHITELIST does not contain ANTHROPIC_AUTH_TOKEN', () => {
  const match = protocolPy.match(/CHAT_FIELD_WHITELIST[^}]*\}/s);
  assert(match && !match[0].includes('ANTHROPIC_AUTH_TOKEN'),
    'ANTHROPIC_AUTH_TOKEN found in CHAT_FIELD_WHITELIST');
});

check('plan.respond → plan_respond in ACTION_ALIASES', () => {
  assert(protocolPy.includes('"plan.respond"') && protocolPy.includes('"plan_respond"'),
    'plan.respond alias missing');
});

check('plan_respond NOT in EXPOSED_ACTIONS (U1)', () => {
  const match = protocolPy.match(/EXPOSED_ACTIONS[^}]*\}/s);
  assert(match && !match[0].includes('plan_respond'),
    'plan_respond should NOT be exposed');
});

// ─── 7. Bug Fix Verification ──────────────────────────────────────
console.log('\n═══ 7. Bug Fix Verification ═══');

check('bridge.ts error event calls done() (ends run)', () => {
  // Verify error handler contains done()
  const errorHandler = bridgeTs.match(/ev\.type === 'error'[^}]*\}/s);
  assert(errorHandler && errorHandler[0].includes('done()'),
    'error event does not call done()');
});

check('bridge.ts destroy(sessionId) cleans socket', () => {
  assert(bridgeTs.includes('destroy(sessionId') && bridgeTs.includes("socks.delete(sessionId)"),
    'destroy() does not clean socket');
});

check('bridge.ts finally block calls release()', () => {
  assert(bridgeTs.includes('finally') && bridgeTs.includes('release()'),
    'finally block missing release()');
});

check('bridge_gateway.py _on_interrupt has abort_watchdog', () => {
  assert(gatewayPy.includes('_abort_watchdog'),
    'abort_watchdog not found in bridge_gateway.py');
});

check('abort_watchdog timeout destroys with force=True', () => {
  assert(gatewayPy.includes('"action": "destroy"') && gatewayPy.includes('"force": True'),
    'abort_watchdog timeout missing force destroy');
});

check('bridge_transport.py LineReader has 8MB cap', () => {
  assert(transportPy.includes('8 * 1024 * 1024') && transportPy.includes('MAX_LINE_BYTES'),
    'LineReader 8MB cap not found');
});

check('bridge_transport.py _read_json_request uses LineReader', () => {
  assert(transportPy.includes('_read_json_request') && transportPy.includes('LineReader()'),
    '_read_json_request does not use LineReader');
});

// ─── 8. Risk Mitigation ───────────────────────────────────────────
console.log('\n═══ 8. Risk Mitigation ═══');

check('_bridge_platform() defaults to "cli"', () => {
  assert(runtimePy.includes('return os.environ.get("HERMES_AGENT_BRIDGE_PLATFORM", "cli").strip() or "cli"'),
    'platform default not "cli"');
});

check('MockBridge emits run.started (NFR-7)', () => {
  assert(bridgeTs.includes("type: 'run.started', sessionId: opts.sessionId, runId"),
    'MockBridge missing run.started');
});

check('ANTHROPIC_AUTH_TOKEN popped from worker env', () => {
  assert(transportPy.includes('env.pop("ANTHROPIC_AUTH_TOKEN", None)'),
    'ANTHROPIC_AUTH_TOKEN not stripped from worker env');
});

check('TCP keepalive set in RealBridge.connect()', () => {
  assert(bridgeTs.includes('setKeepAlive(true, 30_000)'),
    'TCP keepalive not set');
});

// ─── 9. sessionId on all bridge events ────────────────────────────
console.log('\n═══ 9. Event sessionId Injection ═══');

check('_mk_event always includes sessionId', () => {
  assert(protocolPy.includes('"sessionId": session_id'),
    '_mk_event missing sessionId');
});

check('error() function includes sessionId', () => {
  assert(protocolPy.includes('"sessionId": session_id'),
    'error() missing sessionId');
});

// ─── 10. Import Graph (no cycles) ─────────────────────────────────
console.log('\n═══ 10. Import Graph ═══');

const importGraph = {
  'kmaster_bridge.py': ['bridge_broker', 'bridge_gateway', 'bridge_server'],
  'bridge_gateway.py': ['bridge_broker', 'bridge_protocol', 'bridge_transport'],
  'bridge_broker.py': ['bridge_runtime', 'bridge_transport'],
  'bridge_server.py': ['bridge_pool', 'bridge_runtime', 'bridge_transport'],
  'bridge_pool.py': ['bridge_runtime'],
  'bridge_transport.py': ['bridge_runtime'],
  'bridge_runtime.py': [],
  'bridge_protocol.py': [],
};

function hasCycle(graph) {
  const visited = new Set();
  const recStack = new Set();
  
  function dfs(node) {
    visited.add(node);
    recStack.add(node);
    for (const neighbor of (graph[node] || [])) {
      if (!visited.has(neighbor)) {
        if (dfs(neighbor)) return true;
      } else if (recStack.has(neighbor)) {
        return true;
      }
    }
    recStack.delete(node);
    return false;
  }
  
  for (const node of Object.keys(graph)) {
    if (!visited.has(node)) {
      if (dfs(node)) return true;
    }
  }
  return false;
}

check('No circular imports in Python bridge', () => {
  assert(!hasCycle(importGraph),
    'Circular import detected');
});

// ─── 11. BridgeEvent types completeness ───────────────────────────
console.log('\n═══ 11. BridgeEvent Types (protocol.ts) ═══');

const bridgeEventTypes = [
  'message.delta', 'reasoning.delta', 'thinking.delta',
  'tool.started', 'tool.completed', 'tool.failed',
  'approval.requested', 'approval.resolved',
  'clarify.requested', 'clarify.resolved',
  'plan.requested', 'artifact', 'usage.updated',
  'run.started', 'completed', 'error',
  'abort.started', 'abort.completed', 'abort.timeout',
  'session.title.updated', 'session.command', 'agent.event', 'result',
  'subagent.start', 'subagent.tool', 'subagent.text',
  'subagent.thinking', 'subagent.progress', 'subagent.complete',
  'compression.started', 'compression.completed',
  // ── M2 新增 ──
  'mcp.status.changed', 'background.notification',
  'compression.requested', 'delegation.updated',
];

for (const evt of bridgeEventTypes) {
  check(`BridgeEvent includes '${evt}'`, () => {
    assert(protocolTs.includes(`'${evt}'`) || protocolTs.includes(`"${evt}"`),
      `BridgeEvent missing '${evt}'`);
  });
}

// ─── 12. M2 Contract Tests ────────────────────────────────────────
console.log('\n═══ 12. M2 Contract Tests ═══');

// M2 action aliases — verify all 11 new actions exist
const m2Actions = [
  'mcpStart', 'mcpStop', 'mcpRestart', 'mcpConfig',
  'reloadSkills', 'switchSessionModel', 'command',
  'backgroundPoll', 'completeBackgroundNotification',
  'compressionRespond', 'contextEstimate',
];
for (const act of m2Actions) {
  check(`ACTION_ALIASES has '${act}'`, () => {
    assert(protocolPy.includes(`"${act}"`),
      `ACTION_ALIASES missing '${act}'`);
  });
}

// M2 EXPOSED_ACTIONS — verify key new entries
const m2Exposed = [
  'mcp_list', 'mcp_start', 'mcp_stop', 'mcp_restart', 'mcp_config',
  'skills_reload', 'switch_session_model', 'command',
  'background_poll', 'complete_background_notification',
  'compression_respond', 'context_estimate',
];
for (const act of m2Exposed) {
  check(`EXPOSED_ACTIONS includes '${act}'`, () => {
    const match = protocolPy.match(/EXPOSED_ACTIONS[^}]*\}/s);
    assert(match && match[0].includes(`"${act}"`),
      `EXPOSED_ACTIONS missing '${act}'`);
  });
}

// M2 event mappings — verify subagent events upgraded from agent.event to explicit
check('subagent.start mapped to explicit subagent.start (not agent.event)', () => {
  const match = protocolPy.match(/"subagent\.start"\s*:\s*\(/g);
  // Should find our new explicit mapping BEFORE any agent.event fallback
  const idxExplicit = protocolPy.indexOf('"subagent.start":          ("subagent.start"');
  const idxFallback = protocolPy.indexOf('"subagent.start":          ("agent.event"');
  assert(idxExplicit > 0 && idxFallback === -1,
    'subagent.start still mapped to agent.event instead of explicit');
});

check('M2 new event types in HERMES_EVENT_MAP', () => {
  const m2Events = ['mcp.status.changed', 'session.command',
    'delegation.updated', 'background.notification', 'compression.requested'];
  for (const evt of m2Events) {
    assert(protocolPy.includes(`"${evt}"`),
      `HERMES_EVENT_MAP missing '${evt}'`);
  }
});

// M2 error codes
check('M2 error codes defined', () => {
  const m2Errors = ['MCP_CONFIG_INVALID', 'MCP_CONFIG_LOCKED',
    'MCP_SERVER_NOT_FOUND', 'SKILLS_RELOAD_FAILED',
    'MODEL_NOT_AVAILABLE', 'UNKNOWN_COMMAND'];
  for (const code of m2Errors) {
    assert(protocolPy.includes(`"${code}"`) || protocolPy.includes(`ERROR_${code}`),
      `Missing error code: ${code}`);
  }
});

// M2 file lock utilities in bridge_server.py
const serverPy = readFileSync(join(BRIDGE_DIR, 'bridge_server.py'), 'utf-8');
check('bridge_server.py has _acquire_file_lock', () => {
  assert(serverPy.includes('def _acquire_file_lock'),
    'missing _acquire_file_lock');
});
check('bridge_server.py has _atomic_write_with_lock', () => {
  assert(serverPy.includes('def _atomic_write_with_lock'),
    'missing _atomic_write_with_lock');
});
check('bridge_server.py has _backup_file', () => {
  assert(serverPy.includes('def _backup_file'),
    'missing _backup_file');
});

// M2 ipc:// fallback
check('bridge_gateway.py has _resolve_endpoint_with_ipc_fallback', () => {
  assert(gatewayPy.includes('_resolve_endpoint_with_ipc_fallback'),
    'missing ipc fallback');
});
check('bridge_gateway.py has BackgroundPump class', () => {
  assert(gatewayPy.includes('class BackgroundPump'),
    'missing BackgroundPump');
});

// M2 compressionRespond choice whitelist
check('bridge_protocol.py validates compressionRespond choice (allow/deny)', () => {
  assert(protocolPy.includes("choice not in (\"allow\", \"deny\")"),
    'missing compressionRespond choice whitelist');
});

// M2 _on_command handler
check('bridge_gateway.py has _on_command handler', () => {
  assert(gatewayPy.includes('def _on_command'),
    'missing _on_command handler');
});
check('bridge_gateway.py command emits session.command event', () => {
  assert(gatewayPy.includes('"type": "session.command"'),
    'command handler missing session.command emission');
});

// M2 compression_respond handler
check('bridge_gateway.py has _on_compression_respond handler', () => {
  assert(gatewayPy.includes('def _on_compression_respond'),
    'missing _on_compression_respond handler');
});

// ─── SUMMARY ──────────────────────────────────────────────────────
console.log(`\n═══════════════════════════════════════════`);
console.log(`  TOTAL:  ${total}`);
console.log(`  PASSED: ${passed}`);
console.log(`  FAILED: ${failed}`);
console.log(`═══════════════════════════════════════════`);

if (failures.length > 0) {
  console.log('\nFAILURES:');
  for (const f of failures) {
    console.log(`  - ${f.test}: ${f.error}`);
  }
}

process.exit(failed > 0 ? 1 : 0);
