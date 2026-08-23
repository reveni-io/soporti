import { useCallback, useEffect, useRef, useState } from 'react'
import { isUnauthorized, listArtifacts } from '../../../../services/services.js'

export function useArtifactList(token, onUnauthorized) {
  const [artifacts, setArtifacts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const onUnauthorizedRef = useRef(onUnauthorized)
  onUnauthorizedRef.current = onUnauthorized

  const reload = useCallback(async () => {
    if (!token) return

    setLoading(true)
    try {
      const data = await listArtifacts(token)
      setArtifacts(data.artifacts || [])
      setError(null)
    } catch (err) {
      if (isUnauthorized(err)) {
        onUnauthorizedRef.current?.()
        return
      }
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    reload()
  }, [reload])

  return { artifacts, loading, error, reload }
}
