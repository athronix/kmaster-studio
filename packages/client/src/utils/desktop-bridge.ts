/**
 * 桌面能力探测桥（方案 §2.2 / NFR-M5-4「双宿主等价」）
 *
 * 同一份 SPA 同时跑在浏览器与 Electron 壳内：
 * - 桌面能力一律经本模块探测，`window.kmasterDesktop` 不存在时**静默 no-op**；
 * - 🚫 不报错、不隐藏通用功能，Web 下所有 API 都必须能安全调用。
 *
 * 本文件是纯前端工具，不引入任何 Electron 依赖，Web 构建零副作用。
 * ⚠️ 暴露形状必须与 `packages/desktop/src/preload/index.ts` 逐字段一致。
 */

/** server 启动阶段，与 desktop/src/main/server-process.ts 的 ServerStatusPhase 同步。 */
export type ServerStatusPhase =
  | 'probing'
  | 'reusing'
  | 'spawning'
  | 'waiting'
  | 'ready'
  | 'failed'
  | 'stopped';

export interface DesktopServerStatus {
  phase: ServerStatusPhase;
  message: string;
  port: number;
  log_path: string;
}

/** 更新状态，与 desktop/src/main/updater.ts 的 UpdateStatus 同步。 */
export interface DesktopUpdateStatus {
  available: boolean;
  version?: string;
  notes?: string;
  reason?: 'dev-mode' | 'unsigned-macos' | 'unsupported-platform' | 'up-to-date' | 'check-failed';
  message?: string;
}

export type WindowControlAction = 'minimize' | 'maximize' | 'close';
export type Unsubscribe = () => void;

/** L3 目录项（`listDir` 的返回元素）。 */
export interface DirEntry {
  /** 文件 / 目录名（不含父路径） */
  name: string;
  /** 绝对路径 */
  path: string;
  isDirectory: boolean;
  /** 字节大小；目录为 0 */
  size: number;
  /** 最后修改时间戳（ms）；取不到为 0 */
  mtime: number;
}

/** preload 经 contextBridge 注入的 API 形状。 */
export interface KmasterDesktopApi {
  isDesktop: true;
  platform: string;
  version: string;
  windowControl: (action: WindowControlAction) => void;
  onServerStatus: (callback: (status: DesktopServerStatus) => void) => Unsubscribe;
  onUpdateStatus: (callback: (status: DesktopUpdateStatus) => void) => Unsubscribe;
  retryServer: () => Promise<boolean>;
  checkForUpdates: () => Promise<DesktopUpdateStatus>;
  /** V3/#19：调起 Electron 原生文件夹选择对话框。返回路径或 null（用户取消）。Web 端不可用。 */
  pickFolder: () => Promise<string | null>;
  // —— V3/L3：日志读取所需的只读文件系统能力（Q1 决策）——
  /** 读取文本文件；超出 maxBytes 截断。不存在 / 无权限时返回 null。 */
  readTextFile?: (path: string, maxBytes?: number) => Promise<string | null>;
  /** 列目录；不存在 / 无权限时返回空数组。 */
  listDir?: (path: string) => Promise<DirEntry[]>;
  /** 用系统默认应用打开文件或目录；成功返回 true。 */
  openPath?: (path: string) => Promise<boolean>;
  /** 路径是否存在。 */
  pathExists?: (path: string) => Promise<boolean>;
}

declare global {
  interface Window {
    kmasterDesktop?: KmasterDesktopApi;
  }
}

const NOOP_UNSUBSCRIBE: Unsubscribe = () => undefined;

/** 取桥对象；Web 环境（含 SSR/单测无 window）返回 undefined。 */
function bridge(): KmasterDesktopApi | undefined {
  if (typeof window === 'undefined') return undefined;
  return window.kmasterDesktop;
}

/** 是否运行在 Electron 桌面壳内。 */
export function isDesktop(): boolean {
  return bridge()?.isDesktop === true;
}

/** 宿主平台：桌面下为 process.platform（win32/darwin/linux），Web 下固定 'web'。 */
export function platform(): string {
  return bridge()?.platform ?? 'web';
}

/** 桌面壳版本号；Web 下为空串。 */
export function version(): string {
  return bridge()?.version ?? '';
}

/** 窗口控制；Web 下 no-op。 */
export function windowControl(action: WindowControlAction): void {
  bridge()?.windowControl(action);
}

