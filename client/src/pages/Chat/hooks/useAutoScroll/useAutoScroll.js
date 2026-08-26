import { useCallback, useEffect, useRef, useState } from 'react'

const PIN_THRESHOLD_PX = 64

export function useAutoScroll(conversationKey) {
  const scrollRef = useRef(null)
  const contentRef = useRef(null)
  const isPinnedRef = useRef(true)
  const frameRef = useRef(0)
  const [isFollowing, setIsFollowing] = useState(true)

  const scrollToBottom = useCallback(() => {
    const container = scrollRef.current
    if (!container) return

    cancelAnimationFrame(frameRef.current)
    frameRef.current = requestAnimationFrame(() => {
      if (!isPinnedRef.current) return

      container.scrollTop = container.scrollHeight
    })
  }, [])

  const pinToBottom = useCallback(() => {
    isPinnedRef.current = true
    setIsFollowing(true)
    scrollToBottom()
  }, [scrollToBottom])

  useEffect(() => {
    const container = scrollRef.current
    const content = contentRef.current
    if (!container || !content) return

    function handleScroll() {
      const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight
      const pinned = distanceFromBottom <= PIN_THRESHOLD_PX

      isPinnedRef.current = pinned
      setIsFollowing(pinned)
    }

    function handleResize() {
      if (isPinnedRef.current) scrollToBottom()
    }

    const observer = new ResizeObserver(handleResize)
    observer.observe(content)
    observer.observe(container)
    container.addEventListener('scroll', handleScroll, { passive: true })

    return () => {
      observer.disconnect()
      container.removeEventListener('scroll', handleScroll)
      cancelAnimationFrame(frameRef.current)
    }
  }, [scrollToBottom])

  useEffect(() => {
    pinToBottom()
  }, [conversationKey, pinToBottom])

  return { scrollRef, contentRef, pinToBottom, isFollowing }
}
