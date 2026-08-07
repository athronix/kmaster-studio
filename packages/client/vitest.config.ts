import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';
import path from 'node:path';

// M1 单元测试配置：纯 reducer 测试在 node 环境即可（不依赖 DOM）
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  test: {
    environment: 'node',
    globals: true,
    // F19：必须同时匹配 .spec.ts —— 原先只写 .test.ts，导致 src/test/no-mock-guard.spec.ts
    // 这个「禁止 MOCK_ 符号」的守卫**从未被执行过**（设计基线 F19 的表述与实际不符，已上报）。
    include: ['src/**/*.{test,spec}.ts'],
    // 沙箱对 node_modules/.vite 写缓存无权限，关闭结果缓存避免 EPERM 导致非零退出
    cache: false,
  },
});