/** 订阅 server 启动状态；Web 下返回空取消函数。 */
export function onServerStatus(callback: (status: DesktopServerStatus) => void): Unsubscribe {
  const api = bridge();
  if (!api) return NOOP_UNSUBSCRIBE;
  return api.onServerStatus(callback);
}

/** 订阅自动更新状态；Web 下返回空取消函数。 */
export function onUpdateStatus(callback: (status: DesktopUpdateStatus) => void): Unsubscribe {
  const api = bridge();
  if (!api) return NOOP_UNSUBSCRIBE;
  return api.onUpdateStatus(callback);
}

/** 请求桌面壳重试启动 server；Web 下解析为 false。 */
export function retryServer(): Promise<boolean> {
  const api = bridge();
  if (!api) return Promise.resolve(false);
  return api.retryServer();
}

/** 主动检查更新；Web 下返回「不支持的平台」结构，UI 无需分支判断。 */
export function checkForUpdates(): Promise<DesktopUpdateStatus> {
  const api = bridge();
  if (!api) {
    return Promise.resolve({
      available: false,
      reason: 'unsupported-platform',
      message: 'Web 环境不支持自动更新',
    });
  }
  return api.checkForUpdates();
}

/**
 * V3/#19：调起 Electron 原生文件夹选择对话框。
 *
 * 返回值约定：
 *   - 选中目录：返回绝对路径字符串
 *   - 用户取消：返回 null（不抛错）
 *   - Web 环境：返回 null（不抛错，调用方应走 prompt 兜底）
 *
 * Web 下绝不抛错——下游 store 会判定 null 并退回文本输入，UI 不会出现「无反应」状态。
 */
export function pickFolder(): Promise<string | null> {
  const api = bridge();
  if (!api || typeof api.pickFolder !== 'function') return Promise.resolve(null);
  return api.pickFolder().catch(() => null);
}

// ───────────────────── V3/L3：只读文件系统能力（Q1 决策） ─────────────────────
//
// 4 个方法一律「typeof 探测 + Web 静默降级」：
//   - preload 未实现（老版桌面壳）→ 与 Web 同等对待，不抛错；
//   - 调用方（stores/logs.ts）据返回值判定是否落 mock 数据。

/** 单文件读取默认上限 1MB，与 `INTERACTION.maxFileBytes` 对齐（此处不 import，避免常量层反向依赖）。 */
const DEFAULT_MAX_BYTES = 1_048_576;

/**
 * 读取文本文件。
 *
 * 返回值约定：文本内容 / null（Web、桥不支持、文件不存在、读取失败）。绝不抛错。
 */
export function readTextFile(path: string, maxBytes: number = DEFAULT_MAX_BYTES): Promise<string | null> {
  const api = bridge();
  if (!api || typeof api.readTextFile !== 'function') return Promise.resolve(null);
  return api.readTextFile(path, maxBytes).catch(() => null);
}

/**
 * 列目录。
 *
 * 返回值约定：目录项数组 / 空数组（Web、桥不支持、目录不存在）。绝不抛错。
 */
export function listDir(path: string): Promise<DirEntry[]> {
  const api = bridge();
  if (!api || typeof api.listDir !== 'function') return Promise.resolve([]);
  return api.listDir(path).catch(() => [] as DirEntry[]);
}

/**
 * 用系统默认应用打开文件 / 目录（日志「在外部应用打开」）。
 *
 * 返回值约定：true=已调起 / false（Web、桥不支持、失败）。绝不抛错。
 */
export function openPath(path: string): Promise<boolean> {
  const api = bridge();
  if (!api || typeof api.openPath !== 'function') return Promise.resolve(false);
  return api.openPath(path).catch(() => false);
}

/**
 * 判断路径是否存在。
 *
 * 返回值约定：true / false（Web、桥不支持一律 false）。绝不抛错。
 */
export function pathExists(path: string): Promise<boolean> {
  const api = bridge();
  if (!api || typeof api.pathExists !== 'function') return Promise.resolve(false);
  return api.pathExists(path).catch(() => false);
}

/** 是否具备 L3 只读文件系统能力（4 个方法齐备才算）。 */
export function hasFileSystemBridge(): boolean {
  const api = bridge();
  if (!api) return false;
  return (
    typeof api.readTextFile === 'function' &&
    typeof api.listDir === 'function' &&
    typeof api.openPath === 'function' &&
    typeof api.pathExists === 'function'
  );
}
