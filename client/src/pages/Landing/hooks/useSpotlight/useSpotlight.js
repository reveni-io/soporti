import { useRef } from 'react'

const SPOTLIGHT_SELECTOR = '[data-spotlight]'

export function useSpotlight() {
  const ref = useRef(null)

  function handlePointerMove(event) {
    const cards = ref.current?.querySelectorAll(SPOTLIGHT_SELECTOR) ?? []

    cards.forEach(card => {
      const rect = card.getBoundingClientRect()
      card.style.setProperty('--spot-x', `${event.clientX - rect.left}px`)
      card.style.setProperty('--spot-y', `${event.clientY - rect.top}px`)
    })
  }

  return { ref, onPointerMove: handlePointerMove }
}
