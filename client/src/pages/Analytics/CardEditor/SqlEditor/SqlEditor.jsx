import { useId } from 'react'
import Icon from '../../../../common/Icon/Icon.jsx'
import { ANALYTICS_SQL_MAX_LENGTH } from '../../../../constants.js'
import './SqlEditor.css'

const SQL_ROWS = 12

export default function SqlEditor({ value, isRunning, error, onChange, onRun }) {
  const inputId = useId()

  function handleKeyDown(event) {
    if (event.key !== 'Enter' || !(event.ctrlKey || event.metaKey)) return

    event.preventDefault()
    onRun()
  }

  return (
    <div className="sql-editor">
      <div className="sql-editor__bar">
        <label className="sql-editor__label" htmlFor={inputId}>
          SQL
        </label>
        <button
          type="button"
          className="btn btn--secondary btn--sm"
          title="Run the query (Ctrl+Enter)"
          disabled={isRunning || !value.trim()}
          onClick={onRun}
        >
          <Icon name="play" size={12} />
          {isRunning ? 'Running…' : 'Run'}
        </button>
      </div>

      <textarea
        id={inputId}
        className="textarea textarea--code sql-editor__input"
        rows={SQL_ROWS}
        spellCheck={false}
        maxLength={ANALYTICS_SQL_MAX_LENGTH}
        value={value}
        onChange={event => onChange(event.target.value)}
        onKeyDown={handleKeyDown}
      />

      {error && (
        <p className="alert alert--error sql-editor__error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
