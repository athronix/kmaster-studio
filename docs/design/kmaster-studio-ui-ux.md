# kmaster-studio UI-UX 统一设计体系

> **版本**：v1.0
> **日期**：2026-08-07
> **设计人**：许清楚（Xu），kmaster-studio 产品经理
> **基于**：`docs/audit/ui-ux-current-state-2026-08-07.md` 48 文件审计报告
> **设计目标**：界面清爽简洁、直观易用——细到每个图标、每个交互步骤

---

## 第一章：Design Token 体系

> 设计依据：审计报告 §1.2 + §7 的现有 CSS 变量清单。所有新增 Token 均基于实际代码中出现的硬编码值推导，非凭空设计。

### 1.1 颜色 Token

#### 1.1.1 语义色（基础）

| Token | 暗色值 | 亮色值 | 用途说明 |
|-------|--------|--------|---------|
| `--km-bg` | `#1e1e1e` | `#ffffff` | 页面底色（最底层） |
| `--km-panel` | `#252526` | `#f3f3f3` | 面板/侧栏/中等层级背景 |
| `--km-card-bg` | `rgba(255,255,255,0.04)` | `#ffffff` | 卡片背景（高于面板） |
| `--km-card-border` | `rgba(255,255,255,0.08)` | `#e8e8e8` | 卡片边框 |
| `--km-input-bg` | `rgba(255,255,255,0.06)` | `#f9fafb` | 输入框背景 |
| `--km-input-border` | `rgba(255,255,255,0.12)` | `#d1d5db` | 输入框边框 |
| `--km-modal-bg` | `#252526` | `#ffffff` | 模态框背景 |
| `--km-popover-bg` | `#2d2d30` | `#ffffff` | 下拉菜单/弹出层背景 |
| `--km-text` | `#d4d4d4` | `#1f1f1f` | 正文主色 |
| `--km-text-secondary` | `#9ca3af` | `#6b7280` | 次要文字（描述/元信息） |
| `--km-text-disabled` | `#6b7280` | `#9ca3af` | 禁用态文字 |
| `--km-text-inverse` | `#1f1f1f` | `#ffffff` | 反色文字（用于实心按钮等） |
| `--km-border` | `#333333` | `#e5e5e5` | 常规边框 |
| `--km-border-light` | `#444444` | `#d4d4d4` | 淡边框（分割线） |
| `--km-border-focus` | `#3b82f6` | `#3b82f6` | 聚焦状态边框（主色） |
| `--km-accent` | `#3b82f6` | `#2563eb` | 主强调色（品牌蓝） |
| `--km-accent-bg` | `rgba(59,130,246,0.12)` | `rgba(37,99,235,0.08)` | 主色浅底（选中/高亮背景） |
| `--km-accent-hover` | `#60a5fa` | `#3b82f6` | 主色悬停态 |
| `--km-accent-pressed` | `#2563eb` | `#1d4ed8` | 主色按下态 |
| `--km-success` | `#34d399` | `#10b981` | 成功色 |
| `--km-success-bg` | `rgba(52,211,153,0.12)` | `rgba(16,185,129,0.08)` | 成功浅底 |
| `--km-warning` | `#f59e0b` | `#d97706` | 警告色 |
| `--km-warning-bg` | `rgba(245,158,11,0.12)` | `rgba(217,119,6,0.08)` | 警告浅底 |
| `--km-danger` | `#dc2626` | `#dc2626` | 错误/危险色 |
| `--km-danger-bg` | `rgba(220,38,38,0.12)` | `rgba(220,38,38,0.08)` | 错误浅底 |
| `--km-info` | `#3b82f6` | `#2563eb` | 信息色（同主色） |
| `--km-info-bg` | `rgba(59,130,246,0.12)` | `rgba(37,99,235,0.08)` | 信息浅底（同 accent-bg） |

#### 1.1.2 组件专用色

| Token | 暗色值 | 亮色值 | 用途说明 |
|-------|--------|--------|---------|
| `--km-code-bg` | `#161616` | `#f8f8f8` | 代码块背景（审计 #1） |
| `--km-code-head-bg` | `#1a1a1a` | `#ebebeb` | 代码块头部栏背景 |
| `--km-code-border` | `var(--km-border)` | `#e0e0e0` | 代码块边框 |
| `--km-user-bubble` | `#2d2d30` | `#dbeafe` | 用户消息气泡背景 |
| `--km-user-bubble-border` | `var(--km-border-light)` | `#bfdbfe` | 用户消息气泡边框 |
| `--km-ai-bubble` | `var(--km-panel)` | `#f9fafb` | AI 消息气泡背景 |
| `--km-ai-bubble-border` | `var(--km-border)` | `#e5e7eb` | AI 消息气泡边框 |
| `--km-tool-card-bg` | `rgba(255,255,255,0.02)` | `#f9fafb` | 工具调用卡片背景 |
| `--km-tool-card-border` | `var(--km-border-light)` | `#e5e7eb` | 工具调用卡片边框 |
| `--km-agent-tag-bg` | `rgba(139,92,246,0.16)` | `rgba(124,58,237,0.08)` | Agent 标签背景（紫色） |
| `--km-agent-tag-text` | `#a78bfa` | `#7c3aed` | Agent 标签文字 |
| `--km-mode-tag-bg` | `rgba(59,130,246,0.16)` | `rgba(37,99,235,0.08)` | Mode 标签背景 |
| `--km-mode-tag-text` | `#60a5fa` | `#2563eb` | Mode 标签文字 |
| `--km-approval-border` | `#b45309` | `#d97706` | 审批卡片边框（从 ApprovalCard 硬编码迁移） |
| `--km-approval-bg` | `rgba(180,83,9,0.1)` | `rgba(217,119,6,0.06)` | 审批卡片背景 |
| `--km-clarify-border` | `#1d4ed8` | `#2563eb` | 澄清卡片边框（从 ClarifyCard 硬编码迁移） |
| `--km-clarify-bg` | `rgba(29,78,216,0.1)` | `rgba(37,99,235,0.06)` | 澄清卡片背景 |
| `--km-plan-border` | `#7c3aed` | `#7c3aed` | 计划卡片边框（从 PlanCard 硬编码迁移） |
| `--km-plan-bg` | `rgba(124,58,237,0.1)` | `rgba(124,58,237,0.06)` | 计划卡片背景 |
| `--km-thought-border` | `#6b7280` | `#9ca3af` | 思考块左边框（从 ThoughtBlock 硬编码迁移） |
| `--km-thought-text` | `#9ca3af` | `#6b7280` | 思考块文字 |
| `--km-sidebar-bg` | `var(--km-panel)` | `#f5f5f5` | 侧栏背景 |
| `--km-hover-bg` | `rgba(255,255,255,0.06)` | `rgba(0,0,0,0.04)` | 通用 hover 背景（列表项、菜单项等） |
| `--km-hover-bg-strong` | `rgba(255,255,255,0.1)` | `rgba(0,0,0,0.06)` | 强 hover 背景 |
| `--km-file-chip-bg` | `rgba(59,130,246,0.16)` | `rgba(37,99,235,0.08)` | 文件芯片背景 |

