import { useEffect, useState } from 'react'
import { getJevHistory, isUnauthorized } from '../../../../services/services.js'

export function useJevHistory(token, documentId, page, onLogout) {
  const [history, setHistory] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const data = await getJevHistory(token, documentId, page)
        if (active) setHistory(data)
      } catch (err) {
        if (isUnauthorized(err)) {
          onLogout?.()
          return
        }
        if (active) setError(err.message)
      }
    }
    load()
    return () => {
      active = false
    }
  }, [token, documentId, page, onLogout])

  return { history, error }
}
