import { describe, it, expect, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useDrawerSwipe } from './useDrawerSwipe.js'

const DRAWER_WIDTH = 300

function pointer(clientX, clientY, pointerType = 'touch') {
  return { pointerType, clientX, clientY, currentTarget: { offsetWidth: DRAWER_WIDTH } }
}

function touch(type, clientX, clientY) {
  const event = new Event(type)
  event.touches = [{ clientX, clientY }]
  return event
}

function drag(result, from, to) {
  act(() => result.current.drawerProps.onPointerDown(pointer(from.x, from.y)))
  act(() => result.current.drawerProps.onPointerMove(pointer(to.x, to.y)))
}

describe('useDrawerSwipe', () => {
  it('follows a finger dragging the open drawer to the left', () => {
    const { result } = renderHook(() => useDrawerSwipe({ isOpen: true, onOpen: vi.fn(), onClose: vi.fn() }))

    drag(result, { x: 250, y: 400 }, { x: 190, y: 404 })

    expect(result.current.offset).toBe(-60)
    expect(result.current.isDragging).toBe(true)
  })

  it('closes the drawer once it is dragged past a third of its width', () => {
    const onClose = vi.fn()
    const { result } = renderHook(() => useDrawerSwipe({ isOpen: true, onOpen: vi.fn(), onClose }))

    drag(result, { x: 280, y: 400 }, { x: 150, y: 402 })
    act(() => result.current.drawerProps.onPointerUp())

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(result.current.offset).toBe(0)
  })

  it('snaps back after a short drag', () => {
    const onClose = vi.fn()
    const { result } = renderHook(() => useDrawerSwipe({ isOpen: true, onOpen: vi.fn(), onClose }))

    drag(result, { x: 250, y: 400 }, { x: 220, y: 400 })
    act(() => result.current.drawerProps.onPointerUp())

    expect(onClose).not.toHaveBeenCalled()
    expect(result.current.offset).toBe(0)
  })

  it('leaves vertical scrolling alone', () => {
    const onClose = vi.fn()
    const { result } = renderHook(() => useDrawerSwipe({ isOpen: true, onOpen: vi.fn(), onClose }))

    drag(result, { x: 200, y: 500 }, { x: 150, y: 300 })
    act(() => result.current.drawerProps.onPointerUp())

    expect(onClose).not.toHaveBeenCalled()
    expect(result.current.offset).toBe(0)
  })

  it('never drags the drawer to the right or with a mouse', () => {
    const { result } = renderHook(() => useDrawerSwipe({ isOpen: true, onOpen: vi.fn(), onClose: vi.fn() }))

    drag(result, { x: 100, y: 400 }, { x: 160, y: 400 })
    expect(result.current.offset).toBe(0)

    act(() => result.current.drawerProps.onPointerDown(pointer(250, 400, 'mouse')))
    act(() => result.current.drawerProps.onPointerMove(pointer(100, 400, 'mouse')))
    expect(result.current.offset).toBe(0)
  })

  it('opens the closed drawer on a swipe from the left edge', () => {
    const onOpen = vi.fn()
    renderHook(() => useDrawerSwipe({ isOpen: false, onOpen, onClose: vi.fn() }))

    act(() => {
      document.dispatchEvent(touch('touchstart', 6, 400))
      document.dispatchEvent(touch('touchmove', 60, 404))
    })

    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('ignores swipes that start away from the edge or go up and down', () => {
    const onOpen = vi.fn()
    renderHook(() => useDrawerSwipe({ isOpen: false, onOpen, onClose: vi.fn() }))

    act(() => {
      document.dispatchEvent(touch('touchstart', 120, 400))
      document.dispatchEvent(touch('touchmove', 200, 400))
      document.dispatchEvent(touch('touchstart', 6, 400))
      document.dispatchEvent(touch('touchmove', 10, 300))
      document.dispatchEvent(touch('touchmove', 80, 300))
    })

    expect(onOpen).not.toHaveBeenCalled()
  })

  it('stops listening for edge swipes while the drawer is open', () => {
    const onOpen = vi.fn()
    renderHook(() => useDrawerSwipe({ isOpen: true, onOpen, onClose: vi.fn() }))

    act(() => {
      document.dispatchEvent(touch('touchstart', 6, 400))
      document.dispatchEvent(touch('touchmove', 60, 404))
    })

    expect(onOpen).not.toHaveBeenCalled()
  })
})
