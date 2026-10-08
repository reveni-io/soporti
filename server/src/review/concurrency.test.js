import { describe, it, expect, vi } from 'vitest'
import { mapWithConcurrency } from './concurrency.js'

describe('mapWithConcurrency', () => {
  it('maps every item and keeps the results in the input order', async () => {
    const results = await mapWithConcurrency([30, 10, 20], 2, async delay => {
      await new Promise(resolve => setTimeout(resolve, delay))
      return delay * 2
    })

    expect(results).toEqual([60, 20, 40])
  })

  it('never runs more items at once than the limit', async () => {
    const pending = []
    const mapItem = vi.fn(() => new Promise(resolve => pending.push(resolve)))

    const mapping = mapWithConcurrency([1, 2, 3, 4, 5], 2, mapItem)
    await vi.waitFor(() => expect(mapItem).toHaveBeenCalledTimes(2))
    pending.splice(0).forEach(resolve => resolve('done'))
    await vi.waitFor(() => expect(mapItem).toHaveBeenCalledTimes(4))
    pending.splice(0).forEach(resolve => resolve('done'))
    await vi.waitFor(() => expect(mapItem).toHaveBeenCalledTimes(5))
    pending.splice(0).forEach(resolve => resolve('done'))

    expect(await mapping).toEqual(['done', 'done', 'done', 'done', 'done'])
    expect(mapItem.mock.calls.map(([item]) => item)).toEqual([1, 2, 3, 4, 5])
  })

  it('returns an empty list for no items', async () => {
    expect(await mapWithConcurrency([], 4, async item => item)).toEqual([])
  })

  it('rejects with the first error', async () => {
    const failure = new Error('boom')

    await expect(
      mapWithConcurrency([1, 2], 2, async item => {
        if (item === 2) throw failure
        return item
      })
    ).rejects.toBe(failure)
  })
})
