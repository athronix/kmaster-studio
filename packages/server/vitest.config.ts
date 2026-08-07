import { defineConfig } from 'vitest/config';

// 服务端单测配置（A2）：纯 Node 环境，不需要 DOM，也不需要 vue 插件。
// vitest 由 npm workspaces 提升到根 node_modules，**不新增任何依赖**。
export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts'],
    // 与 client 保持一致：沙箱对 node_modules/.vite 写缓存无权限，关闭结果缓存避免 EPERM
    cache: false,
  },
});
