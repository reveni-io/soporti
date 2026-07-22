// Last line of defense against prompt-injection exfiltration:
// everything the review pipeline publishes on GitHub passes through here
// first, so even a successfully manipulated agent cannot post a credential.
// Patterns target well-known credential formats; ordinary hex (commit shas,
// ids) must never match.
const REDACTED = '[redacted]'

const TOKEN_PATTERNS = [
  /-----BEGIN[A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END[A-Z ]*PRIVATE KEY-----|$)/g,
  /\bshp(?:at|ss|ca|pa)_[A-Za-z0-9]{16,}\b/g, // Shopify
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, // GitHub classic tokens
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, // GitHub fine-grained PATs
  /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g, // Slack
  /\bAKIA[0-9A-Z]{16}\b/g, // AWS access key ids
  /\bsk-[A-Za-z0-9_-]{20,}\b/g, // OpenAI-style keys
  /\b[rs]k_(?:live|test)_[A-Za-z0-9]{16,}\b/g, // Stripe-style keys
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, // JWTs
]

// Credentials inside URLs (postgres://user:pass@host/db): mask only the
// credential pair so the host stays readable.
const URL_CREDENTIALS = /\b([a-z][a-z0-9+.-]*):\/\/[^\s/:@]+:[^\s@]+@/gi

export function redactSecrets(text) {
  if (typeof text !== 'string' || text.length === 0) return text

  let result = text
  for (const pattern of TOKEN_PATTERNS) {
    result = result.replace(pattern, REDACTED)
  }
  return result.replace(URL_CREDENTIALS, `$1://${REDACTED}@`)
}
