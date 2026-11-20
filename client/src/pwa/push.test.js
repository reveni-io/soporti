import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  getPushRegistration,
  hasNotificationPermission,
  isPushSupported,
  needsHomeScreenInstall,
  subscribeToPush,
} from './push.js'

const PUBLIC_KEY = '-_-_AQI'
const PUBLIC_KEY_BYTES = [251, 255, 191, 1, 2]
const IPHONE_AGENT = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148'

function stubPushApis({ registration, permission = 'granted', ready = registration }) {
  Object.defineProperty(navigator, 'serviceWorker', {
    value: { getRegistration: vi.fn().mockResolvedValue(registration), ready: Promise.resolve(ready) },
    configurable: true,
  })
  vi.stubGlobal('PushManager', function PushManager() {})
  vi.stubGlobal('Notification', { permission })
}

function pushRegistration({ existing = null, active = {} } = {}) {
  const created = { endpoint: 'https://push.example/new' }

  return {
    active,
    created,
    pushManager: {
      getSubscription: vi.fn().mockResolvedValue(existing),
      subscribe: vi.fn().mockResolvedValue(created),
    },
  }
}

function boundSubscription(bytes) {
  return {
    endpoint: 'https://push.example/old',
    options: { applicationServerKey: bytes ? new Uint8Array(bytes).buffer : null },
    unsubscribe: vi.fn().mockResolvedValue(true),
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  delete navigator.serviceWorker
  delete navigator.userAgent
})

describe('push', () => {
  it('needs a service worker, the Push API and notifications', () => {
    expect(isPushSupported()).toBe(false)

    stubPushApis({ registration: pushRegistration() })

    expect(isPushSupported()).toBe(true)
  })

  it('has permission only once the user granted notifications', () => {
    expect(hasNotificationPermission()).toBe(false)

    stubPushApis({ registration: pushRegistration(), permission: 'default' })
    expect(hasNotificationPermission()).toBe(false)

    stubPushApis({ registration: pushRegistration(), permission: 'granted' })
    expect(hasNotificationPermission()).toBe(true)
  })

  it('asks iPhone users to add the app to the home screen first', () => {
    Object.defineProperty(navigator, 'userAgent', { value: IPHONE_AGENT, configurable: true })
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false })

    expect(needsHomeScreenInstall()).toBe(true)
  })

  it('does not ask for the home screen inside the installed app', () => {
    Object.defineProperty(navigator, 'userAgent', { value: IPHONE_AGENT, configurable: true })
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true })

    expect(needsHomeScreenInstall()).toBe(false)
  })

  it('finds no registration when the browser cannot receive pushes', async () => {
    await expect(getPushRegistration()).resolves.toBeNull()
  })

  it('finds no registration when no service worker is registered, as in development', async () => {
    stubPushApis({ registration: undefined })

    await expect(getPushRegistration()).resolves.toBeNull()
  })

  it('returns the registration of the service worker', async () => {
    const registration = pushRegistration()
    stubPushApis({ registration })

    await expect(getPushRegistration()).resolves.toBe(registration)
  })

  it('subscribes with visible notifications and the decoded server key', async () => {
    const registration = pushRegistration()
    stubPushApis({ registration })

    await expect(subscribeToPush(registration, PUBLIC_KEY)).resolves.toBe(registration.created)

    expect(registration.pushManager.subscribe).toHaveBeenCalledTimes(1)
    const [options] = registration.pushManager.subscribe.mock.calls[0]
    expect(options.userVisibleOnly).toBe(true)
    expect(Array.from(options.applicationServerKey)).toEqual(PUBLIC_KEY_BYTES)
  })

  it('keeps a subscription already bound to the server key', async () => {
    const existing = boundSubscription(PUBLIC_KEY_BYTES)
    const registration = pushRegistration({ existing })
    stubPushApis({ registration })

    await expect(subscribeToPush(registration, PUBLIC_KEY)).resolves.toBe(existing)

    expect(existing.unsubscribe).not.toHaveBeenCalled()
    expect(registration.pushManager.subscribe).not.toHaveBeenCalled()
  })

  it('keeps a subscription when the browser does not say which key it is bound to', async () => {
    const existing = { endpoint: 'https://push.example/old', unsubscribe: vi.fn() }
    const registration = pushRegistration({ existing })
    stubPushApis({ registration })

    await expect(subscribeToPush(registration, PUBLIC_KEY)).resolves.toBe(existing)
    expect(registration.pushManager.subscribe).not.toHaveBeenCalled()
  })

  it('replaces a subscription bound to an older server key', async () => {
    const existing = boundSubscription([4, 1, 2, 3, 4])
    const registration = pushRegistration({ existing })
    stubPushApis({ registration })

    await expect(subscribeToPush(registration, PUBLIC_KEY)).resolves.toBe(registration.created)

    expect(existing.unsubscribe).toHaveBeenCalledTimes(1)
    expect(registration.pushManager.subscribe).toHaveBeenCalledTimes(1)
  })

  it('replaces a subscription made without a server key', async () => {
    const existing = boundSubscription(null)
    const registration = pushRegistration({ existing })
    stubPushApis({ registration })

    await subscribeToPush(registration, PUBLIC_KEY)

    expect(existing.unsubscribe).toHaveBeenCalledTimes(1)
    expect(registration.pushManager.subscribe).toHaveBeenCalledTimes(1)
  })

  it('waits for the service worker to activate before subscribing', async () => {
    const installing = pushRegistration({ active: null })
    const activated = pushRegistration()
    stubPushApis({ registration: installing, ready: activated })

    await expect(subscribeToPush(installing, PUBLIC_KEY)).resolves.toBe(activated.created)

    expect(installing.pushManager.subscribe).not.toHaveBeenCalled()
    expect(activated.pushManager.subscribe).toHaveBeenCalledTimes(1)
  })
})
