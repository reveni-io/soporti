import { describe, it, expect, vi, afterEach } from 'vitest'

const IPHONE_AGENT = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148'
const MAC_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15'
const ANDROID_AGENT = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36'

async function freshModule() {
  vi.resetModules()
  return import('./install-prompt.js')
}

function promptEvent() {
  const event = new Event('beforeinstallprompt', { cancelable: true })
  event.prompt = vi.fn().mockResolvedValue()
  return event
}

function setNavigator(property, value) {
  Object.defineProperty(navigator, property, { value, configurable: true })
}

afterEach(() => {
  vi.restoreAllMocks()
  delete navigator.standalone
  delete navigator.userAgent
  delete navigator.maxTouchPoints
})

describe('install-prompt', () => {
  it('keeps the install prompt the browser offers instead of letting it show', async () => {
    const { captureInstallPrompt, getInstallPrompt } = await freshModule()
    captureInstallPrompt()
    const event = promptEvent()

    window.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expect(getInstallPrompt()).toBe(event)
  })

  it('tells its listeners when the prompt changes until they unsubscribe', async () => {
    const { captureInstallPrompt, onInstallPromptChange } = await freshModule()
    captureInstallPrompt()
    const listener = vi.fn()

    const unsubscribe = onInstallPromptChange(listener)
    window.dispatchEvent(promptEvent())
    unsubscribe()
    window.dispatchEvent(promptEvent())

    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('forgets the prompt and remembers the install once the app is installed', async () => {
    const { captureInstallPrompt, getInstallPrompt, wasAppInstalled } = await freshModule()
    captureInstallPrompt()
    window.dispatchEvent(promptEvent())
    expect(wasAppInstalled()).toBe(false)

    window.dispatchEvent(new Event('appinstalled'))

    expect(getInstallPrompt()).toBeNull()
    expect(wasAppInstalled()).toBe(true)
  })

  it('shows the stored prompt once and forgets it, since a prompt can only be used once', async () => {
    const { captureInstallPrompt, getInstallPrompt, promptInstall } = await freshModule()
    captureInstallPrompt()
    const event = promptEvent()
    window.dispatchEvent(event)

    await promptInstall()
    await promptInstall()

    expect(event.prompt).toHaveBeenCalledTimes(1)
    expect(getInstallPrompt()).toBeNull()
  })

  it('reports the installed app from the standalone display mode', async () => {
    const { isStandalone } = await freshModule()
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true })

    expect(isStandalone()).toBe(true)
    expect(window.matchMedia).toHaveBeenCalledWith('(display-mode: standalone)')
  })

  it('reports the installed app from the iOS home screen flag', async () => {
    const { isStandalone } = await freshModule()
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false })

    expect(isStandalone()).toBe(false)
    setNavigator('standalone', true)
    expect(isStandalone()).toBe(true)
  })

  it('recognises an iPhone', async () => {
    const { isIos } = await freshModule()
    setNavigator('userAgent', IPHONE_AGENT)

    expect(isIos()).toBe(true)
  })

  it('recognises an iPad that presents itself as a Mac by its touch screen', async () => {
    const { isIos } = await freshModule()
    setNavigator('userAgent', MAC_AGENT)
    setNavigator('maxTouchPoints', 5)

    expect(isIos()).toBe(true)
  })

  it('does not mistake a Mac or an Android phone for iOS', async () => {
    const { isIos } = await freshModule()
    setNavigator('maxTouchPoints', 0)

    setNavigator('userAgent', MAC_AGENT)
    expect(isIos()).toBe(false)
    setNavigator('userAgent', ANDROID_AGENT)
    expect(isIos()).toBe(false)
  })
})
