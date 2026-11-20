import { File } from 'node:buffer'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const ORIGIN = 'https://soporti.test'
const SHARE_CACHE = 'soporti-share-target'
const MAX_ASSET_ENTRIES = 80

function absolute(path) {
  return new URL(path, ORIGIN).href
}

function cacheKey(request) {
  return typeof request === 'string' ? absolute(request) : request.url
}

function createCache() {
  const entries = new Map()

  return {
    match: async request => entries.get(cacheKey(request)),
    put: async (request, response) => {
      entries.delete(cacheKey(request))
      entries.set(cacheKey(request), response)
    },
    keys: async () => [...entries.keys()],
    delete: async request => entries.delete(cacheKey(request)),
  }
}

function createCacheStorage() {
  const stores = new Map()

  return {
    open: async name => {
      if (!stores.has(name)) stores.set(name, createCache())
      return stores.get(name)
    },
    keys: async () => [...stores.keys()],
    delete: async name => stores.delete(name),
  }
}

function createWorkerScope() {
  const listeners = {}

  return {
    listeners,
    location: new URL(absolute('/sw.js')),
    addEventListener: (type, listener) => {
      listeners[type] = listener
    },
    skipWaiting: vi.fn().mockResolvedValue(undefined),
    clients: {
      claim: vi.fn().mockResolvedValue(undefined),
      matchAll: vi.fn().mockResolvedValue([]),
      openWindow: vi.fn().mockResolvedValue(null),
    },
    registration: {
      navigationPreload: { enable: vi.fn().mockResolvedValue(undefined) },
      showNotification: vi.fn().mockResolvedValue(undefined),
    },
    navigator: { setAppBadge: vi.fn().mockResolvedValue(undefined) },
  }
}

