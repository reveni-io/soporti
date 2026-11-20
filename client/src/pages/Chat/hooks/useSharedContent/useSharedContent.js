import { useEffect, useRef } from 'react'
import { clearSharedContent, readSharedContent } from '../../../../pwa/shared-content.js'

async function readStoredShare() {
  try {
    return await readSharedContent()
  } catch {
    return null
  }
}

export function useSharedContent({ isShared, onShare, onRead }) {
  const handlersRef = useRef({ onShare, onRead })
  handlersRef.current = { onShare, onRead }

  useEffect(() => {
    if (!isShared) return

    let active = true
    async function consume() {
      const content = await readStoredShare()
      if (!active) return

      handlersRef.current.onRead()
      if (content) handlersRef.current.onShare(content)
      await clearSharedContent().catch(() => {})
    }
    consume()
    return () => {
      active = false
    }
  }, [isShared])
}