> **设计决策**：暗色下 hover/卡片/选中态多用 `rgba(255,255,255,0.xx)` 表达"白色半透明叠层"，亮色下改用 `rgba(0,0,0,0.xx)` 表达"黑色半透明叠层"——这是 VS Code 主题系统的成熟实践。

### 1.2 间距 Token

| Token | 值 | 使用场景 |
|-------|---|---------|
| `--km-space-2xs` | `2px` | 图标与文字紧贴间距、Tag 内边距 |
| `--km-space-xs` | `4px` | 表单 label 与输入框间距、行内元素间距 |
| `--km-space-sm` | `8px` | 按钮组间距、card header 内元素间距 |
| `--km-space-md` | `12px` | 列表项间距、表单行间距、面板内 padding |
| `--km-space-lg` | `16px` | 卡片内 padding、对话框 body padding |
| `--km-space-xl` | `24px` | 页面内容区 padding、section 间距 |
| `--km-space-2xl` | `32px` | 大区块间距、模态框 header/footer padding |
| `--km-space-3xl` | `48px` | 页面级大间距（极少使用） |

> **设计决策**：不定义 `--km-space-xxs(2px)` 等过多粒度。4/8/12/16/24 的 4px 步进体系覆盖 90% 场景，极端间距（2px/32px/48px）按需使用。

### 1.3 字号 / 排版 Token

#### 1.3.1 Type Scale

| Token | 值 | 行高 | 字重 | 适用场景 |
|-------|---|------|------|---------|
| `--km-font-xs` | `10px` | `1.3` | `400` | 标签/徽标/代码块语言标识 |
| `--km-font-sm` | `12px` | `1.4` | `400` | 辅助文字/时间戳/表格表头/描述文字 |
| `--km-font-md` | `14px` | `1.5` | `400` | 正文/Navie UI 默认 body 字号 |
| `--km-font-base` | `15px` | `1.5` | `400` | 菜单项/按钮文字/ChatInput 输入 |
| `--km-font-lg` | `17px` | `1.4` | `500` | 卡片标题/对话框标题/列表组标题 |
| `--km-font-xl` | `20px` | `1.3` | `600` | 页面标题（PageHeader 标题）/ 模态框标题 |
| `--km-font-2xl` | `26px` | `1.2` | `700` | 大数字（UsageView 统计卡片数值） |

#### 1.3.2 行高规范

| Token | 值 | 适用场景 |
|-------|---|---------|
| `--km-leading-tight` | `1.3` | 标题、大数字、标签 |
| `--km-leading-normal` | `1.5` | 正文、菜单、按钮 |
| `--km-leading-relaxed` | `1.7` | 长文段落、Markdown 渲染内容 |

#### 1.3.3 字重规范

| Token | 值 | 适用场景 |
|-------|---|---------|
| `--km-font-normal` | `400` | 正文、辅助文字、输入框 |
| `--km-font-medium` | `500` | 强调文字、卡片标题、菜单项 |
| `--km-font-semibold` | `600` | 页面标题、区段标题 |
| `--km-font-bold` | `700` | 大数字、主标题 |

> **设计决策**：`font-weight` 不单独定义 CSS 变量（按需在组件 scoped 中引用全局变量），通过 Naive UI `themeOverrides` 的 `common.fontSize` 与 `common.fontFamily` 统一注入。

### 1.4 圆角 Token

| Token | 值 | 适用场景 |
|-------|---|---------|
| `--km-radius-none` | `0` | 表格、分割线、嵌入面板 |
| `--km-radius-sm` | `4px` | 输入框、标签/徽标、文件芯片、Tooltip |
| `--km-radius-md` | `6px` | 卡片、面板、按钮、下拉菜单、Naive UI 全局 borderRadius |
| `--km-radius-lg` | `8px` | 模态框、抽屉、大型弹出层 |
| `--km-radius-full` | `999px` | 气泡消息、头像、ContextRing |

**暗色/亮色下圆角不变**。圆角是几何属性，不受主题切换影响。

**边框线条策略**：
- 暗色下：主要依赖 `1px solid` + 颜色区分（暗色背景上边框需要更亮才能被感知）
- 亮色下：边框颜色更深，视觉权重更大，部分场景可用 `0.5px` 或省略（卡片阴影替代）

### 1.5 阴影 Token

| Token | 暗色值 | 亮色值 | 适用场景 |
|-------|--------|--------|---------|
| `--km-shadow-card` | `0 2px 8px rgba(0,0,0,0.3)` | `0 1px 4px rgba(0,0,0,0.06)` | 卡片常态阴影 |
| `--km-shadow-card-hover` | `0 4px 16px rgba(0,0,0,0.45)` | `0 2px 12px rgba(0,0,0,0.1)` | 卡片悬停阴影（解决审计 #6） |
| `--km-shadow-modal` | `0 8px 32px rgba(0,0,0,0.5)` | `0 4px 24px rgba(0,0,0,0.12)` | 模态框阴影 |
| `--km-shadow-dropdown` | `0 4px 16px rgba(0,0,0,0.4)` | `0 2px 12px rgba(0,0,0,0.08)` | 下拉菜单/弹出层阴影 |

**空态/禁用态透明度**：

| Token | 值 | 适用场景 |
|-------|---|---------|
| `--km-opacity-disabled` | `0.4` | 禁用按钮/输入框/菜单项文字 |
| `--km-opacity-muted` | `0.55` | 次要元信息（时间戳、UsageBar 辅助文字） |
| `--km-opacity-empty` | `0.6` | 空态图标/文字透明度 |

> **设计决策**：暗色阴影更重（`rgba(0,0,0,0.3~0.5)`），亮色阴影更轻（`rgba(0,0,0,0.06~0.12)`）。因为在暗色界面上阴影需要更高对比度才能被感知。

---

## 第二章：图标系统

### 2.1 方案选型

**推荐：`@tabler/icons-vue`**

理由：
- 2800+ 图标，覆盖 UI 全部场景
- Vue 3 first-class 支持（`.vue` 组件导入，tree-shakable）
- `currentColor` 染色，零额外颜色管理
- 活跃维护（周级更新），MIT 协议
- 安装量 > 200k/周

