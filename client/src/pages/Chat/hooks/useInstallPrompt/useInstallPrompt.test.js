import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

const IPAD_AGENT = 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148'

function promptEvent() {
  const event = new Event('beforeinstallprompt', { cancelable: true })
  event.prompt = vi.fn().mockResolvedValue()
  return event
}

beforeEach(() => {
  vi.resetModules()
  vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false })
})

afterEach(() => {
  vi.restoreAllMocks()
  delete navigator.userAgent
})

describe('useInstallPrompt', () => {
  it('offers to install once the browser provides a prompt and shows it on install', async () => {
    const { captureInstallPrompt } = await import('../../../../pwa/install-prompt.js')
    const { useInstallPrompt } = await import('./useInstallPrompt.js')
    captureInstallPrompt()
    const event = promptEvent()

    const { result } = renderHook(() => useInstallPrompt())
    expect(result.current.canInstall).toBe(false)

    act(() => {
      window.dispatchEvent(event)
    })
    expect(result.current.canInstall).toBe(true)

    await act(async () => {
      await result.current.install()
    })

    expect(event.prompt).toHaveBeenCalledTimes(1)
    expect(result.current.canInstall).toBe(false)
  })

  it('never offers to install inside the installed app', async () => {
    window.matchMedia.mockReturnValue({ matches: true })
    const { captureInstallPrompt } = await import('../../../../pwa/install-prompt.js')
    const { useInstallPrompt } = await import('./useInstallPrompt.js')
    captureInstallPrompt()

    const { result } = renderHook(() => useInstallPrompt())
    act(() => {
      window.dispatchEvent(promptEvent())
    })

    expect(result.current.isInstalled).toBe(true)
    expect(result.current.canInstall).toBe(false)
  })

  it('remembers that the app was just installed from this tab', async () => {
    const { captureInstallPrompt } = await import('../../../../pwa/install-prompt.js')
    const { useInstallPrompt } = await import('./useInstallPrompt.js')
    captureInstallPrompt()

    const { result } = renderHook(() => useInstallPrompt())
    act(() => {
      window.dispatchEvent(promptEvent())
      window.dispatchEvent(new Event('appinstalled'))
    })

    expect(result.current.wasInstalled).toBe(true)
    expect(result.current.isInstalled).toBe(false)
    expect(result.current.canInstall).toBe(false)
  })

  it('tells iPhone and iPad users apart, who install from the Share menu', async () => {
    Object.defineProperty(navigator, 'userAgent', { value: IPAD_AGENT, configurable: true })
    const { useInstallPrompt } = await import('./useInstallPrompt.js')

    const { result } = renderHook(() => useInstallPrompt())

    expect(result.current.isIos).toBe(true)
  })
})
