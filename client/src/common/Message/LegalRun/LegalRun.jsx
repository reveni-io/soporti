import { useRef, useState } from 'react'
import { useCopyReply } from './hooks/useCopyReply/useCopyReply.js'
import './LegalRun.css'

const CHECKED = 'checked'
const SOURCE_LABELS = { zendesk: 'Zendesk', hubspot: 'HubSpot' }
const CONFIDENCE_DIGITS = 2
const SEND_UNAVAILABLE = 'Sending from Soporti isn’t available yet'

function ticketLabel({ source, ticketId }) {
  return `${SOURCE_LABELS[source] ?? source} ticket ${ticketId}`
}

function needsCare(legalCase) {
  return legalCase.status !== CHECKED || legalCase.warnings > 0
}

function nextStep(legalCase) {
  if (legalCase.status !== CHECKED) return 'Check it yourself, then decide'
  if (legalCase.warnings > 0) return 'Read the warnings, then decide'

  return 'Check it, copy it, send it from the ticket'
}

export default function LegalRun({ cases }) {
  return (
    <div className="legal-run">
      <div className="legal-run__table-wrap">
        <table className="legal-run__table">
          <thead>
            <tr>
              <th>#</th>
              <th>Ticket</th>
              <th>Customer</th>
              <th>Jev</th>
              <th>Next step</th>
            </tr>
          </thead>
          <tbody>
            {cases.map((legalCase, index) => (
              <tr key={`${legalCase.source}-${legalCase.ticketId}`}>
                <td>{index + 1}</td>
                <td>{ticketLabel(legalCase)}</td>
                <td>{legalCase.customer || 'unknown'}</td>
                <td>
                  <CheckBadge legalCase={legalCase} />
                </td>
                <td>{nextStep(legalCase)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {cases.map((legalCase, index) => (
        <LegalCase key={`${legalCase.source}-${legalCase.ticketId}`} number={index + 1} legalCase={legalCase} />
      ))}
    </div>
  )
}

function CheckBadge({ legalCase }) {
  if (legalCase.status !== CHECKED) return <span className="badge badge--warning">Not checked</span>
  if (legalCase.warnings === 0) return <span className="badge badge--success">No warnings</span>

  const count = legalCase.warnings

  return (
    <span className="badge badge--warning">
      Careful · {count} warning{count === 1 ? '' : 's'}
    </span>
  )
}

function LegalCase({ number, legalCase }) {
  const [reply, setReply] = useState(legalCase.draft?.body ?? '')
  const textareaRef = useRef(null)
  const { status, copy } = useCopyReply()
  const label = ticketLabel(legalCase)

  return (
    <section className="legal-run__case">
      <h3 className="legal-run__title">
        {number}.{' '}
        {legalCase.ticketUrl ? (
          <a href={legalCase.ticketUrl} target="_blank" rel="noreferrer">
            {label}
          </a>
        ) : (
          label
        )}{' '}
        · {legalCase.customer || 'unknown'} · {legalCase.subject || 'no subject'}
      </h3>

      <p className="legal-run__heading">What the customer asks</p>
      <blockquote className="legal-run__quote">{legalCase.customerMessage}</blockquote>

      <p className="legal-run__heading">What the data shows</p>
      <DataFacts facts={legalCase.dataFacts} />

      <p className="legal-run__heading">Draft reply</p>
      <DraftReply legalCase={legalCase} label={label} reply={reply} textareaRef={textareaRef} onChange={setReply} />
      <p className="legal-run__muted">Edit the reply if needed, copy it and send it from the ticket.</p>

      <JevCheck legalCase={legalCase} />

      <div className="legal-run__actions">
        <button
          className={`btn btn--sm ${needsCare(legalCase) ? 'btn--secondary' : 'btn--primary'}`}
          type="button"
          onClick={() => copy(reply, textareaRef.current)}
          disabled={!legalCase.draft}
        >
          Copy reply
        </button>
        <button className="btn btn--secondary btn--sm" type="button" disabled title={SEND_UNAVAILABLE}>
          Send
        </button>
        <span className="legal-run__muted">{status ?? `${SEND_UNAVAILABLE}.`}</span>
      </div>
    </section>
  )
}

function DataFacts({ facts }) {
  if (!facts || facts.length === 0) return <p className="legal-run__muted">No data was gathered.</p>

  return (
    <ul className="legal-run__facts">
      {facts.map(fact => (
        <li key={`${fact.source}-${fact.fact}`}>
          {fact.fact} <span className="legal-run__muted">({fact.source})</span>
        </li>
      ))}
    </ul>
  )
}

function DraftReply({ legalCase, label, reply, textareaRef, onChange }) {
  if (!legalCase.draft) return <p className="alert alert--warning">No draft: {legalCase.reason}.</p>

  return (
    <label className="legal-run__email">
      <span className="legal-run__email-meta">
        Reply on {label} · To: {legalCase.customer || 'unknown'} · Subject: {legalCase.draft.subject}
      </span>
      <textarea
        ref={textareaRef}
        className="textarea"
        rows={8}
        value={reply}
        onChange={event => onChange(event.target.value)}
      />
    </label>
  )
}

function JevCheck({ legalCase }) {
  if (!legalCase.jev) {
    return <p className="alert alert--warning">Jev did not check this case: {legalCase.reason}.</p>
  }

  const { setVersion, model, minConfidence, rows } = legalCase.jev

  return (
    <div className="legal-run__jev">
      <div className="legal-run__jev-head">
        <span>
          Jev (Legal) · set v{setVersion} · {model}
        </span>
        <CheckBadge legalCase={legalCase} />
      </div>
      <div className="legal-run__table-wrap">
        <table className="legal-run__table">
          <thead>
            <tr>
              <th>Question</th>
              <th>Jev’s answer</th>
              <th>Confidence</th>
              <th>Check</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.questionId}>
                <td>{row.question}</td>
                <td>{row.answer ?? 'no answer'}</td>
                <td className={row.unsure ? 'legal-run__low' : ''}>
                  {row.confidence.toFixed(CONFIDENCE_DIGITS)}
                  {row.unsure && ` < ${minConfidence.toFixed(CONFIDENCE_DIGITS)}`}
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
