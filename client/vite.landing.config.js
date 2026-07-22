import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/*
 * Standalone build of just the public marketing landing page, for GitHub Pages.
 *
 * `base: './'` keeps every asset URL relative to the HTML file, so the SAME
 * bundle works unchanged whether it is served from a project-page subpath
 * (https://<org>.github.io/soporti/) or from a custom domain root
 * (https://soporti.reveni.com/). The landing is a single page with only in-page
 * hash anchors, so there is no history-API routing that a relative base breaks.
 *
 * Input is `landing.html` (renders src/landing.jsx). GitHub Pages serves
 * `index.html` at the directory root, so the tiny plugin below renames the
 * emitted HTML from landing.html to index.html.
 */
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
