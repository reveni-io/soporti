import IntegrationIcon from '../../../common/IntegrationIcon/IntegrationIcon.jsx'
import PreviewWindow from '../PreviewWindow/PreviewWindow.jsx'
import { frameLoop } from '../frameLoop.js'
import { usePlayOnView } from '../hooks/usePlayOnView/usePlayOnView.js'
import './AutoApproveDemo.css'

const STAGE_CHECKING = 0
const STAGE_FIRST_GUARD = 1
const STAGE_ANSWERED = 2
const STAGE_APPROVED = 3
const VIEW_THRESHOLD = 0.3

const PR = { number: 491, title: 'Clarify the return window on the help page', repo: 'acme/docs' }
const CHECKS = [
  { label: 'Did every CI check pass?', value: 'Yes · 0.98', stage: STAGE_FIRST_GUARD },
  { label: 'Did the review find a critical issue?', value: 'No · 0.97', stage: STAGE_FIRST_GUARD },
  { label: 'What is the merge risk?', value: 'Low · 0.91', stage: STAGE_FIRST_GUARD },
  { label: 'Does it change files REVIEW.md protects?', value: 'No · 0.95', stage: STAGE_FIRST_GUARD },
  { label: 'Does the change touch refunds?', value: 'No · 0.93', stage: STAGE_ANSWERED, isQuestion: true },
]
const LOGO_SIZE = 14

const playApproval = frameLoop([
  { frame: STAGE_CHECKING, ms: 1500 },
  { frame: STAGE_FIRST_GUARD, ms: 1500 },
  { frame: STAGE_ANSWERED, ms: 1600 },
  { frame: STAGE_APPROVED, ms: 4400 },
])

function checkClass(check, stage) {
  const state = stage >= check.stage ? 'done' : 'running'
  const kind = check.isQuestion ? ' lp-approve-demo__check--question' : ''

  return `lp-approve-demo__check lp-approve-demo__check--${state}${kind}`
}

export default function AutoApproveDemo() {
  const { ref, frame: stage } = usePlayOnView({
    play: playApproval,
    initialFrame: STAGE_CHECKING,
    finalFrame: STAGE_APPROVED,
    threshold: VIEW_THRESHOLD,
  })
  const isApproved = stage === STAGE_APPROVED

  return (
    <div className="lp-approve-demo" ref={ref} aria-hidden="true">
      <PreviewWindow title={`Pull request #${PR.number}`} badge={isApproved ? 'Approved' : null}>
        <div className="lp-approve-demo__body">
          <div className="lp-approve-demo__head">
            <IntegrationIcon id="github" size={LOGO_SIZE} />
            <span className="lp-approve-demo__title">{PR.title}</span>
            <span className="chip chip--pill lp-approve-demo__mode">{PR.repo} · on</span>
          </div>

          <ul className="lp-approve-demo__checks">
            {CHECKS.map(check => (
              <li key={check.label} className={checkClass(check, stage)}>
                <span className={stage >= check.stage ? 'lp-done-dot' : 'lp-spinner'} />
                <span className="lp-approve-demo__label">{check.label}</span>
                <span className="lp-approve-demo__value">{stage >= check.stage ? check.value : 'Checking…'}</span>
              </li>
            ))}
          </ul>

          {isApproved && (
            <div className="lp-approve-demo__verdict">
              <strong>✅ Auto-approve · approved</strong>
              <span>The guards its REVIEW.md names raised no warning, so Soporti approved the pull request.</span>
            </div>
          )}
        </div>
      </PreviewWindow>
    </div>
  )
}
