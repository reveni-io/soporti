import { formatTime } from './format-time.js'
import { useLegalCases } from './hooks/useLegalCases/useLegalCases.js'
import GuardReview from '../GuardReview/GuardReview.jsx'
import TicketConversation from './TicketConversation/TicketConversation.jsx'
import './LegalRun.css'

const CHECKED = 'checked'
const SOURCE_LABELS = { zendesk: 'Zendesk', hubspot: 'HubSpot' }
const OLD_RUN = 'This run is older than sending from Soporti: send the reply from the ticket.'

function caseReviews(legalCase) {
  if (legalCase.reviews) return legalCase.reviews

  const { review, warnings, reason } = legalCase

  return [{ guard: legalCase.guard ?? 'Legal', review, warnings, reason }]
}

function ticketLabel({ source, ticketId }) {
  return `${SOURCE_LABELS[source] ?? source} ticket ${ticketId}`
}

function nextStep(legalCase, state) {
  if (state?.replies.length > 0) return 'Sent'
  if (legalCase.status !== CHECKED) return 'Check it yourself, then decide'
  if (legalCase.warnings > 0) return 'Read the warnings, then decide'

  return 'Check it, then ask Soporti to send it'
}

function describeSent([reply]) {
  return `Sent by ${reply.sentBy} · ${formatTime(reply.sentAt)}`
}

function describeSending({ legalCase, state }) {
  if (!legalCase.id) return OLD_RUN
  if (state?.replies.length > 0) return describeSent(state.replies)

  return state?.send.reason ?? ''
}

export default function LegalRun({ cases, token = null, onLogout }) {
  const status = useLegalCases(token, cases.map(legalCase => legalCase.id).filter(Boolean), onLogout)

  return (
    <div className="legal-run">
      {cases.length > 1 && <RunSummary cases={cases} status={status} />}

      {status.error && <p className="alert alert--error">{status.error}</p>}

      {cases.map((legalCase, index) => (
        <LegalCase
          key={`${legalCase.source}-${legalCase.ticketId}`}
          number={cases.length > 1 ? index + 1 : null}
          legalCase={legalCase}
          state={status.cases.get(legalCase.id)}
          token={token}
          onLogout={onLogout}
        />
      ))}
    </div>
  )
}

function RunSummary({ cases, status }) {
  return (
    <div className="legal-run__table-wrap">
      <table className="legal-run__table">
        <thead>
          <tr>
            <th>#</th>
            <th>Ticket</th>
            <th>Customer</th>
            <th>Review</th>
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
              <td>{nextStep(legalCase, status.cases.get(legalCase.id))}</td>
            </tr>
          ))}
        </tbody>
      </table>
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

function LegalCase({ number, legalCase, state, token, onLogout }) {
  const label = ticketLabel(legalCase)

  return (
    <section className="legal-run__case">
      <h3 className="legal-run__title">
        {number && `${number}. `}
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
      <DraftReply legalCase={legalCase} label={label} />
      <p className="legal-run__muted">
        Ask Soporti in the chat to send it, to change it or to look up more data first.
      </p>

      {caseReviews(legalCase).map(({ guard, review, warnings, reason }) => (
        <GuardReview key={guard} guard={guard} review={review} warnings={warnings} reason={reason} />
      ))}

      <p className="legal-run__muted">{describeSending({ legalCase, state })}</p>
      {legalCase.id && state && <TicketConversation token={token} legalCase={legalCase} onLogout={onLogout} />}
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

function DraftReply({ legalCase, label }) {
  if (!legalCase.draft) return <p className="alert alert--warning">No draft: {legalCase.reason}.</p>

  return (
    <div className="legal-run__email">
      <span className="legal-run__email-meta">
        Reply on {label} · To: {legalCase.customer || 'unknown'} · Subject: {legalCase.draft.subject}
      </span>
      <p className="legal-run__draft">{legalCase.draft.body}</p>
    </div>
  )
}
