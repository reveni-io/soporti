import { useEffect, useState } from 'react'
import { getRepos, isUnauthorized } from '../../../../services/services.js'

export function useRepos(token, onLogout) {
  const [repos, setRepos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const data = await getRepos(token)
        if (active) setRepos(data.repos)
      } catch (err) {
        if (isUnauthorized(err)) {
          onLogout()
          return
        }
        if (active) setError(err.message)
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => {
      active = false
    }
  }, [token, onLogout])

  return { repos, loading, error }
}
