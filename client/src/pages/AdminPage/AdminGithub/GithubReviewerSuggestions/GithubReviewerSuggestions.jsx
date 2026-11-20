import { useState } from 'react'
import { saveGithubReviewerSuggestions } from '../../../../services/services.js'
import { useSaveField } from '../../../../hooks/useSaveField/useSaveField.js'
import AdminSection from '../../AdminSection/AdminSection.jsx'

const LOGIN_SEPARATORS = /[\s,]+/

function toText(newcomers) {
  return newcomers.join('\n')
}

function toLogins(text) {
  return text.split(LOGIN_SEPARATORS).filter(Boolean)
}

export default function GithubReviewerSuggestions({ settings, token, onLogout, onSaved }) {
  const [edited, setEdited] = useState(null)
  const { saving, error, savedAt, save } = useSaveField(onLogout)

  const saved = { enabled: settings.enabled, newcomers: toText(settings.newcomers) }
  const draft = edited ?? saved
  const dirty = draft.enabled !== saved.enabled || draft.newcomers !== saved.newcomers

  function handleEnabledChange(event) {
    setEdited({ ...draft, enabled: event.target.checked })
  }

  function handleNewcomersChange(event) {
    setEdited({ ...draft, newcomers: event.target.value })
  }

  function handleSubmit(event) {
    event.preventDefault()
    save(async () => {
      const data = await saveGithubReviewerSuggestions(token, {
        enabled: draft.enabled,
        newcomers: toLogins(draft.newcomers),
      })
      onSaved(data.reviewerSuggestions)
      setEdited(null)
    })
  }

  return (
    <AdminSection title="Reviewer suggestions">
      <p className="admin__muted">
        Each PR review adds a line to the walkthrough with a good reviewer: someone who knows the changed files and has
        reviewed less lately. It works without Jev.
      </p>

      {error && <p className="alert alert--error">{error}</p>}

      <form className="admin__form" onSubmit={handleSubmit}>
        <label className="admin__switch">
          <input type="checkbox" checked={draft.enabled} onChange={handleEnabledChange} disabled={saving} />
          <span className="admin__switch-slider" aria-hidden="true" />
          <span className="admin__switch-label">
            Suggest reviewers
            <span className="admin__muted">
              Only when nobody else is reviewing the PR and Soporti did not approve it.
            </span>
          </span>
        </label>

        <h3 className="admin__subsection-title">People new to the code</h3>
        <p className="admin__muted">
          GitHub usernames, one per line. On PRs that are simple and not risky, one of them is suggested to review it
          and learn that part of the code.
        </p>
        <textarea
          className="textarea textarea--code"
          aria-label="People new to the code"
          placeholder="e.g. ana-garcia"
          rows={4}
          value={draft.newcomers}
          onChange={handleNewcomersChange}
          disabled={saving}
        />

        <div className="admin__form admin__form--row">
          <button className="btn btn--primary" type="submit" disabled={saving || !dirty}>
            {saving ? 'Saving...' : 'Save suggestions'}
          </button>
          {!error && savedAt && !dirty && <span className="admin__saved">Saved</span>}
        </div>
      </form>
    </AdminSection>
  )
}
