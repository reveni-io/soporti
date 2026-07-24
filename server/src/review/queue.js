export class ReviewQueue {
  #items = []
  #keys = new Set()
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

    this.#keys.add(job.dedupeKey)
    this.#items.push(job)
    this.#pump()
    return { accepted: true }
  }

  pendingCount() {
    return this.#items.length + this.#active
  }

  #pump() {
    while (this.#active < this.concurrency && this.#items.length > 0) {
      const job = this.#items.shift()
      this.#active++

      Promise.resolve()
        .then(() => this.processor(job))
        .catch(err => {
          try {
            this.onError(err, job)
          } catch {
          }
        })
        .finally(() => {
          this.#keys.delete(job.dedupeKey)
          this.#active--
          this.#pump()
        })
    }
  }
}

function defaultOnError(err, job) {
  console.error(`[review] Job failed (${job?.dedupeKey ?? 'unknown'}):`, err)
}
