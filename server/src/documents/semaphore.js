import config from '../config.js'

export function createSemaphore(max) {
  let active = 0
  const queue = []
  const next = () => {
    if (active >= max || queue.length === 0) return
    active++
    const resolve = queue.shift()
    resolve(() => {
      active--
      next()
    })
  }
  return {
    acquire() {
      return new Promise(resolve => {
        queue.push(resolve)
        next()
      })
    },
  }
}

let parseSemaphore = null

export function acquireParseSlot() {
  if (!parseSemaphore) parseSemaphore = createSemaphore(Math.max(1, config.documents.parseConcurrency))

  return parseSemaphore.acquire()
}
