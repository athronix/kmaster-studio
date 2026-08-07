// F13 记忆管理 store：视图零网络调用，全部经 api/client 封装（NFR1）。
// 内容寻址 id：任何写操作后 id 会变化，以响应中的 entry 覆盖本地；
// 409 stale_id 统一处理为「刷新列表 + 提示重试」（TECHNICAL-SOLUTION-M4 §7.7）。
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import {
  getMemory,
  createMemory,
  updateMemory,
  deleteMemory,
  HttpError,
} from '../api/client';
import type { MemoryEntry, MemoryGroup } from '../types/chat';

export const MEMORY_GROUP_LABELS: Record<MemoryGroup, string> = {
  memory: 'MEMORY.md · 长期记忆',
  user: 'USER.md · 用户画像',
};

export const useMemoryStore = defineStore('memory', () => {
  const entries = ref<MemoryEntry[]>([]);
  const loading = ref(false);
  const error = ref<string>('');
  /** 搜索关键字（服务端过滤，空串表示不过滤） */
  const query = ref<string>('');
  /** 分组过滤，undefined = 全部 */
  const group = ref<MemoryGroup | undefined>(undefined);
  /** 最近一次删除产生的备份路径（UI 提示可回滚） */
  const lastBackup = ref<string>('');

  /** 按分组归集，供分组列表渲染。 */
  const groups = computed<Record<MemoryGroup, MemoryEntry[]>>(() => {
    const out: Record<MemoryGroup, MemoryEntry[]> = { memory: [], user: [] };
    for (const e of entries.value) {
      if (e.group === 'memory' || e.group === 'user') out[e.group].push(e);
    }
    return out;
  });
  const total = computed(() => entries.value.length);

  async function load(): Promise<MemoryEntry[]> {
    loading.value = true;
    error.value = '';
    try {
      entries.value = await getMemory({ group: group.value, q: query.value || undefined });
      return entries.value;
    } catch (e) {
      error.value = e instanceof Error ? e.message : String(e);
      throw e;
    } finally {
      loading.value = false;
    }
  }

  function setQuery(q: string): Promise<MemoryEntry[]> {
    query.value = q;
    return load();
  }
  function setGroup(g: MemoryGroup | undefined): Promise<MemoryEntry[]> {
    group.value = g;
    return load();
  }

  async function add(g: MemoryGroup, content: string): Promise<MemoryEntry> {
    const entry = await createMemory(g, content);
    await load();
    return entry;
  }

  /**
   * 编辑条目；命中 409 stale_id 时自动刷新列表并抛出可读错误，由视图提示用户重试。
   */
  async function update(id: string, content: string): Promise<MemoryEntry> {
    try {
      const entry = await updateMemory(id, content);
      await load();
      return entry;
    } catch (e) {
      if (e instanceof HttpError && e.status === 409) {
        await load().catch(() => {});
        throw new Error('该条目已被外部修改，列表已刷新，请重新编辑');
      }
      throw e;
    }
  }

  /** 删除条目；服务端写前自动备份，返回备份文件路径。 */
  async function remove(id: string): Promise<string> {
    const { backup } = await deleteMemory(id);
    lastBackup.value = backup ?? '';
    await load();
    return lastBackup.value;
  }

  return {
    entries, loading, error, query, group, lastBackup,
    groups, total,
    load, setQuery, setGroup, add, update, remove,
  };
});
