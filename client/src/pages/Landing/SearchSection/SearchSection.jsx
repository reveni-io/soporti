import Section from '../Section/Section.jsx'
import './SearchSection.css'

const QUERY = 'refund'

const RESULTS = [
  {
    title: 'Why is order 8412 stuck?',
    before: '…the payment went through, but the ',
    match: 'refund',
    after: ' was issued twice from the Shopify webhook…',
  },
  { title: 'Refund window for marketplace orders' },
  {
    title: 'Payout reconciliation for June',
    before: '…the gap is the partial ',
    match: 'refund',
    after: 's still pending on three merchants…',
  },
]

const POINTS = [
  'Matches the title and everything you or the assistant wrote in the conversation',
  'Each result shows the line that matched, with your words highlighted',
  'Clear the box, or press Esc, and the full list is back — answers still in flight included',
]

export default function SearchSection() {
  return (
    <Section id="search" className="lp-section--warm">
      <div className="lp-section__head">
        <span className="lp-eyebrow">Search your history</span>
        <h2 className="lp-h2">
          Find the conversation by <em>what was said</em>.
        </h2>
        <p className="lp-lead">
          Titles are written from the first message, so they are rarely what you remember. Type what the conversation
          was about into the sidebar and it finds it by title or by content, showing you why each one matched.
        </p>
        <ul className="lp-points">
          {POINTS.map(point => (
            <li key={point}>{point}</li>
          ))}
        </ul>
      </div>

      <div className="lp-search__panel">
        <span className="lp-search__label">Conversations</span>
        <div className="lp-search__box">{QUERY}</div>
        <ul className="lp-search__results">
          {RESULTS.map(result => (
            <li className="lp-search__result" key={result.title}>
              <span className="lp-search__title">{result.title}</span>
              {result.match && (
                <span className="lp-search__snippet">
                  {result.before}
                  <mark className="lp-search__match">{result.match}</mark>
                  {result.after}
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </Section>
  )
}
