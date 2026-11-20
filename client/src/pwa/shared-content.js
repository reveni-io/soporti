import { MAX_ATTACHMENTS, SHARE_CACHE_NAME, SHARE_PAYLOAD_PATH } from '../constants.js'

const TEXT_FIELDS = ['title', 'text', 'url']
const TEXT_SEPARATOR = '\n\n'

function hasCacheStorage() {
  return 'caches' in window
}

function matchShared(path) {
  return caches.match(path, { cacheName: SHARE_CACHE_NAME })
}

async function readSharedFile({ name, type, path }) {
  const response = await matchShared(path)
  if (!response) return null

  const blob = await response.blob()

  return new File([blob], name, { type: type || blob.type })
}

function isContainedInAnother(part, parts) {
  return parts.some(other => other !== part && other.includes(part))
}

function composeSharedText(payload) {
  const parts = [...new Set(TEXT_FIELDS.map(field => String(payload[field] ?? '').trim()).filter(Boolean))]

  return parts.filter(part => !isContainedInAnother(part, parts)).join(TEXT_SEPARATOR)
}

export async function readSharedContent() {
  if (!hasCacheStorage()) return null

  const response = await matchShared(SHARE_PAYLOAD_PATH)
  if (!response) return null

  const payload = await response.json()
  const files = await Promise.all((payload.files ?? []).map(readSharedFile))

  return { text: composeSharedText(payload), files: files.filter(Boolean).slice(0, MAX_ATTACHMENTS) }
}

export async function clearSharedContent() {
  if (!hasCacheStorage()) return

  await caches.delete(SHARE_CACHE_NAME)
}
