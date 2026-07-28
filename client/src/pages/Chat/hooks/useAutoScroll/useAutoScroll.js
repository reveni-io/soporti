import { useCallback, useEffect, useRef } from 'react'

const PIN_THRESHOLD_PX = 64

export function useAutoScroll() {
  const scrollRef = useRef(null)
  const contentRef = useRef(null)
  const isPinnedRef = useRef(true)
  const frameRef = useRef(0)

  const scrollToBottom = useCallback(() => {
    const container = scrollRef.current
    if (!container) return

    cancelAnimationFrame(frameRef.current)
    frameRef.current = requestAnimationFrame(() => {
      container.scrollTop = container.scrollHeight
    })
  }, [])

  function pinToBottom() {
    isPinnedRef.current = true
    scrollToBottom()
  }

  useEffect(() => {
    const container = scrollRef.current
    const content = contentRef.current
    if (!container || !content) return

    function handleScroll() {
      const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight
      isPinnedRef.current = distanceFromBottom <= PIN_THRESHOLD_PX
    }

    function handleContentGrowth() {
      if (isPinnedRef.current) scrollToBottom()
    }

    const observer = new ResizeObserver(handleContentGrowth)
    observer.observe(content)
    container.addEventListener('scroll', handleScroll, { passive: true })

    return () => {
      observer.disconnect()
      container.removeEventListener('scroll', handleScroll)
      cancelAnimationFrame(frameRef.current)
    }
  }, [scrollToBottom])

  return { scrollRef, contentRef, pinToBottom }
}
