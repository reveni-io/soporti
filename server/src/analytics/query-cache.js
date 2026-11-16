const ANALYTICS_CACHE_TTL_MS = 5 * 60_000
const MAX_CACHED_RESULTS = 100

const results = new Map()
const executions = new Map()
let generation = 0

export function readCachedResult(key) {
  const entry = results.get(key)
  if (!entry) return null
  if (entry.expiresAt > Date.now()) return entry.result

  results.delete(key)

  return null
}

function storeResult(key, result) {
  results.delete(key)
  if (results.size >= MAX_CACHED_RESULTS) results.delete(results.keys().next().value)

  results.set(key, { result, expiresAt: Date.now() + ANALYTICS_CACHE_TTL_MS })

  return result
}

export function executeShared(key, execute) {
  const running = executions.get(key)
  if (running) return running

  const startedIn = generation
  const execution = Promise.resolve()
    .then(execute)
    .then(result => (startedIn === generation ? storeResult(key, result) : result))
    .finally(() => {
      if (executions.get(key) === execution) executions.delete(key)
    })
  executions.set(key, execution)

  return execution
}

export function clearQueryCache() {
  generation += 1
  results.clear()
  executions.clear()
}
