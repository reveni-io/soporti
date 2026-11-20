import { useEffect, useRef, useState } from 'react'

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'
const VIEW_THRESHOLD = 0.35

function canAutoPlay() {
  if (typeof IntersectionObserver === 'undefined') return false

  return !window.matchMedia?.(REDUCED_MOTION_QUERY)?.matches
}

export function useAutoCycle({ count, intervalMs }) {
  const ref = useRef(null)
  const [active, setActive] = useState(0)
  const [round, setRound] = useState(0)
  const [isInView, setIsInView] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  const isPlaying = isInView && !isHovered

  useEffect(() => {
    const element = ref.current
    if (!element || !canAutoPlay()) return

    const observer = new IntersectionObserver(
      entries => {
        setIsInView(entries.some(entry => entry.isIntersecting))
      },
      { threshold: VIEW_THRESHOLD }
    )
    observer.observe(element)

    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!isPlaying) return

    const timer = setTimeout(() => setActive(current => (current + 1) % count), intervalMs)

    return () => clearTimeout(timer)
  }, [isPlaying, active, round, count, intervalMs])

  function select(index) {
    setActive(index)
    setRound(current => current + 1)
  }

  const hoverProps = {
    onMouseEnter: () => setIsHovered(true),
    onMouseLeave: () => setIsHovered(false),
  }
  const progressKey = isPlaying ? `${active}-${round}` : null

  return { ref, active, select, isPlaying, progressKey, hoverProps }
}
