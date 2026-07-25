import { useCallback, useEffect, useRef, useState } from 'react'

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
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/skills`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.status === 401) {
        onUnauthorizedRef.current?.()
        return
      }
      if (!res.ok) throw new Error('Failed to load skills')
      const data = await res.json()
      setSkills(data.skills || [])
      setError(null)
    } catch (err) {
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
