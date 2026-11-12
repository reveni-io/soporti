import { useState } from 'react'
import { compactLayout, isSameLayout } from '../../grid-layout.js'

export function useCompactLayout(layout) {
  const compacted = compactLayout(layout)
  const [stable, setStable] = useState(compacted)

  if (isSameLayout(stable, compacted)) return stable

  setStable(compacted)

  return compacted
}
