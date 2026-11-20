import { useState } from 'react'
import { JEV_PROJECT_LABELS, VERSIONED_SET_FIELDS } from '../jev-projects.js'
import NumberField from '../NumberField/NumberField.jsx'
import QuestionForm from '../QuestionForm/QuestionForm.jsx'
import { QUESTION_CHOICE } from '../QuestionForm/question-form.js'
import './QuestionSetEditor.css'

const NEW_QUESTION = 'new'
const RELEASE_RE = /^jev-\d+\.\d+\.\d+$/

function versionedPart(set) {
  return JSON.stringify(VERSIONED_SET_FIELDS.map(field => set[field] ?? null))
}

function modelOptions(models, current) {
  const options = models.map(model => ({
    value: model.name,
    label: model.description ? `${model.name} · ${model.description}` : model.name,
  }))
  if (current && !models.some(model => model.name === current)) {
    options.push({ value: current, label: `${current} (not in the saved list)` })
  }

  return [{ value: '', label: 'Choose a model' }, ...options]
}

export default function QuestionSetEditor({ project, state, catalog, inUseMessage }) {
  const [editing, setEditing] = useState(null)
  const [message, setMessage] = useState(null)
  const labels = JEV_PROJECT_LABELS[project]
  const set = state.draft.set
  const setVersion = state.document.setVersion
  const bumps = versionedPart(state.document.data.set) !== versionedPart(set)
  const canPickModel = catalog.keyConfigured && catalog.models.length > 0

  function updateSet(field, value) {
    state.updateDraft(draft => ({ ...draft, set: { ...draft.set, [field]: value } }))
  }

  function handleSetFieldChange(event) {
    updateSet(event.target.name, event.target.value)
  }

  function handleSaveQuestion(question) {
    const questions =
      editing === NEW_QUESTION
        ? [...set.questions, question]
        : set.questions.map((current, index) => (index === editing ? question : current))
    updateSet('questions', questions)
    setEditing(null)
  }

  function handleDeleteQuestion(index) {
    updateSet(
      'questions',
      set.questions.filter((_, position) => position !== index)
    )
  }

  function handleDeleteSet() {
    if (inUseMessage) {
      setMessage(inUseMessage)
      return
    }
    state.updateDraft(draft => ({ ...draft, set: { ...draft.set, description: '', questions: [] } }))
  }

  return (
    <>
      <label className="question-set__label">
        Set description
        <input className="input" name="description" value={set.description} onChange={handleSetFieldChange} />
      </label>

      <div key={`${state.document.rev}-${state.restoredFrom}`} className="question-set__fields">
        <label className="question-set__label">
          Model
          <select
            className="input input--select"
            name="model"
            value={set.model}
            onChange={handleSetFieldChange}
            disabled={!canPickModel}
          >
            {canPickModel ? (
              modelOptions(catalog.models, set.model).map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))
            ) : (
              <option value={set.model}>{set.model || 'No model'}</option>
            )}
          </select>
        </label>
        <NumberField
          label="Min confidence"
          inputMode="decimal"
          value={set.minConfidence}
          onChange={value => updateSet('minConfidence', value)}
        />
        <NumberField
          label="Timeout (s)"
          value={set.timeoutSeconds}
          onChange={value => updateSet('timeoutSeconds', value)}
        />
        <NumberField label="Daily limit" value={set.dailyLimit} onChange={value => updateSet('dailyLimit', value)} />
        {'maxCharacters' in set && (
          <NumberField
            label="Max characters sent to Jev"
            value={set.maxCharacters}
            onChange={value => updateSet('maxCharacters', value)}
          />
        )}
      </div>

      {set.model && !RELEASE_RE.test(set.model) && (
        <p className="alert alert--warning">
          <code>{set.model}</code> is an alias: when it moves to a new Jev release, the answers can change without a new
          set version. Pick a numbered release to pin them.
        </p>
      )}
      <p className="admin__muted">
        This project configures Jev on its own. The models come from the list saved in the Jev section
        {catalog.keyConfigured ? '' : ', which has no key saved: the model cannot be changed until it does'}. A daily
        limit of <code>0</code> means no limit.
      </p>

      <h3 className="admin__subsection-title">
        Questions ({set.questions.length}){' '}
        <span className={`badge ${bumps ? 'badge--warning' : ''}`}>
          set version {setVersion}
          {bumps && ` → ${setVersion + 1} on save`}
        </span>
      </h3>
      {set.questions.length === 0 && <p className="admin__muted">No questions yet. Add the first one.</p>}

      {set.questions.map((question, index) =>
        editing === index ? (
          <QuestionForm
            key={question.id}
            project={project}
            title={`Edit question ${index + 1}`}
            question={question}
            onSave={handleSaveQuestion}
            onCancel={() => setEditing(null)}
          />
        ) : (
          <QuestionItem
            key={question.id}
            number={index + 1}
            question={question}
            labels={labels}
            isLocked={editing !== null}
            onEdit={() => setEditing(index)}
            onDelete={() => handleDeleteQuestion(index)}
          />
        )
      )}
      {editing === NEW_QUESTION && (
        <QuestionForm
          project={project}
          title="New question"
          question={null}
          onSave={handleSaveQuestion}
          onCancel={() => setEditing(null)}
        />
      )}

      {message && <p className="alert alert--error">{message}</p>}
      <div className="admin__form admin__form--row">
        <button
          className="btn btn--secondary"
          type="button"
          onClick={() => setEditing(NEW_QUESTION)}
          disabled={editing !== null}
        >
          Add question
        </button>
        <button className="btn btn--danger btn--sm" type="button" onClick={handleDeleteSet}>
          Delete set
        </button>
      </div>
      <p className="admin__muted">
        The set version goes up on save when the {labels.versioned} change. Editing only the description keeps the
        version. Question edits stay in this page until you save the project below.
      </p>
    </>
  )
}

function QuestionItem({ number, question, labels, isLocked, onEdit, onDelete }) {
  return (
    <div className="admin__kv admin__kv--text question-set__item">
      <div className="question-set__item-head">
        <strong className="question-set__item-title">
          {number}. {question.text}
        </strong>
        <span className="badge">{question.type === QUESTION_CHOICE ? 'choice' : 'noul · score'}</span>
        <button className="btn btn--secondary btn--sm" type="button" onClick={onEdit} disabled={isLocked}>
          Edit
        </button>
        <button className="btn btn--secondary btn--sm" type="button" onClick={onDelete} disabled={isLocked}>
          Delete
        </button>
      </div>
      <dl>
        <div className="admin__kv-row">
          <dt>Instructions</dt>
          <dd>{question.instructions || <span className="admin__muted">none</span>}</dd>
        </div>
        <div className="admin__kv-row">
          <dt>Criteria</dt>
          <dd>{question.criteria || <span className="admin__muted">none</span>}</dd>
        </div>
        {question.type === QUESTION_CHOICE ? (
          <div className="admin__kv-row">
            <dt>Answers</dt>
            <dd>
              <ul>
                {question.answers.map(answer => (
                  <li key={answer.label}>
                    <strong>{answer.label}</strong>
                    {answer.criteria && `: ${answer.criteria}`}{' '}
                    {answer.flag && <span className="badge badge--warning">{labels.badge}</span>}
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        ) : (
          <div className="admin__kv-row">
            <dt>Answer</dt>
            <dd>
              Score from 0 to 100{' '}
              {question.flagAt !== null && (
                <span className="badge badge--warning">
                  {labels.badgeAt} {question.flagAt} or more
                </span>
              )}
            </dd>
          </div>
        )}
      </dl>
    </div>
  )
}
