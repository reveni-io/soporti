import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// The project's single .env lives at the repo root (see .env.example), not in
// client/, so point Vite's env loading there.
const envDir = fileURLToPath(new URL('..', import.meta.url))

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, envDir)
  return {
    plugins: [react()],
    envDir,
    define: {
      // VITE_API_URL is only set on split deployments (static client + separate
      // API origin). Default to '' so same-origin setups (dev proxy, docker,
      // nginx) work without a client/.env file.
      'import.meta.env.VITE_API_URL': JSON.stringify(env.VITE_API_URL || ''),
    },
    server: {
      host: true,
      port: 5173,
      proxy: {
        '/api': {
          target: env.VITE_PROXY_TARGET || 'http://localhost:3001',
          changeOrigin: true,
        },
      },
    },
  }
})
