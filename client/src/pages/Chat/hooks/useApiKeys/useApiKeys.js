import { useCallback, useEffect, useRef, useState } from 'react'
import { getApiKeys, isUnauthorized } from '../../../../services/services.js'

export function useApiKeys(token, onUnauthorized) {
  const [apiKeys, setApiKeys] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const onUnauthorizedRef = useRef(onUnauthorized)
  onUnauthorizedRef.current = onUnauthorized

  const reload = useCallback(async () => {
    if (!token) return

    setLoading(true)
    try {
      const data = await getApiKeys(token)
      setApiKeys(data.apiKeys || [])
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

  return { apiKeys, loading, error, reload }
}
