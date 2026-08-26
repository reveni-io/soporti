const FENCED_CODE_RE = /```[\s\S]*?```/g
const IMAGE_RE = /!\[[^\]]*\]\([^)]*\)/g
const CITATION_RE = /`[^`\n]*`|\[([^\]]*)\]\(\s*(https?:\/\/[^\s)]+?)\s*(?:"[^"]*")?\s*\)|(https?:\/\/[^\s<>"')\]]+)/g
const TRAILING_PUNCTUATION_RE = /[.,;:!?]+$/
const WWW_PREFIX_RE = /^www\./
const EMPHASIS_RE = /[*`]/g

const HOST_SOURCES = [
  ['github.com', 'github'],
  ['docs.google.com', 'google-drive'],
  ['drive.google.com', 'google-drive'],
  ['notion.so', 'notion'],
  ['notion.site', 'notion'],
  ['sentry.io', 'sentry'],
  ['shortcut.com', 'shortcut'],
  ['myshopify.com', 'shopify'],
  ['shopify.com', 'shopify'],
  ['slack.com', 'slack'],
  ['betterstack.com', 'betterstack'],
]

export function extractCitations(markdown) {
  const prose = stripNonProse(markdown)
  const citations = []
  const seen = new Set()

  for (const [, label, linkUrl, bareUrl] of prose.matchAll(CITATION_RE)) {
    const url = linkUrl || bareUrl?.replace(TRAILING_PUNCTUATION_RE, '') || ''
    const host = hostOf(url)

    if (!host || seen.has(url)) continue

    seen.add(url)
    citations.push({ url, title: titleOf(label, url, host), host, source: sourceOf(host) })
  }

  return citations
}

function stripNonProse(markdown) {
  return String(markdown || '')
    .replace(FENCED_CODE_RE, ' ')
    .replace(IMAGE_RE, ' ')
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(WWW_PREFIX_RE, '')
  } catch {
    return ''
  }
}

function titleOf(label, url, host) {
  const clean = String(label || '')
    .replace(EMPHASIS_RE, '')
    .trim()

  if (clean) return clean

  return lastPathSegment(url) || host
}

function lastPathSegment(url) {
  const segments = new URL(url).pathname.split('/').filter(Boolean)

  return segments[segments.length - 1] || ''
}

function sourceOf(host) {
  const match = HOST_SOURCES.find(([suffix]) => host === suffix || host.endsWith(`.${suffix}`))

  return match ? match[1] : ''
}
