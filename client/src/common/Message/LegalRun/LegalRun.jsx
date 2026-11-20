import { useRef, useState } from 'react'
import { formatTime } from './format-time.js'
import { useCopyReply } from './hooks/useCopyReply/useCopyReply.js'
import { useLegalCases } from './hooks/useLegalCases/useLegalCases.js'
import { useSendReply } from './hooks/useSendReply/useSendReply.js'
import SendConfirm from './SendConfirm/SendConfirm.jsx'
import TicketConversation from './TicketConversation/TicketConversation.jsx'
import './LegalRun.css'

const CHECKED = 'checked'
const SOURCE_LABELS = { zendesk: 'Zendesk', hubspot: 'HubSpot' }
const CONFIDENCE_DIGITS = 2
const OLD_RUN = 'This run is older than sending from Soporti: copy the reply and send it from the ticket.'

function ticketLabel({ source, ticketId }) {
  return `${SOURCE_LABELS[source] ?? source} ticket ${ticketId}`
}

function needsCare(legalCase) {
  return legalCase.status !== CHECKED || legalCase.warnings > 0
}

function nextStep(legalCase, state) {
  if (state?.replies.length > 0) return 'Sent'
  if (legalCase.status !== CHECKED) return 'Check it yourself, then decide'
  if (legalCase.warnings > 0) return 'Read the warnings, then decide'

  return 'Check it, then send it'
}

function describeSent([reply]) {
  return `Sent by ${reply.sentBy} · ${formatTime(reply.sentAt)}`
}

function describeSending({ legalCase, state, copyStatus }) {
  if (copyStatus) return copyStatus
  if (!legalCase.id) return OLD_RUN
  if (state?.replies.length > 0) return describeSent(state.replies)

  return state?.send.reason ?? ''
}

export default function LegalRun({ cases, token = null }) {
  const status = useLegalCases(token, cases.map(legalCase => legalCase.id).filter(Boolean))

  return (
    <div className="legal-run">
      <div className="legal-run__table-wrap">
        <table className="legal-run__table">
          <thead>
            <tr>
              <th>#</th>
              <th>Ticket</th>
              <th>Customer</th>
              <th>Legal review</th>
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

      {status.error && <p className="alert alert--error">{status.error}</p>}

      {cases.map((legalCase, index) => (
        <LegalCase
          key={`${legalCase.source}-${legalCase.ticketId}`}
          number={index + 1}
          legalCase={legalCase}
          state={status.cases.get(legalCase.id)}
          token={token}
          onSent={status.addReply}
        />
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

function LegalCase({ number, legalCase, state, token, onSent }) {
  const [reply, setReply] = useState(legalCase.draft?.body ?? '')
  const textareaRef = useRef(null)
  const { status: copyStatus, copy } = useCopyReply()
  const sender = useSendReply(token, legalCase.id, handleSent)
  const label = ticketLabel(legalCase)
  const isSent = state?.replies.length > 0
  const canSend = Boolean(state?.send.allowed && legalCase.draft && !isSent && !sender.confirming && reply.trim())

  function handleSent(sent) {
    onSent(legalCase.id, sent)
  }

  function handleSend(warningsRead) {
    sender.send(reply, warningsRead)
  }

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
      <p className="legal-run__muted">Edit the reply if needed, then send it from here or copy it to the ticket.</p>

      <ReviewCheck legalCase={legalCase} />

      <div className="legal-run__actions">
        <button
          className={`btn btn--sm ${needsCare(legalCase) ? 'btn--secondary' : 'btn--primary'}`}
          type="button"
          onClick={() => copy(reply, textareaRef.current)}
          disabled={!legalCase.draft}
        >
          Copy reply
        </button>
        <button className="btn btn--secondary btn--sm" type="button" onClick={sender.start} disabled={!canSend}>
          {isSent ? 'Sent' : 'Send'}
        </button>
        <span className="legal-run__muted">{describeSending({ legalCase, state, copyStatus })}</span>
      </div>

      {sender.confirming && (
        <SendConfirm
          recipient={legalCase.customer}
          label={label}
          needsCare={needsCare(legalCase)}
          edited={reply !== legalCase.draft?.body}
          sending={sender.sending}
          error={sender.error}
          onCancel={sender.cancel}
          onSend={handleSend}
        />
      )}

      {legalCase.id && state && (
        <TicketConversation
          token={token}
          legalCase={legalCase}
          label={label}
          send={state.send}
          needsCare={needsCare(legalCase)}
          onSent={handleSent}
        />
      )}
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

function ReviewCheck({ legalCase }) {
  if (!legalCase.review) return <p className="alert alert--warning">Not reviewed: {legalCase.reason}.</p>

  const { setVersion, minConfidence, rows } = legalCase.review

  return (
    <div className="legal-run__review">
      <div className="legal-run__review-head">
        <span>Legal review · set v{setVersion}</span>
        <CheckBadge legalCase={legalCase} />
      </div>
      <div className="legal-run__table-wrap">
        <table className="legal-run__table">
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
