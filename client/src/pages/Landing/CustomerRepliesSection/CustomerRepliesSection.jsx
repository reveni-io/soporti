import Section from '../Section/Section.jsx'
import './CustomerRepliesSection.css'

const CASES = [
  { ticket: 'Zendesk #48213', topic: 'Refund for order A-10234', status: 'No warnings', isCareful: false },
  { ticket: 'HubSpot 9312', topic: 'Refund to another account', status: 'Careful · 2 warnings', isCareful: true },
  { ticket: 'Zendesk #48240', topic: '“As we agreed on the phone…”', status: 'Careful · 1 warning', isCareful: true },
]

export default function CustomerRepliesSection() {
  return (
    <Section id="customer-replies" className="lp-section--cool">
      <div className="lp-split">
        <div className="lp-section__head">
          <span className="lp-eyebrow">Replies for Legal</span>
          <h2 className="lp-h2">Soporti drafts the replies. Legal decides what goes out.</h2>
          <p className="lp-lead">
            Schedule a query for the tickets Legal has to answer. Each run, Soporti reads the customer tickets from
            Zendesk and HubSpot, looks up the data behind every one and drafts a reply — then checks the request and the
            draft, and flags anything that needs a second look.
          </p>
          <ul className="lp-points">
            <li>The customer’s message word for word, next to the data Soporti found</li>
            <li>One draft per ticket, in the customer’s language, stating only what the data shows</li>
            <li>A Careful warning for unusual requests, data that does not match, promises or someone else’s data</li>
            <li>Nothing is sent: edit the reply, copy it and send it from the ticket</li>
            <li>A ticket is drafted again only when the customer writes again</li>
          </ul>
        </div>

        <div className="lp-split__visual">
          <div className="lp-replies">
            <p className="lp-replies__title">3 customer tickets to answer</p>
            <ul className="lp-replies__cases">
              {CASES.map(row => (
                <li key={row.ticket} className={`lp-replies__case ${row.isCareful ? 'lp-replies__case--careful' : ''}`}>
                  <span className="lp-replies__ticket">{row.ticket}</span>
                  <span className="lp-replies__topic">{row.topic}</span>
                  <span className="lp-replies__status">{row.status}</span>
                </li>
              ))}
            </ul>
            <p className="lp-replies__meta">Nothing has been sent · Legal has the last word</p>
          </div>
        </div>
      </div>
    </Section>
  )
}
