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

/** 状态 → 图标（KIcon 图标名）映射 */
export const AGENT_STATUS_ICONS: Record<AgentState, string> = {
  'init': 'Circle',
  'closing': 'CircleHalf2',
  'sending-msg': 'ArrowUpRight',
  'thinking': 'MessageDots',
  'busy': 'Hourglass',
  'idle': 'CircleDot',
  'waiting-approval': 'Lock',
  'error': 'X',
  'writing': 'Pencil',
  'coding': 'Code',
  'reading': 'Book',
  'searching': 'Search',
  'researching': 'Microscope',
  'designing': 'Palette',
};

/** 状态 → CSS 颜色类名 */
export const AGENT_STATUS_COLORS: Record<AgentState, string> = {
  'init': 'var(--km-muted)',
  'closing': 'var(--km-muted)',
  'sending-msg': 'var(--km-agent-blue)',
  'thinking': 'var(--km-agent-purple)',
  'busy': 'var(--km-agent-yellow)',
  'idle': 'var(--km-success)',
  'waiting-approval': 'var(--km-agent-orange)',
  'error': 'var(--km-agent-red)',
  'writing': 'var(--km-agent-blue)',
  'coding': 'var(--km-agent-cyan)',
  'reading': 'var(--km-agent-teal)',
  'searching': 'var(--km-agent-indigo)',
  'researching': 'var(--km-agent-purple)',
  'designing': 'var(--km-agent-pink)',
};

/** Agent 角色数据（U-12：MOCK_AGENTS 已删除，现从 /api/agents 读取真实数据） */
// MOCK_AGENTS 已删除。所有 Agent 下拉/选择器现调用 getAgents() → /api/agents
