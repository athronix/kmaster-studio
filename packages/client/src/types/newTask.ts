/**
 * newTask.ts — 新建任务配置类型定义。
 *
 * V2 增量：定义 NewTaskConfig 接口及 SecurityMode 枚举，
 * 供 NewTaskDialog 表单与 chat store createSessionWithConfig 使用。
 */

/** 安全权限模式 */
export type SecurityMode = 'ask' | 'plan' | 'craft' | 'edit-on' | 'allowed-all';

/** 安全模式选项（供 NSelect 使用） */
export const SECURITY_MODE_OPTIONS: { label: string; value: SecurityMode }[] = [
  { label: 'Ask（每次询问）', value: 'ask' },
  { label: 'Plan（先计划后执行）', value: 'plan' },
  { label: 'Craft（自动执行）', value: 'craft' },
  { label: 'Edit-on（编辑模式）', value: 'edit-on' },
  { label: 'Allowed All（完全放行）', value: 'allowed-all' },
];

/** Agent 角色选项 */
export const AGENT_ROLE_OPTIONS: { label: string; value: string }[] = [
  { label: 'Default（默认助手）', value: 'default' },
  { label: 'Expert（专家）', value: 'expert' },
  { label: 'Team（专家团）', value: 'team' },
];

/** 新建任务配置 */
export interface NewTaskConfig {
  title: string;
  agent: string;
  provider: string;
  model: string;
  skills: string[];
  mcpServers: string[];
  securityMode: SecurityMode;
  workspace: string;
}

/** 新建任务表单默认值 */
export function defaultNewTaskConfig(): NewTaskConfig {
  return {
    title: '',
    agent: 'default',
    provider: '',
    model: '',
    skills: [],
    mcpServers: [],
    securityMode: 'craft',
    workspace: 'Default Workspace',
  };
}
