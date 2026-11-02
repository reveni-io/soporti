import { useCallback, useEffect, useRef, useState } from 'react'
import { isUnauthorized } from '../../services/services.js'

export function usePolledResource(fetchResource, { token, intervalMs, shouldPoll, onLogout }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const onLogoutRef = useRef(onLogout)
  onLogoutRef.current = onLogout

  const isPolling = Boolean(token) && data !== null && shouldPoll(data)

  const refresh = useCallback(
    async isCurrent => {
      try {
        const next = await fetchResource(token)
        if (!isCurrent()) return
        setData(next)
        setError(null)
      } catch (err) {
        if (!isCurrent()) return
        if (isUnauthorized(err)) {
          onLogoutRef.current?.()
          return
        }
        setError(err.message)
      } finally {
        if (isCurrent()) setLoading(false)
      }
    },
    [fetchResource, token]
  )

  useEffect(() => {
    if (!token) return

    let active = true
    refresh(() => active)

    return () => {
      active = false
    }
  }, [token, refresh])

  useEffect(() => {
    if (!isPolling) return

    let active = true
    let timer = null

    async function poll() {
      await refresh(() => active)
      if (active) timer = setTimeout(poll, intervalMs)
    }

    timer = setTimeout(poll, intervalMs)

    return () => {
      active = false
      clearTimeout(timer)
    }
  }, [isPolling, refresh, intervalMs])

  return { data, setData, loading, error }
}
