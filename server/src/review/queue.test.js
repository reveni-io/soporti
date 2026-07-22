import { describe, it, expect, vi } from 'vitest'
import { ReviewQueue } from './queue.js'

function deferred() {
  let resolve, reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const tick = () => new Promise(res => setImmediate(res))

describe('ReviewQueue', () => {
  it('requires a processor', () => {
    expect(() => new ReviewQueue({})).toThrow(/processor/)
  })

  it('processes jobs in FIFO order with concurrency 1', async () => {
    const order = []
    const gates = [deferred(), deferred()]
    const processor = vi.fn(async job => {
      order.push(`start:${job.dedupeKey}`)
      await gates[job.index].promise
      order.push(`end:${job.dedupeKey}`)
    })

    const queue = new ReviewQueue({ processor, concurrency: 1 })
    queue.enqueue({ dedupeKey: 'a', index: 0 })
    queue.enqueue({ dedupeKey: 'b', index: 1 })
    await tick()

    expect(order).toEqual(['start:a'])
    gates[0].resolve()
    await tick()
    expect(order).toEqual(['start:a', 'end:a', 'start:b'])
    gates[1].resolve()
    await tick()
    expect(order).toEqual(['start:a', 'end:a', 'start:b', 'end:b'])
  })

  it('rejects a duplicate dedupeKey while the job is queued or running', async () => {
    const gate = deferred()
    const queue = new ReviewQueue({ processor: () => gate.promise })

    expect(queue.enqueue({ dedupeKey: 'repo#1@sha' })).toEqual({ accepted: true })
    expect(queue.enqueue({ dedupeKey: 'repo#1@sha' })).toEqual({ accepted: false, reason: 'in-flight' })

    gate.resolve()
    await tick()

    expect(queue.enqueue({ dedupeKey: 'repo#1@sha' })).toEqual({ accepted: true })
  })

  it('keeps processing after a job fails', async () => {
    const onError = vi.fn()
    const processor = vi.fn(async job => {
      if (job.dedupeKey === 'boom') throw new Error('exploded')
      return 'ok'
    })

    const queue = new ReviewQueue({ processor, onError })
    queue.enqueue({ dedupeKey: 'boom' })
    queue.enqueue({ dedupeKey: 'fine' })
    await tick()

    expect(processor).toHaveBeenCalledTimes(2)
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError.mock.calls[0][0].message).toBe('exploded')
  })

  it('runs jobs in parallel up to the concurrency limit', async () => {
    const gateA = deferred()
    const gateB = deferred()
    const running = new Set()
    const processor = vi.fn(async job => {
      running.add(job.dedupeKey)
      await (job.dedupeKey === 'a' ? gateA.promise : gateB.promise)
      running.delete(job.dedupeKey)
    })

    const queue = new ReviewQueue({ processor, concurrency: 2 })
    queue.enqueue({ dedupeKey: 'a' })
    queue.enqueue({ dedupeKey: 'b' })
    await tick()

    expect(running).toEqual(new Set(['a', 'b']))
    gateA.resolve()
    gateB.resolve()
    await tick()
    expect(queue.pendingCount()).toBe(0)
  })

  it('falls back to serial processing when concurrency is not a finite number', async () => {
    const processor = vi.fn(async () => {})
    const queue = new ReviewQueue({ processor, concurrency: NaN })
    queue.enqueue({ dedupeKey: 'a' })
    await tick()
    expect(processor).toHaveBeenCalledTimes(1)
  })

  it('rejects jobs without a dedupeKey', () => {
    const queue = new ReviewQueue({ processor: async () => {} })
    expect(queue.enqueue({})).toEqual({ accepted: false, reason: 'invalid-job' })
    expect(queue.enqueue(null)).toEqual({ accepted: false, reason: 'invalid-job' })
  })

  it('survives an onError callback that throws', async () => {
    const queue = new ReviewQueue({
      processor: async () => {
        throw new Error('job error')
      },
      onError: () => {
        throw new Error('handler error')
      },
    })
    queue.enqueue({ dedupeKey: 'x' })
    queue.enqueue({ dedupeKey: 'y' })
    await tick()
    expect(queue.pendingCount()).toBe(0)
  })
})
