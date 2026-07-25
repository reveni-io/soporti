import { useState } from 'react'
import {
  MAX_DESCRIPTION_LENGTH,
  MAX_INSTRUCTIONS_LENGTH,
  SKILL_NAME_MAX_LENGTH,
  SKILL_NAME_RE,
} from '../../../../../constants.js'
import { createSkill, isUnauthorized, updateSkill } from '../../../../../services/services.js'
import './SkillForm.css'

export default function SkillForm({ token, onLogout, skill, onSaved, onCancel }) {
  const isEdit = Boolean(skill)
  const [name, setName] = useState(skill?.name ?? '')
  const [description, setDescription] = useState(skill?.description ?? '')
  const [instructions, setInstructions] = useState(skill?.instructions ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const nameInvalid = name.length > 0 && !SKILL_NAME_RE.test(name)
  const canSave =
    SKILL_NAME_RE.test(name) &&
    instructions.trim().length > 0 &&
    description.length <= MAX_DESCRIPTION_LENGTH &&
    instructions.length <= MAX_INSTRUCTIONS_LENGTH

  async function handleSubmit(e) {
    e.preventDefault()
    if (!canSave || saving) return

    setSaving(true)
    setError(null)
    try {
      const payload = { name, description, instructions }
      const data = isEdit ? await updateSkill(token, skill.id, payload) : await createSkill(token, payload)
      onSaved(data.skill)
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

  return (
    <form className="settings-modal__panel skill-form" onSubmit={handleSubmit}>
      <label className="skill-form__label">
        Name
        <input
          className="input"
          value={name}
          onChange={e => setName(e.target.value.toLowerCase())}
          placeholder="e.g. refund-policy"
          maxLength={SKILL_NAME_MAX_LENGTH}
          disabled={saving}
        />
      </label>
      {nameInvalid && (
        <span className="skill-form__hint settings-modal__error">
          Use lowercase letters, numbers, and hyphens only (1-{SKILL_NAME_MAX_LENGTH} characters).
        </span>
      )}

      <label className="skill-form__label">
        Description (optional)
        <input
          className="input"
          value={description}
          onChange={e => setDescription(e.target.value)}
          maxLength={MAX_DESCRIPTION_LENGTH}
          disabled={saving}
        />
      </label>

      <label className="skill-form__label">
        Instructions
        <textarea
          className="textarea settings-modal__textarea skill-form__textarea"
          value={instructions}
          onChange={e => setInstructions(e.target.value)}
          maxLength={MAX_INSTRUCTIONS_LENGTH}
          rows={8}
          disabled={saving}
        />
      </label>
      <span className="skill-form__hint">
        Tip: $ARGUMENTS inserts the full message typed after the /command; $1, $2… insert its individual words.
      </span>

      {error && <span className="skill-form__hint settings-modal__error">{error}</span>}

      <div className="modal__actions">
        <button type="button" className="btn btn--secondary" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button type="submit" className="btn btn--primary" disabled={!canSave || saving}>
          {saving ? 'Saving...' : isEdit ? 'Save changes' : 'Create skill'}
        </button>
      </div>
    </form>
  )
}
