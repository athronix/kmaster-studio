/**
 * dataSource.ts — 数据源状态类型（U-18 诚实降级基础设施）
 *
 * 五态枚举，无 mock 态。mock 只在 HERMES_BRIDGE_MOCK=1 时通过 MockBadge 展示。
 *
 * @module types/dataSource
 */

/** 数据源加载五态 */
export enum DataSourceState {
  Live = 'live',       // 真��数据已加载
  Loading = 'loading', // 加载中（首次）
  Empty = 'empty',     // hermes 已连接但无数据
  Error = 'error',     // hermes 连不上或返回 5xx
  Offline = 'offline', // hermes 整体不可达
}

/** 带状态的数据源包装 */
export interface DataSource<T> {
  state: DataSourceState;
  data: T | null;
  error?: string;
  lastUpdated?: number;
}
