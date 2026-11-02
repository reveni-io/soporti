export const VERSION_STATUSES = {
  QUEUED: 'queued',
  RUNNING: 'running',
  READY: 'ready',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
}

const MINUTES_PER_QUEUED_VIDEO = 15
const SECONDS_PER_MINUTE = 60
const SLUG_SEPARATOR_RE = /[^a-z0-9]+/g
const SLUG_EDGES_RE = /^-+|-+$/g
const DEFAULT_FILE_NAME = 'video'

export function isComposing(version) {
  if (version.status === VERSION_STATUSES.QUEUED) return true

  return version.status === VERSION_STATUSES.RUNNING && !version.previewReady
}

export function isRendering(version) {
  return version.status === VERSION_STATUSES.RUNNING && version.previewReady
}

export function estimateQueueMinutes(queuePosition) {
  return queuePosition * MINUTES_PER_QUEUED_VIDEO
}

export function describeEta(etaSeconds) {
  if (etaSeconds == null) return null
  if (etaSeconds < SECONDS_PER_MINUTE) return 'Less than a minute left'

  return `About ${Math.round(etaSeconds / SECONDS_PER_MINUTE)} min left`
}

export function videoFileName(title, version) {
  const slug = title.toLowerCase().replace(SLUG_SEPARATOR_RE, '-').replace(SLUG_EDGES_RE, '')

  return `${slug || DEFAULT_FILE_NAME}-v${version}.mp4`
}
