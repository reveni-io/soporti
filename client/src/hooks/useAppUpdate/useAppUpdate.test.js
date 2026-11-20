import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

vi.mock('../../pwa/service-worker.js', () => ({ onAppUpdated: vi.fn() }))

const { onAppUpdated } = await import('../../pwa/service-worker.js')
const { useAppUpdate } = await import('./useAppUpdate.js')

const unsubscribe = vi.fn()
let announceUpdate

beforeEach(() => {
  vi.clearAllMocks()
  onAppUpdated.mockImplementation(listener => {
    announceUpdate = listener
    return unsubscribe
  })
})

describe('useAppUpdate', () => {
  it('has no update until the service worker announces one', () => {
    const { result } = renderHook(() => useAppUpdate())

    expect(result.current.isUpdateAvailable).toBe(false)

    act(() => announceUpdate())

    expect(result.current.isUpdateAvailable).toBe(true)
  })

  it('hides the update once dismissed', () => {
    const { result } = renderHook(() => useAppUpdate())
    act(() => announceUpdate())

    act(() => result.current.dismiss())

    expect(result.current.isUpdateAvailable).toBe(false)
  })

  it('reloads the page to pick up the new version', () => {
    const reload = vi.fn()
    Object.defineProperty(window, 'location', { value: { reload }, writable: true, configurable: true })
    const { result } = renderHook(() => useAppUpdate())

    result.current.reload()

    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('stops listening when it unmounts', () => {
    const { unmount } = renderHook(() => useAppUpdate())

    unmount()

    expect(onAppUpdated).toHaveBeenCalledTimes(1)
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })
})
