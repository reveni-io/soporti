import { useEffect, useImperativeHandle, useRef, useState } from 'react'
import Icon from '../../../common/Icon/Icon.jsx'
import { useSaveField } from '../../../hooks/useSaveField/useSaveField.js'
import { ANALYTICS_PROMPT_MAX_LENGTH } from '../../../constants.js'
import './AskBar.css'

const PLACEHOLDER = 'Describe the chart you want…'
const INPUT_LABEL = 'Describe the chart you want'

export default function AskBar({ onAsk, disabled, ref }) {
  const [text, setText] = useState('')
  const textareaRef = useRef(null)
  const { saving: submitting, error, save } = useSaveField()

  const prompt = text.trim()
  const canSubmit = Boolean(prompt) && !submitting && !disabled

  useImperativeHandle(
    ref,
    () => ({
      fill(nextText) {
        setText(nextText)
        textareaRef.current?.focus()
      },
    }),
    []
  )

  useEffect(() => {
    const textarea = textareaRef.current

    textarea.style.height = 'auto'
    textarea.style.height = `${textarea.scrollHeight}px`
  }, [text])

  async function submit() {
    if (!canSubmit) return

    const created = await save(() => onAsk(prompt))
    if (created) setText(current => (current.startsWith(text) ? current.slice(text.length) : current))
  }

  function handleSubmit(event) {
    event.preventDefault()
    submit()
  }

  function handleKeyDown(event) {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return

    event.preventDefault()
    submit()
  }

  return (
    <form className="ask-bar" onSubmit={handleSubmit}>
      <div className="card ask-bar__card">
        <span className="ask-bar__icon">
          <Icon name="spark" size={18} />
        </span>
        <textarea
          ref={textareaRef}
          className="ask-bar__input"
          rows={1}
          aria-label={INPUT_LABEL}
          placeholder={PLACEHOLDER}
          maxLength={ANALYTICS_PROMPT_MAX_LENGTH}
          value={text}
          disabled={disabled}
          onChange={event => setText(event.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button type="submit" className="btn btn--primary ask-bar__submit" disabled={!canSubmit}>
          {submitting ? 'Creating…' : 'Create chart'}
        </button>
      </div>

      {error && (
        <p className="alert alert--error" role="alert">
          {error}
        </p>
      )}
    </form>
  )
}
