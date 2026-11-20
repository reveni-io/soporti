import { useCallback, useEffect, useState } from 'react'
import { getLegalCases } from '../../../../../services/services.js'

export function useLegalCases(token, ids) {
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
        if (active) setError(err.message)
      }
    }
    load()

    return () => {
      active = false
    }
  }, [token, key])

  const addReply = useCallback((id, reply) => {
    setCases(current => {
      const legalCase = current.get(id)
      if (!legalCase) return current

      return new Map(current).set(id, { ...legalCase, replies: [...legalCase.replies, reply] })
    })
  }, [])

  return { cases, error, addReply }
}
