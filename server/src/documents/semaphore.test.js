import { describe, it, expect } from 'vitest'
import { createSemaphore } from './semaphore.js'

describe('createSemaphore', () => {
  it('hands out up to max slots without waiting', async () => {
    const semaphore = createSemaphore(2)

    const first = await semaphore.acquire()
    const second = await semaphore.acquire()

    expect(typeof first).toBe('function')
    expect(typeof second).toBe('function')
  })

  it('queues an acquire beyond max until a slot is released', async () => {
    const semaphore = createSemaphore(1)
    const order = []

    const release = await semaphore.acquire()
    const queued = semaphore.acquire().then(() => order.push('queued'))

    order.push('first')
    release()
    await queued

    expect(order).toEqual(['first', 'queued'])
  })

  it('never runs more than max at a time', async () => {
    const semaphore = createSemaphore(2)
    let running = 0
    let peak = 0

    async function work() {
      const release = await semaphore.acquire()
      running++
      peak = Math.max(peak, running)
      await Promise.resolve()
      running--
      release()
    }

    await Promise.all([work(), work(), work(), work(), work()])

    expect(peak).toBe(2)
  })
})
