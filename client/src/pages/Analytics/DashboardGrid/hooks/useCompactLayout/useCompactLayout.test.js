import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useCompactLayout } from './useCompactLayout.js'

describe('useCompactLayout', () => {
  it('returns a compact layout as it is', () => {
    const layout = [
      { id: 'a', x: 0, y: 0, w: 6, h: 4 },
      { id: 'b', x: 6, y: 0, w: 6, h: 4 },
    ]

    const { result } = renderHook(() => useCompactLayout(layout))

    expect(result.current).toBe(layout)
  })

  it('compacts a layout that has floating or overlapping items', () => {
    const layout = [
      { id: 'a', x: 0, y: 3, w: 6, h: 4 },
      { id: 'b', x: 0, y: 3, w: 6, h: 2 },
    ]

    const { result } = renderHook(() => useCompactLayout(layout))

    expect(result.current).toEqual([
      { id: 'a', x: 0, y: 0, w: 6, h: 4 },
      { id: 'b', x: 0, y: 4, w: 6, h: 2 },
    ])
  })

  it('keeps the same reference when it receives an identical layout in a new array', () => {
    const compact = [{ id: 'a', x: 0, y: 0, w: 6, h: 4 }]
    const floating = [{ id: 'a', x: 0, y: 7, w: 6, h: 4 }]

    const { result, rerender } = renderHook(({ layout }) => useCompactLayout(layout), {
      initialProps: { layout: compact },
    })
    rerender({ layout: [{ ...compact[0] }] })

    expect(result.current).toBe(compact)

    rerender({ layout: floating })

    expect(result.current).toBe(compact)
  })

  it('returns the new layout when its content changes', () => {
    const before = [{ id: 'a', x: 0, y: 0, w: 6, h: 4 }]
    const after = [
      { id: 'a', x: 0, y: 0, w: 6, h: 4 },
      { id: 'b', x: 6, y: 0, w: 6, h: 4 },
    ]

    const { result, rerender } = renderHook(({ layout }) => useCompactLayout(layout), {
      initialProps: { layout: before },
    })
    rerender({ layout: after })

    expect(result.current).toBe(after)

    rerender({ layout: [after[1], after[0]] })

    expect(result.current.map(item => item.id)).toEqual(['b', 'a'])
  })
})
