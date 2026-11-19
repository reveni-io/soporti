import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useTheme } from './useTheme.js'

const ORIGIN = { x: 40, y: 700 }

function fakeViewTransition() {
  let finish
  const finished = new Promise(resolve => {
    finish = resolve
  })
  const startViewTransition = vi.fn(update => {
    update()
    return { finished }
  })

  return { startViewTransition, finish }
}

describe('useTheme', () => {
  const root = document.documentElement

  beforeEach(() => {
    root.removeAttribute('data-theme')
    root.removeAttribute('data-theme-switching')
    root.removeAttribute('style')
    localStorage.clear()
    window.innerWidth = 1000
    window.innerHeight = 800
  })

  afterEach(() => {
    delete document.startViewTransition
    vi.restoreAllMocks()
  })

  it('reads the light theme when the page has no theme yet', () => {
    const { result } = renderHook(() => useTheme())

    expect(result.current.theme).toBe('light')
  })

  it('reads the theme the page was started with', () => {
    root.setAttribute('data-theme', 'dark')

    const { result } = renderHook(() => useTheme())

    expect(result.current.theme).toBe('dark')
  })

  it('follows the theme when something else changes it, like the system preference', async () => {
    const { result } = renderHook(() => useTheme())

    act(() => root.setAttribute('data-theme', 'dark'))

    await waitFor(() => expect(result.current.theme).toBe('dark'))
  })

  it('switches to the other theme and remembers the choice', async () => {
    const { result } = renderHook(() => useTheme())

    act(() => result.current.toggleTheme(ORIGIN))

    expect(root.getAttribute('data-theme')).toBe('dark')
    expect(localStorage.getItem('soporti_theme')).toBe('dark')
    await waitFor(() => expect(result.current.theme).toBe('dark'))

    act(() => result.current.toggleTheme(ORIGIN))

    expect(root.getAttribute('data-theme')).toBe('light')
    expect(localStorage.getItem('soporti_theme')).toBe('light')
  })

  it('reveals the new theme in a circle that grows from the toggle until it covers the farthest corner', async () => {
    const { startViewTransition, finish } = fakeViewTransition()
    document.startViewTransition = startViewTransition
    const { result } = renderHook(() => useTheme())

    act(() => result.current.toggleTheme(ORIGIN))

    expect(startViewTransition).toHaveBeenCalledTimes(1)
    expect(root.getAttribute('data-theme')).toBe('dark')
    expect(root.hasAttribute('data-theme-switching')).toBe(true)
    expect(root.style.getPropertyValue('--theme-reveal-x')).toBe('40px')
    expect(root.style.getPropertyValue('--theme-reveal-y')).toBe('700px')
    expect(root.style.getPropertyValue('--theme-reveal-radius')).toBe(`${Math.hypot(960, 700)}px`)

    await act(async () => finish())

    expect(root.hasAttribute('data-theme-switching')).toBe(false)
  })

  it('switches without the reveal when the user prefers reduced motion', () => {
    const { startViewTransition } = fakeViewTransition()
    document.startViewTransition = startViewTransition
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true })
    const { result } = renderHook(() => useTheme())

    act(() => result.current.toggleTheme(ORIGIN))

    expect(startViewTransition).not.toHaveBeenCalled()
    expect(root.getAttribute('data-theme')).toBe('dark')
    expect(root.hasAttribute('data-theme-switching')).toBe(false)
  })
})
