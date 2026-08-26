import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSmoothText } from './useSmoothText.js'

const FRAME_MS = 16
const LONG_TEXT = 'Hi' + 'x'.repeat(500)

let frames = new Map()
let nextFrameId = 1
let clock = 0

function runFrame() {
  clock += FRAME_MS
  const pending = [...frames.values()]
  frames.clear()
  pending.forEach(callback => callback(clock))
}

function runFrames(count) {
  for (let i = 0; i < count; i++) runFrame()
}

beforeEach(() => {
  frames = new Map()
  nextFrameId = 1
  clock = 0
  vi.stubGlobal('requestAnimationFrame', callback => {
    const id = nextFrameId++
    frames.set(id, callback)
    return id
  })
  vi.stubGlobal('cancelAnimationFrame', id => frames.delete(id))
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useSmoothText', () => {
  it('shows the whole content when it is not active', () => {
    const { result } = renderHook(() => useSmoothText(LONG_TEXT, false))

    expect(result.current.text).toBe(LONG_TEXT)
    expect(frames.size).toBe(0)
  })

  it('shows the content already present when the loop starts', () => {
    const { result } = renderHook(() => useSmoothText('Hi', true))

    act(() => runFrames(2))

    expect(result.current.text).toBe('Hi')
  })

  it('reveals appended text progressively instead of all at once', () => {
    const { result, rerender } = renderHook(({ content }) => useSmoothText(content, true), {
      initialProps: { content: 'Hi' },
    })

    rerender({ content: LONG_TEXT })
    expect(result.current.text).toBe('Hi')

    act(() => runFrames(2))
    expect(result.current.text.length).toBeGreaterThan(2)
    expect(result.current.text.length).toBeLessThan(LONG_TEXT.length)
    expect(LONG_TEXT.startsWith(result.current.text)).toBe(true)

    act(() => runFrames(200))
    expect(result.current.text).toBe(LONG_TEXT)
  })

  it('keeps text pending while new chunks keep arriving', () => {
    const { result, rerender } = renderHook(({ content }) => useSmoothText(content, true), {
      initialProps: { content: 'Hi' },
    })

    let content = 'Hi'
    for (let chunk = 0; chunk < 8; chunk++) {
      content += 'x'.repeat(40)
      rerender({ content })
      act(() => runFrames(5))

      expect(result.current.text.length).toBeLessThan(content.length)
    }
  })

  it('reveals faster the further behind it falls', () => {
    const behind = renderHook(({ content }) => useSmoothText(content, true), { initialProps: { content: 'Hi' } })
    const ahead = renderHook(({ content }) => useSmoothText(content, true), { initialProps: { content: 'Hi' } })

    behind.rerender({ content: LONG_TEXT })
    ahead.rerender({ content: 'Hi' + 'x'.repeat(20) })
    act(() => runFrames(2))

    expect(behind.result.current.text.length).toBeGreaterThan(ahead.result.current.text.length)
  })

  it('flushes the pending text when the stream ends', () => {
    const { result, rerender } = renderHook(({ content, isActive }) => useSmoothText(content, isActive), {
      initialProps: { content: 'Hi', isActive: true },
    })

    rerender({ content: LONG_TEXT, isActive: true })
    act(() => runFrames(2))
    expect(result.current.text).not.toBe(LONG_TEXT)

    rerender({ content: LONG_TEXT, isActive: false })

    expect(result.current.text).toBe(LONG_TEXT)
  })

  it('stops the frame loop on unmount', () => {
    const { unmount } = renderHook(() => useSmoothText('Hi', true))
    expect(frames.size).toBe(1)

    unmount()

    expect(frames.size).toBe(0)
  })
})