**不推荐备选方案**：
- `unplugin-icons`：额外构建配置 + 动态导入复杂
- `@vicons/ionicons5`：图标数量少（~1300），风格偏 iOS
- `lucide-vue-next`：Tabler 图标更全且风格更一致

**安装**：
```bash
pnpm add @tabler/icons-vue
```

### 2.2 图标映射表

> 以下为全量 emoji → Tabler icon 替换映射。按组件分组。

#### 2.2.1 AppNav / LeftSidebar 导航图标

| 位置 | 当前 emoji | 替换为 Tabler Icon | 说明 |
|------|-----------|-------------------|------|
| 对话页 | 💬 | `IconMessageCircle` | 导航项 |
| Memory | 🧠 | `IconBrain` | 导航项 |
| Usage | 📊 | `IconChartBar` | 导航项 |
| Queue | 📥 | `IconInbox` | 导航项 |
| 设置 | ⚙️ | `IconSettings` | 导航项 |
| 搜索按钮 | 🔍 | `IconSearch` | 过滤按钮 |
| 新建按钮 | ➕ | `IconPlus` | 新建会话 |
| 专家按钮 | 🤖 | `IconRobot` | 菜单项 |
| 技能按钮 | 🧩 | `IconPuzzle` | 菜单项 |
| MCP 按钮 | 🔌 | `IconPlugConnected` | 菜单项 |
| 定时任务 | ⏰ | `IconClock` | 菜单项 |
| 展开/折叠 | 🔽 | `IconChevronDown` | 分组折叠 |
| 置顶 | 📌 | `IconPinned` / `IconPin` | 置顶操作 |
| 导出 | 📥 | `IconDownload` | 导出会话 |
| 删除 | 🗑 | `IconTrash` | 删除操作 |
| 重命名 | ✎ | `IconPencil` | 右键菜单 |
| 绑定工作区 | 📁 | `IconFolder` | 右键菜单 |
| 归档 | 📦 | `IconArchive` | 会话归档 |
| 主题切换（亮） | ☀️ | `IconSun` | 主题 toggle |
| 主题切换（暗） | 🌙 | `IconMoon` | 主题 toggle |

#### 2.2.2 PageHeader 图标

| 位置 | 当前 emoji | 替换为 Tabler Icon |
|------|-----------|-------------------|
| 侧栏 toggle | ☰ | `IconMenu2` |
| 搜索前缀 | 🔍 | `IconSearch` |
| 右栏 toggle | ⧉ | `IconLayoutSidebarRight` |

#### 2.2.3 ChatView 图标

| 位置 | 当前 emoji | 替换为 Tabler Icon | 说明 |
|------|-----------|-------------------|------|
| 分享按钮 | 📤 | `IconShare` | PageHeader action |
| 大纲按钮 | 📋 | `IconList` | PageHeader action |
| 历史按钮 | 📜 | `IconHistory` | PageHeader action |
| 停止生成 | ⏹ | `IconPlayerStop` | 停止按钮 |
| 复制代码 | 📋 | `IconCopy` | 代码块复制按钮 |
| 复制确认 | ✓ | `IconCheck` | 复制成功反馈 |
| 复制错误 | ⚠ | `IconAlertTriangle` | 复制失败反馈 |

#### 2.2.4 RightPanel 图标

| 位置 | 当前 emoji | 替换为 Tabler Icon |
|------|-----------|-------------------|
| 全屏 | ⛶ | `IconArrowsMaximize` |
| 关闭 | ✕ | `IconX` |

#### 2.2.5 文件树/目录图标

| 位置 | 当前 emoji | 替换为 Tabler Icon |
|------|-----------|-------------------|
| 文件夹（闭合） | 📁 | `IconFolder` |
| 文件夹（展开） | 📂 | `IconFolderOpen` |
| 文件 | 📄 | `IconFile` |
| 目录选择器 | 📁/📂 | `IconFolder` / `IconFolderOpen` |

#### 2.2.6 对话卡片图标

| 位置 | 当前 emoji | 替换为 Tabler Icon | 说明 |
|------|-----------|-------------------|------|
| 成功状态 | ✅ | `IconCircleCheck` | ResultDialog |
| 错误状态 | ⛔ | `IconCircleX` | ResultDialog |
| 警告状态 | ⚠️ | `IconAlertTriangle` | ResultDialog / MockBadge |
| 工具调用 | 🔧 | `IconTool` | McpDetail 工具名 |
| 资源 | 📦 | `IconPackage` | McpDetail 资源名 |
| 工具状态-完成 | (绿色) | `IconCircleCheck` | ToolCallCard |
| 工具状态-运行中 | (旋转) | `IconLoader` | ToolCallCard |
| 工具状态-错误 | (红色) | `IconCircleX` | ToolCallCard |

#### 2.2.7 MarketLayout 图标

| 位置 | 当前 emoji | 替换为 Tabler Icon |
|------|-----------|-------------------|
| 专家默认 | 🤖 | `IconRobot` |
| 技能默认 | 🧩 | `IconPuzzle` |
| MCP 默认 | 🔌 | `IconPlugConnected` |
| 通用 fallback | 📦 | `IconPackage` |
| 精选推荐 | ✨ | `IconStar` |

#### 2.2.8 品牌图标的处理

| 品牌 | 处理方式 |
|------|---------|
| GitHub | `@tabler/icons-vue` 的 `IconBrandGithub` ✅ |
| VS Code | `IconBrandVscode` ✅ |
| 其他品牌 | 优先使用 Tabler Brand 系列，若无则使用 `IconExternalLink` + 品牌名文字 |

### 2.3 图标尺寸规范

| 场景 | 尺寸 | 说明 |
|------|------|------|
| 内联图标 / 标签内 | `16px` | 如 Agent tag 内图标、上下文敏感图标 |
| 按钮内图标 | `18px` | 如 PageHeader action 按钮、chat 操作按钮 |
| 菜单项图标 | `20px` | 如左栏导航菜单、右键菜单、dropdown item |
| 页面标题图标 | `24px` | 如 PageHeader title 前的页面图标 |
| 卡片头部图标 | `32px` | 如 ResourceCard 左上角图标 |
| 大号装饰图标 | `48px` | 如 SettingsDetailPanel 资源预览 |

### 2.4 颜色策略

**原则：所有图标统一 `color: currentColor`，不独立指定颜色。**

- 图标颜色随父元素文字颜色继承
- 需要强调的图标通过父容器颜色控制（如 danger 按钮 → `color: var(--km-danger)`）
- 禁用态图标：`opacity: var(--km-opacity-disabled)`

### 2.5 图标组件封装

创建统一的 `KIcon.vue` 封装组件，支持：

```vue
<KIcon name="search" :size="20" />
<KIcon name="robot" :size="24" />
```

