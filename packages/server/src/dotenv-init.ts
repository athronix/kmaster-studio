// dotenv-init.ts —— 尽早加载项目 .env，使 HERMES_HOME / HERMES_BRIDGE_MOCK 等可从
// 「项目 .env 文件」读取（用户约定：HERMES_HOME 可来自项目 .env 文件或是环境变量）。
//
// ⚠️ 必须作为 index.ts 的第一个 import：run-chat.ts 在模块级即执行 createBridge()，
// 会读取 process.env.HERMES_BRIDGE_MOCK，故 .env 必须在其之前注入 process.env。
//
// dotenv 默认「不覆盖」已存在的环境变量，因此：shell 环境变量 > 项目 .env > 默认值。
import { config } from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// server 目录与仓库根目录的 .env 都尝试加载（后者不覆盖前者已设的变量）
config({ path: path.resolve(__dirname, '.env') });
config({ path: path.resolve(__dirname, '..', '..', '.env') });
