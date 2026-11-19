import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { createServer } from 'http';
import fs from 'fs';

const env = loadEnv('', process.cwd(), '');
const apiUrl = env.VITE_API_URL || 'http://localhost:5000';
const devPort = parseInt(env.VITE_DEV_PORT || '3001', 10);
const basePath = env.VITE_BASE_PATH || '/';

// SPA fallback: refresh on any client route must serve index.html so the
// router can take over instead of returning 404.
function spaFallback() {
  const indexHtml = fs.readFileSync('index.html', 'utf8');
  return {
    name: 'spa-fallback',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const accept = req.headers.accept || '';
        if (req.method === 'GET' && accept.includes('text/html') && !req.url.startsWith('/api')) {
          res.statusCode = 200;
          res.setHeader('content-type', 'text/html');
          return res.end(indexHtml);
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), spaFallback()],
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
