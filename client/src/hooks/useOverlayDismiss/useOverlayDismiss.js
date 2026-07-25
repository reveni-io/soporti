import { useRef } from 'react'

export function useOverlayDismiss(onDismiss) {
  const pressedOverlay = useRef(false)

  return {
    onMouseDown: e => {
      pressedOverlay.current = e.target === e.currentTarget
    },
    onClick: e => {
      const wasPressedOnOverlay = pressedOverlay.current
      pressedOverlay.current = false
      if (wasPressedOnOverlay && e.target === e.currentTarget) onDismiss()
    },
  }
}
