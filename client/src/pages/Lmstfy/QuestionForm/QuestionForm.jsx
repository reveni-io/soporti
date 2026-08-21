import { useRef, useState } from 'react'
import { buildReplayUrl } from '../question-link.js'
import './QuestionForm.css'

const QUESTION_FIELD_ID = 'lmstfy-question'

export default function QuestionForm() {
  const [question, setQuestion] = useState('')
  const [link, setLink] = useState('')
  const [isCopied, setIsCopied] = useState(false)
  const linkRef = useRef(null)

  const trimmedQuestion = question.trim()

  function handleChange(event) {
    setQuestion(event.target.value)
    setLink('')
    setIsCopied(false)
  }

  function handleSubmit(event) {
    event.preventDefault()
    if (!trimmedQuestion) return

    setLink(buildReplayUrl(trimmedQuestion))
    setIsCopied(false)
  }

  function handleCopy() {
    navigator.clipboard.writeText(link).then(() => {
      setIsCopied(true)
      linkRef.current?.select()
    })
  }

  function handleLinkClick() {
    linkRef.current?.select()
  }

  return (
    <div className="lmstfy-form">
      <h1 className="lmstfy-form__title">Let Me Soporti That For You</h1>
      <p className="lmstfy-form__lead">
        Someone asked you something Soporti already knows? Type the question and send them the link.
      </p>

      <form className="lmstfy-form__fields" onSubmit={handleSubmit}>
        <label className="lmstfy-form__label" htmlFor={QUESTION_FIELD_ID}>
          The question they asked you
        </label>
        <div className="lmstfy-form__row">
          <input
            id={QUESTION_FIELD_ID}
            className="input lmstfy-form__input"
            value={question}
            onChange={handleChange}
            placeholder="Why did that refund fail?"
            autoComplete="off"
          />
          <button type="submit" className="btn btn--primary" disabled={!trimmedQuestion}>
            Generate link
          </button>
        </div>
      </form>

      {link && (
        <div className="lmstfy-form__result">
          <div className="lmstfy-form__row">
            <input
              ref={linkRef}
              className="input lmstfy-form__input"
              value={link}
              readOnly
              aria-label="Shareable link"
              onClick={handleLinkClick}
            />
            <button type="button" className="btn btn--secondary" onClick={handleCopy}>
              {isCopied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <p className="lmstfy-form__notice">
            Whoever opens it watches the question being typed into Soporti, then lands on it themselves.
          </p>
        </div>
      )}
    </div>
  )
}
