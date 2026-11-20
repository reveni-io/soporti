import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000

function stubServiceWorker({ controller = null, register } = {}) {
  const registration = { update: vi.fn().mockResolvedValue(undefined) }
  const container = new EventTarget()
  container.controller = controller
  container.register = register ?? vi.fn().mockResolvedValue(registration)
  Object.defineProperty(navigator, 'serviceWorker', { value: container, configurable: true })

  return { container, registration }
}

function setVisibility(state) {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true })
  document.dispatchEvent(new Event('visibilitychange'))
}

async function loadModule() {
  vi.resetModules()
  return import('./service-worker.js')
}

beforeEach(() => {
  vi.stubEnv('PROD', true)
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.useRealTimers()
  delete navigator.serviceWorker
  delete document.visibilityState
})

describe('registerServiceWorker', () => {
  it('does not register outside production builds', async () => {
    vi.stubEnv('PROD', false)
    const { container } = stubServiceWorker()
    const { registerServiceWorker } = await loadModule()

    await registerServiceWorker()

    expect(container.register).toHaveBeenCalledTimes(0)
  })

  it('does nothing in a browser without service workers', async () => {
    const { registerServiceWorker } = await loadModule()

    await expect(registerServiceWorker()).resolves.toBeUndefined()
  })

  it('registers the worker served at the root of the app', async () => {
    const { container } = stubServiceWorker()
    const { registerServiceWorker } = await loadModule()

    await registerServiceWorker()

    expect(container.register).toHaveBeenCalledTimes(1)
    expect(container.register).toHaveBeenCalledWith('/sw.js')
  })

  it('keeps the app running when the registration fails', async () => {
    stubServiceWorker({ register: vi.fn().mockRejectedValue(new Error('Not found')) })
    const { registerServiceWorker } = await loadModule()

    await expect(registerServiceWorker()).resolves.toBeUndefined()
  })

  it('checks for a new version every thirty minutes and whenever the page becomes visible', async () => {
    vi.useFakeTimers()
    const { registration } = stubServiceWorker()
    const { registerServiceWorker } = await loadModule()
    await registerServiceWorker()

    vi.advanceTimersByTime(UPDATE_CHECK_INTERVAL_MS)
    setVisibility('hidden')
    setVisibility('visible')

    expect(registration.update).toHaveBeenCalledTimes(2)
  })

  it('ignores a failed update check', async () => {
    const { registration } = stubServiceWorker()
    registration.update.mockRejectedValue(new Error('Offline'))
    const { registerServiceWorker } = await loadModule()
    await registerServiceWorker()

    setVisibility('visible')
    await Promise.resolve()

    expect(registration.update).toHaveBeenCalledTimes(1)
  })
})

describe('onAppUpdated', () => {
  it('announces a new version when it takes over a page a worker already controlled', async () => {
    const { container } = stubServiceWorker({ controller: {} })
    const { registerServiceWorker, onAppUpdated } = await loadModule()
    const listener = vi.fn()
    onAppUpdated(listener)
    await registerServiceWorker()

    container.dispatchEvent(new Event('controllerchange'))

    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('stays quiet when the first worker takes control and announces the next one', async () => {
    const { container } = stubServiceWorker()
    const { registerServiceWorker, onAppUpdated } = await loadModule()
    const listener = vi.fn()
    onAppUpdated(listener)
    await registerServiceWorker()

    container.dispatchEvent(new Event('controllerchange'))
    expect(listener).toHaveBeenCalledTimes(0)

    container.dispatchEvent(new Event('controllerchange'))
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('stops calling a listener once it unsubscribes', async () => {
    const { container } = stubServiceWorker({ controller: {} })
    const { registerServiceWorker, onAppUpdated } = await loadModule()
    const listener = vi.fn()
    const unsubscribe = onAppUpdated(listener)
    await registerServiceWorker()

    unsubscribe()
    container.dispatchEvent(new Event('controllerchange'))

    expect(listener).toHaveBeenCalledTimes(0)
  })
})
