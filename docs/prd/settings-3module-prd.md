# 设置页三模块卡片布局 PRD（Skill 管理 / Agent 角色管理 / 系统设置行数）

> **文档类型**：简单 PRD
> **产品经理**：Alice
> **日期**：2026-08-08
> **仓库**：kmaster-studio（monorepo，packages/client = Vue3 + Vite + Naive UI + Pinia + TS）
> **状态**：待评审 → 待架构设计

---

## 0. 调研结论（⚠️ 与需求下达时的假设有重大出入，务必先看）

调研实际读取了以下文件：`views/SettingsView.vue`、`components/common/MarketLayout.vue`、`composables/useMarketList.ts`、`components/settings/{SkillManageSection,AgentRoleSection,McpManageSection,GeneralSection,ExpertPickerPanel}.vue`、`components/market/CardMarketLayout.vue`、`constants/layout.ts`、`types/{market,settings}.ts`、`composables/{useSkillList,useInstall}.ts`、`stores/agentRoles.ts`、`api/client.ts`、`server/src/routes/agents.ts`、`server/src/services/hermes/aggregate/experts.ts`。

### 0.1 结论一：设置页真正渲染的组件不是 `SkillManageSection` / `AgentRoleSection`

`SettingsView.vue` 中 `agent-role` / `skills` / `mcp` 三个类别**统一走 `isMarketSettings` 分支**，渲染的是：

```
PageHeader
└── NTabs（Agent 管理 / Skills 管理 / MCP 管理）
    └── MarketLayout（config: expertSettingsConfig | skillSettingsConfig | mcpSettingsConfig）
    └── SettingsDetailPanel（右侧详情栏）
```

`SECTION_MAP` 里这三项被显式写成 `{} as Component // 占位，由 isMarketSettings 分支接管`。

全仓 grep 确认：**`SkillManageSection.vue` / `AgentRoleSection.vue` / `McpManageSection.vue` 三个文件没有被任何地方 import，属于 T04 遗留死代码**。它们内部那套完整的 `km_grid_cols` + `km.v3.marketLayout` 读取逻辑、`market-layout-changed` 事件监听、分页实现，**当前对用户完全不可见**。

> **因此本需求的真实改造对象是 `MarketLayout.vue` + `useMarketList.ts` + `SettingsView.vue` 的三份 `MarketConfig` + `GeneralSection.vue`，而不是那三个 Section 组件。**

### 0.2 结论二：`MarketLayout.vue` 三模块已存在，但布局/分页全部不达标

| 模块 | 现状 | 差距 |
|---|---|---|
| 精选推荐 | `v-if="config.showFeatured && featuredItems.length"`；设置页三份 config 全为 `showFeatured: false` → **完全不显示**。市场页（ExpertsView/SkillsView）为 true 时是 `NScrollbar x-scrollable` **横向滚动**，无分页、无行列控制 | 需在设置页开启；需改为网格 + 独立分页 |
| 已安装 | `NScrollbar x-scrollable` **横向滚动**，一次性渲染全部 `installedItems`，**无分页、无行列控制** | 需改为网格 + 独立分页 |
| 资源市场 | CSS Grid，列数取自 CSS 变量 `--km-grid-cols`，该变量由 `updateGridCols()` 按**浏览器窗口宽度断点**（1600→5 / 1200→4 / 900→3 / 600→2 / else 1）设置，**完全忽略系统设置的「市场卡片列数」** | 列数须改读系统设置 |

### 0.3 结论三：分页 pageSize 与实际列数脱钩，且行数配置未被消费

`useMarketList.ts`：

```ts
const PAGE_SIZE = computed(() => getGridCols() * 2);  // 模块级 computed，且写死 ×2
```

三重问题：
1. **行数写死 `× 2`**，`km.v3.marketLayout` 的 `marketRows` 从未被消费；
2. `getGridCols()` 读的是 `localStorage['km_grid_cols']`，与 `MarketLayout` 实际渲染用的窗口断点列数**两套口径**，导致「一页 10 条」但网格可能是 3 列 → 出现 3/3/3/1 的残行；
3. `PAGE_SIZE` 是**模块级 `computed`**，localStorage 非响应式 → 首次求值后永久缓存，改设置不生效。

### 0.4 结论四：`market-layout-changed` 事件目前无人监听（活代码里）

