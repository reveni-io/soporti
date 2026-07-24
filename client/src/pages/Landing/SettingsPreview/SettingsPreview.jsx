import { useEffect, useRef, useState } from 'react'
import './SettingsPreview.css'

// A faithful, non-interactive preview of the real Custom instructions panel
// (SettingsModal). It reuses the modal's own classes and, when it scrolls into
// view, "types" an example set of instructions — caret, live character count
// and a final "Saved" — echoing the live feel of the hero chat.

const EXAMPLE = `I'm on the Support team, so keep answers non-technical and behaviour-focused.
Always mention the customer name and order id when they're relevant.
Reply in Spanish, and prefer a small table when you show data.
If something isn't in our docs, say so instead of guessing.`

export default function SettingsPreview() {
  const [typed, setTyped] = useState('')
  const [done, setDone] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    if (reduced || typeof IntersectionObserver === 'undefined') {
      setTyped(EXAMPLE)
      setDone(true)
      return
    }

    let started = false
    let timer
    const type = () => {
      let i = 0
      const step = () => {
        i += 1
        setTyped(EXAMPLE.slice(0, i))
        if (i < EXAMPLE.length) {
          timer = setTimeout(step, 20)
        } else {
          setDone(true)
        }
      }
      step()
    }

    const io = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting && !started) {
            started = true
            io.unobserve(el)
            type()
          }
        })
      },
      { threshold: 0.35 }
    )
    io.observe(el)

    return () => {
      io.disconnect()
      clearTimeout(timer)
    }
  }, [])

  return (
    <div className="lp-ci-preview" ref={ref} aria-hidden="true">
      <div className="modal settings-modal">
        <div className="modal__header">
          <h3 className="modal__title">Custom instructions</h3>
          <span className="modal__close">&times;</span>
        </div>

        <p className="settings-modal__description">
          These instructions are added to every chat from the web app. Use them to tell Soporti about your role,
          preferred response style, or anything else it should keep in mind.
        </p>

        <div className="textarea settings-modal__textarea lp-ci-textarea">
          {typed}
          {!done && <span className="lp-ci-caret" />}
        </div>

        <div className="settings-modal__meta">
          <span className="settings-modal__count">{typed.length.toLocaleString()} / 50,000 characters</span>
          {done && <span className="settings-modal__saved">Saved</span>}
        </div>

        <div className="modal__actions">
          <button type="button" tabIndex={-1} className="btn btn--secondary">
            Close
          </button>
          <button type="button" tabIndex={-1} className="btn btn--primary">
            Save
          </button>
        </div>
      </div>
    </div>
  )
}
