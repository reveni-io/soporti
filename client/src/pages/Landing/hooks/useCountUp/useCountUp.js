import { useEffect, useRef, useState } from 'react'

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'
const VIEW_THRESHOLD = 0.4

function canAnimate() {
  if (typeof IntersectionObserver === 'undefined') return false

  return !window.matchMedia?.(REDUCED_MOTION_QUERY)?.matches
}

function easeOutCubic(progress) {
  return 1 - (1 - progress) ** 3
}

export function useCountUp({ target, durationMs }) {
  const ref = useRef(null)
  const [value, setValue] = useState(() => (canAnimate() ? 0 : target))

  useEffect(() => {
    const element = ref.current
    if (!element || !canAnimate()) return

    let frameId = 0

    function tick(startedAt, now) {
      const progress = Math.min(1, (now - startedAt) / durationMs)
      setValue(Math.round(target * easeOutCubic(progress)))
      if (progress < 1) frameId = requestAnimationFrame(next => tick(startedAt, next))
    }

    const observer = new IntersectionObserver(
      entries => {
        if (!entries.some(entry => entry.isIntersecting)) return

        observer.disconnect()
        const startedAt = performance.now()
        frameId = requestAnimationFrame(now => tick(startedAt, now))
      },
      { threshold: VIEW_THRESHOLD }
    )
    observer.observe(element)

    return () => {
      observer.disconnect()
      cancelAnimationFrame(frameId)
    }
  }, [target, durationMs])

  return { ref, value }
}
