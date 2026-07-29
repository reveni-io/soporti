import { useEffect, useState } from 'react'
import { getAdminStats, isUnauthorized } from '../../../../../services/services.js'
import { STATS_RANGE_ALL } from '../../../../../constants.js'

export function useAdminStats(token, onLogout) {
  const [range, setRange] = useState(STATS_RANGE_ALL)
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let active = true

    async function load() {
      setLoading(true)
      setError(null)

      try {
        const data = await getAdminStats(token, range)
        if (active) setStats(data.stats)
      } catch (err) {
        if (!active) return
        if (isUnauthorized(err)) {
          onLogout?.()
          return
        }
        setError(err.message)
      } finally {
        if (active) setLoading(false)
      }
    }

    load()

    return () => {
      active = false
    }
  }, [token, range, onLogout])

  return { range, setRange, stats, loading, error }
}
