import { useEffect, useState } from 'react'
import { LEGAL_REPLY_SENT_EVENT } from '../../../../../constants.js'
import { getLegalCases, isUnauthorized } from '../../../../../services/services.js'

export function useLegalCases(token, ids, onLogout) {
  const key = ids.join(',')
  const [cases, setCases] = useState(() => new Map())
  const [error, setError] = useState(null)
  const [sentReplies, setSentReplies] = useState(0)

  useEffect(() => {
    function handleReplySent() {
      setSentReplies(count => count + 1)
    }

    window.addEventListener(LEGAL_REPLY_SENT_EVENT, handleReplySent)
    return () => window.removeEventListener(LEGAL_REPLY_SENT_EVENT, handleReplySent)
  }, [])

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
  }, [token, key, onLogout, sentReplies])

  return { cases, error }
}
