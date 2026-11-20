const BUILD_ID = '__SOPORTI_BUILD_ID__'

const SHELL_CACHE = `soporti-shell-${BUILD_ID}`
const ASSET_CACHE = 'soporti-assets'
const SHARE_CACHE = 'soporti-share-target'
const OWN_CACHES = [SHELL_CACHE, ASSET_CACHE, SHARE_CACHE]

const SHELL_KEY = '/'
const ASSET_PREFIX = '/assets/'
const API_PREFIX = '/api/'
const MAX_ASSET_ENTRIES = 80

const SHARE_TARGET_PATH = '/share-target'
const SHARE_PAYLOAD_PATH = '/share-target/payload'
const SHARE_FILE_PREFIX = '/share-target/files/'
const SHARE_FILES_FIELD = 'files'
const SHARE_TEXT_FIELDS = ['title', 'text', 'url']
const MAX_SHARED_FILES = 10
const SHARED_PATH = '/chat?shared=1'
const DEFAULT_PATH = '/chat'
const DEFAULT_FILE_TYPE = 'application/octet-stream'

const SEE_OTHER = 303
const SERVICE_UNAVAILABLE = 503
const HTML_TYPE_RE = /^text\/html/i
const APP_PATH_RE = /^\/(?!\/)/
const OFFLINE_HTML =
  '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Soporti</title><p>Soporti is offline. Check your connection and try again.</p></html>'

const NAVIGATE_MESSAGE = 'soporti:navigate'
const NOTIFICATION_TITLE = 'Soporti'
const NOTIFICATION_ICON = '/icon-192.png'
const NOTIFICATION_BADGE = '/badge-96.png'

self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('activate', event => {
  event.waitUntil(activate())
})

self.addEventListener('fetch', event => {
  const handler = pickFetchHandler(event.request)
  if (!handler) return

  event.respondWith(handler(event))
})

self.addEventListener('push', event => {
  event.waitUntil(showPushNotification(readPushPayload(event.data)))
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  event.waitUntil(openApp(resolveAppPath(event.notification.data?.url)))
})

async function activate() {
  await Promise.all([enableNavigationPreload(), deleteStaleCaches()])
  await self.clients.claim()
}

async function enableNavigationPreload() {
  if (!self.registration.navigationPreload) return

  await self.registration.navigationPreload.enable()
}

async function deleteStaleCaches() {
  const names = await caches.keys()
  const staleNames = names.filter(name => !OWN_CACHES.includes(name))

  await Promise.all(staleNames.map(name => caches.delete(name)))
}

function pickFetchHandler(request) {
  const url = new URL(request.url)

  if (url.origin !== self.location.origin) return null
  if (request.method === 'POST' && url.pathname === SHARE_TARGET_PATH) return receiveShare
  if (request.method !== 'GET' || url.pathname.startsWith(API_PREFIX)) return null
  if (request.mode === 'navigate') return serveNavigation
  if (url.pathname.startsWith(ASSET_PREFIX)) return serveAsset

  return null
}

function isHtml(response) {
  return HTML_TYPE_RE.test(response.headers.get('Content-Type') ?? '')
}

async function serveNavigation(event) {
  try {
    const response = (await event.preloadResponse) || (await fetch(event.request))
    if (response.ok && isHtml(response)) event.waitUntil(storeShell(response.clone()))

    return response
  } catch {
    return offlineResponse()
  }
}

async function storeShell(response) {
  const cache = await caches.open(SHELL_CACHE)

  await cache.put(SHELL_KEY, response)
}

async function offlineResponse() {
  const cache = await caches.open(SHELL_CACHE)
  const shell = await cache.match(SHELL_KEY)
  if (shell) return shell

  return new Response(OFFLINE_HTML, {
    status: SERVICE_UNAVAILABLE,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}

async function serveAsset(event) {
  const cache = await caches.open(ASSET_CACHE)
  const cached = await cache.match(event.request)
  if (cached) return cached

  const response = await fetch(event.request)
  if (response.ok && !isHtml(response)) event.waitUntil(storeAsset(cache, event.request, response.clone()))

  return response
}

async function storeAsset(cache, request, response) {
  await cache.put(request, response)

  const keys = await cache.keys()
  const overflow = keys.slice(0, Math.max(keys.length - MAX_ASSET_ENTRIES, 0))

  await Promise.all(overflow.map(key => cache.delete(key)))
}

async function receiveShare(event) {
  try {
    await storeShare(await event.request.formData())

    return redirectTo(SHARED_PATH)
  } catch {
    return redirectTo(DEFAULT_PATH)
  }
}

function redirectTo(path) {
  return Response.redirect(new URL(path, self.location.origin).href, SEE_OTHER)
}

async function storeShare(formData) {
  await caches.delete(SHARE_CACHE)

  const cache = await caches.open(SHARE_CACHE)
  const sharedFiles = formData
    .getAll(SHARE_FILES_FIELD)
    .filter(entry => typeof entry !== 'string')
    .slice(0, MAX_SHARED_FILES)
  const files = await Promise.all(sharedFiles.map((file, index) => storeSharedFile(cache, file, index)))
  const payload = { ...readShareText(formData), files }

  await cache.put(SHARE_PAYLOAD_PATH, Response.json(payload))
}

function readShareText(formData) {
  return Object.fromEntries(SHARE_TEXT_FIELDS.map(field => [field, readString(formData.get(field))]))
}

async function storeSharedFile(cache, file, index) {
  const path = `${SHARE_FILE_PREFIX}${index}`
  const type = file.type || DEFAULT_FILE_TYPE

  await cache.put(path, new Response(file, { headers: { 'Content-Type': type } }))

  return { name: file.name, type, path }
}

function readString(value) {
  return typeof value === 'string' ? value : ''
}

function readPushPayload(data) {
  if (!data) return {}

  try {
    const payload = data.json()
    return payload && typeof payload === 'object' ? payload : {}
  } catch {
    return { body: data.text() }
  }
}

async function showPushNotification(payload) {
  await self.registration.showNotification(readString(payload.title) || NOTIFICATION_TITLE, {
    body: readString(payload.body),
    tag: readString(payload.tag),
    data: { url: readString(payload.url) },
    icon: NOTIFICATION_ICON,
    badge: NOTIFICATION_BADGE,
  })
  await self.navigator.setAppBadge?.()
}

function resolveAppPath(url) {
  return typeof url === 'string' && APP_PATH_RE.test(url) ? url : DEFAULT_PATH
}

async function openApp(path) {
  const [client] = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  if (!client) return self.clients.openWindow(path)

  client.postMessage({ type: NAVIGATE_MESSAGE, url: path })

  return client.focus()
}
