import { useCallback, useMemo, useState } from 'react'
import { extractCitations } from '../../common/Citations/extract-citations.js'

export function useCitations(markdown) {
  const [isOpen, setIsOpen] = useState(false)
  const [selectedUrl, setSelectedUrl] = useState(null)

  const citations = useMemo(() => extractCitations(markdown), [markdown])

  const select = useCallback(url => {
    setSelectedUrl(url)
    setIsOpen(true)
  }, [])

  const toggle = useCallback(() => {
    setSelectedUrl(null)
    setIsOpen(open => !open)
  }, [])

  return { citations, isOpen, selectedUrl, select, toggle }
}
