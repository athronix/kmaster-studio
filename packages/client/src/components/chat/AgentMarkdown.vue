<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import MarkdownIt from 'markdown-it';
import hljs from 'highlight.js';

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const md = new MarkdownIt({
  html: false,
  linkify: true,
  highlight: (str, lang) => {
    const langLabel = lang ? `<span class="km-code-lang">${escapeHtml(lang)}</span>` : '';
    const copyBtn = '<button class="km-code-copy" title="复制代码">Copy</button>';
    if (lang && hljs.getLanguage(lang)) {
      try {
        return (
          '<div class="km-code-block">' +
          '<div class="km-code-head">' + langLabel + copyBtn + '</div>' +
          '<pre class="hljs"><code>' +
          hljs.highlight(str, { language: lang }).value +
          '</code></pre></div>'
        );
      } catch {
        /* ignore */
      }
    }
    return (
      '<div class="km-code-block">' +
      '<div class="km-code-head">' + langLabel + copyBtn + '</div>' +
      '<pre class="hljs"><code>' + escapeHtml(str) + '</code></pre></div>'
    );
  },
});

const props = defineProps<{ source: string }>();
const html = computed(() => md.render(props.source || ''));

// —— V4：代码块复制按钮（事件委托）——
const containerRef = ref<HTMLElement | null>(null);

function handleCodeCopy(e: Event) {
  const btn = (e.target as HTMLElement).closest('.km-code-copy') as HTMLElement | null;
  if (!btn) return;
  const block = btn.closest('.km-code-block');
  if (!block) return;
  const code = block.querySelector('code')?.textContent ?? '';
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(code).then(() => {
      btn.textContent = 'OK';
      btn.classList.add('km-code-copied');
      setTimeout(() => {
        btn.textContent = 'Copy';
        btn.classList.remove('km-code-copied');
      }, 1500);
    }).catch(() => {
      btn.textContent = '!';
      setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
    });
  }
}

onMounted(() => {
  containerRef.value?.addEventListener('click', handleCodeCopy);
});

// 每当 html 更新后重新绑定（v-html 会重建 DOM）
watch(html, () => {
  // Delegation on container works across v-html updates — no need to rebind
});
</script>

<template>
  <div ref="containerRef" class="km-md" v-html="html" />
</template>

<style scoped>
.km-md :deep(pre.hljs) {
  background: var(--km-code-bg);
 padding: var(--km-space-md);
  border-radius: 0 0 var(--km-radius-lg) var(--km-radius-lg);
  overflow: auto;
  margin: 0;
}
.km-md :deep(code) {
  font-family: 'SFMono-Regular', Consolas, monospace;
  font-size: var(--km-font-sm);
}
.km-md :deep(p) { margin: var(--km-space-6) 0; }
.km-md :deep(ul), .km-md :deep(ol) { padding-left: 22px; }
.km-md :deep(a) { color: var(--km-accent); }
.km-md :deep(table) { border-collapse: collapse; }
.km-md :deep(th), .km-md :deep(td) { border: 1px solid var(--km-border); padding: var(--km-space-xs) var(--km-space-sm); }

/* V4：代码块容器 + 复制按钮（hover 显示） */
.km-md :deep(.km-code-block) {
  position: relative;
  margin: var(--km-space-10) 0;
  border-radius: var(--km-radius-lg);
  overflow: hidden;
  border: 1px solid var(--km-border);
}
.km-md :deep(.km-code-head) {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--km-code-head-bg);
  padding: var(--km-space-6) var(--km-space-md);
  border-bottom: 1px solid var(--km-border);
}
.km-md :deep(.km-code-lang) {
  font-size: var(--km-font-xs);
  color: var(--km-muted);
  text-transform: uppercase;
  font-family: 'SFMono-Regular', Consolas, monospace;
}
.km-md :deep(.km-code-copy) {
  background: var(--km-hover-bg);
  border: 1px solid var(--km-border);
  color: var(--km-muted);
  border-radius: var(--km-radius-sm);
  padding: var(--km-space-2xs) var(--km-space-sm);
  font-size: var(--km-font-sm);
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s ease;
}
.km-md :deep(.km-code-block:hover .km-code-copy) {
  opacity: 1;
}
.km-md :deep(.km-code-copy:hover) {
  background: var(--km-accent-bg-strong);
  color: var(--km-accent);
  border-color: var(--km-accent);
}
.km-md :deep(.km-code-copy.km-code-copied) {
  color: var(--km-success);
  border-color: var(--km-success);
  opacity: 1;
}
</style>
