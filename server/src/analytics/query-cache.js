const ANALYTICS_CACHE_TTL_MS = 5 * 60_000
const MAX_CACHED_RESULTS = 100

const results = new Map()
const executions = new Map()
let generation = 0

export function readCachedResult(sql) {
  const entry = results.get(sql)
  if (!entry) return null
  if (entry.expiresAt > Date.now()) return entry.result

  results.delete(sql)

  return null
}

function storeResult(sql, result) {
  results.delete(sql)
  if (results.size >= MAX_CACHED_RESULTS) results.delete(results.keys().next().value)

  results.set(sql, { result, expiresAt: Date.now() + ANALYTICS_CACHE_TTL_MS })

  return result
}

export function executeShared(sql, execute) {
  const running = executions.get(sql)
  if (running) return running

  const startedIn = generation
  const execution = Promise.resolve()
    .then(execute)
    .then(result => (startedIn === generation ? storeResult(sql, result) : result))
    .finally(() => {
      if (executions.get(sql) === execution) executions.delete(sql)
    })
  executions.set(sql, execution)

  return execution
}

export function clearQueryCache() {
  generation += 1
  results.clear()
  executions.clear()
}
