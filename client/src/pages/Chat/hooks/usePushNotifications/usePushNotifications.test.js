import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { usePushNotifications } from './usePushNotifications.js'

const PUBLIC_KEY = 'AQID'
const OLD_KEY_BYTES = [9, 9, 9]
const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/device-1'
const KEYS = { p256dh: 'p256dh-key', auth: 'auth-secret' }
const IPHONE_AGENT = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148'

function respond(body, status = 200) {
  return { ok: status < 400, status, json: async () => body }
}

function serveApi(overrides = {}) {
  global.fetch = vi.fn(async (url, options) => {
    const route = `${options.method ?? 'GET'} ${url}`
    if (overrides[route]) return overrides[route]
    if (route === 'GET /api/push/key') return respond({ publicKey: PUBLIC_KEY })
    if (route === 'POST /api/push/subscriptions') return respond({ saved: true }, 201)
    if (route === 'DELETE /api/push/subscriptions') return respond({}, 204)
    if (route === 'POST /api/push/test') return respond({ sent: 2 })
    return respond({ error: 'Not found.' }, 404)
  })
}

function subscriptionFor(keyBytes, endpoint = ENDPOINT) {
  return {
    endpoint,
    options: { applicationServerKey: new Uint8Array(keyBytes).buffer },
    toJSON: () => ({ endpoint, expirationTime: null, keys: KEYS }),
    unsubscribe: vi.fn().mockResolvedValue(true),
  }
}

function stubDevice({ permission = 'default', existing = null, answer = 'granted', registered = true } = {}) {
  const created = subscriptionFor([1, 2, 3], `${ENDPOINT}-new`)
  const registration = {
    active: {},
    pushManager: {
      getSubscription: vi.fn().mockResolvedValue(existing),
      subscribe: vi.fn(async () => {
        registration.pushManager.getSubscription.mockResolvedValue(created)
        return created
      }),
    },
  }
  const notification = {
    permission,
    requestPermission: vi.fn(async () => {
      notification.permission = answer
      return answer
    }),
  }
  Object.defineProperty(navigator, 'serviceWorker', {
    value: { getRegistration: vi.fn().mockResolvedValue(registered ? registration : undefined) },
    configurable: true,
  })
  vi.stubGlobal('PushManager', function PushManager() {})
  vi.stubGlobal('Notification', notification)

  return { registration, notification, created }
}

function callsTo(route) {
  return global.fetch.mock.calls.filter(([url, options]) => `${options.method ?? 'GET'} ${url}` === route)
}

let onLogout

beforeEach(() => {
  vi.restoreAllMocks()
  onLogout = vi.fn()
  vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false })
})

afterEach(() => {
  vi.unstubAllGlobals()
  delete navigator.serviceWorker
  delete navigator.userAgent
})

