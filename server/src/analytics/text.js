const WHITESPACE_RE = /\s+/g
const ELLIPSIS = '…'

export function shortenText(text, maxLength) {
  const flat = text.replace(WHITESPACE_RE, ' ').trim()
  if (flat.length <= maxLength) return flat

  return `${flat.slice(0, maxLength - ELLIPSIS.length).trimEnd()}${ELLIPSIS}`
}
