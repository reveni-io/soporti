import PreviewWindow from '../PreviewWindow/PreviewWindow.jsx'
import { usePlayOnView } from '../hooks/usePlayOnView/usePlayOnView.js'
import './SkillsPreview.css'

const SKILLS = [
  { name: 'triage-ticket', description: 'Diagnose a support ticket end to end' },
  { name: 'trace-order', description: 'Follow an order across Shopify and the database' },
  { name: 'code-review', description: 'Review a branch against our standards' },
]

const PARTIAL = '/tr'
const COMMAND = '/triage-ticket'
const REST = 'the customer says the refund never arrived'

const INITIAL_FRAME = { typed: '', sent: false }
const FINAL_FRAME = { typed: '', sent: true }
const VIEW_THRESHOLD = 0.3

async function playSkill({ show, sleep, isCancelled }) {
  while (!isCancelled()) {
    show(INITIAL_FRAME)
    await sleep(900)

    for (let i = 1; i <= PARTIAL.length; i++) {
      if (isCancelled()) return
      show({ typed: PARTIAL.slice(0, i), sent: false })
      await sleep(160)
    }
    await sleep(1300)
    if (isCancelled()) return

    show({ typed: `${COMMAND} `, sent: false })
    await sleep(700)

    for (let i = 1; i <= REST.length; i++) {
      if (isCancelled()) return
      show({ typed: `${COMMAND} ${REST.slice(0, i)}`, sent: false })
      await sleep(38)
    }
    await sleep(1200)
    if (isCancelled()) return

    show(FINAL_FRAME)
    await sleep(4800)
  }
}

export default function SkillsPreview() {
  const { ref, frame } = usePlayOnView({
    play: playSkill,
    initialFrame: INITIAL_FRAME,
    finalFrame: FINAL_FRAME,
    threshold: VIEW_THRESHOLD,
  })
  const { typed, sent } = frame

  const commandPrefix = typed.startsWith(COMMAND) ? COMMAND : ''
  const menuOpen = typed.startsWith('/') && !typed.includes(' ')
  const matchingSkills = menuOpen ? SKILLS.filter(skill => skill.name.startsWith(typed.slice(1))) : []

  return (
    <div className="lp-skills-preview" ref={ref} aria-hidden="true">
      <PreviewWindow className="lp-skills-preview__window" badge={`${SKILLS.length} skills`}>
        <div className="lp-skills-preview__body">
          {sent ? (
            <div className="message message--user">
              <div className="message__bubble message__bubble--user">
                <span className="lp-skills-preview__badge">{COMMAND}</span> {REST}
              </div>
            </div>
          ) : (
            <p className="lp-preview-window__hint">Type “/” to run one of your skills.</p>
          )}
        </div>

        <div className="lp-skills-preview__composer">
          {matchingSkills.length > 0 && (
            <ul className="lp-skills-preview__menu">
              {matchingSkills.map((skill, i) => (
                <li
                  key={skill.name}
                  className={`lp-skills-preview__menu-item${i === 0 ? ' lp-skills-preview__menu-item--active' : ''}`}
                >
                  <span className="lp-skills-preview__menu-name">/{skill.name}</span>
                  <span className="lp-skills-preview__menu-description">{skill.description}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="lp-skills-preview__field">
            {typed ? (
              <span className="lp-skills-preview__typed">
                {commandPrefix && <span className="lp-skills-preview__command">{commandPrefix}</span>}
                {typed.slice(commandPrefix.length)}
                <span className="lp-skills-preview__caret" />
              </span>
            ) : (
              <span className="lp-skills-preview__placeholder">Ask Soporti anything...</span>
            )}
          </div>
          <span className="lp-skills-preview__send">&#8593;</span>
        </div>
      </PreviewWindow>
    </div>
  )
}