describe('usePushNotifications', () => {
  it('reports a browser without push as unsupported and asks the server nothing', () => {
    serveApi()

    const { result } = renderHook(() => usePushNotifications('tok', onLogout))

    expect(result.current.isChecking).toBe(false)
    expect(result.current.isSupported).toBe(false)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('treats a build without a service worker as unsupported', async () => {
    serveApi()
    stubDevice({ registered: false })

    const { result } = renderHook(() => usePushNotifications('tok', onLogout))

    await waitFor(() => expect(result.current.isChecking).toBe(false))
    expect(result.current.isSupported).toBe(false)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('reports a device without a subscription as off', async () => {
    serveApi()
    stubDevice()

    const { result } = renderHook(() => usePushNotifications('tok', onLogout))

    await waitFor(() => expect(result.current.isChecking).toBe(false))
    expect(result.current.isSupported).toBe(true)
    expect(result.current.isSubscribed).toBe(false)
    expect(result.current.permission).toBe('default')
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('saves the subscription of the device again on load so the server keeps it', async () => {
    serveApi()
    const existing = subscriptionFor([1, 2, 3])
    const { registration } = stubDevice({ permission: 'granted', existing })

    const { result } = renderHook(() => usePushNotifications('tok', onLogout))

    await waitFor(() => expect(result.current.isSubscribed).toBe(true))
    expect(registration.pushManager.subscribe).not.toHaveBeenCalled()
    const saves = callsTo('POST /api/push/subscriptions')
    expect(saves).toHaveLength(1)
    expect(JSON.parse(saves[0][1].body)).toEqual({ endpoint: ENDPOINT, keys: KEYS })
  })

  it('subscribes again when the server key changed since the device subscribed', async () => {
    serveApi()
    const existing = subscriptionFor(OLD_KEY_BYTES)
    const { registration } = stubDevice({ permission: 'granted', existing })

    const { result } = renderHook(() => usePushNotifications('tok', onLogout))

    await waitFor(() => expect(result.current.isSubscribed).toBe(true))
    expect(existing.unsubscribe).toHaveBeenCalledTimes(1)
    expect(registration.pushManager.subscribe).toHaveBeenCalledTimes(1)
    const saves = callsTo('POST /api/push/subscriptions')
    expect(saves).toHaveLength(1)
    expect(JSON.parse(saves[0][1].body).endpoint).toBe(`${ENDPOINT}-new`)
  })

  it('leaves a subscription alone when notifications are no longer allowed', async () => {
    serveApi()
    stubDevice({ permission: 'denied', existing: subscriptionFor([1, 2, 3]) })

    const { result } = renderHook(() => usePushNotifications('tok', onLogout))

    await waitFor(() => expect(result.current.isChecking).toBe(false))
    expect(result.current.isSubscribed).toBe(false)
    expect(result.current.permission).toBe('denied')
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('asks for permission, subscribes with the server key and saves the subscription on enable', async () => {
    serveApi()
    const { registration, notification } = stubDevice()
    const { result } = renderHook(() => usePushNotifications('tok', onLogout))
    await waitFor(() => expect(result.current.isChecking).toBe(false))

    await act(async () => {
      await result.current.enable()
    })

    expect(notification.requestPermission).toHaveBeenCalledTimes(1)
    expect(result.current.permission).toBe('granted')
    expect(result.current.isSubscribed).toBe(true)
    const [options] = registration.pushManager.subscribe.mock.calls[0]
    expect(options.userVisibleOnly).toBe(true)
    expect(Array.from(options.applicationServerKey)).toEqual([1, 2, 3])
    const saves = callsTo('POST /api/push/subscriptions')
    expect(saves).toHaveLength(1)
    expect(JSON.parse(saves[0][1].body)).toEqual({ endpoint: `${ENDPOINT}-new`, keys: KEYS })
    expect(saves[0][1].headers.Authorization).toBe('Bearer tok')
  })

  it('stays off when the user blocks notifications', async () => {
    serveApi()
    const { registration } = stubDevice({ answer: 'denied' })
    const { result } = renderHook(() => usePushNotifications('tok', onLogout))
    await waitFor(() => expect(result.current.isChecking).toBe(false))

    await act(async () => {
      await result.current.enable()
    })

    expect(result.current.permission).toBe('denied')
    expect(result.current.isSubscribed).toBe(false)
    expect(registration.pushManager.subscribe).not.toHaveBeenCalled()
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('forgets the subscription on the server and on the device on disable', async () => {
    serveApi()
    const existing = subscriptionFor([1, 2, 3])
    stubDevice({ permission: 'granted', existing })
    const { result } = renderHook(() => usePushNotifications('tok', onLogout))
    await waitFor(() => expect(result.current.isSubscribed).toBe(true))

    await act(async () => {
      await result.current.disable()
    })

    expect(result.current.isSubscribed).toBe(false)
    expect(existing.unsubscribe).toHaveBeenCalledTimes(1)
    const deletes = callsTo('DELETE /api/push/subscriptions')
    expect(deletes).toHaveLength(1)
    expect(JSON.parse(deletes[0][1].body)).toEqual({ endpoint: ENDPOINT })
  })

  it('says how many devices the test notification went to', async () => {
    serveApi()
    stubDevice({ permission: 'granted', existing: subscriptionFor([1, 2, 3]) })
    const { result } = renderHook(() => usePushNotifications('tok', onLogout))
    await waitFor(() => expect(result.current.isSubscribed).toBe(true))

    await act(async () => {
      await result.current.sendTest()
    })

    expect(result.current.testResult).toBe('Test notification sent to 2 devices.')
    expect(callsTo('POST /api/push/test')).toHaveLength(1)
  })

  it('says when the test notification went to this one device', async () => {
    serveApi({ 'POST /api/push/test': respond({ sent: 1 }) })
    stubDevice({ permission: 'granted', existing: subscriptionFor([1, 2, 3]) })
    const { result } = renderHook(() => usePushNotifications('tok', onLogout))
    await waitFor(() => expect(result.current.isSubscribed).toBe(true))

    await act(async () => {
      await result.current.sendTest()
    })

    expect(result.current.testResult).toBe('Test notification sent to 1 device.')
  })

  it('shows why the test notification could not be sent', async () => {
    serveApi({ 'POST /api/push/test': respond({ error: 'No device has notifications turned on.' }, 404) })
    stubDevice({ permission: 'granted', existing: subscriptionFor([1, 2, 3]) })
    const { result } = renderHook(() => usePushNotifications('tok', onLogout))
    await waitFor(() => expect(result.current.isSubscribed).toBe(true))

    await act(async () => {
      await result.current.sendTest()
    })

    expect(result.current.testResult).toBeNull()
    expect(result.current.error).toBe('No device has notifications turned on.')
  })

  it('shows why the subscription could not be synced on load', async () => {
    serveApi({ 'POST /api/push/subscriptions': respond({}, 500) })
    stubDevice({ permission: 'granted', existing: subscriptionFor([1, 2, 3]) })

    const { result } = renderHook(() => usePushNotifications('tok', onLogout))

    await waitFor(() => expect(result.current.error).toBe('Failed to turn on notifications on this device'))
    expect(result.current.isChecking).toBe(false)
    expect(onLogout).not.toHaveBeenCalled()
  })

  it('logs out when the token is rejected while syncing on load', async () => {
    serveApi({ 'GET /api/push/key': respond({ error: 'Unauthorized.' }, 401) })
    stubDevice({ permission: 'granted', existing: subscriptionFor([1, 2, 3]) })

    const { result } = renderHook(() => usePushNotifications('tok', onLogout))

    await waitFor(() => expect(onLogout).toHaveBeenCalledTimes(1))
    expect(result.current.error).toBeNull()
  })

  it('logs out when the token is rejected while turning notifications on', async () => {
    serveApi({ 'GET /api/push/key': respond({ error: 'Unauthorized.' }, 401) })
    stubDevice()
    const { result } = renderHook(() => usePushNotifications('tok', onLogout))
    await waitFor(() => expect(result.current.isChecking).toBe(false))

    await act(async () => {
      await result.current.enable()
    })

    expect(onLogout).toHaveBeenCalledTimes(1)
    expect(result.current.error).toBeNull()
    expect(result.current.isSubscribed).toBe(false)
  })

  it('waits for a signed-in user before checking the device', () => {
    serveApi()
    stubDevice({ permission: 'granted', existing: subscriptionFor([1, 2, 3]) })

    const { result } = renderHook(() => usePushNotifications(null, onLogout))

    expect(result.current.isChecking).toBe(true)
    expect(navigator.serviceWorker.getRegistration).not.toHaveBeenCalled()
  })

  it('asks iPhone users outside the installed app to add it to the home screen first', () => {
    Object.defineProperty(navigator, 'userAgent', { value: IPHONE_AGENT, configurable: true })

    const { result } = renderHook(() => usePushNotifications('tok', onLogout))

    expect(result.current.needsInstall).toBe(true)
    expect(result.current.isSupported).toBe(false)
  })
})
