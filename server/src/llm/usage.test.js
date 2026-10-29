import { describe, it, expect } from 'vitest'
import { extractUsage, formatUsage, sumUsage } from './usage.js'

describe('extractUsage', () => {
  it('returns the counters the run reported, with the cache details summed', () => {
    const usage = extractUsage({
      requests: 2,
      inputTokens: 1000,
      outputTokens: 50,
      inputTokensDetails: [
        { cached_tokens: 200, cache_write_tokens: 100 },
        { cached_tokens: 300, cache_write_tokens: 50 },
      ],
    })

    expect(usage).toEqual({
      requests: 2,
      inputTokens: 1000,
      outputTokens: 50,
      cachedInputTokens: 500,
      cacheWriteTokens: 150,
    })
  })

  it('defaults every missing counter to zero', () => {
    expect(extractUsage({})).toEqual({
      requests: 0,
      inputTokens: 0,
      outputTokens: 0,
      cachedInputTokens: 0,
      cacheWriteTokens: 0,
    })
  })

  it('returns null when there is no usage', () => {
    expect(extractUsage(null)).toBeNull()
    expect(extractUsage(undefined)).toBeNull()
  })
})

describe('formatUsage', () => {
  it('reports requests, input and output tokens', () => {
    const line = formatUsage({ requests: 3, inputTokens: 48210, outputTokens: 1204 })

    expect(line).toContain('3 req')
    expect(line).toContain('in 48210')
    expect(line).toContain('out 1204')
  })

  it('sums the cache details across every request of the run', () => {
    const line = formatUsage({
      requests: 2,
      inputTokens: 1000,
      outputTokens: 50,
      inputTokensDetails: [
        { cached_tokens: 200, cache_write_tokens: 100 },
        { cached_tokens: 300, cache_write_tokens: 50 },
      ],
    })

    expect(line).toContain('cache write 150')
    expect(line).toContain('cache read 500 (50%)')
  })

  it('reports a zero hit rate so a cache that never engages is visible', () => {
    const line = formatUsage({ requests: 1, inputTokens: 900, outputTokens: 20 })

    expect(line).toContain('cache read 0 (0%)')
  })

  it('omits the cache write segment when nothing was written', () => {
    const line = formatUsage({
      requests: 1,
      inputTokens: 900,
      outputTokens: 20,
      inputTokensDetails: [{ cached_tokens: 900 }],
    })

    expect(line).not.toContain('cache write')
    expect(line).toContain('cache read 900 (100%)')
  })

  it('omits the cache read segment when no input tokens were counted', () => {
    const line = formatUsage({ requests: 1, inputTokens: 0, outputTokens: 20 })

    expect(line).toBe('1 req · in 0 · out 20')
  })

  it('returns null when there is no usage to report', () => {
    expect(formatUsage(null)).toBeNull()
    expect(formatUsage(undefined)).toBeNull()
    expect(formatUsage({})).toBeNull()
    expect(formatUsage({ requests: 0, inputTokens: 0, outputTokens: 0 })).toBeNull()
  })

  it('tolerates details that are not an array or carry unrelated keys', () => {
    expect(formatUsage({ requests: 1, inputTokens: 100, outputTokens: 5, inputTokensDetails: {} })).toContain(
      'cache read 0 (0%)'
    )
    expect(
      formatUsage({ requests: 1, inputTokens: 100, outputTokens: 5, inputTokensDetails: [null, { other: 7 }] })
    ).toContain('cache read 0 (0%)')
  })
})

describe('sumUsage', () => {
  const MAIN = { requests: 2, inputTokens: 1000, outputTokens: 300, cachedInputTokens: 800, cacheWriteTokens: 100 }
  const NESTED = { requests: 1, inputTokens: 400, outputTokens: 90, cachedInputTokens: 0, cacheWriteTokens: 50 }

  it('adds what a nested run cost to the main run, counter by counter', () => {
    expect(sumUsage([MAIN, NESTED])).toEqual({
      requests: 3,
      inputTokens: 1400,
      outputTokens: 390,
      cachedInputTokens: 800,
      cacheWriteTokens: 150,
    })
  })

  it('returns the only entry unchanged when nothing was nested', () => {
    expect(sumUsage([MAIN])).toEqual(MAIN)
  })

  it('skips the runs that reported no usage at all', () => {
    expect(sumUsage([MAIN, null, undefined])).toEqual(MAIN)
  })

  it('returns null when there is nothing to report', () => {
    expect(sumUsage([])).toBeNull()
    expect(sumUsage([null])).toBeNull()
    expect(sumUsage(null)).toBeNull()
  })
})