组件内部按 name 动态映射到对应的 `@tabler/icons-vue` 导入。这样可以：
- 统一管理图标映射，后续更换图标库只需改一个文件
- 提供 size prop 统一尺寸
- 自动应用 `currentColor`

---

## 第三章：交互状态规范

> 每个组件类型逐一规定 6 态或 4 态的完整交互行为。

### 3.1 按钮（NButton）

#### 3.1.1 六态规范

| 状态 | 视觉变化 | 实现方式 |
|------|---------|---------|
| **default** | 按 variant 默认样式 | Naive UI 默认 |
| **hover** | 背景色加深/减淡 8-12%，`cursor: pointer` | Naive UI 默认 + `transition: all 0.15s ease` |
| **active** | 背景色再加深 4-6%，轻微缩放 `scale(0.98)` | Naive UI 默认 |
| **focus-visible** | `outline: 2px solid var(--km-accent)` + `outline-offset: 2px` | 全局 `.km-app-root :focus-visible` 规则 |
| **disabled** | `opacity: 0.4`，`cursor: not-allowed`，`pointer-events: none` | Naive UI 默认 |
| **loading** | 文字 `opacity: 0` + 居中 spinner `16px` | Naive UI `loading` prop |

#### 3.1.2 尺寸

| 尺寸 | 高度 | 水平 padding | 字号 | Naive UI size |
|------|------|-------------|------|-------------|
| tiny | `24px` | `8px` | `--km-font-xs` (10px) | `tiny` |
| small | `28px` | `12px` | `--km-font-sm` (12px) | `small` |
| medium | `34px` | `16px` | `--km-font-base` (15px) | `medium` |
| large | `40px` | `20px` | `--km-font-lg` (17px) | `large` |

#### 3.1.3 变体

| 变体 | Naive type | 使用场景 |
|------|-----------|---------|
| primary | `type="primary"` | 主要操作（发送、保存、确认） |
| secondary | `type="default"` + 自定义边框色 | 次要操作（取消、返回） |
| quaternary | `type="default" text quaternary` | 低优先级操作（图标按钮、辅助操作） |
| danger | `type="error"` | 破坏性操作（删除、清空） |

> Naive UI 已覆盖 button 交互态的核心实现，kmaster 仅补充 `focus-visible` 全局规则。

### 3.2 输入框（NInput / textarea）

#### 3.2.1 六态规范

| 状态 | 视觉变化 |
|------|---------|
| **default** | `border: 1px solid var(--km-input-border)`, `background: var(--km-input-bg)` |
| **hover** | `border-color: var(--km-border)` (加深一线) |
| **focus** | `border-color: var(--km-accent)` + `box-shadow: 0 0 0 3px rgba(59,130,246,0.15)` 蓝色外发光 |
| **error** | `border-color: var(--km-danger)` + 下方红色错误文字 `font-size: var(--km-font-sm)` |
| **disabled** | `opacity: 0.4`, `cursor: not-allowed`, `background: transparent` |
| **readonly** | 无边框样式变化，`background: transparent`，文字正常显示 |

> **设计决策**：focus 时使用 `box-shadow` 外发光而非 `outline`，因为 `box-shadow` 在圆角输入框上更自然（跟随 `border-radius`），`outline` 为直角。

### 3.3 卡片（ResourceCard / EntityCard）

#### 3.3.1 四态规范

| 状态 | 视觉变化 |
|------|---------|
| **default** | `background: var(--km-card-bg)`, `border: 1px solid var(--km-card-border)`, `box-shadow: var(--km-shadow-card)` |
| **hover** | `transform: translateY(-2px)` + `box-shadow: var(--km-shadow-card-hover)`, `cursor: pointer` |
| **selected** | `border-color: var(--km-accent)` + `background: var(--km-accent-bg)` |
| **disabled** | `opacity: 0.5`, `cursor: not-allowed`, 不响应 hover |

> **设计决策**：hover 上浮 2px（可感知但不夸张），配合暗/亮双值阴影确保在任何主题下可见——解决审计 #6 (ResourceCard 暗色下阴影不可见)。

### 3.4 标签 Tag（NTag）

#### 3.4.1 尺寸

| 尺寸 | 高度 | 字号 | padding |
|------|------|------|---------|
| tiny | `20px` | `--km-font-xs` (10px) | `2px 6px` |
| small | `24px` | `--km-font-sm` (12px) | `4px 8px` |

#### 3.4.2 变体

| 变体 | Naive type | 背景色 | 文字色 | 使用场景 |
|------|-----------|--------|--------|---------|
| default | `default` | `var(--km-hover-bg)` | `var(--km-text)` | 通用标签 |
| info | `info` | `var(--km-info-bg)` | `var(--km-info)` | Agent 标签、模式标签 |
| success | `success` | `var(--km-success-bg)` | `var(--km-success)` | 成功状态标签 |
| warning | `warning` | `var(--km-warning-bg)` | `var(--km-warning)` | 警告/注意标签 |
| error | `error` | `var(--km-danger-bg)` | `var(--km-danger)` | 错误/危险标签 |

### 3.5 菜单项（右键菜单 / Dropdown Item）

#### 3.5.1 四态规范

| 状态 | 视觉变化 |
|------|---------|
| **default** | 常规文字色、无背景 |
| **hover** | `background: var(--km-hover-bg)`, `cursor: pointer` |
| **active** | `background: var(--km-accent-bg)`, `color: var(--km-accent)` |
| **disabled** | `opacity: 0.4`, `cursor: not-allowed` |

#### 3.5.2 键盘导航

- ↑↓ 键在菜单项间移动焦点
- 当前焦点项显示 `outline: 2px solid var(--km-accent)`（不改变背景色，区别于 hover）
- Enter 触发当前焦点项操作
- Esc 关闭菜单

### 3.6 链接

| 状态 | 视觉变化 |
|------|---------|
| **default** | `color: var(--km-accent)`, `text-decoration: none` |
| **hover** | `text-decoration: underline`, `color: var(--km-accent-hover)` |
| **active** | `color: var(--km-accent-pressed)` |
| **visited** | 不区分（应用程序内链接无需 visited 态） |

### 3.7 数据展示组件

#### 3.7.1 表格

| 交互 | 规范 |
|------|------|
| 行 default | 常规背景 |
| 行 hover | `background: var(--km-hover-bg)`, `transition: background 0.12s ease` |
| 行 selected | `box-shadow: inset 3px 0 0 var(--km-accent)`（保留当前实现） |
| 斑马条纹 | 可选：奇数行 `background: rgba(255,255,255,0.02)`（暗色）/ `rgba(0,0,0,0.01)`（亮色） |
| 排序图标 | 排序列标题旁显示 `IconArrowsSort` / `IconArrowUp` / `IconArrowDown` |

