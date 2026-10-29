import Section from '../Section/Section.jsx'
import './SendcloudSection.css'

const QUESTION = 'Order #1042 from the EU store still has not arrived — what happened?'

const TIMELINE = [
  { time: 'Oct 3, 09:12', label: 'Delivery attempt failed — recipient not home', tone: 'warning' },
  { time: 'Oct 2, 18:40', label: 'Out for delivery', tone: 'success' },
  { time: 'Oct 2, 06:05', label: 'Arrived at the Madrid hub', tone: 'success' },
  { time: 'Oct 1, 11:00', label: 'Handed to DHL', tone: 'success' },
]

export default function SendcloudSection() {
  return (
    <Section id="sendcloud" className="lp-section--cool">
      <div className="lp-split">
        <div className="lp-section__head">
          <span className="lp-eyebrow">Sendcloud</span>
          <h2 className="lp-h2">Where is the parcel? Ask, instead of opening another panel.</h2>
          <p className="lp-lead">
            Link one or more Sendcloud accounts in <strong>/admin</strong> — one per brand or store, each with its own
            API keys — and Soporti reads them straight from the Sendcloud API. Give it an order or a tracking number and
            it finds the parcels, follows the carrier timeline and tells you what went wrong, in the same answer where
            it checked the order in your database.
          </p>
          <ul className="lp-points">
            <li>Parcels by order number, tracking number or reference — every parcel of a split order</li>
            <li>The full tracking timeline, with the delay or failed delivery spelled out</li>
            <li>Returns with their reason, refund type and status history</li>
            <li>The shipping methods and carrier products for a route, with their weight ranges</li>
            <li>Booked pickups, service points with their opening times, and an address check before a label fails</li>
            <li>Whether an integration's webhook stopped pushing status updates</li>
            <li>Read-only: it never creates a label, cancels a parcel or edits an address</li>
          </ul>
        </div>

        <div className="lp-split__visual">
          <div className="lp-sendcloud">
            <p className="lp-sendcloud__question">{QUESTION}</p>
            <p className="lp-sendcloud__meta">Acme EU · DHL · JVGL0612345</p>
            <ol className="lp-sendcloud__timeline">
              {TIMELINE.map(event => (
                <li key={event.time} className={`lp-sendcloud__event lp-sendcloud__event--${event.tone}`}>
                  <span className="lp-sendcloud__time">{event.time}</span>
                  <span className="lp-sendcloud__label">{event.label}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </Section>
  )
}
