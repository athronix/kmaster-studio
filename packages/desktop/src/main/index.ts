/**
 * Electron 主进程入口（TECHNICAL-SOLUTION-M5 §2.3 / §4.1）
 *
 * 职责边界（桌面层为旁路薄壳，不参与业务分层）：
 *   窗口创建（1440×900 / 最小 1024×720 / 状态持久化）→ 启动占位页 → ensureServer()
 *   → loadURL(http://localhost:6648) → 延迟 5s 检查更新 → 退出时清理进程树。
 *
 * 硬约束（NFR-M5-5，🚫 不得放宽）：
 *   webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, preload }
 */
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  screen,
  shell,
  Tray,
  type Event as ElectronEvent,
  type HandlerDetails,
  type IpcMainEvent,
  type WindowOpenHandlerResponse,
} from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import {
  ServerProcessManager,
  ServerStartTimeoutError,
  DEFAULT_PORT,
  type ServerStatus,
} from './server-process';
import { WindowStateStore, MIN_WINDOW_WIDTH, MIN_WINDOW_HEIGHT } from './window-state';
import { Updater, type UpdateStatus } from './updater';

/** IPC 通道名（与 preload/index.ts 一一对应，改名必须同步）。 */
export const IPC = {
  SERVER_STATUS: 'kmaster:server-status',
  UPDATE_STATUS: 'kmaster:update-status',
  WINDOW_CONTROL: 'kmaster:window-control',
  RETRY_SERVER: 'kmaster:retry-server',
  CHECK_UPDATES: 'kmaster:check-updates',
  // V3/#19：调起原生文件夹选择对话框（会话级 workspace 绑定用）。
  PICK_FOLDER: 'kmaster:pick-folder',
} as const;

const UPDATE_CHECK_DELAY_MS = 5_000;
/** 窗口状态写盘防抖：resize/move 每秒可触发数十次，逐次同步写盘会拖慢拖拽。 */
const WINDOW_STATE_DEBOUNCE_MS = 400;
/** 启动占位页 / 错误页（FR-D7），随 tsc 产物由 scripts/copy-assets.mjs 复制到 dist/main/。 */
const LOADING_PAGE = path.join(__dirname, 'loading.html');

// V3/#25：系统托盘相关常量。
/** 托盘图标路径。开发期从仓库根 build/icon.png 加载；打包后由 electron-builder
 *  把 `build/icon.png` 拷贝到 `process.resourcesPath/build/icon.png`（electron-builder
 *  的 `extraResources` 默认拷贝整个 build/ 目录）。两者都尝试，失败则退化到空图标。 */
const TRAY_ICON_CANDIDATES = [
  path.join(process.resourcesPath || '', 'build', 'icon.png'),
  path.join(__dirname, '../../build/icon.png'),
  path.join(__dirname, '../build/icon.png'),
  path.join(app.getAppPath(), 'build', 'icon.png'),
];
/** 托盘 hover tooltip。 */
const TRAY_TOOLTIP = 'kmaster-studio';

let mainWindow: BrowserWindow | null = null;
let serverManager: ServerProcessManager | null = null;
let updater: Updater | null = null;
let windowState: WindowStateStore | null = null;
let bootstrapping = false;
let updateCheckScheduled = false;
let quitting = false;
// V3/#25：托盘实例。仅创建一次；app.quit() 时显式 destroy() 以释放系统资源。
let tray: Tray | null = null;

/** 向渲染进程播报 server 启动状态（loading.html 消费）。 */
function broadcastServerStatus(status: ServerStatus): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(IPC.SERVER_STATUS, status);
  }
}

/** 当前窗口是否停在占位页（判断是否需要先导航回去才能显示错误 UI）。 */
function isOnLoadingPage(win: BrowserWindow): boolean {
  return win.webContents.getURL().endsWith('/loading.html');
}

/**
 * 展示失败态（FR-D7）。
 * ⚠️ 必须先把窗口导航回 loading.html 再播报：`loadURL` 失败后窗口停在 Chromium 的
 * 默认错误页（对用户等同白屏），此时 `webContents.send` 发给的是那张页面，重试按钮永远出不来。
 */
