import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';

const env = loadEnv('', process.cwd(), '');
const apiUrl = env.VITE_API_URL || 'http://localhost:5000';
const devPort = parseInt(env.VITE_DEV_PORT || '3001', 10);
const basePath = env.VITE_BASE_PATH || '/';

export default defineConfig({
  plugins: [react()],
  base: basePath,
  server: {
    port: devPort,
    proxy: {
      '/api': {
        target: apiUrl,
        changeOrigin: true,
      },
    },
  },
});
