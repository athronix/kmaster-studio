/**
 * 窗口尺寸/位置持久化（写 `userData/window-state.json`）。
 *
 * 🚫 明令禁止引入 `electron-store` / `conf`（方案 §6.2）—— 手写即可。
 * ⚠️ 本文件**不 import electron**：userData 目录与显示器工作区由调用方（main/index.ts）注入，
 *    因此在 electron 未安装的 web-first 阶段也能通过 tsc，并且天然可单测。
 */
import fs from 'node:fs';
import path from 'node:path';

/** 默认窗口尺寸（方案 §2.3：1440×900 / 最小 1024×720）。 */
export const DEFAULT_WINDOW_WIDTH = 1440;
export const DEFAULT_WINDOW_HEIGHT = 900;
export const MIN_WINDOW_WIDTH = 1024;
export const MIN_WINDOW_HEIGHT = 720;

export interface WindowBounds {
  x?: number;
  y?: number;
  width: number;
  height: number;
  maximized: boolean;
}

/** 显示器可用工作区（由 electron `screen.getPrimaryDisplay().workArea` 注入）。 */
export interface WorkArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const DEFAULT_WINDOW_STATE: WindowBounds = {
  width: DEFAULT_WINDOW_WIDTH,
  height: DEFAULT_WINDOW_HEIGHT,
  maximized: false,
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

export class WindowStateStore {
  private readonly file: string;

  /**
   * @param userDataDir Electron 的 `app.getPath('userData')`
   * @param fileName 状态文件名
   */
  constructor(userDataDir: string, fileName = 'window-state.json') {
    this.file = path.join(userDataDir, fileName);
  }

  get filePath(): string {
    return this.file;
  }

  /**
   * 读取上次窗口状态并做合法性收敛：
   * - 尺寸不小于最小值、不大于工作区；
   * - 位置必须在工作区内可见，否则丢弃坐标交由 Electron 居中。
   */
  load(workArea?: WorkArea): WindowBounds {
    const raw = this.readRaw();
    const state: WindowBounds = { ...DEFAULT_WINDOW_STATE };

    if (isFiniteNumber(raw.width)) state.width = Math.round(raw.width);
    if (isFiniteNumber(raw.height)) state.height = Math.round(raw.height);
    state.maximized = raw.maximized === true;

    const maxW = workArea ? workArea.width : Number.MAX_SAFE_INTEGER;
    const maxH = workArea ? workArea.height : Number.MAX_SAFE_INTEGER;
    state.width = clamp(state.width, MIN_WINDOW_WIDTH, Math.max(MIN_WINDOW_WIDTH, maxW));
    state.height = clamp(state.height, MIN_WINDOW_HEIGHT, Math.max(MIN_WINDOW_HEIGHT, maxH));

    if (isFiniteNumber(raw.x) && isFiniteNumber(raw.y)) {
      const x = Math.round(raw.x);
      const y = Math.round(raw.y);
      if (!workArea || this.isVisible(x, y, state.width, state.height, workArea)) {
        state.x = x;
        state.y = y;
      }
    }
    return state;
  }

  /** 持久化窗口状态；写失败静默忽略（不能因为存不下窗口尺寸就影响退出）。 */
  save(bounds: Partial<WindowBounds>): void {
    const payload: WindowBounds = {
      width: isFiniteNumber(bounds.width) ? Math.round(bounds.width) : DEFAULT_WINDOW_WIDTH,
      height: isFiniteNumber(bounds.height) ? Math.round(bounds.height) : DEFAULT_WINDOW_HEIGHT,
      maximized: bounds.maximized === true,
    };
    if (isFiniteNumber(bounds.x)) payload.x = Math.round(bounds.x);
    if (isFiniteNumber(bounds.y)) payload.y = Math.round(bounds.y);

    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(payload, null, 2), 'utf8');
      fs.renameSync(tmp, this.file);
    } catch {
      /* 窗口状态属尽力而为，失败不上抛 */
    }
  }

  /** 窗口至少要有一部分落在工作区内，否则会「打开在看不见的地方」。 */
  private isVisible(x: number, y: number, width: number, height: number, area: WorkArea): boolean {
    const overlapX = Math.min(x + width, area.x + area.width) - Math.max(x, area.x);
    const overlapY = Math.min(y + height, area.y + area.height) - Math.max(y, area.y);
    return overlapX > 80 && overlapY > 40;
  }

  private readRaw(): Partial<WindowBounds> {
    try {
      const text = fs.readFileSync(this.file, 'utf8');
      const parsed: unknown = JSON.parse(text);
      if (parsed && typeof parsed === 'object') return parsed as Partial<WindowBounds>;
    } catch {
      /* 首次运行 / 文件损坏 → 用默认值 */
    }
    return {};
  }
}