`GeneralSection.vue` 每次改行数/列数都会 `window.dispatchEvent(new CustomEvent('market-layout-changed'))`，但全仓只有那三个**死组件**注册了监听。活的 `MarketLayout` / `useMarketList` 没有监听 → **系统设置改完，设置页毫无反应，刷新也不生效（因为列数走窗口断点）**。

### 0.5 结论五：`GeneralSection.vue` 的三个行数输入框**已经存在**且写入正确

需求下达时说的「行数只有一个值、featuredRows/installedRows 保存时被硬编码成 1」**与当前代码不符**。实际已有三个 `NInputNumber`：

| 标签 | 变量 | 范围 | 默认 |
|---|---|---|---|
| 市场卡片列数 | `gridCols` → `localStorage['km_grid_cols']`（裸数字字符串） | 3–8 | 5 |
| 精选推荐行数 | `featuredRows` | 1–3 | 1 |
| 已安装行数 | `installedRows` | 1–5 | 1 |
| 市场可选行数 | `marketRows` | 1–10 | 4 |

后三者由 `writeMarketLayout()` 整体写入 `localStorage['km.v3.marketLayout']` 的完整 JSON 对象，**没有硬编码为 1**。

> **因此「系统设置 UI 改造」这一项从「改造」降级为「校准 + 补文案 + 补生效链路」**：UI 本身基本不用动，要做的是让下游真正消费它，并把标签统一为「资源市场行数」。

### 0.6 结论六：Agent 三模块数据源**成立**，后端**不需要新增接口**

后端 `GET /api/agents?source=all` → `mergeExpertLists()` 已返回三段：

```ts
{
  installed:  AgentEntry[],   // hermes config.yaml personalities + agents/*.md
  candidates: ExpertAsset[],  // COS expert_center.json 专家候选池（含 installed 标记）
  categories: ExpertCategory[]
}
```

且已有 `POST /api/agents/:name/install`、`DELETE /api/agents/:name/uninstall`，前端 `api/client.ts` 也已封装（`getAgents` / `installAgent` / `uninstallAgent`），`useInstall('expert')` 已接通。

`SettingsView.fetchAllExpertSettings()` **已经在用这套数据**（installed + candidates 双段 + 把 `candidates` 里 `installed=true` 的回填进 installed）。

> 也就是说：**Agent 页的「已安装 / 资源市场」数据源现在就是通的**，只是被 `MarketLayout` 渲染成了横向滚动条而已。
> 唯一"名存实亡"的是 `ExpertPickerPanel.vue`（右栏「从市场添加」），其 `pool` 被硬编码为 `computed(() => [])`（注释 `T04/U-13：hermes 暂无专家概念`）——该注释已过时，但**不在本次范围内**。

### 0.7 结论七：精选推荐无后端字段，只有前端 top-N 约定

全仓搜索 `featured`：后端 `ExpertAsset` / `SkillAsset` / COS manifest **均无 featured 字段**，无 `/api/*/featured` 接口。前端唯一实现是 `useMarketList.syncDerived()`：

```ts
featuredItems.value = _candidateItemsRaw.value.slice(0, 5);  // 候选池前 5 项，且写死 5
```

后端 `mergeExpertLists` 对 candidates 的排序是「未安装优先 → 按 category 名字典序」，**并非按热度/推荐度**，所以"前 N 项"目前是个**弱语义**。

### 0.8 结论八：MCP 设置页与 Skill/Agent **共用同一个 `MarketLayout`**

需求说「本次不动 MCP 结构」——但 MCP 设置页走的是 `mcpSettingsConfig` + 同一个 `MarketLayout`，**改 `MarketLayout` 必然同时改变 MCP 设置页的外观**。「不动 MCP」在当前架构下不可达，需在本 PRD 中显式接受这一连带影响（见 §5 待确认问题 Q5）。

---

## 1. 产品目标

1. **视觉统一**：设置页的 Skill 管理与 Agent 角色管理，统一为「精选推荐 / 已安装 / 资源市场」三模块的**卡片网格**列表，消除当前「已安装/精选靠横向滚动、资源市场靠窗口断点」的割裂感。
2. **布局可控**：三个模块的每页卡片数严格等于「系统设置的市场卡片列数 × 该模块自己的行数」，用户在系统设置里的调整**即时生效**，不需刷新。
3. **溢出即分页**：任一模块卡片数超过「行 × 列」时，该模块**独立启动分页**；模块之间分页状态互不影响，不出现横向滚动，不出现残行。

