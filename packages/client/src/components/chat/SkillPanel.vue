<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { NDrawer, NDrawerContent, NButton, NInput, NEmpty, NTag } from 'naive-ui';
import KIcon from '../common/KIcon.vue';
import { useChatStore } from '../../stores/chat';

const props = defineProps<{ show: boolean }>();
const emit = defineEmits<{ 'update:show': [boolean] }>();

const store = useChatStore();
const search = ref('');
const activeCategory = ref<string>('__all__');

const categories = computed<string[]>(() => {
  const set = new Set<string>();
  store.skills.forEach((s) => set.add(s.category || '其他'));
  return ['__all__', ...Array.from(set)];
});

const filtered = computed(() => {
  const kw = search.value.trim().toLowerCase();
  return store.skills.filter((s) => {
    const catOk = activeCategory.value === '__all__' || (s.category || '其他') === activeCategory.value;
    const kwOk = !kw || s.name.toLowerCase().includes(kw) || (s.description ?? '').toLowerCase().includes(kw);
    return catOk && kwOk;
  });
});

function open() {
  store.loadSkills().catch(() => {});
}
watch(() => props.show, (v) => { if (v) open(); });

function invoke(name: string) {
  const sid = store.activeSessionId;
  if (!sid) return;
  store.invokeSkill(sid, name);
  emit('update:show', false);
}
</script>

<template>
  <n-drawer :show="show" placement="right" :width="420" @update:show="(v: boolean) => emit('update:show', v)">
    <n-drawer-content title="技能面板" :native-scrollbar="false">
      <div class="sk-toolbar">
        <n-input
          v-model:value="search"
          placeholder="搜索技能名称 / 描述"
          clearable
          size="small"
        />
        <n-button size="small" secondary type="primary" @click="store.loadSkills().catch(() => {})"><template #icon><KIcon name="Refresh" :size="14" /></template>刷新</n-button>
      </div>

      <div class="sk-body">
        <!-- 类目树（左侧） -->
        <div class="sk-cats">
          <div
            v-for="c in categories"
            :key="c"
            class="sk-cat"
            :class="{ active: activeCategory === c }"
            @click="activeCategory = c"
          >{{ c === '__all__' ? '全部' : c }}</div>
        </div>

        <!-- 卡片列表（右侧） -->
        <div class="sk-cards">
          <n-empty v-if="!filtered.length" description="无匹配技能" />
          <div v-for="s in filtered" :key="s.name" class="sk-card">
            <div class="sk-card-head">
              <span class="sk-name">{{ s.name }}</span>
              <n-tag v-if="!s.enabled" size="tiny" type="warning">未启用</n-tag>
            </div>
            <div class="sk-desc">{{ s.description || '（无描述）' }}</div>
            <div class="sk-card-foot">
              <n-tag size="tiny" :bordered="false">{{ s.category || '其他' }}</n-tag>
              <n-button size="small" type="primary" @click="invoke(s.name)">调用</n-button>
            </div>
          </div>
        </div>
      </div>
    </n-drawer-content>
  </n-drawer>
</template>

<style scoped>
.sk-toolbar { display: flex; gap: 8px; margin-bottom: 10px; }
.sk-body { display: flex; gap: 10px; min-height: 0; }
.sk-cats { width: 96px; flex-shrink: 0; display: flex; flex-direction: column; gap: 4px; }
.sk-cat {
  padding: 6px 8px;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  border: 1px solid transparent;
}
.sk-cat:hover { background: rgba(255, 255, 255, 0.05); }
.sk-cat.active { background: rgba(59, 130, 246, 0.16); border-color: var(--km-accent); }
.sk-cards { flex: 1; display: flex; flex-direction: column; gap: 10px; overflow: auto; min-width: 0; }
.sk-card { border: 1px solid var(--km-border); border-radius: 8px; padding: 10px 12px; background: var(--km-panel); }
.sk-card-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.sk-name { font-weight: 600; font-size: 14px; }
.sk-desc { font-size: 12px; opacity: 0.7; margin: 6px 0 10px; line-height: 1.5; }
.sk-card-foot { display: flex; align-items: center; justify-content: space-between; }
</style>
