import { createElement } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism'

const LANGUAGE_RE = /language-(\w+)/
const APP_RENDERED_LANGUAGES = ['mermaid', 'chart', 'csv']

function highlightedMarkup(code, language) {
  const host = document.createElement('div')
  const root = createRoot(host)

  try {
    flushSync(() => root.render(createElement(SyntaxHighlighter, { language, style: oneLight }, code)))
    return host.querySelector('code')?.innerHTML ?? null
  } finally {
    root.unmount()
  }
}

export function highlightArtifactCode(html) {
  if (!html.includes('language-')) return html

  const doc = new DOMParser().parseFromString(html, 'text/html')
  const nodes = [...doc.querySelectorAll('pre > code[class*="language-"]')]
  let changed = false

  for (const node of nodes) {
    const language = LANGUAGE_RE.exec(node.className)?.[1]
    if (!language || APP_RENDERED_LANGUAGES.includes(language)) continue

    const markup = highlightedMarkup(node.textContent.replace(/\n$/, ''), language)
    if (!markup) continue

    node.innerHTML = markup
    changed = true
  }

  if (!changed) return html

  return doc.head.innerHTML + doc.body.innerHTML
}