async function showFailure(status: ServerStatus): Promise<void> {
  const win = mainWindow;
  if (!win || win.isDestroyed()) return;
  if (!isOnLoadingPage(win)) {
    try {
      await win.loadFile(LOADING_PAGE);
    } catch {
      /* 占位页都加载不了时只能放弃 UI 兜底，状态仍会写日志 */
    }
  }
  if (!win.isDestroyed()) win.webContents.send(IPC.SERVER_STATUS, status);
}

function broadcastUpdateStatus(status: UpdateStatus): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(IPC.UPDATE_STATUS, status);
  }
}

/**
 * V3/#25：创建系统托盘。
 *
 * 行为契约：
 *   - 左键单击：切换主窗口显示（不可见则显示并聚焦，已可见则隐藏）；
 *   - 双击：在 Windows / Linux 上等同于左键单击的「显示并聚焦」语义；
 *   - 右键菜单：「显示窗口」/「退出」（macOS 习惯把 quit 显式列出，避免 Cmd+Q 被吞）。
 *
 * 设计约束（NFR-M5-7：进程清理有序）：
 *   - 关闭主窗口 ≠ 退出 app，统一走 hide 而非 close；
 *   - 真正的退出由「托盘菜单 → 退出」或 `app.on('before-quit')` 触发，标志位 `quitting = true`。
 *   - 托盘实例在 app 退出前显式 destroy()，否则 Windows 下 tray 残留到 explorer 异常。
 */
function createTray(): void {
  if (tray) return; // 幂等：测试 HMR / 多次启动只建一个
  // 尝试从多个候选路径加载图标；都失败则 fallback 到 nativeImage.createEmpty()——
  // 后者在多数平台仍能渲染出托盘入口（空图标），不至于完全没托盘。
  let icon: Electron.NativeImage = nativeImage.createEmpty();
  for (const candidate of TRAY_ICON_CANDIDATES) {
    try {
      if (fs.existsSync(candidate)) {
        icon = nativeImage.createFromPath(candidate);
        if (!icon.isEmpty()) break;
      }
    } catch {
      /* 跳过单个候选路径，继续尝试 */
    }
  }
  tray = new Tray(icon);
  tray.setToolTip(TRAY_TOOLTIP);
  rebuildTrayMenu();

  // macOS 上 click 也走菜单更符合用户习惯；Windows / Linux 上单击即显示/隐藏窗口。
  tray.on('click', () => toggleMainWindow());
  // Windows / Linux 上双击 = 强制显示并聚焦。
  tray.on('double-click', () => showAndFocusMainWindow());
}

