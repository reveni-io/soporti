import { useLayoutEffect, useRef, useState } from 'react'

const FALLBACK_WIDTH = 1200

export function useContainerWidth() {
  const containerRef = useRef(null)
  const [width, setWidth] = useState(null)

  useLayoutEffect(() => {
    const container = containerRef.current
    const observer = new ResizeObserver(entries => setWidth(entries[0].contentRect.width || FALLBACK_WIDTH))

    setWidth(container.getBoundingClientRect().width || FALLBACK_WIDTH)
    observer.observe(container)

    return () => observer.disconnect()
  }, [])

  return { containerRef, width }
}
