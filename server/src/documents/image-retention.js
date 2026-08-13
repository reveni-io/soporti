import { deleteExpiredAttachmentImages } from '../db/attachment-images.js'

const SWEEP_INTERVAL_MS = 60 * 60 * 1000

let intervalHandle = null

export async function sweepExpiredImages() {
  try {
    const deleted = await deleteExpiredAttachmentImages()
    if (deleted > 0) console.log(`[attachments] retention: removed ${deleted} expired image(s)`)
    return deleted
  } catch (err) {
    console.error('[attachments] retention sweep failed:', err.message)
    return 0
  }
}

export function startImageRetention() {
  if (intervalHandle) return intervalHandle

  intervalHandle = setInterval(sweepExpiredImages, SWEEP_INTERVAL_MS)
  intervalHandle.unref?.()
  sweepExpiredImages()

  return intervalHandle
}

export function stopImageRetention() {
  if (!intervalHandle) return

  clearInterval(intervalHandle)
  intervalHandle = null
}
