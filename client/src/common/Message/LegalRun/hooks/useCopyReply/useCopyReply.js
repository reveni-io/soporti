import { useState } from 'react'

const COPIED = 'Copied. Paste it in the ticket.'
const COPY_BY_HAND = 'Select the text and copy it with Ctrl+C.'

export function useCopyReply() {
  const [status, setStatus] = useState(null)

  async function copy(text, textarea) {
    try {
      await navigator.clipboard.writeText(text)
      setStatus(COPIED)
    } catch {
      textarea?.select()
      setStatus(COPY_BY_HAND)
    }
  }

  return { status, copy }
}
