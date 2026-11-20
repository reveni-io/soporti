import { useState } from 'react'
import { sendLegalReply } from '../../../../../services/services.js'

export function useSendReply(token, caseId, onSent) {
  const [confirming, setConfirming] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)

  function start() {
    setError(null)
    setConfirming(true)
  }

  function cancel() {
    setConfirming(false)
  }

  async function send(text, warningsRead) {
    setSending(true)
    setError(null)
    try {
      const { reply } = await sendLegalReply(token, caseId, { text, warningsRead })
      setConfirming(false)
      onSent(reply)
    } catch (err) {
      setError(err.message)
    } finally {
      setSending(false)
    }
  }

  return { confirming, sending, error, start, cancel, send }
}