---

## 2. 用户故事

1. **As a** 使用者，**I want** 在「设置 → Skills 管理」里一眼看到「精选推荐 / 已安装 / 资源市场」三个分区的卡片网格，**so that** 我能像逛市场页一样在设置页里直接挑选和管理技能，而不用横向拖拽找卡片。
2. **As a** 使用者，**I want** 在「设置 → Agent 管理」里同样看到这三个分区，已安装区是我本地的角色、资源市场区是 COS 专家候选池、精选推荐区是被挑出来的少数几个，**so that** 我能在一个页面内完成「看已有 → 逛市场 → 一键安装」的闭环。
3. **As a** 使用者，**I want** 在「系统设置」里分别设定精选推荐 / 已安装 / 资源市场三个模块各自的行数，并设定统一的卡片列数，**so that** 我能按自己屏幕尺寸和使用习惯控制每个模块占多大篇幅。
4. **As a** 使用者，**I want** 改完系统设置后回到 Skill / Agent 页，布局**立刻**按新的行列数重排，**so that** 我不需要刷新页面或重启应用才能看到效果。
5. **As a** 使用者，**I want** 当某个模块的卡片装不下时，只有那个模块出现分页器，翻页时其他模块保持不动，**so that** 我在翻资源市场第 3 页时，上方的已安装区不会跟着跳。

---

## 3. 需求池

### P0（必须，本需求核心）

| ID | 需求 | 验收要点 |
|---|---|---|
| P0-1 | **列数单一真源**：`MarketLayout` 的所有网格列数改为读取 `localStorage['km_grid_cols']`（3–8，回落 `MARKET_DEFAULTS.gridCols=5`），**移除** `getGridCols()` 的窗口断点逻辑与 `resize` 监听 | 系统设置列数设为 6 → 三个模块每行都是 6 张卡片 |
| P0-2 | **行数分模块消费**：从 `localStorage['km.v3.marketLayout']` 读 `{featuredRows, installedRows, marketRows}`（回落 `MARKET_DEFAULTS`），三模块 pageSize 分别 = `gridCols × 对应行数` | 列 5 / 精选 1 / 已安装 2 / 市场 4 → 三模块每页 5 / 10 / 20 |
| P0-3 | **精选推荐模块在设置页开启**：`SettingsView` 的 `expertSettingsConfig`、`skillSettingsConfig` 的 `showFeatured` 改为 `true` | 两页均出现「精选推荐」标题区 |
| P0-4 | **精选推荐改为网格 + 独立分页**：去掉 `NScrollbar x-scrollable`，改 CSS Grid；数据源由 `candidates.slice(0,5)` 改为**全量候选**，前端按 `gridCols × featuredRows` 分页 | 精选区无横向滚动条；候选 30 条、每页 5 → 出现 6 页分页器 |
| P0-5 | **已安装改为网格 + 独立分页**：去掉 `NScrollbar x-scrollable`，改 CSS Grid，按 `gridCols × installedRows` 分页 | 已安装 23 条、每页 10 → 出现 3 页分页器 |
| P0-6 | **资源市场分页对齐**：`useMarketList` 的 `PAGE_SIZE` 从 `getGridCols() * 2` 改为 `gridCols × marketRows`，并去掉模块级 `computed` 缓存（改为响应式 ref/可重算） | 市场行数改为 3、列 5 → 每页 15 |
| P0-7 | **三模块分页互相独立**：精选/已安装/市场各自维护 `page` 状态，翻其中一个不重置另外两个 | 市场翻到第 3 页 → 已安装仍在第 1 页 |
| P0-8 | **配置即时生效**：`MarketLayout`（或其数据层）监听 `window` 的 `market-layout-changed` 事件，收到后重读列数/行数、重算 pageSize、三模块页码归 1 | 在系统设置改列数后切回 Skill 页，无需刷新即按新列数重排 |
| P0-9 | **Agent 页数据映射落定**（见 §4.4 映射表），不新增后端接口 | Agent 页三模块均有真实数据（COS manifest 存在时） |
| P0-10 | **Skill 页数据映射落定**（见 §4.4 映射表），不新增后端接口 | Skill 页三模块均有真实数据 |
| P0-11 | **系统设置 UI 校准**：将「市场可选行数」文案改为「资源市场行数」，与页面模块标题一致；三个行数框 + 列数框保持现有读写 `km.v3.marketLayout` / `km_grid_cols` 的行为不变 | 文案一致；`localStorage['km.v3.marketLayout']` 始终是完整三键对象 |
| P0-12 | **无残行/无横向滚动**：任一模块在任意列数（3–8）下，卡片按 `repeat(N, 1fr)` 铺满，容器不出现水平滚动条 | 列数 8、窗口 1280px 下不出现横向滚动 |

