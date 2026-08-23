import { renderMermaid } from 'beautiful-mermaid'
import { MERMAID_RENDER_COLORS } from '../constants.js'

const MERMAID_PRE_RE = /<pre[^>]*class=(?:"mermaid"|'mermaid')[^>]*>([\s\S]*?)<\/pre>/gi
const MERMAID_CODE_RE =
  /<pre[^>]*>\s*<code[^>]*class=(?:"[^"]*language-mermaid[^"]*"|'[^']*language-mermaid[^']*')[^>]*>([\s\S]*?)<\/code>\s*<\/pre>/gi
const CODE_TAG_RE = /^\s*<code[^>]*>|<\/code>\s*$/g
const ENTITY_RE = /&(?:lt|gt|quot|#39|amp);/g

const ENTITIES = { '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&amp;': '&' }

function decodeEntities(source) {
  return source.replace(ENTITY_RE, entity => ENTITIES[entity])
}

async function renderBlock(block, source) {
  const chart = decodeEntities(source.replace(CODE_TAG_RE, '')).trim()

  try {
    const svg = await renderMermaid(chart, MERMAID_RENDER_COLORS)
    return `<div class="mermaid-diagram">${svg}</div>`
  } catch (err) {
    console.error('Failed to render an artifact mermaid diagram:', err.message)
    return block
  }
}

export async function inlineArtifactMermaid(html) {
  if (!html.includes('mermaid')) return html

  let result = html

  for (const pattern of [MERMAID_PRE_RE, MERMAID_CODE_RE]) {
    for (const match of [...result.matchAll(pattern)]) {
      const replacement = await renderBlock(match[0], match[1])
      result = result.replace(match[0], () => replacement)
    }
  }

  return result
}
