import { useCallback, useState } from 'react'
import { absoluteAppUrl, isUnauthorized, shareArtifact } from '../../services/services.js'

export function useArtifactShare(token, onAuthError) {
  const [shareUrl, setShareUrl] = useState(null)
  const [error, setError] = useState(null)

  const share = useCallback(
    async (artifactId, version = null) => {
      setError(null)
      try {
        const data = await shareArtifact(token, artifactId, version)
        setShareUrl(absoluteAppUrl(data.url))
      } catch (err) {
        if (isUnauthorized(err)) {
          onAuthError?.()
          return
        }
        setError(err.message)
      }
    },
    [token, onAuthError]
  )

  const dismiss = useCallback(() => setShareUrl(null), [])

  return { shareUrl, error, share, dismiss }
}
