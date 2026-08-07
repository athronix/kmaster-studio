/**
 * Updater —— electron-updater 封装（R-M5-4 / T0-3）
 *
 * T0-3 结论落地：
 * - macOS 自动更新**强制**要求签名 + 公证，无绕过手段 → 未签名时直接短路
 *   返回 `{ available:false, reason:'unsigned-macos' }`，UI 提示「请前往官网手动下载新版本」。
 * - Windows 未签名时 electron-updater 会校验新旧安装包的签名主体是否一致 → 内测通道需显式放开
 *   （环境变量 KMASTER_UPDATER_ALLOW_UNSIGNED=1），并在设置页「关于」区标注「内测通道，未签名」。
 * - 证书到位后仅改配置即可开通，**代码零返工**。
 */
import { app } from 'electron';
import {
  autoUpdater,
  NsisUpdater,
  type ProgressInfo,
  type UpdateDownloadedEvent,
  type UpdateInfo,
} from 'electron-updater';

/** 不可更新时的原因码（UI 据此给出不同文案）。 */
export type UpdateUnavailableReason =
  | 'dev-mode'
  | 'unsigned-macos'
  | 'unsupported-platform'
  | 'up-to-date'
  | 'check-failed';

export interface UpdateStatus {
  available: boolean;
  version?: string;
  notes?: string;
  reason?: UpdateUnavailableReason;
  message?: string;
}

/** 下载/安装进度，用于 UI 展示。 */
export interface UpdateProgress {
  percent: number;
  transferred: number;
  total: number;
  bytesPerSecond: number;
}

export interface UpdaterOptions {
  /** 状态播报回调（主进程转发到渲染进程）。 */
  onStatus?: (status: UpdateStatus) => void;
  onProgress?: (progress: UpdateProgress) => void;
}

export class Updater {
  private initialized = false;
  private readonly onStatus: (status: UpdateStatus) => void;
  private readonly onProgress: (progress: UpdateProgress) => void;

  constructor(options: UpdaterOptions = {}) {
    this.onStatus = options.onStatus ?? ((): void => undefined);
    this.onProgress = options.onProgress ?? ((): void => undefined);
  }

  /** 注册 electron-updater 事件；幂等，可重复调用。 */
  init(): void {
    if (this.initialized) return;
    this.initialized = true;

    // 下载完成后由用户决定何时重启；退出时自动安装
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    this.relaxWindowsSignatureCheck();

    autoUpdater.on('update-available', (info: UpdateInfo) => {
      this.onStatus({ available: true, version: info.version, notes: toNotes(info.releaseNotes) });
    });
    autoUpdater.on('update-not-available', (info: UpdateInfo) => {
      this.onStatus({ available: false, reason: 'up-to-date', version: info.version });
    });
    autoUpdater.on('download-progress', (progress: ProgressInfo) => {
      this.onProgress({
        percent: progress.percent,
        transferred: progress.transferred,
        total: progress.total,
        bytesPerSecond: progress.bytesPerSecond,
      });
    });
    autoUpdater.on('update-downloaded', (event: UpdateDownloadedEvent) => {
      this.onStatus({
        available: true,
        version: event.version,
        message: '新版本已下载，退出应用时将自动安装',
      });
    });
    autoUpdater.on('error', (err: Error) => {
      this.onStatus({ available: false, reason: 'check-failed', message: err?.message ?? String(err) });
    });
  }

  /**
   * 内测通道：未签名 Windows 包需放开发布者一致性校验（不安全，仅限内测）。
   *
   * ⚠️ `NsisUpdater.verifyUpdateCodeSignature` 是**校验函数**
   * （`(publisherName: string[], path: string) => Promise<string | null>`，返回 null 表示校验通过），
   * **不是布尔开关**；且其 setter 会忽略假值（`if (value) { ... }`）。
   * 因此放开校验的唯一正确姿势是注入一个恒定返回 `null` 的实现——
   * 早期写法 `(autoUpdater as { verifyUpdateCodeSignature?: boolean }).verifyUpdateCodeSignature = false`
   * 会被 setter 静默丢弃，功能实际从未生效。
   */
  private relaxWindowsSignatureCheck(): void {
    if (process.platform !== 'win32') return;
    if (process.env.KMASTER_UPDATER_ALLOW_UNSIGNED !== '1') return;
    if (!(autoUpdater instanceof NsisUpdater)) return;
    autoUpdater.verifyUpdateCodeSignature = (): Promise<string | null> => Promise.resolve(null);
  }

  /**
   * 主动检查更新。任何不可用情形都返回结构化结果，**不抛异常**（不能因为检查更新失败而影响主流程）。
   */
  async checkForUpdates(): Promise<UpdateStatus> {
    if (!app.isPackaged) {
      return { available: false, reason: 'dev-mode', message: '开发模式不检查更新' };
    }
    const unsupported = this.unsupportedReason();
    if (unsupported) return unsupported;

    this.init();
    try {
      const result = await autoUpdater.checkForUpdates();
      const version = result?.updateInfo?.version;
      if (!version || version === app.getVersion()) {
        return { available: false, reason: 'up-to-date', version };
      }
      return { available: true, version, notes: toNotes(result?.updateInfo?.releaseNotes) };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { available: false, reason: 'check-failed', message };
    }
  }

  /** 立即退出并安装已下载的更新。 */
  quitAndInstall(): void {
    try {
      autoUpdater.quitAndInstall();
    } catch {
      /* 无已下载更新时忽略 */
    }
  }

  /**
   * 平台可行性判定（T0-3）：
   * - macOS 未签名 → 自动更新功能挂起；
   * - Linux 仅 AppImage 受 electron-updater 接管（deb/rpm 走系统包管理器）。
   */
  private unsupportedReason(): UpdateStatus | null {
    if (process.platform === 'darwin' && process.env.KMASTER_UPDATER_MACOS_SIGNED !== '1') {
      return {
        available: false,
        reason: 'unsigned-macos',
        message: 'macOS 自动更新需要签名与公证，请前往官网手动下载新版本',
      };
    }
    if (process.platform === 'linux' && !process.env.APPIMAGE) {
      return {
        available: false,
        reason: 'unsupported-platform',
        message: '非 AppImage 安装包请使用系统包管理器更新',
      };
    }
    return null;
  }

  /** 平台是否支持自动更新（供 UI 决定是否展示「检查更新」按钮）。 */
  isSupportedPlatform(): boolean {
    return this.unsupportedReason() === null;
  }
}

/**
 * `UpdateInfo.releaseNotes` 的真实类型是 `string | ReleaseNoteInfo[] | null | undefined`
 * （`fullChangelog: true` 时为分段数组），统一压成纯文本供 UI 展示。
 */
function toNotes(notes: UpdateInfo['releaseNotes']): string | undefined {
  if (!notes) return undefined;
  if (typeof notes === 'string') return notes;
  const text = notes
    .map((entry) => entry.note ?? '')
    .filter((note) => note.length > 0)
    .join('\n');
  return text.length > 0 ? text : undefined;
}
