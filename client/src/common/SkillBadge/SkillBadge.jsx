import { useEffect, useState } from 'react'
import { useOverlayDismiss } from '../../hooks/useOverlayDismiss/useOverlayDismiss.js'
import './SkillBadge.css'

function SkillPreviewModal({ skillId, fallbackName, token, onClose }) {
  const [skill, setSkill] = useState(null)
  const [error, setError] = useState(null)
  const overlayProps = useOverlayDismiss(onClose)
  const loading = !skill && !error

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/skills/${skillId}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (res.status === 404) throw new Error('This skill no longer exists.')
        if (!res.ok) throw new Error('Failed to load the skill.')
        const data = await res.json()
        if (active) setSkill(data.skill)
      } catch (err) {
        if (active) setError(err.message)
      }
    }
    load()
    return () => {
      active = false
    }
  }, [skillId, token])

  return (
    <div className="modal-overlay" {...overlayProps}>
      <div className="modal">
        <div className="modal__header">
          <h3 className="modal__title">/{skill?.name ?? fallbackName}</h3>
          <button className="modal__close" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>

        {loading && <p className="skill-badge__status">Loading…</p>}
        {error && <p className="skill-badge__status">{error}</p>}
        {skill && (
          <>
            {skill.description && <p className="skill-badge__description">{skill.description}</p>}
            <pre className="note skill-badge__instructions">{skill.instructions}</pre>
          </>
        )}
      </div>
    </div>
  )
}

export default function SkillBadge({ skill, token }) {
  const [open, setOpen] = useState(false)

  if (!token || !skill.id) {
    return <span className="skill-badge">/{skill.name}</span>
  }

  return (
    <>
      <button
        type="button"
        className="skill-badge skill-badge--clickable"
        onClick={() => setOpen(true)}
        title="View skill"
      >
        /{skill.name}
      </button>
      {open && (
        <SkillPreviewModal skillId={skill.id} fallbackName={skill.name} token={token} onClose={() => setOpen(false)} />
      )}
    </>
  )
}
