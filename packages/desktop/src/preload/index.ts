/**
 * Preload —— 唯一的主进程 ↔ 渲染进程桥（NFR-M5-5）
 *
 * 约定：
 * - 运行在 `sandbox: true` + `contextIsolation: true` 下，只经 contextBridge 暴露白名单能力，
 *   🚫 绝不把 ipcRenderer / require / process 整体挂到 window 上。
 * - 暴露的形状必须与 `packages/client/src/utils/desktop-bridge.ts` 的 `KmasterDesktopApi` 逐字段一致。
 *   下方 `KmasterDesktopApi` 是该契约在桌面侧的镜像声明，并用作 `desktopApi` 的显式类型标注，
 *   任何字段/签名漂移都会在 `tsc -p packages/desktop` 阶段直接报错。
 *   ⚠️ 这里刻意**不跨包 import** client 的类型：preload 编译为独立 CommonJS 产物（rootDir=src），
 *      引入 client 的 ESM 源码会破坏产物边界与 rootDir 约束。
 * - 通道名必须与 `main/index.ts` 的 IPC 常量一致。
 */
import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

const IPC = {
  SERVER_STATUS: 'kmaster:server-status',
  UPDATE_STATUS: 'kmaster:update-status',
  WINDOW_CONTROL: 'kmaster:window-control',
  RETRY_SERVER: 'kmaster:retry-server',
  CHECK_UPDATES: 'kmaster:check-updates',
  // V3/#19：会话级工作目录——调起原生文件夹选择器。
  PICK_FOLDER: 'kmaster:pick-folder',
} as const;

/** 窗口控制白名单；必须与 `main/index.ts` 的 `ipcMain.on(WINDOW_CONTROL)` 分支一一对应。 */
const ALLOWED_WINDOW_ACTIONS = ['minimize', 'maximize', 'close'] as const;

/** 与 client 的 `WindowControlAction` 同步。 */
export type WindowControlAction = (typeof ALLOWED_WINDOW_ACTIONS)[number];

/** 与 `main/server-process.ts` 的 `ServerStatusPhase` 同步。 */
export type ServerStatusPhase =
  | 'probing'
  | 'reusing'
  | 'spawning'
  | 'waiting'
  | 'ready'
  | 'failed'
  | 'stopped';

/** 与 `main/server-process.ts` 的 `ServerStatus` 同步。 */
export interface DesktopServerStatus {
  phase: ServerStatusPhase;
  message: string;
  port: number;
  log_path: string;
}

/** 与 `main/updater.ts` 的 `UpdateUnavailableReason` 同步。 */
export type UpdateUnavailableReason =
  | 'dev-mode'
  | 'unsigned-macos'
  | 'unsupported-platform'
  | 'up-to-date'
  | 'check-failed';

/** 与 `main/updater.ts` 的 `UpdateStatus` 同步。 */
export interface DesktopUpdateStatus {
  available: boolean;
  version?: string;
  notes?: string;
  reason?: UpdateUnavailableReason;
  message?: string;
}

export type Unsubscribe = () => void;

/** contextBridge 暴露到 `window.kmasterDesktop` 的完整形状。 */
export interface KmasterDesktopApi {
  isDesktop: true;
  platform: string;
  version: string;
  windowControl: (action: WindowControlAction) => void;
  onServerStatus: (callback: (status: DesktopServerStatus) => void) => Unsubscribe;
  onUpdateStatus: (callback: (status: DesktopUpdateStatus) => void) => Unsubscribe;
  retryServer: () => Promise<boolean>;
  checkForUpdates: () => Promise<DesktopUpdateStatus>;
  /** V3/#19：调起原生文件夹选择对话框，返回路径或 null（用户取消）。 */
  pickFolder: () => Promise<string | null>;
}

const NOOP_UNSUBSCRIBE: Unsubscribe = () => undefined;

/** 版本号由主进程经 webPreferences.additionalArguments 注入（sandbox 下拿不到 app.getVersion()）。 */
function readArg(prefix: string, fallback: string): string {
  const hit = process.argv.find((arg) => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
}

/**
 * 统一的订阅封装：返回取消订阅函数，避免渲染进程泄漏监听器。
 * payload 由主进程 `webContents.send` 投递，形状与 `TPayload` 由通道常量保证。
 */
function subscribe<TPayload>(channel: string, callback: (payload: TPayload) => void): Unsubscribe {
  if (typeof callback !== 'function') return NOOP_UNSUBSCRIBE;
  const listener = (_event: IpcRendererEvent, payload: TPayload): void => {
    try {
      callback(payload);
    } catch {
      /* 渲染侧回调异常不应打断 IPC */
    }
  };
  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.removeListener(channel, listener);
  };
}

/**
 * `ipcRenderer.invoke` 声明返回 `Promise<any>`，此处收口成 `unknown`，
 * 避免 `any` 顺着桥的公开签名扩散到渲染侧。
 */
function invoke(channel: string): Promise<unknown> {
  return ipcRenderer.invoke(channel);
}

/** 运行期校验主进程回包，形状不符时退化为 check-failed，UI 无需处理 undefined。 */
function isUpdateStatus(value: unknown): value is DesktopUpdateStatus {
  return (
    typeof value === 'object' &&
    value !== null &&
    'available' in value &&
    typeof value.available === 'boolean'
  );
}

const desktopApi: KmasterDesktopApi = {
  isDesktop: true,
  platform: process.platform,
  version: readArg('--kmaster-app-version=', '0.0.0'),

  windowControl(action: WindowControlAction): void {
    if (!ALLOWED_WINDOW_ACTIONS.includes(action)) return;
    ipcRenderer.send(IPC.WINDOW_CONTROL, action);
  },

  onServerStatus(callback: (status: DesktopServerStatus) => void): Unsubscribe {
    return subscribe<DesktopServerStatus>(IPC.SERVER_STATUS, callback);
  },

  onUpdateStatus(callback: (status: DesktopUpdateStatus) => void): Unsubscribe {
    return subscribe<DesktopUpdateStatus>(IPC.UPDATE_STATUS, callback);
  },

  async retryServer(): Promise<boolean> {
    return (await invoke(IPC.RETRY_SERVER)) === true;
  },

  async checkForUpdates(): Promise<DesktopUpdateStatus> {
    const result = await invoke(IPC.CHECK_UPDATES);
    if (isUpdateStatus(result)) return result;
    return { available: false, reason: 'check-failed', message: '主进程未返回有效的更新状态' };
  },

  /**
   * V3/#19：调起原生文件夹选择对话框。
   *
   * 主进程侧使用 `dialog.showOpenDialog({ properties: ['openDirectory'] })`。
   * 用户取消时主进程返回 `canceled`，preload 把它归一为 `null`（与 contract 一致）。
   *
   * 桥契约约定返回路径或 null；不抛错，避免渲染侧 `try/catch` 漫天飞。
   */
  async pickFolder(): Promise<string | null> {
    try {
      const result = await invoke(IPC.PICK_FOLDER);
      if (typeof result === 'string' && result.length > 0) return result;
      return null;
    } catch {
      return null;
    }
  },
};

contextBridge.exposeInMainWorld('kmasterDesktop', desktopApi);
