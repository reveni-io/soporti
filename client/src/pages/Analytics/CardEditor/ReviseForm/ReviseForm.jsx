import { useId, useState } from 'react'
import { ANALYTICS_PROMPT_MAX_LENGTH } from '../../../../constants.js'
import './ReviseForm.css'

const PLACEHOLDER = 'e.g. make it monthly, only the top 5…'
const HINT = 'The assistant rewrites the saved query. Unsaved edits are discarded.'

export default function ReviseForm({ isSending, error, onAsk }) {
  const [text, setText] = useState('')
  const inputId = useId()

  const prompt = text.trim()
  const canAsk = Boolean(prompt) && !isSending

  function handleSubmit(event) {
    event.preventDefault()
    if (!canAsk) return

    onAsk(prompt)
  }

  return (
    <form className="revise-form" onSubmit={handleSubmit}>
      <label className="revise-form__label" htmlFor={inputId}>
        Ask for a change
      </label>
      <div className="revise-form__row">
        <input
          id={inputId}
          className="input revise-form__input"
          placeholder={PLACEHOLDER}
          maxLength={ANALYTICS_PROMPT_MAX_LENGTH}
          value={text}
          onChange={event => setText(event.target.value)}
        />
        <button type="submit" className="btn btn--secondary btn--sm" disabled={!canAsk}>
          {isSending ? 'Asking…' : 'Ask'}
        </button>
      </div>
      <p className="revise-form__hint">{HINT}</p>

      {error && (
        <p className="alert alert--error" role="alert">
          {error}
        </p>
      )}
    </form>
  )
}
