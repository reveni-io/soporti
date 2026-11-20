import { useState } from 'react'
import { VERSIONED_SET_FIELDS, projectLabels } from '../jev-projects.js'
import NumberField from '../NumberField/NumberField.jsx'
import QuestionForm from '../QuestionForm/QuestionForm.jsx'
import { QUESTION_CHOICE } from '../QuestionForm/question-form.js'
import './QuestionSetEditor.css'

const NEW_QUESTION = 'new'

function versionedPart(set) {
  return JSON.stringify(VERSIONED_SET_FIELDS.map(field => set[field] ?? null))
}

export default function QuestionSetEditor({ project, state }) {
  const [editing, setEditing] = useState(null)
  const labels = projectLabels(project)
  const set = state.draft.set
  const setVersion = state.document.setVersion
  const bumps = versionedPart(state.document.data.set) !== versionedPart(set)

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
    state.updateDraft(draft => ({ ...draft, set: { ...draft.set, description: '', questions: [] } }))
  }

  return (
    <>
      <label className="question-set__label">
        {labels.description}
        <input className="input" name="description" value={set.description} onChange={handleSetFieldChange} />
      </label>

      <div key={`${state.document.rev}-${state.restoredFrom}`} className="question-set__fields">
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

      <p className="admin__muted">
        Every guard asks Jev’s latest model. A daily limit of <code>0</code> means no limit.
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
        version. Question edits stay here until you save the guard below.
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