### P1（重要）

| ID | 需求 | 说明 |
|---|---|---|
| P1-1 | **精选推荐空态**：候选池为空（COS manifest 缺失/离线）时，精选区不渲染空白标题，或渲染 `NEmpty` 文案「暂无精选推荐」 | 现有 `v-if="featuredItems.length"` 会整块隐藏，需明确是"隐藏"还是"占位提示" |
| P1-2 | **已安装空态**：无已安装项时展示 `NEmpty`「尚未安装任何项目，可在下方资源市场中挑选」，而非整块消失（当前 `v-if="installedItems.length"` 直接隐藏） | 首次使用的用户看不到"已安装"这个概念，认知断层 |
| P1-3 | **分页器只在溢出时出现**：`itemCount > pageSize` 才渲染 `NPagination`，避免只有 2 张卡片也顶一个"1"的分页器 | 与 `CardMarketLayout` 现有 `v-if="installedFiltered.length > installedPageSize"` 口径一致 |
| P1-4 | **搜索/筛选后页码回弹**：搜索、切分类、切排序后，受影响模块页码重置为 1；过滤后总数变少导致当前页越界时，页码拉回最后一页 | 参考 `CardMarketLayout` 的 `watch(installedFiltered, ...)` 实现 |
| P1-5 | **响应式下限保护**：窗口宽度不足以容纳 `gridCols` 列时（卡片被压得过窄），允许按最小卡片宽度降级列数，但**不得**回到"窗口断点决定列数"的旧逻辑 | 避免 8 列在 1024px 下卡片挤成条 |
| P1-6 | **搜索作用域**：明确顶部搜索框作用于哪些模块（建议：作用于「已安装」+「资源市场」，精选推荐不参与过滤） | 当前 `marketState.search()` 只过滤 candidates |
| P1-7 | **加载骨架屏对齐**：`SkeletonCard` 数量改为按 `gridCols × marketRows` 渲染，而非写死 6 | 减少加载→就绪的布局跳动 |

### P2（锦上添花）

| ID | 需求 | 说明 |
|---|---|---|
| P2-1 | 记忆各模块上次页码（会话内内存态即可，不落 localStorage） | 从详情栏返回时不跳回第 1 页 |
| P2-2 | 分页器旁提供 pageSize 快捷倍数（`base` / `base×2` / `base×4`），参考 `CardMarketLayout.dynamicPageSizeOptions` | 临时想多看几屏时不用去改系统设置 |
| P2-3 | 系统设置行数控件加实时预览提示：「当前每页 = 5 列 × 4 行 = 20 张」 | 降低理解成本 |
| P2-4 | 清理死代码：删除或归档 `SkillManageSection.vue` / `AgentRoleSection.vue` / `McpManageSection.vue` 及仅服务于它们的 `CardMarketLayout.vue` | 避免后续维护者再改错文件（本次调研已踩坑） |
| P2-5 | 精选推荐排序语义化：后端在 `expert_center.json` / skill manifest 增加 `featured` 或 `weight` 字段，前端改为按该字段取 | 本期用 top-N 兜底，属技术债 |

---

## 4. UI 设计稿（文字描述）

### 4.1 Skill 管理页 / Agent 管理页（共用同一套布局）

