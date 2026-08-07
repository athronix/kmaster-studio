// 构建后置步骤：把 tsc 不处理的静态资源（loading.html 等）复制到 dist，保持目录结构一致。
// 主进程用 path.join(__dirname, 'loading.html') 定位，因此必须落到 dist/main/ 下。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const pkgRoot = path.resolve(here, '..');

/** 需要复制的资源：[相对 src 的路径] */
const ASSETS = ['main/loading.html'];

let copied = 0;
for (const rel of ASSETS) {
  const from = path.join(pkgRoot, 'src', rel);
  const to = path.join(pkgRoot, 'dist', rel);
  if (!fs.existsSync(from)) {
    console.warn(`[copy-assets] 跳过（源文件不存在）：${rel}`);
    continue;
  }
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(from, to);
  copied += 1;
}
console.log(`[copy-assets] 已复制 ${copied}/${ASSETS.length} 个静态资源到 dist/`);
