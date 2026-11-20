import { useState } from 'react'
import { getLegalConversation, isUnauthorized } from '../../../../../services/services.js'

export function useTicketConversation(token, caseId, onLogout) {
  const [messages, setMessages] = useState(null)
  const [notice, setNotice] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const data = await getLegalConversation(token, caseId)
      setMessages(data.messages)
      setNotice(data.notice ?? null)
    } catch (err) {
      if (isUnauthorized(err)) {
        onLogout?.()
        return
      }
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return { messages, notice, loading, error, load }
}
