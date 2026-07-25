import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useEscapeKey } from './useEscapeKey.js'

function pressKey(key) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key }))
}

describe('useEscapeKey', () => {
  it('calls the callback when Escape is pressed', () => {
    const onEscape = vi.fn()
    renderHook(() => useEscapeKey(onEscape))

    pressKey('Escape')

    expect(onEscape).toHaveBeenCalledTimes(1)
  })

  it('ignores every other key', () => {
    const onEscape = vi.fn()
    renderHook(() => useEscapeKey(onEscape))

    pressKey('Enter')
    pressKey('a')

    expect(onEscape).not.toHaveBeenCalled()
  })

  it('stops listening once unmounted', () => {
    const onEscape = vi.fn()
    const { unmount } = renderHook(() => useEscapeKey(onEscape))

    unmount()
    pressKey('Escape')

    expect(onEscape).not.toHaveBeenCalled()
  })
})
