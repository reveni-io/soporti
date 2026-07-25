import { useEffect, useState } from 'react'
import { MAX_INSTRUCTIONS_LENGTH } from '../../../../constants.js'
import { getUserInstructions, isUnauthorized, saveUserInstructions } from '../../../../services/services.js'
import './CustomInstructionsTab.css'

export default function CustomInstructionsTab({ token, onLogout }) {
  const [instructions, setInstructions] = useState('')
  const [initial, setInitial] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [savedAt, setSavedAt] = useState(null)

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const data = await getUserInstructions(token)
        if (!active) return
        setInstructions(data.instructions || '')
        setInitial(data.instructions || '')
      } catch (err) {
        if (isUnauthorized(err)) {
          onLogout?.()
          return
        }
        if (active) setError(err.message)
      } finally {
        if (active) setLoading(false)
      }
    }
    load()
    return () => {
      active = false
    }
  }, [token, onLogout])

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const data = await saveUserInstructions(token, instructions)
      setInstructions(data.instructions || '')
      setInitial(data.instructions || '')
      setSavedAt(Date.now())
    } catch (err) {
      if (isUnauthorized(err)) {
        onLogout?.()
        return
      }
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const dirty = instructions !== initial
  const remaining = MAX_INSTRUCTIONS_LENGTH - instructions.length

  return (
    <div className="settings-modal__panel custom-instructions-tab">
      <p className="settings-modal__description">
        These instructions are added to every chat from the web app. Use them to tell Soporti about your role, preferred
        response style, or anything else it should keep in mind.
      </p>

      <textarea
        className="textarea settings-modal__textarea custom-instructions-tab__textarea"
        placeholder="e.g. I work on the payments team. Always reference file paths when explaining code."
        value={instructions}
        onChange={e => setInstructions(e.target.value)}
        maxLength={MAX_INSTRUCTIONS_LENGTH}
        disabled={loading || saving}
        rows={12}
      />

      <div className="settings-modal__meta">
        <span className="settings-modal__count">
          {instructions.length.toLocaleString()} / {MAX_INSTRUCTIONS_LENGTH.toLocaleString()} characters
          {remaining < 0 ? ' (over limit)' : ''}
        </span>
        {error && <span className="settings-modal__error">{error}</span>}
        {!error && savedAt && !dirty && <span className="settings-modal__saved">Saved</span>}
      </div>

      <div className="modal__actions">
        <button
          className="btn btn--primary"
          onClick={handleSave}
          disabled={!dirty || saving || loading || remaining < 0}
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  )
}
