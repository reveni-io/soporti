import { describe, it, expect, vi, afterEach } from 'vitest'
import { showLocalNotification } from './local-notification.js'

const NOTIFICATION = {
  title: 'Your answer is ready',
  body: 'Refunds over €500 need a second approval.',
  url: '/chat?conversation=0b6f5c1e-8f4a-4d2b-9c3e-2a1b0c9d8e7f',
  tag: 'conversation-0b6f5c1e-8f4a-4d2b-9c3e-2a1b0c9d8e7f',
}

function stubDevice({ permission = 'granted', subscription = { endpoint: 'https://push.example/1' } } = {}) {
  const registration = {
    pushManager: { getSubscription: vi.fn().mockResolvedValue(subscription) },
    showNotification: vi.fn().mockResolvedValue(),
  }
  Object.defineProperty(navigator, 'serviceWorker', {
    value: { getRegistration: vi.fn().mockResolvedValue(registration) },
    configurable: true,
  })
  vi.stubGlobal('PushManager', function PushManager() {})
  vi.stubGlobal('Notification', { permission })

  return registration
}

afterEach(() => {
  vi.unstubAllGlobals()
  delete navigator.serviceWorker
})

describe('showLocalNotification', () => {
  it('shows the notification through the service worker with its link and tag', async () => {
    const registration = stubDevice()

    await showLocalNotification(NOTIFICATION)

    expect(registration.showNotification).toHaveBeenCalledTimes(1)
    expect(registration.showNotification).toHaveBeenCalledWith('Your answer is ready', {
      body: NOTIFICATION.body,
      tag: NOTIFICATION.tag,
      data: { url: NOTIFICATION.url },
      icon: '/icon-192.png',
      badge: '/badge-96.png',
    })
  })

  it('stays quiet until the user allows notifications', async () => {
    const registration = stubDevice({ permission: 'default' })

    await showLocalNotification(NOTIFICATION)

    expect(registration.showNotification).not.toHaveBeenCalled()
  })

  it('stays quiet on a device where notifications were not turned on', async () => {
    const registration = stubDevice({ subscription: null })

    await showLocalNotification(NOTIFICATION)

    expect(registration.showNotification).not.toHaveBeenCalled()
  })

  it('stays quiet when no service worker is registered', async () => {
    stubDevice()
    navigator.serviceWorker.getRegistration.mockResolvedValue(undefined)

    await expect(showLocalNotification(NOTIFICATION)).resolves.toBeUndefined()
  })

  it('never throws when the browser refuses to show it', async () => {
    const registration = stubDevice()
    registration.showNotification.mockRejectedValue(new TypeError('No active registration'))

    await expect(showLocalNotification(NOTIFICATION)).resolves.toBeUndefined()
  })

  it('does nothing in a browser without notifications', async () => {
    await expect(showLocalNotification(NOTIFICATION)).resolves.toBeUndefined()
  })
})
