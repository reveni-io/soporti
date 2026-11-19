import { useState } from 'react'
import { JEV_PROJECT_LABELS } from '../jev-projects.js'
import { blankAnswer, fromForm, QUESTION_CHOICE, QUESTION_NOUL, toForm } from './question-form.js'
import './QuestionForm.css'

const TYPE_OPTIONS = [
  { value: QUESTION_CHOICE, label: 'choice: one answer from a list' },
  { value: QUESTION_NOUL, label: 'noul: yes or no, scored from 0 to 100' },
]

export default function QuestionForm({ project, title, question, onSave, onCancel }) {
  const [form, setForm] = useState(() => toForm(question))
  const [error, setError] = useState(null)
  const labels = JEV_PROJECT_LABELS[project]

  function update(field, value) {
    setForm(current => ({ ...current, [field]: value }))
    setError(null)
  }

  function updateAnswer(index, field, value) {
    update(
      'answers',
      form.answers.map((answer, position) => (position === index ? { ...answer, [field]: value } : answer))
    )
  }

  function handleRemoveAnswer(index) {
    update(
      'answers',
      form.answers.filter((_, position) => position !== index)
    )
  }

  function handleSave() {
    const result = fromForm(form)
    if (result.error) {
      setError(result.error)
      return
    }
    onSave(result.value)
  }

  return (
    <div className="admin__kv question-form">
      <h3 className="admin__subsection-title">{title}</h3>
      {error && <p className="alert alert--error">{error}</p>}

      <label className="question-form__label">
        Question
        <input
          className="input"
          value={form.text}
          onChange={event => update('text', event.target.value)}
          placeholder="e.g. Does the change alter how money is refunded?"
        />
      </label>

      <label className="question-form__label">
        Type
        <select
          className="input input--select"
          value={form.type}
          onChange={event => update('type', event.target.value)}
        >
          {TYPE_OPTIONS.map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label className="question-form__label">
        Instructions
        <textarea
          className="textarea"
          rows={2}
          value={form.instructions}
          onChange={event => update('instructions', event.target.value)}
        />
      </label>

      <label className="question-form__label">
        Criteria
        <textarea
          className="textarea"
          rows={2}
          value={form.criteria}
          onChange={event => update('criteria', event.target.value)}
        />
      </label>

      {form.type === QUESTION_CHOICE ? (
        <>
          <span className="question-form__label">Answers and their criteria</span>
          {form.answers.map((answer, index) => (
            <div key={index} className="admin__form admin__form--row">
              <input
                className="input"
                aria-label={`Answer ${index + 1}`}
                placeholder="Answer"
                value={answer.label}
                onChange={event => updateAnswer(index, 'label', event.target.value)}
              />
              <input
                className="input"
                aria-label={`Criteria of answer ${index + 1}`}
                placeholder="When Jev gives this answer"
                value={answer.criteria}
                onChange={event => updateAnswer(index, 'criteria', event.target.value)}
              />
              <label className="question-form__check">
                <input
                  type="checkbox"
                  checked={answer.flag}
                  onChange={event => updateAnswer(index, 'flag', event.target.checked)}
                />
                {labels.flag}
              </label>
              <button className="btn btn--secondary btn--sm" type="button" onClick={() => handleRemoveAnswer(index)}>
                Remove
              </button>
            </div>
          ))}
          <div>
            <button
              className="btn btn--secondary btn--sm"
              type="button"
              onClick={() => update('answers', [...form.answers, blankAnswer()])}
            >
              Add answer
            </button>
          </div>
          <p className="admin__muted">{labels.help}</p>
        </>
      ) : (
        <>
          <p className="admin__muted">
            Jev answers yes or no and returns how likely yes is as a score from 0 to 100. Write the question as a
            statement.
          </p>
          <label className="question-form__label">
            {labels.score}
            <input
              className="input"
              inputMode="numeric"
              placeholder="e.g. 60"
              value={form.flagAt}
              onChange={event => update('flagAt', event.target.value)}
            />
          </label>
        </>
      )}

      <div className="modal__actions">
        <button className="btn btn--secondary" type="button" onClick={onCancel}>
          Cancel
        </button>
        <button className="btn btn--primary" type="button" onClick={handleSave}>
          Save question
        </button>
      </div>
    </div>
  )
}
