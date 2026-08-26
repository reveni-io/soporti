import { useEffect, useRef, useState } from 'react'

const BUFFER_MS = 350
const MIN_CHARS_PER_MS = 0.012
const MAX_FRAME_MS = 100

export function useSmoothText(content, isActive) {
  const [revealed, setRevealed] = useState(content.length)
  const targetRef = useRef(content)
  const revealedRef = useRef(content.length)
  const carryRef = useRef(0)

  useEffect(() => {
    targetRef.current = content

    if (!isActive) {
      revealedRef.current = content.length
      carryRef.current = 0
    }
  }, [content, isActive])

  useEffect(() => {
    if (!isActive) return

    let frame = 0
    let previous = null

    function step(now) {
      const elapsedMs = previous === null ? 0 : Math.min(now - previous, MAX_FRAME_MS)
      previous = now

      const target = targetRef.current.length
      const backlog = target - revealedRef.current

      if (backlog > 0) {
        carryRef.current += Math.max(backlog / BUFFER_MS, MIN_CHARS_PER_MS) * elapsedMs

        const chars = Math.floor(carryRef.current)
        if (chars > 0) {
          carryRef.current -= chars
          revealedRef.current = Math.min(revealedRef.current + chars, target)
          setRevealed(revealedRef.current)
        }
      }

      frame = requestAnimationFrame(step)
    }

    frame = requestAnimationFrame(step)

    return () => cancelAnimationFrame(frame)
  }, [isActive])

  return { text: isActive ? content.slice(0, revealed) : content }
}
