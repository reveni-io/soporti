import { useEffect, useRef, useState } from 'react'
import { messageLabel, messagePreview } from './message-preview.js'
import { progressAt, readingLineAt } from './rail-geometry.js'

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'
const OVERFLOW_MIN_PX = 240

export function useMessageRail(scrollRef, contentRef, messages) {
  const [progress, setProgress] = useState(0)
  const [isOverflowing, setIsOverflowing] = useState(false)
  const frameRef = useRef(0)

  const items = messages.map((message, index) => ({
    index,
    role: message.role,
    preview: messagePreview(message),
    label: messageLabel(message, index),
  }))
  const lastIndex = messages.length - 1

  useEffect(() => {
    const container = scrollRef.current
    const content = contentRef.current
    if (!container || !content) return

    function measure() {
      const readingLine = readingLineAt(container.scrollTop, container.scrollHeight, container.clientHeight)

      setIsOverflowing(container.scrollHeight - container.clientHeight > OVERFLOW_MIN_PX)
      setProgress(progressAt(messageTops(container, content), readingLine))
    }

    function handleScroll() {
      cancelAnimationFrame(frameRef.current)
      frameRef.current = requestAnimationFrame(measure)
    }

    const observer = new ResizeObserver(measure)
    observer.observe(container)
    observer.observe(content)
    container.addEventListener('scroll', handleScroll, { passive: true })
    measure()

    return () => {
      observer.disconnect()
      container.removeEventListener('scroll', handleScroll)
      cancelAnimationFrame(frameRef.current)
    }
  }, [scrollRef, contentRef, messages.length])

  function scrollToMessage(index) {
    const content = contentRef.current
    if (!content) return

    const target = content.querySelector(`[data-message-index="${index}"]`)
    if (!target) return

    target.scrollIntoView({ behavior: scrollBehavior(), block: index === lastIndex ? 'end' : 'start' })
  }

  return { items, progress, activeIndex: Math.round(progress), isOverflowing, scrollToMessage }
}

function messageTops(container, content) {
  const containerTop = container.getBoundingClientRect().top

  return [...content.querySelectorAll('[data-message-index]')].map(
    element => element.getBoundingClientRect().top - containerTop
  )
}

function scrollBehavior() {
  return window.matchMedia?.(REDUCED_MOTION_QUERY)?.matches ? 'auto' : 'smooth'
}
