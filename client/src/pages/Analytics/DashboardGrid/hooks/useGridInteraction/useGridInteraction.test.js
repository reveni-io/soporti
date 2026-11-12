import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, fireEvent, renderHook } from '@testing-library/react'
import { useGridInteraction } from './useGridInteraction.js'

const WIDTH = 1184
const LAYOUT = [
  { id: 'a', x: 0, y: 0, w: 6, h: 4 },
  { id: 'b', x: 6, y: 0, w: 6, h: 4 },
]
const MOVED_LAYOUT = [
  { id: 'a', x: 6, y: 0, w: 6, h: 4 },
  { id: 'b', x: 6, y: 4, w: 6, h: 4 },
]

function mountHandle(id) {
  const container = document.createElement('div')
  const item = document.createElement('div')
  const handle = document.createElement('header')

  item.dataset.gridItem = id
  item.append(handle)
  container.append(item)
  document.body.append(container)

  return { containerRef: { current: container }, handle }
}

function pressOn(handle, point) {
  return { button: 0, pointerId: 1, target: handle, currentTarget: handle, ...point }
}

describe('useGridInteraction', () => {
  beforeEach(() => {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({ width: WIDTH, left: 0, top: 0 })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    document.body.replaceChildren()
  })

  it('hands out inert prop bags and the layout as it is when disabled', () => {
    const { containerRef } = mountHandle('a')

    const { result } = renderHook(() =>
      useGridInteraction({ layout: LAYOUT, width: 600, containerRef, onLayoutChange: vi.fn(), disabled: true })
    )

    expect(result.current.handleProps).toEqual({})
    expect(result.current.resizeProps).toEqual({})
    expect(result.current.layout).toBe(LAYOUT)
    expect(result.current.active).toBeNull()
  })

  it('describes the drag handle for the keyboard and for assistive technology', () => {
    const { containerRef } = mountHandle('a')

    const { result } = renderHook(() =>
      useGridInteraction({ layout: LAYOUT, width: WIDTH, containerRef, onLayoutChange: vi.fn(), disabled: false })
    )

    expect(result.current.handleProps).toMatchObject({
      role: 'group',
      tabIndex: 0,
      'aria-label': 'Move chart: the arrow keys move it, Shift with the arrow keys resizes it',
      'aria-roledescription': 'drag handle',
      'data-grid-handle': '',
    })
    expect(Object.keys(result.current.handleProps).sort()).toEqual([
      'aria-label',
      'aria-roledescription',
      'data-grid-handle',
      'onDragStart',
      'onKeyDown',
      'onPointerDown',
      'role',
      'tabIndex',
    ])
    expect(Object.keys(result.current.resizeProps).sort()).toEqual(['onKeyDown', 'onPointerDown'])
  })

  it('keeps the same prop bags while the layout, the width and the callback change', () => {
    const { containerRef } = mountHandle('a')

    const { result, rerender } = renderHook(
      ({ layout, width }) =>
        useGridInteraction({ layout, width, containerRef, onLayoutChange: vi.fn(), disabled: false }),
      { initialProps: { layout: LAYOUT, width: WIDTH } }
    )
    const { handleProps, resizeProps } = result.current
    rerender({ layout: MOVED_LAYOUT, width: 900 })

    expect(result.current.handleProps).toBe(handleProps)
    expect(result.current.resizeProps).toBe(resizeProps)
  })

  it('reports the working layout and the dragged item, then commits on release', () => {
    const { containerRef, handle } = mountHandle('a')
    const onLayoutChange = vi.fn()

    const { result } = renderHook(() =>
      useGridInteraction({ layout: LAYOUT, width: WIDTH, containerRef, onLayoutChange, disabled: false })
    )
    act(() => result.current.handleProps.onPointerDown(pressOn(handle, { clientX: 10, clientY: 10 })))

    expect(result.current.active).toBeNull()
    expect(result.current.layout).toBe(LAYOUT)

    fireEvent.pointerMove(window, { pointerId: 1, clientX: 630, clientY: 16 })

    expect(result.current.active).toEqual({
      id: 'a',
      isResize: false,
      rect: { left: 600, top: 6, width: 584, height: 336 },
    })
    expect(result.current.layout).toEqual(MOVED_LAYOUT)
    expect(onLayoutChange).not.toHaveBeenCalled()

    fireEvent.pointerUp(window, { pointerId: 1, clientX: 630, clientY: 16 })

    expect(onLayoutChange).toHaveBeenCalledTimes(1)
    expect(onLayoutChange).toHaveBeenCalledWith(MOVED_LAYOUT)
    expect(result.current.active).toBeNull()
    expect(result.current.layout).toBe(LAYOUT)
  })

  it('reports the resized item with its live size', () => {
    const { containerRef, handle } = mountHandle('a')
    const onLayoutChange = vi.fn()

    const { result } = renderHook(() =>
      useGridInteraction({ layout: LAYOUT, width: WIDTH, containerRef, onLayoutChange, disabled: false })
    )
    act(() => result.current.resizeProps.onPointerDown(pressOn(handle, { clientX: 580, clientY: 330 })))
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 480, clientY: 242 })

    expect(result.current.active).toEqual({
      id: 'a',
      isResize: true,
      rect: { left: 0, top: 0, width: 484, height: 248 },
    })
    expect(result.current.layout).toEqual([{ id: 'a', x: 0, y: 0, w: 5, h: 3 }, LAYOUT[1]])

    fireEvent.pointerUp(window, { pointerId: 1, clientX: 480, clientY: 242 })

    expect(onLayoutChange).toHaveBeenCalledTimes(1)
    expect(onLayoutChange).toHaveBeenCalledWith([{ id: 'a', x: 0, y: 0, w: 5, h: 3 }, LAYOUT[1]])
  })

  it('measures the pointer from the corner of the container', () => {
    const { containerRef, handle } = mountHandle('a')
    Element.prototype.getBoundingClientRect.mockReturnValue({ width: WIDTH, left: 240, top: 96 })

    const { result } = renderHook(() =>
      useGridInteraction({ layout: LAYOUT, width: WIDTH, containerRef, onLayoutChange: vi.fn(), disabled: false })
    )
    act(() => result.current.handleProps.onPointerDown(pressOn(handle, { clientX: 250, clientY: 106 })))
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 350, clientY: 106 })

    expect(result.current.active.rect).toEqual({ left: 100, top: 0, width: 584, height: 336 })
  })

  it('calls the latest onLayoutChange it received', () => {
    const { containerRef, handle } = mountHandle('a')
    const first = vi.fn()
    const latest = vi.fn()

    const { result, rerender } = renderHook(
      ({ onLayoutChange }) =>
        useGridInteraction({ layout: LAYOUT, width: WIDTH, containerRef, onLayoutChange, disabled: false }),
      { initialProps: { onLayoutChange: first } }
    )
    act(() => result.current.handleProps.onPointerDown(pressOn(handle, { clientX: 10, clientY: 10 })))
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 630, clientY: 10 })
    rerender({ onLayoutChange: latest })
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 630, clientY: 10 })

    expect(first).not.toHaveBeenCalled()
    expect(latest).toHaveBeenCalledTimes(1)
    expect(latest).toHaveBeenCalledWith(MOVED_LAYOUT)
  })

  it('captures the pointer on the handle and releases it when Escape cancels', () => {
    const { containerRef, handle } = mountHandle('a')
    const onLayoutChange = vi.fn()
    handle.setPointerCapture = vi.fn()
    handle.hasPointerCapture = vi.fn(() => true)
    handle.releasePointerCapture = vi.fn()

    const { result } = renderHook(() =>
      useGridInteraction({ layout: LAYOUT, width: WIDTH, containerRef, onLayoutChange, disabled: false })
    )
    act(() => result.current.handleProps.onPointerDown(pressOn(handle, { clientX: 10, clientY: 10 })))
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 630, clientY: 10 })
    fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 630, clientY: 10 })

    expect(handle.setPointerCapture).toHaveBeenCalledTimes(1)
    expect(handle.setPointerCapture).toHaveBeenCalledWith(1)
    expect(handle.releasePointerCapture).toHaveBeenCalledTimes(1)
    expect(handle.releasePointerCapture).toHaveBeenCalledWith(1)
    expect(result.current.active).toBeNull()
    expect(onLayoutChange).not.toHaveBeenCalled()
  })

  it('does not release a pointer the handle no longer holds', () => {
    const { containerRef, handle } = mountHandle('a')
    handle.setPointerCapture = vi.fn()
    handle.hasPointerCapture = vi.fn(() => false)
    handle.releasePointerCapture = vi.fn()

    const { result } = renderHook(() =>
      useGridInteraction({ layout: LAYOUT, width: WIDTH, containerRef, onLayoutChange: vi.fn(), disabled: false })
    )
    act(() => result.current.handleProps.onPointerDown(pressOn(handle, { clientX: 10, clientY: 10 })))
    fireEvent.keyDown(window, { key: 'Escape' })

    expect(handle.hasPointerCapture).toHaveBeenCalledWith(1)
    expect(handle.releasePointerCapture).not.toHaveBeenCalled()
  })

  it('works where pointer capture is not available', () => {
    const { containerRef, handle } = mountHandle('a')
    const onLayoutChange = vi.fn()

    const { result } = renderHook(() =>
      useGridInteraction({ layout: LAYOUT, width: WIDTH, containerRef, onLayoutChange, disabled: false })
    )
    act(() => result.current.handleProps.onPointerDown(pressOn(handle, { clientX: 10, clientY: 10 })))
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 630, clientY: 10 })
    fireEvent.keyDown(window, { key: 'Escape' })

    expect(result.current.active).toBeNull()
    expect(onLayoutChange).not.toHaveBeenCalled()
  })

  it('drops the gesture when the grid becomes disabled', () => {
    const { containerRef, handle } = mountHandle('a')
    const onLayoutChange = vi.fn()

    const { result, rerender } = renderHook(
      ({ disabled }) => useGridInteraction({ layout: LAYOUT, width: WIDTH, containerRef, onLayoutChange, disabled }),
      { initialProps: { disabled: false } }
    )
    act(() => result.current.handleProps.onPointerDown(pressOn(handle, { clientX: 10, clientY: 10 })))
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 630, clientY: 10 })
    rerender({ disabled: true })

    expect(result.current.active).toBeNull()
    expect(result.current.layout).toBe(LAYOUT)

    fireEvent.pointerUp(window, { pointerId: 1, clientX: 630, clientY: 10 })

    expect(onLayoutChange).not.toHaveBeenCalled()
  })

  it('stops listening once unmounted', () => {
    const { containerRef, handle } = mountHandle('a')
    const onLayoutChange = vi.fn()

    const { result, unmount } = renderHook(() =>
      useGridInteraction({ layout: LAYOUT, width: WIDTH, containerRef, onLayoutChange, disabled: false })
    )
    act(() => result.current.handleProps.onPointerDown(pressOn(handle, { clientX: 10, clientY: 10 })))
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 630, clientY: 10 })
    unmount()
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 630, clientY: 10 })

    expect(onLayoutChange).not.toHaveBeenCalled()
  })

  it('commits a keyboard move through the latest onLayoutChange', () => {
    const { containerRef, handle } = mountHandle('a')
    const onLayoutChange = vi.fn()
    const preventDefault = vi.fn()

    const { result } = renderHook(() =>
      useGridInteraction({ layout: LAYOUT, width: WIDTH, containerRef, onLayoutChange, disabled: false })
    )
    act(() =>
      result.current.handleProps.onKeyDown({ key: 'ArrowRight', target: handle, currentTarget: handle, preventDefault })
    )

    expect(preventDefault).toHaveBeenCalledTimes(1)
    expect(onLayoutChange).toHaveBeenCalledTimes(1)
    expect(onLayoutChange).toHaveBeenCalledWith([
      { id: 'a', x: 1, y: 0, w: 6, h: 4 },
      { id: 'b', x: 6, y: 4, w: 6, h: 4 },
    ])
  })
})
