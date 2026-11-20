import { useEffect, useState } from 'react'
import { getLegalCases, isUnauthorized } from '../../../../../services/services.js'

export function useLegalCases(token, ids, onLogout) {
  const key = ids.join(',')
  const [cases, setCases] = useState(() => new Map())
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!token || !key) return undefined

    let active = true
    async function load() {
      try {
        const data = await getLegalCases(token, key.split(','))
        if (active) setCases(new Map(data.cases.map(legalCase => [legalCase.id, legalCase])))
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
  }, [token, key, onLogout])

  return { cases, error }
}
