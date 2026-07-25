import { useCallback, useEffect, useRef, useState } from 'react'
import { getSkills, isUnauthorized } from '../../services/services.js'

export function useSkills(token, onUnauthorized) {
  const [skills, setSkills] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const onUnauthorizedRef = useRef(onUnauthorized)
  onUnauthorizedRef.current = onUnauthorized

  const reload = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const data = await getSkills(token)
      setSkills(data.skills || [])
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

  return { skills, loading, error, reload }
}
