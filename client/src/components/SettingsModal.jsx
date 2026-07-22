import { useEffect, useState } from 'react'
import './SettingsModal.css'

const MAX_LENGTH = 50_000

export default function SettingsModal({ token, onClose, onLogout }) {
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
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/user/instructions`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.status === 401) {
          onLogout?.()
          return
        }
        if (!res.ok) throw new Error('Failed to load instructions')
        const data = await res.json()
        if (!active) return
        setInstructions(data.instructions || '')
        setInitial(data.instructions || '')
      } catch (err) {
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
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/user/instructions`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ instructions }),
      })
      if (res.status === 401) {
        onLogout?.()
        return
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to save')
      }
      const data = await res.json()
      setInstructions(data.instructions || '')
      setInitial(data.instructions || '')
      setSavedAt(Date.now())
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const dirty = instructions !== initial
  const remaining = MAX_LENGTH - instructions.length

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal settings-modal" onClick={e => e.stopPropagation()}>
        <div className="modal__header">
          <h3 className="modal__title">Custom instructions</h3>
          <button className="modal__close" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>

        <p className="settings-modal__description">
          These instructions are added to every chat from the web app. Use them to tell Soporti about your role,
          preferred response style, or anything else it should keep in mind.
        </p>

        <textarea
          className="textarea settings-modal__textarea"
          placeholder="e.g. I work on the payments team. Always reference file paths when explaining code."
          value={instructions}
          onChange={e => setInstructions(e.target.value)}
          maxLength={MAX_LENGTH}
          disabled={loading || saving}
          rows={12}
        />

        <div className="settings-modal__meta">
          <span className="settings-modal__count">
            {instructions.length.toLocaleString()} / {MAX_LENGTH.toLocaleString()} characters
            {remaining < 0 ? ' (over limit)' : ''}
          </span>
          {error && <span className="settings-modal__error">{error}</span>}
          {!error && savedAt && !dirty && <span className="settings-modal__saved">Saved</span>}
        </div>

        <div className="modal__actions">
          <button className="btn btn--secondary" onClick={onClose}>
            Close
          </button>
          <button
            className="btn btn--primary"
            onClick={handleSave}
            disabled={!dirty || saving || loading || remaining < 0}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
