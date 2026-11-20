import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const envDir = fileURLToPath(new URL('..', import.meta.url))

const SERVICE_WORKER_SOURCE = fileURLToPath(new URL('src/sw.js', import.meta.url))
const SERVICE_WORKER_FILE = 'sw.js'
const BUILD_ID_PLACEHOLDER = '__SOPORTI_BUILD_ID__'
const BUILD_ID_LENGTH = 12

function hashFileNames(bundle) {
  const fileNames = Object.keys(bundle).sort().join('\n')

  return createHash('sha256').update(fileNames).digest('hex').slice(0, BUILD_ID_LENGTH)
}

function emitServiceWorker() {
  return {
    name: 'soporti-service-worker',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const source = readFileSync(SERVICE_WORKER_SOURCE, 'utf8')

      this.emitFile({
        type: 'asset',
        fileName: SERVICE_WORKER_FILE,
        source: source.replace(BUILD_ID_PLACEHOLDER, hashFileNames(bundle)),
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, envDir)
  return {
    plugins: [react(), emitServiceWorker()],
    envDir,
    define: {
      'import.meta.env.VITE_API_URL': JSON.stringify(env.VITE_API_URL || ''),
    },
    server: {
      host: true,
      port: 5173,
      watch: env.VITE_USE_POLLING === 'true' ? { usePolling: true, interval: 300 } : undefined,
      proxy: {
        '/api': {
          target: env.VITE_PROXY_TARGET || 'http://localhost:3001',
          changeOrigin: true,
        },
        '/.well-known/oauth-': {
          target: env.VITE_PROXY_TARGET || 'http://localhost:3001',
          changeOrigin: true,
        },
      },
    },
  }
})
