const REDACTED = '[redacted]'

const TOKEN_PATTERNS = [
  /-----BEGIN[A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END[A-Z ]*PRIVATE KEY-----|$)/g,
  /\bshp(?:at|ss|ca|pa)_[A-Za-z0-9]{16,}\b/g,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bsk-[A-Za-z0-9_-]{20,}\b/g,
  /\b[rs]k_(?:live|test)_[A-Za-z0-9]{16,}\b/g,
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
]

const URL_CREDENTIALS = /\b([a-z][a-z0-9+.-]*):\/\/[^\s/:@]+:[^\s@]+@/gi

export function redactSecrets(text) {
  if (typeof text !== 'string' || text.length === 0) return text

  let result = text
  for (const pattern of TOKEN_PATTERNS) {
    result = result.replace(pattern, REDACTED)
  }
  return result.replace(URL_CREDENTIALS, `$1://${REDACTED}@`)
}