```
┌─ PageHeader：「设置」+ 搜索框 ─────────────────────────────────────────┐
├─ NTabs：[Agent 管理] [Skills 管理] [MCP 管理] ────────────────────────┤
│                                                                        │
│  ┌── 左栏：MarketLayout ───────────────────┐ ┌─ 右栏：详情面板 ──┐   │
│  │ [搜索框]                                 │ │                   │   │
│  │                                          │ │  SettingsDetail   │   │
│  │ ✨ 精选推荐                              │ │  Panel            │   │
│  │ ┌────┐┌────┐┌────┐┌────┐┌────┐          │ │  （未选中时为     │   │
│  │ │卡片││卡片││卡片││卡片││卡片│  ← 1 行×5列 │ │   EmptyState）    │   │
│  │ └────┘└────┘└────┘└────┘└────┘          │ │                   │   │
│  │              ‹ 1 2 3 ›   ← 精选独立分页   │ │                   │   │
│  │                                          │ │                   │   │
│  │ 已安装  ⑫                                │ │                   │   │
│  │ ┌────┐┌────┐┌────┐┌────┐┌────┐          │ │                   │   │
│  │ │卡片││卡片││卡片││卡片││卡片│  ← 2 行×5列 │ │                   │   │
│  │ └────┘└────┘└────┘└────┘└────┘          │ │                   │   │
│  │ ┌────┐┌────┐┌────┐┌────┐┌────┐          │ │                   │   │
│  │ └────┘└────┘└────┘└────┘└────┘          │ │                   │   │
│  │              ‹ 1 2 ›     ← 已安装独立分页 │ │                   │   │
│  │                                          │ │                   │   │
│  │ 资源市场                                  │ │                   │   │
│  │ [专家][专家团]                    [综合▾] │ │                   │   │
│  │ 〔推荐〕〔办公〕〔编程〕…〔…更多〕         │ │                   │   │
│  │ ┌────┐┌────┐┌────┐┌────┐┌────┐          │ │                   │   │
│  │ │卡片││卡片││卡片││卡片││卡片│  ← 4 行×5列 │ │                   │   │
│  │ └────┘└────┘└────┘└────┘└────┘          │ │                   │   │
│  │ …（共 4 行）                              │ │                   │   │
│  │              ‹ 1 2 3 4 5 › ← 市场独立分页 │ │                   │   │
│  └──────────────────────────────────────────┘ └───────────────────┘   │
└────────────────────────────────────────────────────────────────────────┘
```

要点：
- 三个 `<section>` 纵向排列，模块间距沿用 `.ml-section { margin-bottom: var(--km-space-xl) }`。
- 每个模块标题行沿用 `.ml-section-title`（12px/600/opacity .6）；「已安装」右侧保留数量徽标 `.ml-count`；「精选推荐」保留 `KIcon name="Sparkles"`。
- **三个模块的卡片容器统一为** `display: grid; grid-template-columns: repeat(var(--km-grid-cols), 1fr); gap: var(--km-space-md);`，其中 `--km-grid-cols` 由系统设置的列数驱动（不再由窗口宽度驱动）。
- **分页器位置**：每个模块的**网格正下方、模块内部**，居中对齐，`size="small"`，沿用 `.ml-pagination` 样式（`justify-content: center`）。**不做全页共用一个分页器。**
- 「资源市场」模块保留现有的「大分类按钮行 + 排序下拉」`ml-tabs-sort-row` 与「领域标签行」`ml-category-row`，位置在标题与网格之间。精选/已安装模块**不带**分类与排序控件。
- 卡片组件统一为 `ResourceCard.vue`，宽度由 grid track 决定（`width: 100%`）。

### 4.2 系统设置（GeneralSection）改后形态

现有控件基本保留，仅做文案校准，顺序如下（沿用 `.sec-row` 三段式：label / control / hint）：

```
市场卡片列数        [ 5 ▴▾ ]   (3–8)
  提示：调整 Agent / Skill / MCP 页的卡片列数（3-8），即时生效

精选推荐行数        [ 1 ▴▾ ]   (1–3)
  提示：精选推荐模块的展示行数；每页卡片数 = 列数 × 行数

已安装行数          [ 2 ▴▾ ]   (1–5)
  提示：已安装模块的展示行数；每页卡片数 = 列数 × 行数

资源市场行数        [ 4 ▴▾ ]   (1–10)   ← 文案由「市场可选行数」改名
  提示：资源市场模块的展示行数；每页卡片数 = 列数 × 行数
```

- 四个控件均为 `NInputNumber`，`style="max-width: 160px"`，与现有 `.sec-control` 一致。
- 列数写 `localStorage['km_grid_cols']`（裸数字字符串，**保持现状不改格式**，下游需兼容裸数字与 JSON 两种解析）。
- 三个行数整体写 `localStorage['km.v3.marketLayout']` 的完整对象 `{featuredRows, installedRows, marketRows}`。
- 任一控件变更后 `dispatchEvent(new CustomEvent('market-layout-changed'))`——**本次要补的是消费方，不是生产方**。
- 「即时生效」措辞替换现有「刷新后生效」。

