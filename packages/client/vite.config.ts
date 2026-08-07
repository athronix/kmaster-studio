import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'node:path';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  server: {
    port: 6649,
    strictPort: true,
    // 本地 NekoBox 为 TUN 模式会拦截 127.0.0.1；用 localhost(→::1) 绕过代理直达本机服务
    proxy: {
      '/api': 'http://localhost:6648',
      '/socket.io': { target: 'http://localhost:6648', ws: true },
    },
  },
  build: {
    outDir: 'dist',
    // 本地安全删除垫片会拦截 vite 清空 dist 的 rm；CI/正常环境保持 true，本沙箱用 KMASTER_NO_EMPTY_DIST=1 跳过清理
    emptyOutDir: process.env.KMASTER_NO_EMPTY_DIST === '1' ? false : true,
  },
});