#### 3.7.2 列表

| 交互 | 规范 |
|------|------|
| 列表项 default | 常规背景 |
| 列表项 hover | `background: var(--km-hover-bg)` |
| 列表项 selected | `background: var(--km-accent-bg)` |
| 拖拽手柄 | `IconGripVertical`, `opacity: 0` → hover 显示 `opacity: 0.3` → 拖拽中 `opacity: 0.6` |

#### 3.7.3 空态

统一使用 `EmptyState` 通用组件（详见 §5.4），覆盖以下场景：
- 列表/搜索结果为空
- 无会话记录
- Queue 无待发送项
- Memory 无记录

---

## 第四章：页面布局模板

### 4.1 标准页面布局

适用于：Experts / Skills / MCP / Settings / Jobs / Queue / Usage / Memory

```
┌──────────────────────────────────────────────────────────┐
│ PageHeader                                    height:48px│
│ [返回] [页面标题] [#extra]         [🔍搜索] [#actions]    │
│ border-bottom: 1px solid var(--km-border-light)           │
├──────────────────────────────────────────────────────────┤
│                                                          │
│ .km-page-body                                            │
│   flex: 1                                                │
│   overflow-y: auto                                       │
│   padding: var(--km-space-xl) = 24px                     │
│                                                          │
│   ┌──────────────────────────────────────────────────┐   │
│   │ 内容区（各 View 自定义）                          │   │
│   │                                                  │   │
│   └──────────────────────────────────────────────────┘   │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

**CSS 约定**（已在 variables.scss 中有 `.km-page-body`）：
```css
.km-page-body {
  flex: 1;
  min-height: 0;
  min-width: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  padding: var(--km-space-xl); /* 统一定义 padding */
}
```

**关键要求**：
- QueueView / UsageView **必须替换自建 header 为 PageHeader 组件**（审计 #2、#3）
- 所有 View 的 `.km-page-body` padding 统一为 `24px`

### 4.2 会话页面布局（ChatView）

```
┌──────────────────────────────────────────────┬───────────┐
│ PageHeader (48px)                            │ RightPanel│
│ [标题] [Agent badge] [Mode badge] [Model badge]│ (flexible)│
│ [#actions: 📤分享 📋大纲 📜历史]              │           │
├──────────────────────────────────────────────┤           │
│ AgentTabBar (horizontal scroll, 36px)        │           │
│ NTag 平铺 Agent 标签                          │           │
├──────────────────────────────────────────────┤           │
│                                              │           │
│ MessageList                                  │           │
│   flex: 1                                    │           │
│   overflow-y: auto                           │           │
│   padding: 16px 24px                         │           │
│                                              │           │
├──────────────────────────────────────────────┤           │
│ ChatInput                                    │           │
│   附件 chips 行 (条件显示)                    │           │
│   textarea + 发送按钮                         │           │
├──────────────────────────────────────────────┤           │
│ SessionConfigBar (32px)                      │           │
│   工作区/Agent/Mode ｜ ContextRing/Model      │           │
└──────────────────────────────────────────────┴───────────┘
```

**详细布局参数**：
- PageHeader：48px 固定高度
- AgentTabBar：36px 高度，`overflow-x: auto`，`flex-shrink: 0`
- MessageList：`flex: 1`，`padding: 16px 24px`
- ChatInput：`flex-shrink: 0`，padding `12px 16px`
- SessionConfigBar：32px，`flex-shrink: 0`，背景 `var(--km-panel)`

### 4.3 设置页面布局（SettingsView）

```
┌────────────────────────────────────┬──────────────────────┐
│ PageHeader (48px)                  │                      │
│ [⚙️ 设置] [SettingsNav: tabs]     │                      │
├────────────────────────────────────┤ SettingsDetailPanel  │
│ .km-settings-body                  │ (320px)              │
│                                    │                      │
│ ┌──────────────────────────────┐   │  ┌────────────────┐  │
│ │ 市场类: MarketLayout          │   │  │ 资源详情       │  │
│ │ (settingsMode, 无搜索/精选)   │   │  │ icon + name    │  │
│ │                              │   │  │ description    │  │
│ │ ┌──────┐ ┌──────┐ ┌──────┐  │   │  │ 操作按钮       │  │
│ │ │ card │ │ card │ │ card │  │   │  │ tags           │  │
│ │ └──────┘ └──────┘ └──────┘  │   │  │                │  │
│ │                              │   │  └────────────────┘  │
│ └──────────────────────────────┘   │                      │
│                                    │                      │
│ 非市场类:                           │                      │
│ <Suspense> 异步加载 section 组件    │                      │
└────────────────────────────────────┴──────────────────────┘
```

**关键修复**（审计 #5）：
- NTabs `@update:value` 回调必须执行 `router.push()` 同步 URL，确保刷新后 tab 状态保持

---

## 第五章：组件 UI 规范

### 5.1 PageHeader — 统一页面标题栏

**布局**：
```
[☰ 侧栏toggle] [页面标题] [#title-extra内容]  ………  [🔍 搜索] [#actions 操作按钮组] [⧉ 右栏toggle]
```

**规格**：
- 高度：`48px`
- 底部边框：`1px solid var(--km-border-light)`
- 左侧 padding：`16px`，右侧 padding：`8px`
- 标题字号：`var(--km-font-xl)` = `20px`，字重 `600`
- 搜索框宽度：`200px`（默认），focus 时 `280px`（transition 150ms）

**使用约束**：
- 所有 View 必须使用 PageHeader —— QueueView / UsageView 当前自建 header 需替换（审计 #2/#3）
- 搜索框在不需要的 View 中通过 prop 隐藏：`<PageHeader :showSearch="false" />`
- 右栏 toggle 通过 `showRightToggle` prop 控制显示（仅在 ChatView 显示）

### 5.2 ResourceCard — 资源卡片

基于已实现的 N2 新布局（审计 T02），补充以下交互态：

**规格**：
- 最小宽度：`180px`（Grid 自适应 `minmax(180px, 1fr)`）
- 图标：`32×32`，`border-radius: var(--km-radius-sm)` = `4px`
- 名称：`font-size: 13px`，`font-weight: 500`，单行截断
- 描述：`font-size: 11px`，`color: var(--km-text-secondary)`，最多 2 行 `-webkit-line-clamp: 2`
- Tags：最多 5 个 `<NTag size="tiny">`

**四态完整规范**：

| 状态 | 边框 | 背景 | 阴影 | 动效 |
|------|------|------|------|------|
| default | `var(--km-card-border)` | `var(--km-card-bg)` | `var(--km-shadow-card)` | - |
| hover | 不变 | 不变 | `var(--km-shadow-card-hover)` | `translateY(-2px)` |
| selected | `var(--km-accent)` | `var(--km-accent-bg)` | 不变 | - |
| disabled | 不变 | 不变 | - | `opacity: 0.5` |

**hover transition**：
```css
transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
```

### 5.3 ChatInput — 输入框

基于 T03 已实现的 NTag 附件行 + 语音 + sendMode，补充以下细节：

**规格**：
- 输入区最小高度：`40px`，最大高度：`200px`（自动扩展）
- textarea 字体：`var(--km-font-base)` = `15px`（与展示字号一致，减少视觉跳跃）
- 发送按钮：primary 实心，`IconSend` 图标，空输入时 `disabled` + `opacity: 0.4`
- 附件 chip：`font-size: 12px`，`border-radius: var(--km-radius-sm)`，closable

**交互补充**：
- focus 时：`border-color: var(--km-accent)` + `box-shadow: 0 0 0 3px rgba(59,130,246,0.15)`
- 空输入：发送按钮 disabled（灰色，不可点击）
- 语音录音中：按钮 `color: var(--km-danger)`，脉冲动画
- 拖拽文件：输入区显示虚线边框 `2px dashed var(--km-accent)`
- `+` 按钮面板：打开时 `IconPlus` 旋转 45° 变为 `IconX`

### 5.4 EmptyState — 空态通用组件

**设计（统一替代各处零散的空态实现）**：

```
┌──────────────────────────────┐
│                              │
│       [大图标 64×64]          │
│    opacity: var(--km-opacity-empty) │
│                              │
│    提示标题（16px, 500）      │
│   提示描述（13px, muted）      │
│                              │
│    [建议操作按钮]             │
│                              │
└──────────────────────────────┘
```

**Props**：
```ts
interface EmptyStateProps {
  icon?: string        // Tabler icon name，默认 'IconInbox'
  title: string        // 提示标题
  description?: string // 提示描述
  actionLabel?: string // 操作按钮文字
  actionIcon?: string  // 操作按钮图标
  onAction?: () => void // 操作回调
}
```

**使用场景**：
- 列表/搜索结果为空
- 无会话记录
- Queue 无待发送项 → "暂无待发送消息" + "返回对话" 按钮
- Memory 无记录
- SettingsDetailPanel 未选中 → "点击左侧卡片查看详情"

### 5.5 加载骨架屏

**卡片骨架**：
```
┌──────────────────────┐
│ ██████████  ████     │  ← 灰色 pulse 矩形（图标 + 名称）
│ ████████████████     │  ← 描述行
│ ████████████████     │  ← 描述行 2
│ ████ ████ ████      │  ← tags 模拟
└──────────────────────┘
```

**列表骨架**：重复 5-8 行，每行 `▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓` 灰色条 + 右侧短灰色条

**样式**：
```css
@keyframes km-skeleton-pulse {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 0.8; }
}
.km-skeleton {
  background: var(--km-hover-bg);
  border-radius: var(--km-radius-sm);
  animation: km-skeleton-pulse 1.5s ease-in-out infinite;
}
```

> **设计决策**：不使用旋转 spinner——pulse 骨架在文本密集场景下视觉干扰更小，且能传达"内容即将在此位置出现"的空间预期。

### 5.6 消息气泡 — MessageItem

**用户消息**：
- 右对齐，`max-width: 70%`
- 背景：`var(--km-user-bubble)`
- 边框：`1px solid var(--km-user-bubble-border)`
- 圆角：`12px 12px 4px 12px`（右下角小圆角）
- 文字色：`var(--km-text)`（暗色浅底深字 / 亮色蓝色底深字）
- 文件芯片：`background: var(--km-file-chip-bg)`，文字色 `var(--km-text)`
- 时间戳：右对齐，`font-size: 11px`，`opacity: 0.55`

**AI 消息**：
- 左对齐，`max-width: 85%`（AI 消息通常更长）
- 背景：`var(--km-ai-bubble)` = `var(--km-panel)`
- 边框：`1px solid var(--km-ai-bubble-border)`
- 圆角：`12px 12px 12px 4px`（左下角小圆角）
- Agent 来源标签：消息右上角，`NTag size="tiny" type="info"`
- 时间戳：左对齐

**操作按钮**（复制/编辑/重试）：
- 默认 `opacity: 0`，hover 消息时 `opacity: 1`
- 位置：消息气泡外右侧（用户消息在左，AI 消息在右）
- 按钮：`NTag text quaternary size="tiny"`

**错误态**：
- 左侧红色边框：`border-left: 3px solid var(--km-danger)`
- 错误信息文字：`color: var(--km-danger)`，`font-size: 12px`

### 5.7 AgentTabBar

- 高度：`36px`
- 背景：`var(--km-panel)`，底部边框：`1px solid var(--km-border-light)`
- 标签：`NTag`，`round`，`closable`（仅在 agents.length > 1 时）
- active 态：`border-color: var(--km-accent)` + `background: var(--km-accent-bg)`
- hover 关闭按钮：`color: var(--km-danger)`
- 添加按钮：最后一个标签后，`NButton text tiny` + `IconPlus`

### 5.8 SessionConfigBar

- 高度：`32px`
- 背景：`var(--km-panel)`
- 布局：`flex` 两端对齐
- 左侧：工作区 / Agent / Mode（`NButton text tiny` + `NDropdown`）
- 右侧：ContextRing + Model dropdown

### 5.9 ContextRing

- 尺寸：`22×22` SVG
- 颜色：使用 CSS 变量替代硬编码
  - 绿色（<70%）：`var(--km-success)`
  - 黄色（70-90%）：`var(--km-warning)`
  - 红色（>90%）：`var(--km-danger)`
  - 背景环：`var(--km-border)`
- 百分比文字：`font-size: 7px`，`fill: var(--km-text)`

### 5.10 ToolCallCard / ThoughtBlock / ApprovalCard / ClarifyCard / PlanCard

**共同规范**：
- 所有颜色通过 CSS 变量引用（不再硬编码）
- 卡片背景：`var(--km-tool-card-bg)`
- 卡片边框：`var(--km-tool-card-border)`
- 可折叠：点击标题区展开/收起，chevron 旋转 180°
- 代码块：`background: var(--km-code-bg)`

**ThoughtBlock**：
- 左边框：`3px solid var(--km-thought-border)`
- 文字：`color: var(--km-thought-text)`
- 默认折叠（`open = ref(false)`），减少长思考占用空间

**ApprovalCard**：
- 边框：`var(--km-approval-border)`
- 背景：`var(--km-approval-bg)`

**ClarifyCard**：
- 边框：`var(--km-clarify-border)`
- 背景：`var(--km-clarify-bg)`

**PlanCard**：
- 边框：`var(--km-plan-border)`
- 背景：`var(--km-plan-bg)`

### 5.11 DirPickerModal

**修复要求**（审计 #4）：
- 15+ 处内联 `style` 属性 → 全部迁移到 `<style scoped>` 中
- 面包屑分隔符：使用 `IconChevronRight` 16px 替代 `/` 文本
- 目录项：单击选中高亮 + 双击进入（补充单击反馈）
- 键盘支持：↑↓ 导航目录项 + Enter 进入

### 5.12 DataStateBoundary

已完善（审计 §3.5），保持现有结构：
- Live → 正常内容
- Loading → NSpin（或替换为骨架屏）
- Empty → EmptyState（替换 NEmpty）
- Error → NResult
- Offline → NAlert

---

## 第六章：响应式策略

### 6.1 断点定义

| 断点 | 宽度 | 布局行为 |
|------|------|---------|
| **Desktop** | ≥ 1400px | 标准布局：右栏 320px 展开，全部元素可见 |
| **Laptop** | 1024–1399px | 紧凑布局：右栏默认折叠（`--km-right-w: 0`），可手动打开（overlay 模式） |
| **Tablet** | < 1024px | 简化布局：暂不优化，后续版本迭代 |

### 6.2 卡片 Grid 自适应

```css
.km-card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: var(--km-space-md);
}
```

- 最小列宽 `180px`（确保 ResourceCard 内容不挤压）
- 当前 MarketLayout 的 `--km-grid-cols` JS 方案（审计 §3.2）保留，因为它在 `1400px+` 段提供了比纯 CSS Grid 更精细的列数控制（最多 6 列）
- 小屏场景回退到 CSS `auto-fill`

### 6.3 右栏策略

- ≥1400px：内嵌式（push 主体），`--km-right-w: 320px`
- <1400px：覆盖式（overlay），`position: fixed; right: 0; z-index: 100`，带半透明遮罩
- 主体宽度 < 480px：自动强制收起右栏（当前 ResizeObserver 逻辑保留）

### 6.4 表格响应式

- 优先横向滚动（`overflow-x: auto`），不隐藏列
- 仅在 < 600px 时考虑隐藏低优先级列（如时间戳）

---

## 第七章：动画与过渡规范

### 7.1 全局原则

> **动画服务于可用性，不是装饰。** 在文本密集的产品中，动画过多适得其反。

| 场景 | 规范 | 理由 |
|------|------|------|
| **页面切换** | ❌ 无动画 | 避免认知负担。当前 SPA hash 路由切换为即时替换 |
| **右栏开关** | `width` / `transform` transition `200ms ease` | 布局变化需要过渡，200ms 足够快不拖沓 |
| **hover 上浮/阴影** | `transform` + `box-shadow` transition `150ms ease` | 即时反馈，150ms 让人感觉"敏捷" |
| **加载骨架** | `opacity` pulse `1.5s infinite` | 柔和脉动，不闪烁 |
| **下拉菜单展开** | Naive UI 默认（`--n-bezier`） | 不做自定义，保持 Naive 一致性 |
| **消息进入** | ❌ 无动画（移除当前 `km-msg-fade`） | 文本密集场景动画适得其反——对话历史加载时 50 条消息逐个淡入是干扰 |
| **主题切换** | `background-color` + `color` transition `0.3s ease`（已有） | 确保亮/暗切换平滑 |
| **代码块复制反馈** | 图标从 `IconCopy` → `IconCheck` 切换，无额外动画 | 简单明了 |

### 7.2 Transition Token

```css
:root {
  --km-transition-fast: 0.12s ease;    /* 行 hover、按钮反馈 */
  --km-transition-normal: 0.15s ease;  /* 卡片 hover、阴影变化 */
  --km-transition-slow: 0.2s ease;     /* 面板宽度、布局变化 */
  --km-transition-theme: 0.3s ease;    /* 主题切换 */
}
```

### 7.3 不使用的动画

- ❌ 页面进入/离开动画（SPA 路由切换不需要）
- ❌ 消息淡入（移除 `km-msg-fade` TransitionGroup）
- ❌ 滚动触发的视差/渐显效果
- ❌ 按钮点击波纹（Naive UI 默认无，不额外添加）

---

## 第八章：实施路径

> 基于审计报告 §6.5 建议优先级，分 3 个 Phase 执行。每个 Phase 的产出独立可验证。

### Phase A：Design Token 基础（预计 ~5 文件）

**目标**：建立完整的 Token 体系，使后续迁移有统一的变量可引用。

| # | 任务 | 文件 | 依赖 |
|---|------|------|------|
| A1 | 补全 `variables.scss`：新增 §1.1–§1.5 全部 Token（暗色+亮色双值） | `styles/variables.scss` | - |
| A2 | 升级 `theme.ts`：补齐 `buildOverrides` 的组件级 token（Button/Tag/Input/Modal），读取 localStorage 偏好 + `prefers-color-scheme` 媒体查询 | `styles/theme.ts` | A1 |
| A3 | AgentMarkdown 代码块亮色适配：`pre` 背景 → `var(--km-code-bg)`，头部 → `var(--km-code-head-bg)`，复制按钮 → CSS 变量 | `chat/AgentMarkdown.vue` | A1 |
| A4 | 安装 `@tabler/icons-vue`，创建 `KIcon.vue` 封装组件 | `common/KIcon.vue` | - |
| A5 | 全局 `focus-visible` 样式规则 | `styles/variables.scss` 或 `App.vue` | A1 |

**验证标准**：
- `variables.scss` 包含全部 Token（暗/亮双值），终端 `grep` 检查硬编码颜色是否降至审计报告的 50% 以下
- 亮色主题下 AgentMarkdown 代码块可读
- KIcon 组件可通过 `name` prop 渲染任意 Tabler 图标

### Phase B：组件一致性（预计 ~12 文件）

**目标**：统一 PageHeader、图标替换、颜色迁移。

| # | 任务 | 文件 | 依赖 |
|---|------|------|------|
| B1 | QueueView 替换自建 header → PageHeader | `views/QueueView.vue` | A4 |
| B2 | UsageView 替换自建 header → PageHeader | `views/UsageView.vue` | A4 |
| B3 | 全局 emoji 图标替换为 KIcon（AppNav/LeftSidebar/PageHeader/ChatView/RightPanel/FileTreePane/DirPickerModal） | 7 文件 | A4 |
| B4 | 硬编码颜色迁移到 CSS 变量：ThoughtBlock / ToolCallCard / ApprovalCard / ClarifyCard / PlanCard / SubagentCard | 6 文件 | A1 |
| B5 | ResourceCard hover 阴影适配：`var(--km-shadow-card-hover)` | `common/ResourceCard.vue` | A1 |
| B6 | DirPickerModal 内联 style 清理 → scoped CSS | `common/DirPickerModal.vue` | A1 |
| B7 | ChatInput 硬编码颜色迁移（编辑条 / 录音 / +面板 hover） | `chat/ChatInput.vue` | A1 |
| B8 | ContextRing 颜色 → CSS 变量 | `chat/ContextRing.vue` | A1 |
| B9 | MessageItem 硬编码迁移（时间戳 / 文件芯片 / 右键菜单 / 引导消息） | `chat/MessageItem.vue` | A1 |
| B10 | AgentTabBar / SessionConfigBar 硬编码 hover 色迁移 | 2 文件 | A1 |
| B11 | SettingsView tabs URL 同步（`@update:value` → `router.push`） | `views/SettingsView.vue` | - |
| B12 | UsageView 柱状图渐变色 → 全部使用 CSS 变量 | `views/UsageView.vue` | A1 |

**验证标准**：
- QueueView / UsageView 与其他 View 的 header 视觉一致
- 全站无 emoji 图标（grep 扫描 `<template #icon>` 和 ASCII emoji）
- 硬编码颜色降至接近 0（仅允许 `transparent` 和 `currentColor`）

