/**
 * useWorkspacePicker — 统一的工作区目录选择器。
 *
 * 桌面端（Electron）：直接调 `pickFolder()` 走原生文件夹对话框。
 * Web 端：弹 `DirPickerModal` 目录树选择器，经组件层模板渲染。
 *
 * 用法（组件层）：
 * ```ts
 * const picker = useWorkspacePicker();
 * const picked = await picker.open(currentPath); // string | null（null=取消）
 * ```
 * 模板中放置：
 * ```html
 * <DirPickerModal
 *   :show="picker.show"
 *   :initial-path="picker.initialPath"
 *   @select="picker.resolve"
 *   @close="picker.cancel"
 * />
 * ```
 *
 * 这样所有「目录选择」都收敛到本 composable，全仓不再有任何手动粘贴入口。
 */
import { ref, type Ref } from 'vue';
import { isDesktop, pickFolder } from '../utils/desktop-bridge';

export interface WorkspacePicker {
  /** Web 端是否显示 DirPickerModal */
  show: Ref<boolean>;
  /** DirPickerModal 的起始目录 */
  initialPath: Ref<string>;
  /** 打开选择器；桌面端直接返回 pickFolder 结果，Web 端弹 Modal 并返回 promise */
  open(initialPath?: string): Promise<string | null>;
  /** Web 端 DirPickerModal 选中回调 */
  resolve(path: string): void;
  /** Web 端 DirPickerModal 取消回调 */
  cancel(): void;
}

export function useWorkspacePicker(): WorkspacePicker {
  const show = ref(false);
  const initialPath = ref('');
  let resolver: ((value: string | null) => void) | null = null;

  async function open(initial?: string): Promise<string | null> {
    initialPath.value = initial ?? '';
    if (isDesktop()) {
      // 桌面端：原生对话框，取消时 pickFolder 返回 null
      return (await pickFolder()) ?? null;
    }
    // Web 端：弹目录树选择器，待用户确认/取消后 resolve
    return new Promise<string | null>((resolve) => {
      resolver = resolve;
      show.value = true;
    });
  }

  function resolve(path: string): void {
    show.value = false;
    resolver?.(path);
    resolver = null;
  }

  function cancel(): void {
    show.value = false;
    resolver?.(null);
    resolver = null;
  }

  return { show, initialPath, open, resolve, cancel };
}
