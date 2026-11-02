import { useEffect, useRef, useState } from 'react'
import { getVideoPreview, isUnauthorized } from '../../../../services/services.js'

export function useVideoPreview({ token, videoId, version, onLogout }) {
  const [html, setHtml] = useState(null)
  const [error, setError] = useState(null)
  const onLogoutRef = useRef(onLogout)
  onLogoutRef.current = onLogout

  useEffect(() => {
    setHtml(null)
    setError(null)

    let active = true

    async function load() {
      try {
        const data = await getVideoPreview(token, videoId, version)
        if (active) setHtml(data.html)
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
    }
  }, [token, videoId, version])

  return { html, error }
}