### Phase C：交互完善（预计 ~8 文件）

**目标**：补全交互态、空态、骨架屏、组件收尾。

| # | 任务 | 文件 | 依赖 |
|---|------|------|------|
| C1 | 创建 EmptyState 通用组件 | `common/EmptyState.vue` | B3 |
| C2 | EmptyState 替换现有空态：QueueView / MemoryView / MessageList / SettingsDetailPanel | 4 文件 | C1 |
| C3 | 创建骨架屏组件（卡片骨架 + 列表骨架 + 消息骨架） | `common/SkeletonCard.vue`, `common/SkeletonList.vue` | A1 |
| C4 | MarketLayout / ExpertsView / SkillsView / McpView 加载态替换为骨架屏 | 4 文件 | C3 |
| C5 | 按钮/输入框/卡片完整交互态验证 + 补充 focus-visible | 全局 | A5 |
| C6 | 消息气泡样式细化（圆角/间距/操作按钮） | `chat/MessageItem.vue` | B9 |
| C7 | 清理 dead code：SessionList / ArtifactPanel | 2 文件 | - |
| C8 | DirPickerModal 键盘导航补充（↑↓ + Enter） | `common/DirPickerModal.vue` | B6 |

**验证标准**：
- 所有空列表/空搜索结果可见 EmptyState + 操作按钮
- 首次加载可见骨架屏（非旋转 spinner）
- 键盘 Tab 导航可见 focus-visible 轮廓
- 右键菜单在亮/暗主题下均可正常使用

