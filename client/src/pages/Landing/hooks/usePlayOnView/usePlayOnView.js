import { useEffect, useRef, useState } from 'react'

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

export function usePlayOnView({ play, initialFrame, finalFrame, threshold }) {
  const ref = useRef(null)
  const [frame, setFrame] = useState(initialFrame)

  useEffect(() => {
    const element = ref.current
    if (!element) return

    const prefersReduced = window.matchMedia?.(REDUCED_MOTION_QUERY)?.matches
    if (prefersReduced || typeof IntersectionObserver === 'undefined') {
      setFrame(finalFrame)
      return
    }

    let cancelled = false
    let started = false
    const timers = []
    const sleep = ms => new Promise(resolve => timers.push(setTimeout(resolve, ms)))
    const isCancelled = () => cancelled

    function show(value) {
      if (!cancelled) setFrame(value)
    }

    const observer = new IntersectionObserver(
      entries => {
        if (started || !entries.some(entry => entry.isIntersecting)) return

        started = true
        observer.unobserve(element)
        play({ show, sleep, isCancelled })
      },
      { threshold }
    )
    observer.observe(element)

    return () => {
      cancelled = true
      observer.disconnect()
      timers.forEach(clearTimeout)
    }
  }, [play, finalFrame, threshold])

  return { ref, frame }
}
