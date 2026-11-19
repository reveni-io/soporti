import { useEffect, useState } from 'react'
import { isUnauthorized } from '../../../../services/services.js'

export function useJevPage(fetchPage, { token, documentId, page }, onLogout) {
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const data = await fetchPage(token, documentId, page)
        if (active) setResult(data)
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
  }, [fetchPage, token, documentId, page, onLogout])

  return { result, error }
}
