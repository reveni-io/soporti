import IntegrationIcon from '../../../common/IntegrationIcon/IntegrationIcon.jsx'
import PreviewWindow from '../PreviewWindow/PreviewWindow.jsx'
import { frameLoop } from '../frameLoop.js'
import { usePlayOnView } from '../hooks/usePlayOnView/usePlayOnView.js'
import './PrReviewDemo.css'

const STAGE_REVIEWING = 0
const STAGE_HALFWAY = 1
const STAGE_COMMENTED = 2
const STAGE_VERIFIED = 3
const VIEW_THRESHOLD = 0.3

const PR = { number: 482, title: 'Fix refund rounding for partial returns', label: 'soporti-review' }
const PASSES = ['Correctness', 'Security', 'Standards', 'Spec']
const DIFF = [
  { number: 41, kind: 'context', code: 'const ratio = returned / ordered' },
  { number: 42, kind: 'removed', code: 'const amount = total * ratio' },
  { number: 42, kind: 'added', code: 'const amount = Math.round(total * ratio)' },
  { number: 43, kind: 'context', code: 'return convert(amount, currency)' },
]
const COMMENT = 'Rounding before the currency conversion drops a cent on EUR → GBP refunds. Convert first, then round.'
const SUGGESTION = 'return Math.round(convert(total * ratio, currency))'
const LOGO_SIZE = 14

const playReview = frameLoop([
  { frame: STAGE_REVIEWING, ms: 1700 },
  { frame: STAGE_HALFWAY, ms: 1300 },
  { frame: STAGE_COMMENTED, ms: 1800 },
  { frame: STAGE_VERIFIED, ms: 4400 },
])

function passState(index, stage) {
  if (stage >= STAGE_COMMENTED) return 'done'
  if (stage === STAGE_HALFWAY && index < PASSES.length / 2) return 'done'

  return 'running'
}

export default function PrReviewDemo() {
  const { ref, frame: stage } = usePlayOnView({
    play: playReview,
    initialFrame: STAGE_REVIEWING,
    finalFrame: STAGE_VERIFIED,
    threshold: VIEW_THRESHOLD,
  })

  return (
    <div className="lp-pr-demo" ref={ref} aria-hidden="true">
      <PreviewWindow title={`Pull request #${PR.number}`} badge={stage === STAGE_VERIFIED ? 'Review posted' : null}>
        <div className="lp-pr-demo__body">
          <div className="lp-pr-demo__head">
            <IntegrationIcon id="github" size={LOGO_SIZE} />
            <span className="lp-pr-demo__title">{PR.title}</span>
            <span className="chip chip--pill lp-pr-demo__label">{PR.label}</span>
          </div>

          <ul className="lp-pr-demo__passes">
            {PASSES.map((pass, index) => (
              <li key={pass} className={`lp-pr-demo__pass lp-pr-demo__pass--${passState(index, stage)}`}>
                <span className={passState(index, stage) === 'done' ? 'lp-done-dot' : 'lp-spinner'} />
                {pass}
              </li>
            ))}
          </ul>

          <div className="lp-pr-demo__diff">
            <span className="lp-pr-demo__file">src/refunds/calc.js</span>
            {DIFF.map(line => (
              <code key={`${line.kind}-${line.number}`} className={`lp-pr-demo__line lp-pr-demo__line--${line.kind}`}>
                <span className="lp-pr-demo__number">{line.number}</span>
                {line.code}
              </code>
            ))}
          </div>

          {stage >= STAGE_COMMENTED && (
            <div className="lp-pr-demo__comment">
              <div className="lp-pr-demo__badges">
                <span className="lp-pr-demo__badge lp-pr-demo__badge--major">Major</span>
                <span
                  className={`lp-pr-demo__badge lp-pr-demo__badge--${stage === STAGE_VERIFIED ? 'verified' : 'verifying'}`}
                >
                  {stage === STAGE_VERIFIED ? '✓ Verified' : 'Verifying…'}
                </span>
              </div>
              <p className="lp-pr-demo__text">{COMMENT}</p>
              <code className="lp-pr-demo__suggestion">+ {SUGGESTION}</code>
            </div>
          )}
        </div>
      </PreviewWindow>
    </div>
  )
}
