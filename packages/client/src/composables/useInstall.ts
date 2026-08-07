/**
 * useInstall — 安装/卸载/召唤逻辑复用 composable（T01）。
 *
 * 接受 entityType 参数，返回 { install, uninstall, summon, isInstalling }。
 *
 * 核心逻辑：
 *   - install(name): 调用对应 API，乐观更新 isInstalling
 *   - uninstall(name): 同上但卸载
 *   - summon(name): 未安装则先安装 → chatStore.createSessionWithConfig({ agent: name }) → router.push('/')
 *   - isInstalling: ref<boolean>，互斥锁（同时只允许一个操作）
 */
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  installAgent as installAgentApi,
  uninstallAgent as uninstallAgentApi,
  installSkill as installSkillApi,
  uninstallSkill as uninstallSkillApi,
} from '../api/client';
import { useChatStore } from '../stores/chat';

export type EntityKind = 'expert' | 'skill' | 'mcp';

export function useInstall(entityType: EntityKind) {
  const router = useRouter();
  const chatStore = useChatStore();
  const isInstalling = ref(false);

  /** 互斥锁：同时只允许一个安装/卸载操作。 */
  async function withLock<T>(fn: () => Promise<T>): Promise<T> {
    if (isInstalling.value) {
      throw new Error('已有操作正在进行中，请稍后重试');
    }
    isInstalling.value = true;
    try {
      return await fn();
    } finally {
      isInstalling.value = false;
    }
  }

  /** 安装实体。 */
  async function install(name: string): Promise<void> {
    return withLock(async () => {
      switch (entityType) {
        case 'expert':
          await installAgentApi(name);
          break;
        case 'skill':
          await installSkillApi(name);
          break;
        case 'mcp':
          // MCP 安装走 postMcp
          throw new Error('MCP 安装请使用 postMcp');
        default:
          throw new Error(`不支持的实体类型: ${entityType}`);
      }
    });
  }

  /** 卸载实体。 */
  async function uninstall(name: string): Promise<void> {
    return withLock(async () => {
      switch (entityType) {
        case 'expert':
          await uninstallAgentApi(name);
          break;
        case 'skill':
          await uninstallSkillApi(name);
          break;
        case 'mcp':
          // MCP 卸载走 deleteMcp
          throw new Error('MCP 卸载请使用 deleteMcp');
        default:
          throw new Error(`不支持的实体类型: ${entityType}`);
      }
    });
  }

  /**
   * 召唤实体（agent 场景专用）。
   *
   * 流程：未安装 → 先安装 → 以 agent 身份创建会话 → 跳转到首页。
   * 对于 skill/mcp 类型，此方法无实际语义，调用将抛出错误。
   */
  async function summon(name: string): Promise<void> {
    if (entityType !== 'expert') {
      throw new Error(`summon 仅支持 expert 类型，当前为 ${entityType}`);
    }
    return withLock(async () => {
      // 先确保已安装
      await installAgentApi(name);
      // 以 agent 身份创建会话
      const sid = await chatStore.createSessionWithConfig({ agent: name } as any);
      if (sid) {
        await router.push('/');
      }
    });
  }

  return { install, uninstall, summon, isInstalling };
}
