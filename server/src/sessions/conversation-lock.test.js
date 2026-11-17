import { describe, it, expect } from 'vitest'
import { _countConversationLocksForTests, withConversationLock } from './conversation-lock.js'

function deferred() {
  let resolve
  let reject
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function flush() {
  return new Promise(resolve => setImmediate(resolve))
}

describe('withConversationLock', () => {
  it('returns what the task returns', async () => {
    expect(await withConversationLock('c1', async () => 'done')).toBe('done')
  })

  it('runs the tasks of one conversation one after another, in the order they arrived', async () => {
    const order = []
    const gate = deferred()

    const first = withConversationLock('c1', async () => {
      order.push('first:start')
      await gate.promise
      order.push('first:end')
    })
    const second = withConversationLock('c1', async () => {
      order.push('second')
    })
    await flush()

    expect(order).toEqual(['first:start'])

    gate.resolve()
    await Promise.all([first, second])

    expect(order).toEqual(['first:start', 'first:end', 'second'])
  })

  it('lets different conversations run at the same time', async () => {
    const gate = deferred()
    const order = []

    const blocked = withConversationLock('c1', async () => {
      await gate.promise
      order.push('c1')
    })
    await withConversationLock('c2', async () => {
      order.push('c2')
    })

    expect(order).toEqual(['c2'])

    gate.resolve()
    await blocked
  })

  it('keeps the queue going after a task fails, and rejects only that task', async () => {
    const failing = withConversationLock('c1', async () => {
      throw new Error('boom')
    })
    const next = withConversationLock('c1', async () => 'next')

    await expect(failing).rejects.toThrow('boom')
    expect(await next).toBe('next')
  })

  it('rejects when the task throws synchronously', async () => {
    const result = withConversationLock('c1', () => {
      throw new Error('sync boom')
    })

    await expect(result).rejects.toThrow('sync boom')
  })

  it('forgets a conversation once its queue has drained', async () => {
    const gate = deferred()
    const first = withConversationLock('c1', () => gate.promise)
    const second = withConversationLock('c1', async () => 'second')

    expect(_countConversationLocksForTests()).toBe(1)

    gate.resolve()
    await Promise.all([first, second])
    await flush()

    expect(_countConversationLocksForTests()).toBe(0)
  })
})
