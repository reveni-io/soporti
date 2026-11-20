import { useState } from 'react'
import { isUnauthorized, sendLegalReply } from '../../../../../services/services.js'

export function useSendReply(token, caseId, onSent, onLogout) {
  const [confirming, setConfirming] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)
  const [warning, setWarning] = useState(null)

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
      const { reply, warning: sentWarning } = await sendLegalReply(token, caseId, { text, warningsRead })
      setConfirming(false)
      setWarning(sentWarning ?? null)
      onSent(reply)
    } catch (err) {
      if (isUnauthorized(err)) {
        onLogout?.()
        return
      }
      setError(err.message)
    } finally {
      setSending(false)
    }
  }

  return { confirming, sending, error, warning, start, cancel, send }
}