### 4.3 分页行为规格

| 模块 | pageSize | 分页器显示条件 | 页码重置时机 |
|---|---|---|---|
| 精选推荐 | `gridCols × featuredRows` | `featuredTotal > pageSize` | 配置变更 |
| 已安装 | `gridCols × installedRows` | `installedTotal > pageSize` | 配置变更、搜索、过滤结果越界 |
| 资源市场 | `gridCols × marketRows` | `marketTotal > pageSize` | 配置变更、搜索、切分类、切排序、过滤结果越界 |

### 4.4 数据映射表（工程师直接照此实现，不要猜）

#### Skill 管理页

| 模块 | 数据源 | 说明 |
|---|---|---|
| 已安装 | `GET /api/skills` → `installed`（`SettingsView.fetchAllSkillSettings` 已实现，映射为 `ResourceItem[]`，`installed: true`） | 已通 |
| 资源市场 | `GET /api/skills` → `candidates`，按 D1 口径**过滤掉已安装 + 按 name 去重** | 已通 |
| 精选推荐 | **资源市场同源**：取 `candidates`（过滤去重后的全量）作为精选池，前端按 `gridCols × featuredRows` 分页展示。后端**无** featured 字段 | 需改（现为 `slice(0,5)`） |

#### Agent 管理页

| 模块 | 数据源 | 说明 |
|---|---|---|
| 已安装 | `GET /api/agents?source=all` → `installed`（`AgentEntry[]`，来自 hermes `config.yaml` personalities + `agents/*.md`）**并回填** `candidates` 中 `installed === true` 的条目（`SettingsView.fetchAllExpertSettings` 已实现该合并） | 已通 |
| 资源市场 | 同一响应的 `candidates`（`ExpertAsset[]`，来自 COS `expert_center.json`，字段：`id/name/description/category/icon/installed/profession/tags/doNotRedistribute`） | 已通 |
| 精选推荐 | **资源市场同源**：取 `candidates` 作为精选池，前端按 `gridCols × featuredRows` 分页。后端**无** featured 字段，`mergeExpertLists` 的排序是「未安装优先 → category 字典序」 | 需改 |
| 安装 / 卸载 | `POST /api/agents/:name/install` / `DELETE /api/agents/:name/uninstall`（`useInstall('expert')` 已接通） | 已通 |

> **注**：`ExpertPickerPanel.vue`（右栏「从市场添加角色」）的 `pool` 仍硬编码为 `[]`，与上表无关，**不在本次范围**，但建议后续用同一份 `candidates` 填充（见 §5 Q4）。

---

## 5. 待确认问题

