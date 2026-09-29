import { usePlayOnView } from '../hooks/usePlayOnView/usePlayOnView.js'
import './SettingsPreview.css'

const EXAMPLE = `I'm on the Support team, so keep answers non-technical and behaviour-focused.
Always mention the customer name and order id when they're relevant.
Reply in Spanish, and prefer a small table when you show data.
If something isn't in our docs, say so instead of guessing.`

const INITIAL_FRAME = { typed: '', done: false }
const FINAL_FRAME = { typed: EXAMPLE, done: true }
const VIEW_THRESHOLD = 0.35
const KEYSTROKE_MS = 20

async function typeExample({ show, sleep, isCancelled }) {
  for (let i = 1; i < EXAMPLE.length; i++) {
    show({ typed: EXAMPLE.slice(0, i), done: false })
    await sleep(KEYSTROKE_MS)
    if (isCancelled()) return
  }

  show(FINAL_FRAME)
}

export default function SettingsPreview() {
  const { ref, frame } = usePlayOnView({
    play: typeExample,
    initialFrame: INITIAL_FRAME,
    finalFrame: FINAL_FRAME,
    threshold: VIEW_THRESHOLD,
  })
  const { typed, done } = frame

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
