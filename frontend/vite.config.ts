import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 3000,
    host: true,
    proxy: {
      '/api': {
        // Defaults to the host-exposed backend port for `npm run dev` on the
        // host; the Docker dev service overrides this to the service name
        // (`backend`) since containers don't share localhost with the host.
        target: process.env.VITE_DEV_API_PROXY_TARGET || 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
      }
    },
    watch: {
      // Docker bind mounts don't reliably forward host inotify events into
      // the container, so native fs-event watching silently misses edits
      // (Vite keeps serving a stale transform with no error). Polling is
      // opt-in via env — only the Docker dev service sets it; host-run
      // `npm run dev` gets real fs events and doesn't need the CPU cost.
      usePolling: process.env.VITE_DEV_USE_POLLING === 'true',
      interval: 300,
    }
  }
})
