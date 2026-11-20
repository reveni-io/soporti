import IntegrationIcon from '../../../common/IntegrationIcon/IntegrationIcon.jsx'
import PreviewWindow from '../PreviewWindow/PreviewWindow.jsx'
import { frameLoop } from '../frameLoop.js'
import { usePlayOnView } from '../hooks/usePlayOnView/usePlayOnView.js'
import './LegalRepliesDemo.css'

const STAGE_FINDING = 0
const STAGE_DRAFTING = 1
const STAGE_REVIEWING = 2
const STAGE_READY = 3
const VIEW_THRESHOLD = 0.3

const QUERY = 'Draft replies to the tickets Legal received yesterday and pass each one through the Legal guard'
const CASES = [
  { source: 'zendesk', ticket: 'Zendesk #48213', topic: 'Refund for order A-10234', status: 'No warnings' },
  { source: 'hubspot', ticket: 'HubSpot 9312', topic: 'Refund to another account', status: 'Careful · 2 warnings' },
  { source: 'zendesk', ticket: 'Zendesk #48240', topic: '“As we agreed on the phone…”', status: 'Careful · 1 warning' },
]
const STAGE_LABELS = { [STAGE_DRAFTING]: 'Drafting…', [STAGE_REVIEWING]: 'Reviewing…' }
const LOGO_SIZE = 14

const playRun = frameLoop([
  { frame: STAGE_FINDING, ms: 1400 },
  { frame: STAGE_DRAFTING, ms: 1600 },
  { frame: STAGE_REVIEWING, ms: 1600 },
  { frame: STAGE_READY, ms: 4400 },
])

function statusClass(legalCase, stage) {
  if (stage < STAGE_READY) return 'lp-legal-demo__status lp-legal-demo__status--running'

  return `lp-legal-demo__status ${legalCase.status.startsWith('Careful') ? 'lp-legal-demo__status--careful' : 'lp-legal-demo__status--ok'}`
}

export default function LegalRepliesDemo() {
  const { ref, frame: stage } = usePlayOnView({
    play: playRun,
    initialFrame: STAGE_FINDING,
    finalFrame: STAGE_READY,
    threshold: VIEW_THRESHOLD,
  })
  const isReady = stage === STAGE_READY

  return (
    <div className="lp-legal-demo" ref={ref} aria-hidden="true">
      <PreviewWindow title="Scheduled query · Legal guard" badge={isReady ? 'Ready to send' : null}>
        <div className="lp-legal-demo__body">
          <p className="lp-legal-demo__query">{QUERY}</p>

          {stage === STAGE_FINDING ? (
            <p className="lp-legal-demo__finding">
              <span className="lp-spinner" />
              Finding the tickets in Zendesk and HubSpot…
            </p>
          ) : (
            <ul className="lp-legal-demo__cases">
              {CASES.map(legalCase => (
                <li key={legalCase.ticket} className="lp-legal-demo__case">
                  <IntegrationIcon id={legalCase.source} size={LOGO_SIZE} />
                  <span className="lp-legal-demo__ticket">{legalCase.ticket}</span>
                  <span className="lp-legal-demo__topic">{legalCase.topic}</span>
                  <span className={statusClass(legalCase, stage)}>
                    {isReady ? legalCase.status : STAGE_LABELS[stage]}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {isReady && <p className="lp-legal-demo__footer">Nothing has been sent · a person has the last word</p>}
        </div>
      </PreviewWindow>
    </div>
  )
}
