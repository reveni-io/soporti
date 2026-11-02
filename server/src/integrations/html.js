const TAG_RE = /<[^>]*>/g
const WHITESPACE_RE = /\s+/g
const HTML_ENTITIES = [
  [/&nbsp;/g, ' '],
  [/&amp;/g, '&'],
  [/&lt;/g, '<'],
  [/&gt;/g, '>'],
  [/&quot;/g, '"'],
  [/&#39;/g, "'"],
]

function decodeEntities(text) {
  return HTML_ENTITIES.reduce((decoded, [pattern, replacement]) => decoded.replace(pattern, replacement), text)
}

export function stripHtml(html) {
  if (!html) return ''

  const text = decodeEntities(html.replace(TAG_RE, ''))

  return text.replace(WHITESPACE_RE, ' ').trim()
}
