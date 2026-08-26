import { describe, it, expect, vi } from 'vitest'
import { McpJobStore } from './jobs.js'
import { MCP_JOB_DONE, MCP_JOB_FAILED, MCP_JOB_RUNNING } from '../constants.js'

const OWNER = '7:'
const OTHER_OWNER = '7:4'

function pending() {
  let resolve
  let reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('McpJobStore', () => {
  it('returns the answer when the run settles inside the wait window', async () => {
    const jobs = new McpJobStore({ waitMs: 1000 })

    const runId = jobs.start(OWNER, async () => 'The answer.')

    expect(await jobs.wait(runId, OWNER)).toEqual({
      status: MCP_JOB_DONE,
      answer: 'The answer.',
      error: null,
      progress: null,
    })
  })

  it('reports the run as still running when the wait window expires first', async () => {
    const jobs = new McpJobStore({ waitMs: 5 })
    const run = pending()

    const runId = jobs.start(OWNER, () => run.promise)
    const snapshot = await jobs.wait(runId, OWNER)

    expect(snapshot.status).toBe(MCP_JOB_RUNNING)
    expect(snapshot.answer).toBeNull()

    run.resolve('Late answer.')
  })

  it('keeps a run alive past the wait window, so a later wait collects the answer', async () => {
    const jobs = new McpJobStore({ waitMs: 5 })
    const run = pending()

    const runId = jobs.start(OWNER, () => run.promise)
    expect((await jobs.wait(runId, OWNER)).status).toBe(MCP_JOB_RUNNING)

    run.resolve('The answer.')

    expect(await jobs.wait(runId, OWNER)).toMatchObject({ status: MCP_JOB_DONE, answer: 'The answer.' })
  })

  it('reports a run that threw as failed, carrying the error', async () => {
    const jobs = new McpJobStore({ waitMs: 1000 })

    const runId = jobs.start(OWNER, async () => {
      throw new Error('pg: connection refused')
    })
    const snapshot = await jobs.wait(runId, OWNER)

    expect(snapshot.status).toBe(MCP_JOB_FAILED)
    expect(snapshot.error.message).toBe('pg: connection refused')
  })

  it('reports a run that threw synchronously as failed', async () => {
    const jobs = new McpJobStore({ waitMs: 1000 })

    const runId = jobs.start(OWNER, () => {
      throw new Error('bad wiring')
    })

    expect((await jobs.wait(runId, OWNER)).status).toBe(MCP_JOB_FAILED)
  })

  it('hands nothing to a credential that does not own the run', async () => {
    const jobs = new McpJobStore({ waitMs: 1000 })

    const runId = jobs.start(OWNER, async () => 'The answer.')

    expect(await jobs.wait(runId, OTHER_OWNER)).toBeNull()
  })

  it('returns nothing for an unknown run', async () => {
    const jobs = new McpJobStore({ waitMs: 1000 })

    expect(await jobs.wait('11111111-1111-4111-8111-111111111111', OWNER)).toBeNull()
  })

  it('carries the last progress message of a run that is still going', async () => {
    const jobs = new McpJobStore({ waitMs: 5 })
    const run = pending()
    let report

    const runId = jobs.start(OWNER, (_signal, onProgress) => {
      report = onProgress
      return run.promise
    })
    report('Consulting search_code...')
    const snapshot = await jobs.wait(runId, OWNER)

    expect(snapshot).toMatchObject({ status: MCP_JOB_RUNNING, progress: 'Consulting search_code...' })

    run.resolve('The answer.')
  })

  it('relays progress reported before the first wait to the listener given at the start', async () => {
    const jobs = new McpJobStore({ waitMs: 5 })
    const run = pending()
    const listener = vi.fn()

    const runId = jobs.start(
      OWNER,
      (_signal, onProgress) => {
        onProgress('Consulting search_code...')
        return run.promise
      },
      listener
    )

    expect(listener).toHaveBeenCalledWith('Consulting search_code...')

    run.resolve('The answer.')
    await jobs.wait(runId, OWNER)
  })

  it('relays progress to the listener waiting on the run', async () => {
    const jobs = new McpJobStore({ waitMs: 20 })
    const run = pending()
    const listener = vi.fn()
    let report

    const runId = jobs.start(OWNER, (_signal, onProgress) => {
      report = onProgress
      return run.promise
    })
    const waiting = jobs.wait(runId, OWNER, listener)
    report('Consulting search_code...')
    run.resolve('The answer.')
    await waiting

    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith('Consulting search_code...')
  })

  it('stops relaying progress to a listener that already stopped waiting', async () => {
    const jobs = new McpJobStore({ waitMs: 5 })
    const run = pending()
    const listener = vi.fn()
    let report

    const runId = jobs.start(OWNER, (_signal, onProgress) => {
      report = onProgress
      return run.promise
    })
    await jobs.wait(runId, OWNER, listener)
    report('Consulting search_code...')

    expect(listener).not.toHaveBeenCalled()

    run.resolve('The answer.')
  })

  it('aborts a run that outlives the run timeout', async () => {
    const jobs = new McpJobStore({ waitMs: 1000, runTimeoutMs: 5 })
    let runSignal

    const runId = jobs.start(OWNER, signal => {
      runSignal = signal
      return new Promise(resolve => {
        signal.addEventListener('abort', () => resolve('Stopped early.'))
      })
    })

    expect(await jobs.wait(runId, OWNER)).toMatchObject({ status: MCP_JOB_DONE, answer: 'Stopped early.' })
    expect(runSignal.aborted).toBe(true)
  })

  it('refuses to start more runs than a user is allowed to have in flight', async () => {
    const jobs = new McpJobStore({ waitMs: 5, maxPerUser: 1 })
    const run = pending()

    jobs.start(OWNER, () => run.promise)

    expect(() => jobs.start(OWNER, async () => 'Second.')).toThrow(/in flight/)
    expect(() => jobs.start(OTHER_OWNER, async () => 'Theirs.')).not.toThrow()

    run.resolve('The answer.')
  })

  it('lets a user start another run once the previous one settled', async () => {
    const jobs = new McpJobStore({ waitMs: 1000, maxPerUser: 1 })

    const runId = jobs.start(OWNER, async () => 'The answer.')
    await jobs.wait(runId, OWNER)

    expect(() => jobs.start(OWNER, async () => 'Second.')).not.toThrow()
  })

  it('sweeps settled runs out of the registry when the next one starts', async () => {
    const jobs = new McpJobStore({ waitMs: 1000, ttlMs: 0 })

    const runId = jobs.start(OWNER, async () => 'The answer.')
    await jobs.wait(runId, OWNER)
    jobs.start(OWNER, async () => 'The next answer.')

    expect(jobs.jobs.has(runId)).toBe(false)
  })

  it('forgets a settled run once its retention window has passed', async () => {
    const jobs = new McpJobStore({ waitMs: 1000, ttlMs: 0 })

    const runId = jobs.start(OWNER, async () => 'The answer.')
    await jobs.wait(runId, OWNER)

    expect(await jobs.wait(runId, OWNER)).toBeNull()
  })
})
