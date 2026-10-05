export class ReviewQueue {
  #items = []
  #keys = new Set()
  #running = new Map()
  #active = 0

  constructor({ processor, concurrency = 1, onError = defaultOnError }) {
    if (typeof processor !== 'function') {
      throw new Error('ReviewQueue requires a processor function.')
    }
    this.processor = processor
    this.concurrency = Number.isFinite(concurrency) && concurrency >= 1 ? Math.floor(concurrency) : 1
    this.onError = onError
  }

  enqueue(job) {
    if (!job || typeof job.dedupeKey !== 'string' || !job.dedupeKey) {
      return { accepted: false, reason: 'invalid-job' }
    }
    if (this.#keys.has(job.dedupeKey)) {
      return { accepted: false, reason: 'in-flight' }
    }

    const superseded = Boolean(job.supersedeKey) && this.#supersede(job.supersedeKey)

    this.#keys.add(job.dedupeKey)
    this.#items.push(job)
    this.#pump()

    return { accepted: true, superseded }
  }

  pendingCount() {
    return this.#items.length + this.#active
  }

  #supersede(supersedeKey) {
    const running = this.#running.get(supersedeKey)
    running?.abort()

    const queuedIndex = this.#items.findIndex(item => item.supersedeKey === supersedeKey)
    if (queuedIndex === -1) return Boolean(running)

    const [queued] = this.#items.splice(queuedIndex, 1)
    this.#keys.delete(queued.dedupeKey)
    return true
  }

  #pump() {
    while (this.#active < this.concurrency) {
      const index = this.#items.findIndex(item => !this.#running.has(item.supersedeKey))
      if (index === -1) return

      const [job] = this.#items.splice(index, 1)
      const controller = new AbortController()
      this.#active++
      if (job.supersedeKey) this.#running.set(job.supersedeKey, controller)

      Promise.resolve()
        .then(() => this.processor(job, { signal: controller.signal }))
        .catch(err => {
          try {
            this.onError(err, job)
          } catch {}
        })
        .finally(() => {
          this.#keys.delete(job.dedupeKey)
          this.#running.delete(job.supersedeKey)
          this.#active--
          this.#pump()
        })
    }
  }
}

function defaultOnError(err, job) {
  console.error(`[review] Job failed (${job?.dedupeKey ?? 'unknown'}):`, err)
}
