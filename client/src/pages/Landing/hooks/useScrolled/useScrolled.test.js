import { describe, it, expect, afterEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useScrolled } from './useScrolled.js'

function scrollTo(y) {
  act(() => {
    window.scrollY = y
    window.dispatchEvent(new Event('scroll'))
  })
}

describe('useScrolled', () => {
  afterEach(() => {
    window.scrollY = 0
  })

  it('reports whether the page has scrolled past the offset', () => {
    const { result } = renderHook(() => useScrolled(40))

    expect(result.current).toBe(false)

    scrollTo(41)
    expect(result.current).toBe(true)

    scrollTo(40)
    expect(result.current).toBe(false)
  })

  it('reads the scroll position the page already has when it mounts', () => {
    window.scrollY = 300

    const { result } = renderHook(() => useScrolled(40))

    expect(result.current).toBe(true)
  })
})
