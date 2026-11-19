import Section from '../Section/Section.jsx'
import './AutoApproveSection.css'

const GATES = [
  { gate: 'CI status', answer: 'Passed', isOk: true },
  { gate: 'Blocking findings', answer: 'No', isOk: true },
  { gate: 'Max merge risk ≤ Low', answer: 'Low', isOk: true },
  { gate: 'Denylist', answer: 'No match', isOk: true },
  { gate: 'Personal data in logs?', answer: 'No · 0.64', isOk: false },
]

export default function AutoApproveSection() {
  return (
    <Section id="auto-approve">
      <div className="lp-split">
        <div className="lp-section__head">
          <span className="lp-eyebrow">Auto-approve</span>
          <h2 className="lp-h2">Soporti approves the safe PRs, and only those.</h2>
          <p className="lp-lead">
            Pick the repos and start them in <strong>shadow</strong>: every review Soporti posts says whether it would
            have approved the PR, and nothing is approved. Turn a repo <strong>on</strong> when the shadow results
            convince you, and Soporti approves a PR when none of your rules or questions vetoes it.
          </p>
          <ul className="lp-points">
            <li>
              Your rules — CI, blocking findings, merge risk, review time, nitpicks, a denylist per repo — checked on
              every review
            </li>
            <li>Your own questions, versioned, with the answers that veto and a minimum confidence</li>
            <li>Shadow first: a repo goes on only after it was evaluated in shadow</li>
            <li>When the check cannot run, the repo decides as today: only trivial PRs are approved</li>
            <li>Every answer, its confidence and the gate it decided, in the same review</li>
          </ul>
        </div>

        <div className="lp-split__visual">
          <div className="lp-auto-approve">
            <p className="lp-auto-approve__title">⛔ Auto-approve · not approved</p>
            <ul className="lp-auto-approve__gates">
              {GATES.map(row => (
                <li key={row.gate} className={`lp-auto-approve__gate ${row.isOk ? '' : 'lp-auto-approve__gate--veto'}`}>
                  <span>{row.gate}</span>
                  <span className="lp-auto-approve__answer">{row.answer}</span>
                </li>
              ))}
            </ul>
            <p className="lp-auto-approve__meta">Question set v9 · not sure: 0.64 &lt; 0.75</p>
          </div>
        </div>
      </div>
    </Section>
  )
}
