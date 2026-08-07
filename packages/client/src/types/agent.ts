/**
 * Agent 状态类型定义 + mock 数据。
 *
 * 14 种状态枚举，覆盖 Agent 从初始化到各类工作态的全生命周期。
 * 当前为纯前端 mock，后续对接后端 Agent status 端点。
 */

/** Agent 运行状态枚举 */
export type AgentState =
  | 'init'
  | 'closing'
  | 'sending-msg'
  | 'thinking'
  | 'busy'
  | 'idle'
  | 'waiting-approval'
  | 'error'
  | 'writing'
  | 'coding'
  | 'reading'
  | 'searching'
  | 'researching'
  | 'designing';

/** Agent 角色定义 */
export interface AgentDef {
  id: string;
  name: string;
  icon: string;
  description: string;
  status: AgentState;
}

/** Agent 状态 = 角色 + 运行时状态 */
export interface AgentStatus {
  id: string;
  agentId: string;
  name: string;
  state: AgentState;
}

/** 状态 → 图标（emoji）映射 */
export const AGENT_STATUS_ICONS: Record<AgentState, string> = {
  'init': '○',
  'closing': '◐',
  'sending-msg': '↗',
  'thinking': '💭',
  'busy': '⏳',
  'idle': '◉',
  'waiting-approval': '🔐',
  'error': '✕',
  'writing': '✏️',
  'coding': '⌨️',
  'reading': '📖',
  'searching': '🔍',
  'researching': '🔬',
  'designing': '🎨',
};

/** 状态 → CSS 颜色类名 */
export const AGENT_STATUS_COLORS: Record<AgentState, string> = {
  'init': '#9ca3af',
  'closing': '#9ca3af',
  'sending-msg': '#60a5fa',
  'thinking': '#a78bfa',
  'busy': '#fbbf24',
  'idle': '#34d399',
  'waiting-approval': '#fb923c',
  'error': '#f87171',
  'writing': '#60a5fa',
  'coding': '#22d3ee',
  'reading': '#2dd4bf',
  'searching': '#818cf8',
  'researching': '#a78bfa',
  'designing': '#f472b6',
};

/** Agent 角色数据（U-12：MOCK_AGENTS 已删除，现从 /api/agents 读取真实数据） */
// MOCK_AGENTS 已删除。所有 Agent 下拉/选择器现调用 getAgents() → /api/agents
