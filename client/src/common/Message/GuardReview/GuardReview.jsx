import { PERCENT } from '../../../constants.js'
import './GuardReview.css'

function toPercent(confidence) {
  return Math.round(confidence * PERCENT)
}

function WarningsBadge({ warnings }) {
  if (warnings === 0) return <span className="badge badge--success">No warnings</span>

  return (
    <span className="badge badge--warning">
      Careful · {warnings} warning{warnings === 1 ? '' : 's'}
    </span>
  )
}

export default function GuardReview({ guard, review, warnings, reason }) {
  if (!review) return <p className="alert alert--warning">Not reviewed: {reason}.</p>

  const { setVersion, minConfidence, rows } = review

  return (
    <div className="guard-review">
      <div className="guard-review__head">
        <span>
          {guard} guard · set v{setVersion}
        </span>
        <WarningsBadge warnings={warnings} />
      </div>
      <div className="guard-review__wrap">
        <table className="guard-review__table">
          <thead>
            <tr>
              <th>Question</th>
              <th>Answer</th>
              <th>Confidence</th>
              <th>Check</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.questionId}>
                <td>{row.question}</td>
                <td>{row.answer ?? 'no answer'}</td>
                <td className={row.unsure ? 'guard-review__low' : ''}>
                  {toPercent(row.confidence)}
                  {row.unsure && ` < ${toPercent(minConfidence)}`}
                </td>
                <td>
                  {row.flagged || row.unsure ? (
                    <span className="badge badge--warning">Careful</span>
                  ) : (
                    <span className="badge">OK</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
