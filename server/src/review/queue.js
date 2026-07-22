// In-memory FIFO queue for review jobs. Jobs carry a dedupeKey; a job is
// rejected while another job with the same key is queued or running, so a
// simultaneous label + reviewer-request gesture yields a single review while a
// deliberate re-trigger later still works (one-shot semantics).
// Queued jobs do not survive a process restart — GitHub's webhook redelivery
// covers that gap for the MVP.
export class ReviewQueue {
  #items = []
  #keys = new Set()
  #active = 0

  constructor({ processor, concurrency = 1, onError = defaultOnError }) {
    if (typeof processor !== 'function') {
      throw new Error('ReviewQueue requires a processor function.')
    }
    this.processor = processor
    // Guard against NaN from a bad env var: NaN comparisons are always false,
    // which would silently freeze the queue.
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
            // onError must never break the queue loop.
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
