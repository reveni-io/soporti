const LIKE_SPECIAL_CHARS_RE = /[\\%_]/g
const WHITESPACE_RE = /\s+/g
const SNIPPET_CONTEXT_CHARS = 40
const SNIPPET_ELLIPSIS = '…'

export function toContainsPattern(query) {
  return `%${query.replace(LIKE_SPECIAL_CHARS_RE, '\\$&')}%`
}

export function buildSnippet(text, query) {
  const flat = text.replace(WHITESPACE_RE, ' ').trim()
  const matchIndex = Math.max(flat.toLowerCase().indexOf(query.toLowerCase()), 0)
  const start = Math.max(matchIndex - SNIPPET_CONTEXT_CHARS, 0)
  const end = Math.min(matchIndex + query.length + SNIPPET_CONTEXT_CHARS, flat.length)

  const prefix = start > 0 ? SNIPPET_ELLIPSIS : ''
  const suffix = end < flat.length ? SNIPPET_ELLIPSIS : ''

  return `${prefix}${flat.slice(start, end).trim()}${suffix}`
}