### 实施顺序依赖图

```
Phase A (基础)
  A1 ← A2 ← A5
  A1 ← A3
  A4
      ↓
Phase B (一致性)
  A1 → B4, B5, B6, B7, B8, B9, B10, B12
  A4 → B1, B2, B3
  B11 (独立)
      ↓
Phase C (交互完善)
  B3 → C1 → C2
  A1 → C3 → C4
  A5 → C5
  B9 → C6
  B6 → C8
  C7 (独立)
```

### 工时估算

| Phase | 任务数 | 预计文件数 | 预估工时 |
|-------|--------|-----------|---------|
| A | 5 | ~5 | 1-1.5 天 |
| B | 12 | ~12 | 2-3 天 |
| C | 8 | ~8 | 1.5-2 天 |
| **总计** | **25** | **~25** | **4.5-6.5 天** |

---

## 附录 A：Token 速查卡片

```
┌─ 颜色 ─────────────────────────────────────────────┐
│ km-bg         页面背景    #1e1e1e / #ffffff        │
│ km-panel      面板背景    #252526 / #f3f3f3        │
│ km-card-bg    卡片背景    rgba(w,0.04) / #fff      │
│ km-text       正文        #d4d4d4 / #1f1f1f        │
│ km-text-sec   次要文字    #9ca3af / #6b7280        │
│ km-accent     主色        #3b82f6 / #2563eb        │
│ km-border     常规边框    #333 / #e5e5e5           │
│ km-hover-bg   悬停背景    rgba(w,0.06) / rgba(b,0.04) │
│ km-code-bg    代码块      #161616 / #f8f8f8        │
├─ 间距 ─────────────────────────────────────────────┤
│ 4/8/12/16/24  (4px步进)                            │
├─ 字号 ─────────────────────────────────────────────┤
│ xs=10 sm=12 md=14 base=15 lg=17 xl=20 2xl=26      │
├─ 圆角 ─────────────────────────────────────────────┤
│ sm=4px(输入框) md=6px(卡片) lg=8px(模态) full=999px│
├─ 阴影 ─────────────────────────────────────────────┤
│ card: 0 2px 8px rgba(0,0,0,0.3) 暗 / 0 1px 4px rgba(0,0,0,0.06) 亮 │
│ hover: 0 4px 16px rgba(0,0,0,0.45) 暗 / 0 2px 12px rgba(0,0,0,0.1) 亮 │
├─ 过渡 ─────────────────────────────────────────────┤
│ fast=0.12s normal=0.15s slow=0.2s theme=0.3s      │
└────────────────────────────────────────────────────┘
```

## 附录 B：图标速查（常用 Top 20）

| Icon | Tabler Name | 使用场景 |
|------|------------|---------|
| `IconMessageCircle` | message-circle | 对话 |
| `IconRobot` | robot | 专家/Agent |
| `IconPuzzle` | puzzle | 技能 |
| `IconPlugConnected` | plug-connected | MCP |
| `IconBrain` | brain | Memory |
| `IconChartBar` | chart-bar | Usage |
| `IconInbox` | inbox | Queue |
| `IconSettings` | settings | 设置 |
| `IconSearch` | search | 搜索 |
| `IconPlus` | plus | 新建 |
| `IconTrash` | trash | 删除 |
| `IconPencil` | pencil | 编辑 |
| `IconCopy` | copy | 复制 |
| `IconCheck` | check | 确认 |
| `IconX` | x | 关闭 |
| `IconSend` | send | 发送 |
| `IconShare` | share | 分享 |
| `IconDownload` | download | 导出 |
| `IconFolder` | folder | 目录 |
| `IconSun` / `IconMoon` | sun / moon | 主题切换 |

---

> **文档完成**：2026-08-07，许清楚（Xu）
> **下一步**：架构师审阅 → 按 Phase A→B→C 顺序实施
