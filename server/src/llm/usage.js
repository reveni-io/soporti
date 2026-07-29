const CACHE_READ_KEY = 'cached_tokens'
const CACHE_WRITE_KEY = 'cache_write_tokens'

function sumDetail(details, key) {
  if (!Array.isArray(details)) return 0

  return details.reduce((total, entry) => total + (entry?.[key] ?? 0), 0)
}

export function extractUsage(usage) {
  if (!usage) return null

  return {
    requests: usage.requests ?? 0,
    inputTokens: usage.inputTokens ?? 0,
    outputTokens: usage.outputTokens ?? 0,
    cachedInputTokens: sumDetail(usage.inputTokensDetails, CACHE_READ_KEY),
    cacheWriteTokens: sumDetail(usage.inputTokensDetails, CACHE_WRITE_KEY),
  }
}

export function formatUsage(usage) {
  const extracted = extractUsage(usage)
  if (!extracted) return null

  const { requests, inputTokens, outputTokens, cachedInputTokens, cacheWriteTokens } = extracted

  if (requests === 0 && inputTokens === 0 && outputTokens === 0) return null

  const parts = [`${requests} req`, `in ${inputTokens}`, `out ${outputTokens}`]
  if (cacheWriteTokens > 0) parts.push(`cache write ${cacheWriteTokens}`)
  if (inputTokens > 0) {
    const hitRate = Math.round((cachedInputTokens / inputTokens) * 100)
    parts.push(`cache read ${cachedInputTokens} (${hitRate}%)`)
  }

  return parts.join(' · ')
}
