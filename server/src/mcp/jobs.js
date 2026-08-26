import { randomUUID } from 'node:crypto'
import {
  MCP_JOB_DONE,
  MCP_JOB_FAILED,
  MCP_JOB_RETENTION_MS,
  MCP_JOB_RUNNING,
  MCP_JOB_RUN_TIMEOUT_MS,
  MCP_JOB_WAIT_MS,
  MCP_MAX_JOBS_PER_USER,
} from '../constants.js'

function delay(ms) {
  let timer
  const promise = new Promise(resolve => {
    timer = setTimeout(resolve, ms)
    timer.unref?.()
  })

  return { promise, cancel: () => clearTimeout(timer) }
}

export class McpJobStore {
  constructor({
    waitMs = MCP_JOB_WAIT_MS,
    runTimeoutMs = MCP_JOB_RUN_TIMEOUT_MS,
    ttlMs = MCP_JOB_RETENTION_MS,
    maxPerUser = MCP_MAX_JOBS_PER_USER,
  } = {}) {
    this.waitMs = waitMs
    this.runTimeoutMs = runTimeoutMs
    this.ttlMs = ttlMs
    this.maxPerUser = maxPerUser
    this.jobs = new Map()
  }

  start(owner, run, onProgress) {
    if (this._sweepAndCount(owner) >= this.maxPerUser) {
      throw new Error(`Owner ${owner} already has ${this.maxPerUser} questions in flight.`)
    }

    const runId = randomUUID()
    const abort = new AbortController()
    const timeout = delay(this.runTimeoutMs)
    const job = {
      owner,
      status: MCP_JOB_RUNNING,
      answer: null,
      error: null,
      progress: null,
      sink: onProgress ?? null,
      settledAt: 0,
    }

    timeout.promise.then(() => abort.abort())

    function report(message) {
      job.progress = message

      return job.sink?.(message)
    }

    let running
    try {
      running = Promise.resolve(run(abort.signal, report))
    } catch (err) {
      running = Promise.reject(err)
    }

    job.promise = running
      .then(answer => {
        job.status = MCP_JOB_DONE
        job.answer = answer
      })
      .catch(err => {
        job.status = MCP_JOB_FAILED
        job.error = err
      })
      .finally(() => {
        timeout.cancel()
        job.settledAt = Date.now()
        job.promise = null
      })

    this.jobs.set(runId, job)

    return runId
  }

  async wait(runId, owner, onProgress) {
    const job = this.jobs.get(runId)
    if (!job || job.owner !== owner) return null

    if (this._hasExpired(job)) {
      this.jobs.delete(runId)
      return null
    }

    if (job.status === MCP_JOB_RUNNING) {
      const window = delay(this.waitMs)
      job.sink = onProgress ?? null

      try {
        await Promise.race([job.promise, window.promise])
      } finally {
        window.cancel()
        job.sink = null
      }
    }

    return { status: job.status, answer: job.answer, error: job.error, progress: job.progress }
  }

  _hasExpired(job) {
    return job.settledAt > 0 && job.settledAt + this.ttlMs <= Date.now()
  }

  _sweepAndCount(owner) {
    let running = 0

    for (const [runId, job] of this.jobs) {
      if (this._hasExpired(job)) {
        this.jobs.delete(runId)
        continue
      }

      if (job.owner === owner && job.status === MCP_JOB_RUNNING) running += 1
    }

    return running
  }
}
