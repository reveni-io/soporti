import { useEffect, useRef } from 'react'

const VISIBLE_CLASS = 'is-visible'
const THRESHOLD = 0.12

export function useReveal() {
  const ref = useRef(null)

  useEffect(() => {
    const element = ref.current
    if (!element) return

    const prefersReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    if (prefersReduced || typeof IntersectionObserver === 'undefined') {
      element.classList.add(VISIBLE_CLASS)
      return
    }

    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add(VISIBLE_CLASS)
            observer.unobserve(entry.target)
          }
        })
      },
      { threshold: THRESHOLD }
    )
    observer.observe(element)

    return () => observer.disconnect()
  }, [])

  return ref
}