function htmlResponse(body, status = 200) {
  return new Response(body, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}

function scriptResponse(body) {
  return new Response(body, { headers: { 'Content-Type': 'text/javascript' } })
}

function navigation(path) {
  return { url: absolute(path), method: 'GET', mode: 'navigate' }
}

function assetRequest(path) {
  return { url: absolute(path), method: 'GET', mode: 'cors' }
}

function shareRequest(entries) {
  const formData = {
    get: name => entries.find(([key]) => key === name)?.[1] ?? null,
    getAll: name => entries.filter(([key]) => key === name).map(([, value]) => value),
  }

  return { url: absolute('/share-target'), method: 'POST', mode: 'navigate', formData: async () => formData }
}

function extendableEvent(fields = {}) {
  return { ...fields, waitUntil: vi.fn() }
}

async function settle(event) {
  await Promise.all(event.waitUntil.mock.calls.map(([promise]) => promise))
}

async function dispatchFetch(scope, request, preloadResponse) {
  const event = { request, preloadResponse, respondWith: vi.fn(), waitUntil: vi.fn() }

  scope.listeners.fetch(event)
  const response = await event.respondWith.mock.calls[0]?.[0]
  await settle(event)

  return { event, response }
}

async function dispatch(scope, type, fields) {
  const event = extendableEvent(fields)

  scope.listeners[type](event)
  await settle(event)

  return event
}

async function readCachedJson(name, path) {
  const cache = await caches.open(name)
  const response = await cache.match(path)

  return response.json()
}

describe('sw', () => {
  let scope

  beforeEach(async () => {
    scope = createWorkerScope()
    vi.stubGlobal('self', scope)
    vi.stubGlobal('caches', createCacheStorage())
    vi.stubGlobal('fetch', vi.fn())
    vi.resetModules()
    await import('./sw.js')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('lifecycle', () => {
    it('activates a new version right away on install', async () => {
      await dispatch(scope, 'install')

      expect(scope.skipWaiting).toHaveBeenCalledTimes(1)
    })

    it('claims the open pages, enables navigation preload and drops caches that are not its own', async () => {
      await Promise.all(
        ['soporti-shell-previous', 'soporti-assets', SHARE_CACHE, 'legacy-cache'].map(name => caches.open(name))
      )

      await dispatch(scope, 'activate')

      expect((await caches.keys()).sort()).toEqual(['soporti-assets', SHARE_CACHE])
      expect(scope.registration.navigationPreload.enable).toHaveBeenCalledTimes(1)
      expect(scope.clients.claim).toHaveBeenCalledTimes(1)
    })

    it('still claims the open pages when the browser has no navigation preload', async () => {
      scope.registration.navigationPreload = undefined

      await dispatch(scope, 'activate')

      expect(scope.clients.claim).toHaveBeenCalledTimes(1)
    })
  })

  describe('navigations', () => {
    it('serves the network page and falls back to the last one when offline', async () => {
      fetch.mockResolvedValueOnce(htmlResponse('<p>fresh</p>'))
      const online = await dispatchFetch(scope, navigation('/chat'))

      fetch.mockRejectedValueOnce(new TypeError('Failed to fetch'))
      const offline = await dispatchFetch(scope, navigation('/bots/12'))

      expect(await online.response.text()).toBe('<p>fresh</p>')
      expect(await offline.response.text()).toBe('<p>fresh</p>')
      expect(fetch).toHaveBeenCalledTimes(2)
      expect(fetch).toHaveBeenNthCalledWith(1, navigation('/chat'))
    })

    it('uses the navigation preload response instead of fetching again', async () => {
      const { response } = await dispatchFetch(
        scope,
        navigation('/chat'),
        Promise.resolve(htmlResponse('<p>preloaded</p>'))
      )

      expect(await response.text()).toBe('<p>preloaded</p>')
      expect(fetch).toHaveBeenCalledTimes(0)
    })

    it('answers with an offline page when there is no stored page', async () => {
      fetch.mockRejectedValueOnce(new TypeError('Failed to fetch'))

      const { response } = await dispatchFetch(scope, navigation('/chat'))

      expect(response.status).toBe(503)
      expect(await response.text()).toContain('Soporti is offline')
    })

    it.each([
      ['a failed page', () => htmlResponse('<p>missing</p>', 404)],
      ['a page that is not html', () => new Response('png', { headers: { 'Content-Type': 'image/png' } })],
    ])('does not keep %s for offline use', async (_label, buildResponse) => {
      fetch.mockResolvedValueOnce(buildResponse())
      await dispatchFetch(scope, navigation('/chat'))

      fetch.mockRejectedValueOnce(new TypeError('Failed to fetch'))
      const { response } = await dispatchFetch(scope, navigation('/chat'))

      expect(response.status).toBe(503)
    })
  })

  describe('assets', () => {
    it('downloads an asset once and serves it from the cache afterwards', async () => {
      fetch.mockResolvedValueOnce(scriptResponse('console.log(1)'))

      const first = await dispatchFetch(scope, assetRequest('/assets/index-abc.js'))
      const second = await dispatchFetch(scope, assetRequest('/assets/index-abc.js'))

      expect(await first.response.text()).toBe('console.log(1)')
      expect(await second.response.text()).toBe('console.log(1)')
      expect(fetch).toHaveBeenCalledTimes(1)
      expect(fetch).toHaveBeenCalledWith(assetRequest('/assets/index-abc.js'))
    })

    it('does not cache the html a host returns for a missing asset', async () => {
      fetch.mockImplementation(async () => htmlResponse('<p>app</p>'))

      await dispatchFetch(scope, assetRequest('/assets/gone.js'))
      await dispatchFetch(scope, assetRequest('/assets/gone.js'))

      expect(fetch).toHaveBeenCalledTimes(2)
    })

    it('evicts the oldest assets once the cache is full', async () => {
      fetch.mockImplementation(async request => scriptResponse(request.url))

      for (let index = 0; index <= MAX_ASSET_ENTRIES; index += 1) {
        await dispatchFetch(scope, assetRequest(`/assets/chunk-${index}.js`))
      }
      await dispatchFetch(scope, assetRequest(`/assets/chunk-${MAX_ASSET_ENTRIES}.js`))
      await dispatchFetch(scope, assetRequest('/assets/chunk-0.js'))

      expect(fetch).toHaveBeenCalledTimes(MAX_ASSET_ENTRIES + 2)
      expect(fetch).toHaveBeenLastCalledWith(assetRequest('/assets/chunk-0.js'))
    })
  })

  describe('requests it leaves alone', () => {
    it.each([
      ['an api call', { url: absolute('/api/chat'), method: 'GET', mode: 'cors' }],
      ['an api navigation', navigation('/api/auth/google/callback')],
      ['a cross-origin request', { url: 'https://fonts.googleapis.com/css2', method: 'GET', mode: 'cors' }],
      ['a post that is not a share', { url: absolute('/chat'), method: 'POST', mode: 'navigate' }],
      ['a public file', { url: absolute('/icon-192.png'), method: 'GET', mode: 'no-cors' }],
    ])('does not answer %s', async (_label, request) => {
      const { event } = await dispatchFetch(scope, request)

      expect(event.respondWith).toHaveBeenCalledTimes(0)
      expect(fetch).toHaveBeenCalledTimes(0)
    })
  })

  describe('share target', () => {
    it('stores the shared text and files and opens the chat', async () => {
      const screenshot = new File(['png-bytes'], 'shot.png', { type: 'image/png' })
      const report = new File(['a,b'], 'report.csv', { type: 'text/csv' })

      const { response } = await dispatchFetch(
        scope,
        shareRequest([
          ['title', 'Broken checkout'],
          ['text', 'See the attached screenshot'],
          ['files', screenshot],
          ['files', 'not-a-file'],
          ['files', report],
        ])
      )

      expect(response.status).toBe(303)
      expect(response.headers.get('Location')).toBe(absolute('/chat?shared=1'))
      expect(await readCachedJson(SHARE_CACHE, '/share-target/payload')).toEqual({
        title: 'Broken checkout',
        text: 'See the attached screenshot',
        url: '',
        files: [
          { name: 'shot.png', type: 'image/png', path: '/share-target/files/0' },
          { name: 'report.csv', type: 'text/csv', path: '/share-target/files/1' },
        ],
      })
      const storedFile = await (await caches.open(SHARE_CACHE)).match('/share-target/files/0')
      expect(storedFile.headers.get('Content-Type')).toBe('image/png')
      expect(await storedFile.text()).toBe('png-bytes')
    })

    it('replaces the previous share and keeps at most ten files', async () => {
      const previous = await caches.open(SHARE_CACHE)
      await previous.put('/share-target/files/11', new Response('old'))
      const files = Array.from({ length: 12 }, (_, index) => ['files', new File(['x'], `file-${index}.png`)])

      await dispatchFetch(scope, shareRequest([['url', 'https://example.com/page'], ...files]))

      const payload = await readCachedJson(SHARE_CACHE, '/share-target/payload')
      expect(payload.url).toBe('https://example.com/page')
      expect(payload.files).toHaveLength(10)
      expect(payload.files[0]).toEqual({
        name: 'file-0.png',
        type: 'application/octet-stream',
        path: '/share-target/files/0',
      })
      expect(await (await caches.open(SHARE_CACHE)).match('/share-target/files/11')).toBeUndefined()
    })

    it('opens the chat without a share when the form cannot be read', async () => {
      const request = { ...shareRequest([]), formData: () => Promise.reject(new TypeError('Bad form')) }

      const { response } = await dispatchFetch(scope, request)

      expect(response.status).toBe(303)
      expect(response.headers.get('Location')).toBe(absolute('/chat'))
    })
  })

  describe('push', () => {
    it('shows the pushed notification and sets the app badge', async () => {
      const payload = { title: 'Sales bot', body: '3 refunds', url: '/bots/12', tag: 'bot-12' }

      await dispatch(scope, 'push', { data: { json: () => payload, text: () => JSON.stringify(payload) } })

      expect(scope.registration.showNotification).toHaveBeenCalledTimes(1)
      expect(scope.registration.showNotification).toHaveBeenCalledWith('Sales bot', {
        body: '3 refunds',
        tag: 'bot-12',
        data: { url: '/bots/12' },
        icon: '/icon-192.png',
        badge: '/badge-96.png',
      })
      expect(scope.navigator.setAppBadge).toHaveBeenCalledTimes(1)
    })

    it.each([
      ['no data', null, ''],
      ['a json value that is not an object', { json: () => 'hello', text: () => '"hello"' }, ''],
      [
        'text that is not json',
        {
          json: () => {
            throw new SyntaxError('Unexpected token')
          },
          text: () => 'Plain update',
        },
        'Plain update',
      ],
    ])('falls back to the app name when the push carries %s', async (_label, data, body) => {
      await dispatch(scope, 'push', { data })

      expect(scope.registration.showNotification).toHaveBeenCalledWith('Soporti', {
        body,
        tag: '',
        data: { url: '' },
        icon: '/icon-192.png',
        badge: '/badge-96.png',
      })
    })

    it('shows the notification when the browser has no app badge', async () => {
      scope.navigator = {}

      await dispatch(scope, 'push', { data: null })

      expect(scope.registration.showNotification).toHaveBeenCalledTimes(1)
    })
  })

  describe('notification click', () => {
    function notification(url) {
      return { close: vi.fn(), data: { url } }
    }

    it('focuses an open window and asks it to navigate', async () => {
      const client = { postMessage: vi.fn(), focus: vi.fn().mockResolvedValue(undefined) }
      scope.clients.matchAll.mockResolvedValue([client])
      const clicked = notification('/bots/12')

      await dispatch(scope, 'notificationclick', { notification: clicked })

      expect(clicked.close).toHaveBeenCalledTimes(1)
      expect(scope.clients.matchAll).toHaveBeenCalledWith({ type: 'window', includeUncontrolled: true })
      expect(client.postMessage).toHaveBeenCalledTimes(1)
      expect(client.postMessage).toHaveBeenCalledWith({ type: 'soporti:navigate', url: '/bots/12' })
      expect(client.focus).toHaveBeenCalledTimes(1)
      expect(scope.clients.openWindow).toHaveBeenCalledTimes(0)
    })

    it('opens a new window when the app is not open', async () => {
      await dispatch(scope, 'notificationclick', { notification: notification('/videos/abc') })

      expect(scope.clients.openWindow).toHaveBeenCalledTimes(1)
      expect(scope.clients.openWindow).toHaveBeenCalledWith('/videos/abc')
    })

    it.each([undefined, 'https://evil.test/phish', '//evil.test/phish'])(
      'opens the chat when the notification url is %s',
      async url => {
        await dispatch(scope, 'notificationclick', { notification: notification(url) })

        expect(scope.clients.openWindow).toHaveBeenCalledWith('/chat')
      }
    )
  })
})
