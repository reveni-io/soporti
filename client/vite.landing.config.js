import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

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

export default defineConfig({
  base: './',
  plugins: [react(), emitHtmlAsIndex()],
  build: {
    outDir: 'dist-landing',
    emptyOutDir: true,
    rollupOptions: {
      input: 'landing.html',
    },
  },
})
