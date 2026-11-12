import { useEffect, useMemo, useRef, useState } from 'react'
import { cellAt, moveItem, moveRect, resizeItem, resizeRect, shiftItem, spanAt } from '../../grid-layout.js'

const DRAG_THRESHOLD = 4
const PRIMARY_BUTTON = 0
const NO_DRAG_SELECTOR = 'button, a, input, textarea, select, [data-no-drag]'
const ITEM_SELECTOR = '[data-grid-item]'
const HANDLE_LABEL = 'Move chart: the arrow keys move it, Shift with the arrow keys resizes it'
const HANDLE_ROLE_DESCRIPTION = 'drag handle'
const INERT_PROPS = { handleProps: {}, resizeProps: {} }
const KEY_STEPS = {
  ArrowLeft: { dx: -1, dy: 0 },
  ArrowRight: { dx: 1, dy: 0 },
  ArrowUp: { dx: 0, dy: -1 },
  ArrowDown: { dx: 0, dy: 1 },
}

function pointIn(container, event) {
  const bounds = container.getBoundingClientRect()

  return { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
}

function itemOf(layout, element) {
  const id = element.closest(ITEM_SELECTOR).dataset.gridItem

  return layout.find(item => item.id === id)
}

function pressesControl(event) {
  const control = event.target.closest(NO_DRAG_SELECTOR)

  return Boolean(control) && control !== event.currentTarget && event.currentTarget.contains(control)
}

function hasModifier(event) {
  return event.altKey || event.ctrlKey || event.metaKey
}

function preventDefault(event) {
  event.preventDefault()
}

function capturePointer(element, pointerId) {
  if (element.setPointerCapture) element.setPointerCapture(pointerId)
}

function releasePointer(element, pointerId) {
  if (element.hasPointerCapture?.(pointerId)) element.releasePointerCapture(pointerId)
}

function resolveDrag({ base, item, width, isResize }, delta) {
  const rect = isResize ? resizeRect(item, delta, width) : moveRect(item, delta, width)

  if (isResize) return { rect, layout: resizeItem(base, item.id, spanAt(rect, width)) }

  return { rect, layout: moveItem(base, item.id, cellAt(rect, width)) }
}

function trackPress(press, { container, onDrag, onEnd }) {
  let pointer = null
  let isDragging = false

  function resolve() {
    const point = pointIn(container, pointer)
    const delta = { dx: point.x - press.grab.x, dy: point.y - press.grab.y }

    isDragging = isDragging || Math.hypot(delta.dx, delta.dy) >= DRAG_THRESHOLD

    return isDragging ? resolveDrag(press, delta) : null
  }

  function refresh() {
    const drag = pointer && resolve()

    if (drag) onDrag(drag)
  }

  function handleMove(event) {
    if (event.pointerId !== press.pointerId) return

    pointer = event
    refresh()
  }

  function handleUp(event) {
    if (event.pointerId !== press.pointerId) return

    pointer = event

    const drag = resolve()

    onEnd(drag && drag.layout !== press.base ? drag.layout : null)
  }

  function handleCancel(event) {
    if (event.pointerId === press.pointerId) onEnd(null)
  }

  function abort() {
    releasePointer(press.handle, press.pointerId)
    onEnd(null)
  }

  function handleKeyDown(event) {
    if (event.key === 'Escape') abort()
  }

  const listeners = [
    ['pointermove', handleMove, false],
    ['pointerup', handleUp, false],
    ['pointercancel', handleCancel, false],
    ['keydown', handleKeyDown, false],
    ['contextmenu', preventDefault, false],
    ['blur', abort, false],
    ['scroll', refresh, true],
  ]

  listeners.forEach(([type, listener, capture]) => window.addEventListener(type, listener, capture))

  return () => {
    listeners.forEach(([type, listener, capture]) => window.removeEventListener(type, listener, capture))
  }
}

function createProps({ latestRef, containerRef, onPress }) {
  function startPress(event, isResize) {
    if (event.button !== PRIMARY_BUTTON) return

    const { layout, width } = latestRef.current
    const handle = event.currentTarget

    capturePointer(handle, event.pointerId)
    onPress({
      isResize,
      handle,
      width,
      pointerId: event.pointerId,
      base: layout,
      item: itemOf(layout, handle),
      grab: pointIn(containerRef.current, event),
    })
  }

  function handleKey(event, isResize) {
    const step = KEY_STEPS[event.key]

    if (!step || hasModifier(event) || event.target !== event.currentTarget) return

    event.preventDefault()

    const { layout, onLayoutChange } = latestRef.current
    const item = itemOf(layout, event.currentTarget)
    const next = isResize
      ? resizeItem(layout, item.id, { w: item.w + step.dx, h: item.h + step.dy })
      : shiftItem(layout, item.id, step)

    if (next !== layout) onLayoutChange(next)
  }

  return {
    handleProps: {
      role: 'group',
      tabIndex: 0,
      'aria-label': HANDLE_LABEL,
      'aria-roledescription': HANDLE_ROLE_DESCRIPTION,
      'data-grid-handle': '',
      onDragStart: preventDefault,
      onKeyDown: event => handleKey(event, event.shiftKey),
      onPointerDown: event => {
        if (!pressesControl(event)) startPress(event, false)
      },
    },
    resizeProps: {
      onKeyDown: event => handleKey(event, true),
      onPointerDown: event => startPress(event, true),
    },
  }
}

export function useGridInteraction({ layout, width, containerRef, onLayoutChange, disabled }) {
  const [gesture, setGesture] = useState(null)
  const latestRef = useRef({ layout, width, onLayoutChange })

  const isCurrent = Boolean(gesture) && !disabled && gesture.press.base === layout
  const press = isCurrent ? gesture.press : null
  const drag = isCurrent ? gesture.drag : null

  useEffect(() => {
    latestRef.current = { layout, width, onLayoutChange }
  })

  useEffect(() => {
    if (!press) return undefined

    return trackPress(press, {
      container: containerRef.current,
      onDrag: nextDrag => setGesture({ press, drag: nextDrag }),
      onEnd: nextLayout => {
        setGesture(null)
        if (nextLayout) latestRef.current.onLayoutChange(nextLayout)
      },
    })
  }, [press, containerRef])

  const props = useMemo(() => {
    if (disabled) return INERT_PROPS

    return createProps({
      latestRef,
      containerRef,
      onPress: nextPress => setGesture({ press: nextPress, drag: null }),
    })
  }, [disabled, containerRef])

  return {
    ...props,
    layout: drag ? drag.layout : layout,
    active: drag ? { id: press.item.id, isResize: press.isResize, rect: drag.rect } : null,
  }
}
