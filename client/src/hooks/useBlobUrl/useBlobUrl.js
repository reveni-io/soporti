import { useEffect, useRef, useState } from 'react'
import { isUnauthorized } from '../../services/services.js'

export function useBlobUrl(loadBlob, onLogout) {
  const [url, setUrl] = useState(null)
  const [error, setError] = useState(null)
  const onLogoutRef = useRef(onLogout)
  onLogoutRef.current = onLogout

  useEffect(() => {
    setUrl(null)
    setError(null)
    if (!loadBlob) return

    let active = true
    let objectUrl = null

    async function load() {
      try {
        const blob = await loadBlob()
        if (!active) return
        objectUrl = URL.createObjectURL(blob)
        setUrl(objectUrl)
      } catch (err) {
        if (!active) return
        if (isUnauthorized(err)) {
          onLogoutRef.current?.()
          return
        }
        setError(err.message)
      }
    }

    load()

    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [loadBlob])

  return { url, error }
}
