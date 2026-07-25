import { useState } from 'react'
import SkillForm from './SkillForm/SkillForm.jsx'
import './SkillsTab.css'

export default function SkillsTab({ token, onLogout, skills: skillStore }) {
  const { skills, loading, error: loadError, reload } = skillStore
  const [deleteError, setDeleteError] = useState(null)
  const [view, setView] = useState('list')
  const [editingSkill, setEditingSkill] = useState(null)
  const [pendingDeleteId, setPendingDeleteId] = useState(null)

  const error = deleteError ?? loadError

  async function handleDelete(id) {
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/skills/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.status === 401) {
        onLogout?.()
        return
      }
      if (!res.ok) throw new Error('Failed to delete skill')
      setPendingDeleteId(null)
      setDeleteError(null)
      await reload()
    } catch (err) {
      setDeleteError(err.message)
    }
  }

  function openNewForm() {
    setEditingSkill(null)
    setView('form')
  }

  function openEditForm(skill) {
    setEditingSkill(skill)
    setView('form')
  }

  async function handleSaved() {
    setView('list')
    await reload()
  }

  if (view === 'form') {
    return (
      <SkillForm
        token={token}
        onLogout={onLogout}
        skill={editingSkill}
        onSaved={handleSaved}
        onCancel={() => setView('list')}
      />
    )
  }

  return (
    <div className="settings-modal__panel skills-tab">
      <p className="settings-modal__description">
        Skills are reusable instruction snippets. Invoke one by starting a message with "/" plus the skill name (e.g.
        /refund-policy how do returns work?) — it stays active for the rest of that conversation, and never affects any
        other chat.
      </p>

      {loading && <p className="skills-tab__status">Loading…</p>}
      {error && <span className="settings-modal__error">{error}</span>}
      {!loading && !error && skills.length === 0 && <p className="skills-tab__empty">No skills yet.</p>}

      <ul className="skills-tab__list">
        {skills.map(skill => (
          <li key={skill.id} className="skills-tab__item">
            <div className="skills-tab__item-info">
              <span className="skills-tab__item-name">{skill.name}</span>
              {skill.description && <span className="skills-tab__item-description">{skill.description}</span>}
            </div>
            <div className="skills-tab__item-actions">
              <button className="btn btn--secondary btn--sm" onClick={() => openEditForm(skill)}>
                Edit
              </button>
              {pendingDeleteId === skill.id ? (
                <>
                  <button className="btn btn--danger btn--sm" onClick={() => handleDelete(skill.id)}>
                    Confirm
                  </button>
                  <button className="btn btn--secondary btn--sm" onClick={() => setPendingDeleteId(null)}>
                    Cancel
                  </button>
                </>
              ) : (
                <button className="btn btn--danger btn--sm" onClick={() => setPendingDeleteId(skill.id)}>
                  Delete
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>

      <div className="modal__actions">
        <button className="btn btn--primary" onClick={openNewForm}>
          + New skill
        </button>
      </div>
    </div>
  )
}
