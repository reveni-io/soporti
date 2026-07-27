import { useCallback, useEffect, useRef, useState } from 'react'
import { getSchedules, isUnauthorized } from '../../../../services/services.js'

export function useSchedules(token, onUnauthorized) {
  const [schedules, setSchedules] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const onUnauthorizedRef = useRef(onUnauthorized)
  onUnauthorizedRef.current = onUnauthorized

  const reload = useCallback(async () => {
    if (!token) return

    setLoading(true)
    try {
      const data = await getSchedules(token)
      setSchedules(data.schedules || [])
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

  return { schedules, loading, error, reload }
}