/** 重建托盘右键菜单（每次菜单打开时重画，避免引用过期闭包）。 */
function rebuildTrayMenu(): void {
  if (!tray) return;
  const menu = Menu.buildFromTemplate([
    {
      label: '显示窗口',
      click: () => showAndFocusMainWindow(),
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        quitting = true;
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(menu);
}

/** 切换主窗口可见性（不可见 → 显示并聚焦；已可见 → 隐藏）。 */
function toggleMainWindow(): void {
  const win = mainWindow;
  if (!win || win.isDestroyed()) return;
  if (win.isVisible() && !win.isMinimized()) {
    win.hide();
  } else {
    showAndFocusMainWindow();
  }
}

/** 把主窗口拉到前台并获取焦点。最小化时先 restore 再 focus，避免「可见但被最小化覆盖」。 */
function showAndFocusMainWindow(): void {
  const win = mainWindow;
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  if (!win.isVisible()) win.show();
  win.focus();
}

/** V3/#25：托盘兜底。app 退出时必须销毁 Tray，否则 Windows 上 explorer 偶发残留。 */
function destroyTray(): void {
  if (tray) {
    try { tray.destroy(); } catch { /* ignore */ }
    tray = null;
  }
}

function createWindow(): BrowserWindow {
  const userDataDir = app.getPath('userData');
  windowState = new WindowStateStore(userDataDir);
  const workArea = screen.getPrimaryDisplay().workArea;
  const state = windowState.load(workArea);

  const win = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: MIN_WINDOW_WIDTH,
    minHeight: MIN_WINDOW_HEIGHT,
    show: false,
    backgroundColor: '#141414',
    title: 'kmaster studio',
    // FR-D10/D11 自定义标题栏与托盘保持 P1，M5 用原生标题栏
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      // NFR-M5-5 硬约束，🚫 不得放宽
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // 渲染进程通过 http://localhost:6648 同源访问 server，无需放开 webSecurity
      webSecurity: true,
      additionalArguments: [`--kmaster-app-version=${app.getVersion()}`],
    },
  });

  if (state.maximized) win.maximize();
  win.once('ready-to-show', () => win.show());

  // 外链一律交给系统默认浏览器（终端 addon-web-links 点击 URL 也走这里）
  win.webContents.setWindowOpenHandler(({ url }: HandlerDetails): WindowOpenHandlerResponse => {
    if (/^https?:/i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });

  const persist = (): void => {
    if (!windowState || win.isDestroyed()) return;
    const bounds = win.isMaximized() ? win.getNormalBounds() : win.getBounds();
    windowState.save({ ...bounds, maximized: win.isMaximized() });
  };
  let persistTimer: NodeJS.Timeout | null = null;
  const persistDebounced = (): void => {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(persist, WINDOW_STATE_DEBOUNCE_MS);
  };
  win.on('resize', persistDebounced);
  win.on('move', persistDebounced);
  // 关闭时必须同步落盘：进程随后就退出，防抖定时器不会再被执行
  win.on('close', (event: ElectronEvent) => {
    // V3/#25：关闭主窗口 ≠ 退出 app。点击窗口右上角 × 应最小化到托盘，
    // 由用户在托盘菜单显式选择「退出」才真正退出。
    // 通过 `quitting` 标志区分「用户主动退出」（before-quit 会置 true）与
    // 「普通窗口关闭」（继续走 hide 分支）。
    if (!quitting) {
      event.preventDefault();
      // 仍要把窗口状态（大小/位置）落盘一次——resize/move 防抖里的 timer 可能赶不上
      if (persistTimer) {
        clearTimeout(persistTimer);
        persistTimer = null;
      }
      persist();
      win.hide();
      return;
    }
    // 真正退出路径：同步落盘，再让 close 自然完成
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }
    persist();
  });
  win.on('closed', () => {
    mainWindow = null;
  });

  // SPA 主框架加载失败（server 中途挂掉 / 连接被拒）时回落到错误页，避免 Chromium 默认错误页（FR-D7）
  win.webContents.on(
    'did-fail-load',
    (_event: ElectronEvent, errorCode: number, errorDescription: string, validatedURL: string, isMainFrame: boolean) => {
      // -3 = ERR_ABORTED，通常来自主动导航打断，不是真失败
      if (!isMainFrame || errorCode === -3) return;
      if (validatedURL.endsWith('/loading.html')) return;
      void showFailure({
        phase: 'failed',
        message: `页面加载失败（${errorDescription || errorCode}）：${validatedURL}`,
        port: resolvePort(),
        log_path: serverManager?.logPath() ?? '',
      });
    },
  );

  return win;
}

/** 端口来源单一化，避免多处重复读 env。 */
function resolvePort(): number {
  return Number(process.env.PORT ?? DEFAULT_PORT);
}

/**
 * 启动 server 并加载 SPA。失败时停留在 loading.html 的错误页（含日志路径 + 重试按钮，FR-D7）。
 */
async function bootstrapServer(): Promise<void> {
  if (bootstrapping) return;
  bootstrapping = true;
  try {
    if (!serverManager) {
      serverManager = new ServerProcessManager({
        port: resolvePort(),
        onStatus: broadcastServerStatus,
      });
    }
    const handle = await serverManager.ensureServer();
    if (mainWindow && !mainWindow.isDestroyed()) {
      await mainWindow.loadURL(handle.url);
    }
    scheduleUpdateCheck();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await showFailure({
      phase: 'failed',
      message:
        err instanceof ServerStartTimeoutError
          ? `server 启动超时（30s）。${message}`
          : `server 启动失败：${message}`,
      port: resolvePort(),
      log_path: serverManager?.logPath() ?? '',
    });
  } finally {
    bootstrapping = false;
  }
}

