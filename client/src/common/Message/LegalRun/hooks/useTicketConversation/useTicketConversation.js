import { useState } from 'react'
import { getLegalConversation } from '../../../../../services/services.js'

export function useTicketConversation(token, caseId) {
  const [messages, setMessages] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const data = await getLegalConversation(token, caseId)
      setMessages(data.messages)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return { messages, loading, error, load }
}
