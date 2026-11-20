import PreviewWindow from '../PreviewWindow/PreviewWindow.jsx'
import { frameLoop } from '../frameLoop.js'
import { usePlayOnView } from '../hooks/usePlayOnView/usePlayOnView.js'
import './QueryGuard.css'

const CHECKS = [
  {
    statement: "SELECT count(*) FROM returns WHERE created_at > now() - interval '7 days'",
    verdict: 'allowed',
    label: '✓ Ran in a read-only transaction',
  },
  {
    statement: "UPDATE orders SET status = 'refunded' WHERE id = 8412",
    verdict: 'blocked',
    label: '✕ Rejected · read-only transaction',
  },
  { statement: 'DROP TABLE merchants', verdict: 'blocked', label: '✕ Rejected · read-only transaction' },
  {
    statement: 'Posting to #support: "api_key": "sk_live_51HxQ…"',
    redacted: 'Posting to #support: "api_key": "[redacted]"',
    verdict: 'redacted',
    label: '⦸ Secret redacted before it was posted',
  },
]
const CHECK_MS = 900
const VERDICT_MS = 1100
const HOLD_MS = 3800
const VIEW_THRESHOLD = 0.35
const FINAL_FRAME = CHECKS.length * 2

const playGuard = frameLoop([
  ...CHECKS.flatMap((_, index) => [
    { frame: index * 2 + 1, ms: CHECK_MS },
    { frame: index * 2 + 2, ms: VERDICT_MS },
  ]),
  { frame: FINAL_FRAME, ms: HOLD_MS },
])

export default function QueryGuard() {
  const { ref, frame } = usePlayOnView({
    play: playGuard,
    initialFrame: 0,
    finalFrame: FINAL_FRAME,
    threshold: VIEW_THRESHOLD,
  })
  const visibleChecks = CHECKS.slice(0, Math.ceil(frame / 2))

  return (
    <div className="lp-guard" ref={ref} aria-hidden="true">
      <PreviewWindow title="guardrails" badge="Read-only" isDark>
        <ol className="lp-guard__checks">
          {visibleChecks.map((check, index) => (
            <GuardCheck key={check.statement} check={check} isDecided={frame >= index * 2 + 2} />
          ))}
        </ol>
      </PreviewWindow>
    </div>
  )
}

function GuardCheck({ check, isDecided }) {
  const state = isDecided ? check.verdict : 'checking'
  const statement = isDecided && check.redacted ? check.redacted : check.statement

  return (
    <li className={`lp-guard__check lp-guard__check--${state}`}>
      <code className="lp-guard__statement">{statement}</code>
      <span key={state} className="lp-guard__verdict">
        {isDecided ? check.label : 'Checking…'}
      </span>
    </li>
  )
}