/** 延迟检查更新，不阻塞首屏（方案 §4.1）。只排一次，重试启动不重复排期。 */
function scheduleUpdateCheck(): void {
  if (updateCheckScheduled) return;
  updateCheckScheduled = true;
  if (!updater) {
    updater = new Updater({ onStatus: broadcastUpdateStatus });
    updater.init();
  }
  setTimeout(() => {
    void updater?.checkForUpdates().then(broadcastUpdateStatus);
  }, UPDATE_CHECK_DELAY_MS);
}

function registerIpc(): void {
  // action 来自渲染进程，视为不可信输入：用 unknown 接收并逐值判等，非白名单值静默忽略。
  ipcMain.on(IPC.WINDOW_CONTROL, (_event: IpcMainEvent, action: unknown) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (action === 'minimize') mainWindow.minimize();
    else if (action === 'maximize') {
      if (mainWindow.isMaximized()) mainWindow.unmaximize();
      else mainWindow.maximize();
    } else if (action === 'close') mainWindow.close();
  });

  ipcMain.handle(IPC.RETRY_SERVER, async () => {
    await bootstrapServer();
    return true;
  });

  ipcMain.handle(IPC.CHECK_UPDATES, async (): Promise<UpdateStatus> => {
    if (!updater) {
      updater = new Updater({ onStatus: broadcastUpdateStatus });
      updater.init();
    }
    return updater.checkForUpdates();
  });

  // V3/#19：调起原生文件夹选择对话框，供会话级 workspace 绑定使用。
  // 取消时返回 null（preload 把它归一为 null，不抛错）；选中时返回绝对路径。
  // 默认从「上次选定的工作区」或用户主目录起跳，UX 友好。
  let lastPickedDir: string | undefined;
  ipcMain.handle(IPC.PICK_FOLDER, async (): Promise<string | null> => {
    if (!mainWindow || mainWindow.isDestroyed()) return null;
    const opts: Electron.OpenDialogOptions = {
      title: '选择工作区目录',
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: lastPickedDir,
    };
    const res = await dialog.showOpenDialog(mainWindow, opts);
    if (res.canceled || res.filePaths.length === 0) return null;
    lastPickedDir = res.filePaths[0];
    return lastPickedDir;
  });
}

// —— 单实例：第二次启动时聚焦已有窗口，避免重复拉起 server ——
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  void app.whenReady().then(async () => {
    registerIpc();
    mainWindow = createWindow();
    // V3/#25：必须在 createWindow 之后（托盘菜单回调里要 showAndFocusMainWindow），
    // 也必须在 bootstrapServer 之前（避免启动期间点托盘被空指针击穿）。
    createTray();
    await mainWindow.loadFile(LOADING_PAGE);
    void bootstrapServer();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = createWindow();
        void mainWindow.loadFile(LOADING_PAGE).then(() => bootstrapServer());
      }
    });
  });

  // V3/#25：默认行为（按方案 §4.1）——所有窗口都关了就 quit。
  // 但只要托盘存在，用户关闭窗口走的是 hide，不会触发这条路径；
  // 真正的退出由「托盘菜单 → 退出」或 Cmd/Ctrl+Q 触发，会经 will-quit / before-quit 走清理。
  app.on('window-all-closed', () => {
    app.quit();
  });

  // V3/#25：macOS 上 Cmd+Q 触发 before-quit，此时必须把 quitting 置 true，
  // 否则 createWindow 里 win.on('close') 会再 hide 一次，导致「点了退出却只是窗口消失」。
  app.on('before-quit', () => {
    quitting = true;
  });

  app.on('will-quit', (event: ElectronEvent) => {
    // V3/#25：托盘兜底——Windows 上若不显式 destroy，explorer 偶发残留旧托盘图标。
    destroyTray();
    const manager = serverManager;
    if (quitting || !manager) return;
    quitting = true;
    // 无条件走 stopServer()：它内部按 spawnedByMe 分流——自己拉起的杀进程树，
    // 复用的外部 server 一个字都不动（AC6），同时负责关掉日志流。
    // 🚫 不要在这里用 isSpawnedByMe() 提前 return：server 仍在 spawn 中途时该标志可能尚未置位，
    //    提前退出会把正在起来的子进程留成孤儿（NFR-M5-7）。
    event.preventDefault();
    serverManager = null;
    void manager
      .stopServer()
      .catch(() => undefined)
      .finally(() => app.quit());
  });
}