| # | 问题 | 背景 | PM 建议 |
|---|---|---|---|
| **Q1** | **「精选推荐」与「资源市场」同源、内容重叠**，用户会看到同一张卡片出现两次。是否接受？ | 后端无 featured 字段，只能从 candidates 取子集；且现在精选是 `slice(0,5)`，与市场第 1 页高度重合 | 三选一：**(a)** 精选取 candidates 前 N（N=列×精选行），资源市场从第 N+1 项起排除已在精选中的；**(b)** 接受重叠，精选仅作"快捷入口"；**(c)** 本期精选只在 Skill/Agent 页展示 `installed=false` 且 `category` 命中白名单的条目。**倾向 (a)**，语义最干净 |
| **Q2** | **精选推荐需要分页吗？** 若精选池 = 全量候选（几百条），分页页数会和资源市场一样多，"精选"就失去意义 | 需求明确要求"哪个模块展示不下就分页" | 建议：精选池**截断为固定上限**（如 `min(候选总数, 列数 × 精选行数 × 3)`，即最多 3 页），既满足"可分页"又保住"精选"语义。需拍板上限系数 |
| **Q3** | **是否本期就补后端 `featured` 字段？** | COS manifest（`expert_center.json` / skill manifest）由外部生成，加字段涉及跨仓协作 | 建议：**本期不加**，前端 top-N 兜底（P2-5 记为技术债）。若产品认为"精选"必须人工可控，则需另开后端需求 |
| **Q4** | **`ExpertPickerPanel.vue` 的空 `pool` 要不要一并修？** | 右栏「从市场添加角色」目前永远显示"没有匹配的专家"，是明确的坏体验，且数据源现成 | 建议：**列为独立小需求**，不塞进本次；但需在验收时确认它不会被误判为本次回归 |
| **Q5** | **MCP 设置页会被连带改变，是否接受？** | Skill / Agent / MCP 三页共用 `MarketLayout.vue`，改它就等于同时改 MCP | 建议：**接受并纳入验收范围**。MCP 的 `showFeatured` 保持 `false`（MCP 无精选概念），仅继承「已安装/资源市场」的网格化 + 分页 + 列数生效。需确认 MCP 是否也要开精选 |
| **Q6** | **`SkillManageSection` / `AgentRoleSection` / `McpManageSection` / `CardMarketLayout` 四个死文件如何处置？** | 本次调研已因它们误判现状，是真实的认知陷阱 | 建议：本期**删除**（P2-4），或至少在文件头加 `@deprecated 未被任何页面引用，实际渲染见 components/common/MarketLayout.vue` |
| **Q7** | **列数下限保护策略**（P1-5） | 系统设置允许 8 列，但窗口 1024px 时 8 列会把卡片压到 ~110px，`ResourceCard` 内容溢出 | 建议：设卡片最小宽度（如 160px），实际列数 = `min(设置列数, floor(容器宽 / 160))`，并在设置项 hint 里说明"窄窗口下会自动减少列数"。需确认是否接受这种"设置值不一定完全生效"的行为 |
| **Q8** | **搜索框作用域**（P1-6） | 当前顶部搜索只过滤 candidates，不过滤 installed | 建议：搜索同时作用于「已安装」与「资源市场」，精选推荐不受影响。需确认 |
| **Q9** | **`km_grid_cols` 存储格式** | `GeneralSection` 写的是裸数字字符串 `"5"`，但死代码里的读取器同时兼容 JSON 数字；`LS_KEYS` 规范要求 V3 新 key 用 `km.v3.*` + JSON | 建议：**保持裸数字不迁移**（避免存量用户配置丢失），新读取器沿用现有"先 JSON 后 Number"的双兼容解析。需确认是否接受这个规范例外 |

---

## 6. 范围说明

**In scope**
- `packages/client/src/components/common/MarketLayout.vue`（三模块网格化 + 三套独立分页 + 列数/行数消费 + 事件监听）
- `packages/client/src/composables/useMarketList.ts`（pageSize 公式、响应式化、三模块分页状态）
- `packages/client/src/views/SettingsView.vue`（`expertSettingsConfig` / `skillSettingsConfig` 的 `showFeatured`）
- `packages/client/src/components/settings/GeneralSection.vue`（文案校准）
- `packages/client/src/constants/layout.ts`（如需新增读取工具函数 / 默认值）

**Out of scope（但需保持兼容 / 需在验收中确认无回归）**
- MCP 设置页：**会被连带改变外观**（共用组件），不新增 MCP 专属逻辑（Q5）
- 市场主页 `ExpertsView.vue` / `SkillsView.vue` / `McpView.vue`：同样使用 `MarketLayout`，需确认改动后这三页不崩、且列数改由系统设置驱动是可接受的
- `ExpertPickerPanel.vue` 空 pool（Q4）
- 后端任何改动：**本次不新增、不修改任何后端接口**
- Plugins / Channels / Tools 等其他设置页

---

## 7. 验收清单（供 QA）

1. 系统设置：列数 3→8 逐档切换，Skill / Agent / MCP 三页三模块的每行卡片数同步变化，**无需刷新**。
2. 系统设置：精选行数 1→3、已安装行数 1→5、资源市场行数 1→10 分别调整，对应模块每页卡片数 = 列 × 行。
3. Skill 页与 Agent 页均可见「精选推荐 / 已安装 / 资源市场」三个标题区。
4. 任一模块卡片数 ≤ 行×列 时**不显示**分页器；> 行×列 时显示，且页数 = `ceil(total / (行×列))`。
5. 三个模块的分页互不干扰：翻资源市场页码，已安装与精选停留在原页。
6. 三个模块容器均**无水平滚动条**；最后一行不足时左对齐留空，不出现居中或拉伸变形。
7. Agent 页「资源市场」卡片点击「安装」→ 成功后该卡片进入「已安装」模块，计数徽标 +1。
8. Skill 页同上。
9. COS manifest 缺失/离线时：资源市场与精选推荐展示空态文案，页面不报错、不白屏。
10. 已安装为 0 时：展示引导空态而非整块消失（P1-2）。
