import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const APP_MANIFEST_FILE = 'manifest.webmanifest'

function emitHtmlAsIndex() {
  return {
    name: 'landing-html-as-index',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const html = bundle['landing.html']
      if (html) {
        html.fileName = 'index.html'
      }
    },
  }
}

function dropAppManifest() {
  return {
    name: 'landing-drop-app-manifest',
    async writeBundle(options) {
      await rm(join(options.dir, APP_MANIFEST_FILE), { force: true })
    },
  }
}

export default defineConfig({
  base: './',
  plugins: [react(), emitHtmlAsIndex(), dropAppManifest()],
  build: {
    outDir: 'dist-landing',
    emptyOutDir: true,
    rollupOptions: {
      input: 'landing.html',
    },
  },
})
