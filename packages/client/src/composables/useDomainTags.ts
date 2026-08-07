/**
 * useDomainTags — 领域标签 localStorage 频度排序逻辑。
 *
 * V2 增量：读取/写入 localStorage key `km-domain-freq`，
 * 存储 Record<string, number> 标签点击频度，供 CardMarketLayout
 * 对领域标签按频度降序排列，"推荐"始终第一。
 */
import { computed, ref, type ComputedRef } from 'vue';

const STORAGE_KEY = 'km-domain-freq';

/** 从 localStorage 加载频度数据 */
function loadFromStorage(): Record<string, number> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, number>;
    }
    return {};
  } catch {
    return {};
  }
}

/** 写入频度数据到 localStorage */
function saveToStorage(data: Record<string, number>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // localStorage 不可用或已满，静默失败
  }
}

/** 全局频度数据（模块级单例） */
const freqData = ref<Record<string, number>>(loadFromStorage());

/**
 * 获取当前频度数据（只读）。
 * 返回的是 Record<string, number> 的浅拷贝，调用方不应直接修改。
 */
export function getDomainFreq(): Record<string, number> {
  return { ...freqData.value };
}

/**
 * 记录一次标签点击，频度 +1 并持久化。
 */
export function recordDomainClick(tag: string): void {
  if (!tag) return;
  const next = { ...freqData.value };
  next[tag] = (next[tag] ?? 0) + 1;
  freqData.value = next;
  saveToStorage(next);
}

/**
 * 对给定标签列表按频度降序排列。"推荐"始终排第一位。
 * 返回 { visible: string[], overflow: string[] } —
 * visible 为可视区域内标签，overflow 为超出可视宽度的标签（供"更多"下拉使用）。
 *
 * @param allTags  所有标签
 * @param maxVisible  最大可见标签数（默认 8）
 */
export function useSortedDomains(allTags: ComputedRef<string[]> | string[], maxVisible = 8): {
  sortedTags: ComputedRef<string[]>;
  visibleTags: ComputedRef<string[]>;
  overflowTags: ComputedRef<string[]>;
} {
  const tagsSource = computed(() => Array.isArray(allTags) ? allTags : allTags.value);

  const sortedTags = computed<string[]>(() => {
    const tags = [...tagsSource.value];
    // 移除"推荐"（如果存在），后面会重新放到第一位
    const hasRecommend = tags.includes('推荐');
    const filtered = hasRecommend ? tags.filter((t) => t !== '推荐') : tags;

    const freq = freqData.value;
    filtered.sort((a, b) => (freq[b] ?? 0) - (freq[a] ?? 0));

    if (hasRecommend) {
      return ['推荐', ...filtered];
    }
    return filtered;
  });

  const visibleTags = computed(() => sortedTags.value.slice(0, maxVisible));
  const overflowTags = computed(() => sortedTags.value.slice(maxVisible));

  return { sortedTags, visibleTags, overflowTags };
}
