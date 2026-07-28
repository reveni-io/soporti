const CACHE_READ_KEY = 'cached_tokens'
const CACHE_WRITE_KEY = 'cache_write_tokens'

function sumDetail(details, key) {
  if (!Array.isArray(details)) return 0

  return details.reduce((total, entry) => total + (entry?.[key] ?? 0), 0)
}

export function formatUsage(usage) {
  if (!usage) return null

  const requests = usage.requests ?? 0
  const inputTokens = usage.inputTokens ?? 0
  const outputTokens = usage.outputTokens ?? 0
  const cacheRead = sumDetail(usage.inputTokensDetails, CACHE_READ_KEY)
  const cacheWrite = sumDetail(usage.inputTokensDetails, CACHE_WRITE_KEY)

  if (requests === 0 && inputTokens === 0 && outputTokens === 0) return null

  const parts = [`${requests} req`, `in ${inputTokens}`, `out ${outputTokens}`]
  if (cacheWrite > 0) parts.push(`cache write ${cacheWrite}`)
  if (inputTokens > 0) parts.push(`cache read ${cacheRead} (${Math.round((cacheRead / inputTokens) * 100)}%)`)

  return parts.join(' · ')
}
