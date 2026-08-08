<script setup lang="ts">
/**
 * FileTreePane — 简单文件树组件
 *
 * 从 Artifact 列表提取文件路径，构建目录树并递归渲染。
 * 文件夹可折叠（▶/▼），文件单击预览。
 *
 * 递归渲染通过自引用实现（Vue 3.3+），节点渲染委托给 FileTreeNode。
 */
import { computed, ref, h, defineComponent, type Component, type PropType, type VNode } from 'vue';
import KIcon from '../common/KIcon.vue';

// ═══════════════════════════════════════════════════════════════════════════════
// 类型定义
// ═══════════════════════════════════════════════════════════════════════════════

interface TreeNode {
  name: string;
  path: string;
  isDir: boolean;
  children: TreeNode[];
  collapsed: boolean;
}

interface TreeNodeWithArtifact extends TreeNode {
  _artifactId?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 递归子组件：FileTreeNode（用 defineComponent + h 实现递归渲染）
// ═══════════════════════════════════════════════════════════════════════════════

const FileTreeNode: Component = defineComponent({
  name: 'FileTreeNode',
  props: {
    node: { type: Object as PropType<TreeNodeWithArtifact>, required: true },
    depth: { type: Number, default: 0 },
    selectedId: { type: String as PropType<string | null>, default: null },
  },
  emits: ['toggle', 'select'],
  setup(props, { emit }): () => VNode | VNode[] {
    return () => {
      const node = props.node;
      const indent = props.depth * 18;
      const isSelected = !node.isDir && node._artifactId && node._artifactId === props.selectedId;

      const liChildren: any[] = [];

      if (node.isDir) {
        // 箭头 + 图标 + 名称
        liChildren.push(
          h('span', { class: 'km-ft-arrow' }, h(KIcon, { name: node.collapsed ? 'ChevronRight' : 'ChevronDown', size: 12 })),
          h('span', { class: 'km-ft-icon' }, h(KIcon, { name: node.collapsed ? 'Folder' : 'FolderOpen', size: 14 })),
          h('span', { class: 'km-ft-name' }, node.name),
        );
      } else {
        liChildren.push(
          h('span', { class: 'km-ft-arrow' }),
          h('span', { class: 'km-ft-icon' }, h(KIcon, { name: 'File', size: 14 })),
          h('span', { class: 'km-ft-name' }, node.name),
        );
      }

      const li = h(
        'li',
        {
          class: {
            'km-ft-node': true,
            'km-ft-dir': node.isDir,
            'km-ft-file': !node.isDir,
            'km-ft-selected': isSelected,
          },
          style: { paddingLeft: `${indent + 8}px` },
          role: 'treeitem',
          'aria-expanded': node.isDir ? String(!node.collapsed) : undefined,
          'aria-selected': !node.isDir ? String(isSelected) : undefined,
          onClick: () => {
            if (node.isDir) {
              emit('toggle', node);
            } else {
              emit('select', node);
            }
          },
        },
        liChildren,
      );

      // 文件夹展开时递归渲染子节点
      if (node.isDir && !node.collapsed && node.children.length > 0) {
        return h('template', {}, [
          li,
          ...node.children.map((child) =>
            h(FileTreeNode, {
              key: child.path,
              node: child as TreeNodeWithArtifact,
              depth: props.depth + 1,
              selectedId: props.selectedId,
              onToggle: (n: TreeNode) => emit('toggle', n),
              onSelect: (n: TreeNodeWithArtifact) => emit('select', n),
            }),
          ),
        ]);
      }

      return li;
    };
  },
});

// ═══════════════════════════════════════════════════════════════════════════════
// FileTreePane 主体
// ═══════════════════════════════════════════════════════════════════════════════

const props = defineProps<{
  artifacts: Array<{ id: string; name: string; [key: string]: any }>;
}>();

const emit = defineEmits<{
  (e: 'select', artifactId: string): void;
}>();

const selectedId = ref<string | null>(null);

/** 从 artifact 名称列表构建树 */
function buildTree(
  items: Array<{ id: string; name: string; [key: string]: any }>,
): TreeNodeWithArtifact[] {
  const root: TreeNodeWithArtifact[] = [];

  for (const art of items) {
    if (!art.name) continue;
    const parts = art.name.split('/').filter(Boolean);
    if (parts.length === 0) continue;

    let currentLevel = root;
    let currentPath = '';

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const isLast = i === parts.length - 1;

      if (isLast) {
        currentLevel.push({
          name: part,
          path: currentPath,
          isDir: false,
          children: [],
          collapsed: false,
          _artifactId: art.id,
        });
      } else {
        let dir = currentLevel.find((n) => n.isDir && n.name === part);
        if (!dir) {
          dir = {
            name: part,
            path: currentPath,
            isDir: true,
            children: [],
            collapsed: false,
          };
          currentLevel.push(dir);
        }
        currentLevel = dir.children as TreeNodeWithArtifact[];
      }
    }
  }

  // 排序：目录在前，同组按名称
  function sortNodes(nodes: TreeNodeWithArtifact[]): void {
    nodes.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const n of nodes) {
      if (n.isDir) sortNodes(n.children as TreeNodeWithArtifact[]);
    }
  }
  sortNodes(root);

  return root;
}

const tree = computed(() => buildTree(props.artifacts));

function toggleDir(node: TreeNode): void {
  node.collapsed = !node.collapsed;
}

function selectFile(node: TreeNodeWithArtifact): void {
  if (node._artifactId) {
    selectedId.value = node._artifactId;
    emit('select', node._artifactId);
  }
}
</script>

<template>
  <div class="km-file-tree">
    <div v-if="!tree.length" class="km-file-tree-empty">
      暂无文件。发送消息后，agent 生成的文件会显示在这里。
    </div>
    <ul v-else class="km-file-tree-list" role="tree">
      <FileTreeNode
        v-for="node in tree"
        :key="node.path"
        :node="node"
        :depth="0"
        :selected-id="selectedId"
        @toggle="toggleDir"
        @select="selectFile"
      />
    </ul>
  </div>
</template>

<style scoped>
.km-file-tree {
  flex: 1;
  overflow: auto;
  min-height: 0;
}
.km-file-tree-empty {
  font-size: var(--km-font-sm);
  opacity: 0.55;
  line-height: 1.7;
  padding: var(--km-space-sm) 0;
}
.km-file-tree-list {
  list-style: none;
  margin: 0;
  padding: var(--km-space-xs) 0;
}
.km-ft-node {
  display: flex;
  align-items: center;
  gap: var(--km-space-xs);
  padding: var(--km-space-6) var(--km-space-sm);
  cursor: pointer;
  font-size: var(--km-font-sm);
  user-select: none;
  white-space: nowrap;
  border-radius: var(--km-radius-sm);
  margin: 0 var(--km-space-xs);
}
.km-ft-node:hover {
  background: var(--km-hover-bg);
}
.km-ft-arrow {
  width: 14px;
  min-width: 14px;
  font-size: var(--km-font-xs);
  flex-shrink: 0;
  opacity: 0.4;
  text-align: center;
}
.km-ft-icon {
  font-size: var(--km-font-sm);
  flex-shrink: 0;
  opacity: 0.6;
}
.km-ft-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.km-ft-selected {
  background: var(--km-accent-bg-strong) !important;
  color: var(--km-accent);
}
</style>
