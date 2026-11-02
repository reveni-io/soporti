import { useState } from 'react'
import './VideoComposer.css'

const TEXTAREA_ROWS = 3
const MESSAGE_MAX_LENGTH = 4000

export default function VideoComposer({ placeholder, disabled, busy, onSend }) {
  const [draft, setDraft] = useState('')
  const text = draft.trim()

  async function handleSubmit(event) {
    event.preventDefault()
    if (await onSend(text)) setDraft('')
  }

  return (
    <form className="video-composer" onSubmit={handleSubmit}>
      <textarea
        className="textarea video-composer__input"
        aria-label="Message"
        rows={TEXTAREA_ROWS}
        maxLength={MESSAGE_MAX_LENGTH}
        placeholder={placeholder}
        value={draft}
        disabled={disabled}
        onChange={event => setDraft(event.target.value)}
      />
      <button type="submit" className="btn btn--primary video-composer__send" disabled={disabled || busy || !text}>
        Send
      </button>
    </form>
  )
}
