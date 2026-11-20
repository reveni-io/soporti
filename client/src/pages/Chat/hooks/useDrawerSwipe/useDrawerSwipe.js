import { useEffect, useRef, useState } from 'react'

const EDGE_WIDTH_PX = 24
const INTENT_PX = 10
const CLOSE_RATIO = 0.3
const TOUCH_POINTER = 'touch'

function horizontalIntent(dx, dy) {
  if (Math.abs(dx) < INTENT_PX && Math.abs(dy) < INTENT_PX) return null
  return Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical'
}

function useEdgeSwipe(isEnabled, onOpen) {
  const onOpenRef = useRef(onOpen)
  onOpenRef.current = onOpen

  useEffect(() => {
    if (!isEnabled) return
    let start = null

    function handleTouchStart(event) {
      const touch = event.touches[0]
      start = touch.clientX <= EDGE_WIDTH_PX ? { x: touch.clientX, y: touch.clientY } : null
    }

    function handleTouchMove(event) {
      if (!start) return
      const touch = event.touches[0]
      const intent = horizontalIntent(touch.clientX - start.x, touch.clientY - start.y)
      if (!intent) return

      if (intent === 'horizontal' && touch.clientX > start.x) onOpenRef.current()
      start = null
    }

    document.addEventListener('touchstart', handleTouchStart, { passive: true })
    document.addEventListener('touchmove', handleTouchMove, { passive: true })
    return () => {
      document.removeEventListener('touchstart', handleTouchStart)
      document.removeEventListener('touchmove', handleTouchMove)
    }
  }, [isEnabled])
}

export function useDrawerSwipe({ isOpen, onOpen, onClose }) {
  const [offset, setOffset] = useState(0)
  const gesture = useRef(null)

  useEdgeSwipe(!isOpen && Boolean(onOpen), onOpen)

  function reset() {
    gesture.current = null
    setOffset(0)
  }

  function handlePointerDown(event) {
    if (!isOpen || event.pointerType !== TOUCH_POINTER) return
    gesture.current = { x: event.clientX, y: event.clientY, width: event.currentTarget.offsetWidth, intent: null }
  }

  function handlePointerMove(event) {
    const current = gesture.current
    if (!current) return

    const dx = event.clientX - current.x
    current.intent ??= horizontalIntent(dx, event.clientY - current.y)
    if (current.intent === 'vertical') {
      reset()
      return
    }
    if (current.intent === 'horizontal') setOffset(Math.min(0, dx))
  }

  function handlePointerUp() {
    const current = gesture.current
    if (!current) return

    if (offset < -current.width * CLOSE_RATIO) onClose()
    reset()
  }

  return {
    offset,
    isDragging: offset !== 0,
    drawerProps: {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
      onPointerCancel: reset,
    },
  }
}
