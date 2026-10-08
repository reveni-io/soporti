import { describe, it, expect, vi, afterEach } from 'vitest'
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

    expect(queue.enqueue({ dedupeKey: 'repo#1@sha' })).toEqual({ accepted: true, superseded: false })
    expect(queue.enqueue({ dedupeKey: 'repo#1@sha' })).toEqual({ accepted: false, reason: 'in-flight' })

    gate.resolve()
    await tick()

    expect(queue.enqueue({ dedupeKey: 'repo#1@sha' })).toEqual({ accepted: true, superseded: false })
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

  it('hands each job an abort signal that starts unaborted', async () => {
    const processor = vi.fn(async () => {})
    const queue = new ReviewQueue({ processor })

    queue.enqueue({ dedupeKey: 'a' })
    await tick()

    expect(processor).toHaveBeenCalledTimes(1)
    expect(processor.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal)
    expect(processor.mock.calls[0][1].signal.aborted).toBe(false)
  })

  it('replaces a queued review of the same PR with the newer one', async () => {
    const gate = deferred()
    const processor = vi.fn(async job => {
      if (job.dedupeKey === 'busy') await gate.promise
    })
    const queue = new ReviewQueue({ processor })

    queue.enqueue({ dedupeKey: 'busy' })
    queue.enqueue({ dedupeKey: 'repo#1@old', supersedeKey: 'repo#1' })
    const result = queue.enqueue({ dedupeKey: 'repo#1@new', supersedeKey: 'repo#1' })

    expect(result).toEqual({ accepted: true, superseded: true })
    expect(queue.pendingCount()).toBe(2)

    gate.resolve()
    await tick()

    expect(processor.mock.calls.map(([job]) => job.dedupeKey)).toEqual(['busy', 'repo#1@new'])
    expect(queue.enqueue({ dedupeKey: 'repo#1@old', supersedeKey: 'repo#1' })).toEqual({
      accepted: true,
      superseded: false,
    })
  })

  it('aborts a running review of the same PR and runs the newer one once it stops', async () => {
    const order = []
    const processor = vi.fn((job, { signal }) => {
      order.push(`start:${job.dedupeKey}`)
      if (job.dedupeKey !== 'repo#1@old') return Promise.resolve()
      return new Promise(resolve => {
        signal.addEventListener('abort', () => {
          order.push('aborted:repo#1@old')
          resolve()
        })
      })
    })
    const queue = new ReviewQueue({ processor, concurrency: 2 })

    queue.enqueue({ dedupeKey: 'repo#1@old', supersedeKey: 'repo#1' })
    await tick()
    const result = queue.enqueue({ dedupeKey: 'repo#1@new', supersedeKey: 'repo#1' })

    expect(result).toEqual({ accepted: true, superseded: true })
    expect(order).toEqual(['start:repo#1@old', 'aborted:repo#1@old'])

    await tick()

    expect(order).toEqual(['start:repo#1@old', 'aborted:repo#1@old', 'start:repo#1@new'])
    expect(processor.mock.calls[1][1].signal.aborted).toBe(false)
  })

  it('never runs two reviews of the same PR at once, even with spare concurrency', async () => {
    const gate = deferred()
    const processor = vi.fn(() => gate.promise)
    const queue = new ReviewQueue({ processor, concurrency: 3 })

    queue.enqueue({ dedupeKey: 'repo#1@old', supersedeKey: 'repo#1' })
    await tick()
    queue.enqueue({ dedupeKey: 'repo#1@new', supersedeKey: 'repo#1' })
    queue.enqueue({ dedupeKey: 'repo#2@sha', supersedeKey: 'repo#2' })
    await tick()

    expect(processor.mock.calls.map(([job]) => job.dedupeKey)).toEqual(['repo#1@old', 'repo#2@sha'])

    gate.resolve()
    await tick()

    expect(processor.mock.calls.map(([job]) => job.dedupeKey)).toEqual(['repo#1@old', 'repo#2@sha', 'repo#1@new'])
  })

  it('leaves jobs without a supersede key, like mentions, untouched', async () => {
    const gate = deferred()
    const processor = vi.fn(() => gate.promise)
    const queue = new ReviewQueue({ processor, concurrency: 2 })

    queue.enqueue({ dedupeKey: 'repo#1@mention-1' })
    await tick()
    const result = queue.enqueue({ dedupeKey: 'repo#1@sha', supersedeKey: 'repo#1' })
    queue.enqueue({ dedupeKey: 'repo#1@mention-2' })
    await tick()

    expect(result).toEqual({ accepted: true, superseded: false })
    expect(processor.mock.calls[0][1].signal.aborted).toBe(false)
    expect(processor.mock.calls.map(([job]) => job.dedupeKey)).toEqual(['repo#1@mention-1', 'repo#1@sha'])

    gate.resolve()
    await tick()

    expect(processor).toHaveBeenCalledTimes(3)
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

  describe('delayed jobs', () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    it('waits for the delay before running a job', async () => {
      vi.useFakeTimers()
      const processor = vi.fn(async () => {})
      const queue = new ReviewQueue({ processor })

      const result = queue.enqueue({ dedupeKey: 'repo#1@a', supersedeKey: 'repo#1', delayMs: 1000 })
      await vi.advanceTimersByTimeAsync(999)

      expect(result).toEqual({ accepted: true, superseded: false })
      expect(processor).not.toHaveBeenCalled()
      expect(queue.pendingCount()).toBe(1)

      await vi.advanceTimersByTimeAsync(1)

      expect(processor).toHaveBeenCalledTimes(1)
      expect(processor.mock.calls[0][0]).toMatchObject({ dedupeKey: 'repo#1@a' })
      expect(queue.pendingCount()).toBe(0)
    })

    it('replaces a waiting job with a newer one for the same PR and restarts the wait', async () => {
      vi.useFakeTimers()
      const processor = vi.fn(async () => {})
      const queue = new ReviewQueue({ processor })

      queue.enqueue({ dedupeKey: 'repo#1@a', supersedeKey: 'repo#1', delayMs: 1000 })
      await vi.advanceTimersByTimeAsync(600)
      const result = queue.enqueue({ dedupeKey: 'repo#1@b', supersedeKey: 'repo#1', delayMs: 1000 })
      await vi.advanceTimersByTimeAsync(600)

      expect(result).toEqual({ accepted: true, superseded: true })
      expect(processor).not.toHaveBeenCalled()
      expect(queue.pendingCount()).toBe(1)

      await vi.advanceTimersByTimeAsync(400)

      expect(processor).toHaveBeenCalledTimes(1)
      expect(processor.mock.calls[0][0]).toMatchObject({ dedupeKey: 'repo#1@b' })

      await vi.advanceTimersByTimeAsync(5000)

      expect(processor).toHaveBeenCalledTimes(1)
    })

    it('lets an immediate job for the same PR replace a waiting one', async () => {
      vi.useFakeTimers()
      const processor = vi.fn(async () => {})
      const queue = new ReviewQueue({ processor })

      queue.enqueue({ dedupeKey: 'repo#1@a', supersedeKey: 'repo#1', delayMs: 1000 })
      const result = queue.enqueue({ dedupeKey: 'repo#1@b', supersedeKey: 'repo#1' })
      await vi.advanceTimersByTimeAsync(0)

      expect(result).toEqual({ accepted: true, superseded: true })
      expect(processor).toHaveBeenCalledTimes(1)
      expect(processor.mock.calls[0][0]).toMatchObject({ dedupeKey: 'repo#1@b' })

      await vi.advanceTimersByTimeAsync(5000)

      expect(processor).toHaveBeenCalledTimes(1)
    })

    it('lets a job with the same dedupe key replace a waiting one instead of rejecting it', async () => {
      vi.useFakeTimers()
      const processor = vi.fn(async () => {})
      const queue = new ReviewQueue({ processor })

      queue.enqueue({ dedupeKey: 'repo#1@a', kind: 'synchronize', delayMs: 1000 })
      const result = queue.enqueue({ dedupeKey: 'repo#1@a', kind: 'labeled' })
      await vi.advanceTimersByTimeAsync(5000)

      expect(result).toEqual({ accepted: true, superseded: true })
      expect(processor).toHaveBeenCalledTimes(1)
      expect(processor.mock.calls[0][0]).toMatchObject({ kind: 'labeled' })
    })

    it('aborts a running review of the same PR as soon as a delayed job arrives, then runs it after the wait', async () => {
      vi.useFakeTimers()
      const processor = vi.fn((job, { signal }) => {
        if (job.dedupeKey !== 'repo#1@old') return Promise.resolve()
        return new Promise(resolve => signal.addEventListener('abort', resolve))
      })
      const queue = new ReviewQueue({ processor })

      queue.enqueue({ dedupeKey: 'repo#1@old', supersedeKey: 'repo#1' })
      await vi.advanceTimersByTimeAsync(0)
      const result = queue.enqueue({ dedupeKey: 'repo#1@new', supersedeKey: 'repo#1', delayMs: 1000 })
      await vi.advanceTimersByTimeAsync(0)

      expect(result).toEqual({ accepted: true, superseded: true })
      expect(processor.mock.calls[0][1].signal.aborted).toBe(true)
      expect(processor).toHaveBeenCalledTimes(1)

      await vi.advanceTimersByTimeAsync(1000)

      expect(processor).toHaveBeenCalledTimes(2)
      expect(processor.mock.calls[1][0]).toMatchObject({ dedupeKey: 'repo#1@new' })
      expect(processor.mock.calls[1][1].signal.aborted).toBe(false)
    })

    it('rejects a duplicate of a delayed job once it has started running', async () => {
      vi.useFakeTimers()
      const gate = deferred()
      const queue = new ReviewQueue({ processor: () => gate.promise })

      queue.enqueue({ dedupeKey: 'repo#1@a', supersedeKey: 'repo#1', delayMs: 1000 })
      await vi.advanceTimersByTimeAsync(1000)

      expect(queue.enqueue({ dedupeKey: 'repo#1@a', supersedeKey: 'repo#1' })).toEqual({
        accepted: false,
        reason: 'in-flight',
      })
    })
  })
})
