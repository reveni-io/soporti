import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useAppBadge } from './useAppBadge.js'

function stubBadging() {
  const badging = {
    setAppBadge: vi.fn().mockResolvedValue(),
    clearAppBadge: vi.fn().mockResolvedValue(),
  }
  Object.defineProperty(navigator, 'setAppBadge', { value: badging.setAppBadge, configurable: true })
  Object.defineProperty(navigator, 'clearAppBadge', { value: badging.clearAppBadge, configurable: true })

  return badging
}

afterEach(() => {
  delete navigator.setAppBadge
  delete navigator.clearAppBadge
})

describe('useAppBadge', () => {
  it('shows the count on the app icon', () => {
    const badging = stubBadging()

    renderHook(() => useAppBadge(3))

    expect(badging.setAppBadge).toHaveBeenCalledTimes(1)
    expect(badging.setAppBadge).toHaveBeenCalledWith(3)
    expect(badging.clearAppBadge).not.toHaveBeenCalled()
  })

  it('clears the badge once nothing is left unread', () => {
    const badging = stubBadging()

    const { rerender } = renderHook(({ count }) => useAppBadge(count), { initialProps: { count: 2 } })
    rerender({ count: 0 })

    expect(badging.setAppBadge).toHaveBeenCalledTimes(1)
    expect(badging.clearAppBadge).toHaveBeenCalledTimes(1)
  })

  it('ignores a browser that refuses to badge the icon', async () => {
    const unhandled = vi.fn()
    process.on('unhandledRejection', unhandled)
    Object.defineProperty(navigator, 'setAppBadge', {
      value: () => Promise.reject(new DOMException('Not allowed', 'NotAllowedError')),
      configurable: true,
    })

    renderHook(() => useAppBadge(1))
    await new Promise(resolve => setTimeout(resolve, 0))
    process.off('unhandledRejection', unhandled)

    expect(unhandled).not.toHaveBeenCalled()
  })

  it('does nothing in a browser without app badges', () => {
    expect(() => renderHook(() => useAppBadge(4))).not.toThrow()
  })
})
