import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { clearQueryCache, executeShared, readCachedResult } from './query-cache.js'

const SQL = 'SELECT week, returns FROM weekly_returns'
const TTL_MS = 5 * 60_000
const MAX_ENTRIES = 100

function result(label) {
  return { columns: [{ name: 'label', kind: 'text' }], rows: [{ label }], truncated: false }
}

function deferred() {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })

  return { promise, resolve, reject }
}

async function store(sql, value) {
  return executeShared(sql, async () => value)
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-11-12T10:00:00.000Z'))
  clearQueryCache()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('readCachedResult', () => {
  it('returns nothing for a query that was never executed', () => {
    expect(readCachedResult(SQL)).toBeNull()
  })

  it('returns the result of an execution until its five minutes are over', async () => {
    const first = result('first')
    await store(SQL, first)

    expect(readCachedResult(SQL)).toBe(first)

    vi.advanceTimersByTime(TTL_MS - 1)
    expect(readCachedResult(SQL)).toBe(first)
  })

  it('forgets a result once it is five minutes old', async () => {
    await store(SQL, result('first'))

    vi.advanceTimersByTime(TTL_MS)

    expect(readCachedResult(SQL)).toBeNull()
  })

  it('serves the next execution after a result expired', async () => {
    await store(SQL, result('first'))
    vi.advanceTimersByTime(TTL_MS)
    expect(readCachedResult(SQL)).toBeNull()

    const second = await store(SQL, result('second'))

    expect(readCachedResult(SQL)).toBe(second)
  })

  it('keys results by the exact text of the query', async () => {
    await store(SQL, result('first'))

    expect(readCachedResult(`${SQL} `)).toBeNull()
    expect(readCachedResult(SQL.toLowerCase())).toBeNull()
  })
})

describe('executeShared', () => {
  it('runs the query even when a result is cached, and replaces it', async () => {
    const execute = vi.fn(async () => result('second'))
    await store(SQL, result('first'))

    const fresh = await executeShared(SQL, execute)

    expect(execute).toHaveBeenCalledTimes(1)
    expect(fresh).toEqual(result('second'))
    expect(readCachedResult(SQL)).toBe(fresh)
  })

  it('restarts the five minutes of a result that is replaced', async () => {
    await store(SQL, result('first'))
    vi.advanceTimersByTime(TTL_MS - 1)
    await store(SQL, result('second'))

    vi.advanceTimersByTime(TTL_MS - 1)

    expect(readCachedResult(SQL)).toEqual(result('second'))
  })

  it('shares one execution between callers that ask for the same query at the same time', async () => {
    const pending = deferred()
    const execute = vi.fn(() => pending.promise)
    const other = vi.fn(async () => result('other'))

    const first = executeShared(SQL, execute)
    const second = executeShared(SQL, other)
    pending.resolve(result('shared'))

    expect(await first).toEqual(result('shared'))
    expect(await second).toBe(await first)
    expect(execute).toHaveBeenCalledTimes(1)
    expect(other).not.toHaveBeenCalled()
  })

  it('runs different queries side by side', async () => {
    const [first, second] = await Promise.all([store('SELECT 1', result(1)), store('SELECT 2', result(2))])

    expect(first).toEqual(result(1))
    expect(second).toEqual(result(2))
  })

  it('executes again once the shared execution has finished', async () => {
    const execute = vi.fn(async () => result('again'))
    await store(SQL, result('first'))

    await executeShared(SQL, execute)
    await executeShared(SQL, execute)

    expect(execute).toHaveBeenCalledTimes(2)
  })

  it('rejects every waiting caller when the execution fails, and caches nothing', async () => {
    const failure = new Error('syntax error')
    const pending = deferred()

    const first = executeShared(SQL, () => pending.promise)
    const second = executeShared(SQL, async () => result('never'))
    pending.reject(failure)

    await expect(first).rejects.toBe(failure)
    await expect(second).rejects.toBe(failure)
    expect(readCachedResult(SQL)).toBeNull()
  })

  it('retries after a failure instead of handing out the failed execution', async () => {
    const failure = new Error('connection lost')
    await expect(executeShared(SQL, async () => Promise.reject(failure))).rejects.toBe(failure)

    const retried = await store(SQL, result('retried'))

    expect(retried).toEqual(result('retried'))
    expect(readCachedResult(SQL)).toBe(retried)
  })

  it('retries after an execution that throws before it returns a promise', async () => {
    const failure = new Error('thrown at once')
    const thrower = () => {
      throw failure
    }
    await expect(executeShared(SQL, thrower)).rejects.toBe(failure)

    expect(await store(SQL, result('retried'))).toEqual(result('retried'))
  })

  it('keeps the previous result when a later execution fails', async () => {
    const first = await store(SQL, result('first'))

    await expect(executeShared(SQL, async () => Promise.reject(new Error('timeout')))).rejects.toThrow('timeout')

    expect(readCachedResult(SQL)).toBe(first)
  })

  it('evicts the oldest result when a new query arrives at the limit of 100', async () => {
    for (let index = 0; index < MAX_ENTRIES; index += 1) await store(`SELECT ${index}`, result(index))
    expect(readCachedResult('SELECT 0')).toEqual(result(0))

    await store('SELECT 100', result(100))

    expect(readCachedResult('SELECT 0')).toBeNull()
    expect(readCachedResult('SELECT 1')).toEqual(result(1))
    expect(readCachedResult('SELECT 100')).toEqual(result(100))
  })

  it('counts a result that was replaced as the newest, and evicts nothing to replace it', async () => {
    for (let index = 0; index < MAX_ENTRIES; index += 1) await store(`SELECT ${index}`, result(index))

    await store('SELECT 0', result('replaced'))
    expect(readCachedResult('SELECT 1')).toEqual(result(1))

    await store('SELECT 100', result(100))

    expect(readCachedResult('SELECT 0')).toEqual(result('replaced'))
    expect(readCachedResult('SELECT 1')).toBeNull()
    expect(readCachedResult('SELECT 2')).toEqual(result(2))
  })
})

describe('clearQueryCache', () => {
  it('empties the cache', async () => {
    await store(SQL, result('first'))

    clearQueryCache()

    expect(readCachedResult(SQL)).toBeNull()
  })

  it('does not keep the result of a query that was still running when the cache was cleared', async () => {
    const pending = deferred()
    const execution = executeShared(SQL, () => pending.promise)

    clearQueryCache()
    pending.resolve(result('from the previous database'))

    await expect(execution).resolves.toEqual(result('from the previous database'))
    expect(readCachedResult(SQL)).toBeNull()
  })

  it('runs a query again after a clear instead of joining the one that was running before it', async () => {
    const stale = deferred()
    const execute = vi.fn(async () => result('from the new database'))
    const staleExecution = executeShared(SQL, () => stale.promise)

    clearQueryCache()
    const fresh = await executeShared(SQL, execute)
    stale.resolve(result('from the previous database'))
    await staleExecution

    expect(execute).toHaveBeenCalledTimes(1)
    expect(fresh).toEqual(result('from the new database'))
    expect(readCachedResult(SQL)).toEqual(result('from the new database'))
  })
})
