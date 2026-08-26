import { useId } from 'react'
import IntegrationIcon from '../IntegrationIcon/IntegrationIcon.jsx'
import './Citations.css'

const ICON_SIZE = 14

export default function Citations({ citations, isOpen, selectedUrl, onToggle }) {
  const panelId = useId()

  const className = ['citations', isOpen && 'citations--open'].filter(Boolean).join(' ')

  return (
    <section className={className}>
      <button
        type="button"
        className="citations__header"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={panelId}
      >
        <LinkIcon />
        <span className="citations__title">Sources</span>
        <span className="citations__count">{citations.length}</span>
        <ChevronIcon />
      </button>

      <div className="citations__panel" id={panelId} inert={!isOpen}>
        <div className="citations__panel-inner">
          <ol className="citations__list">
            {citations.map((citation, index) => (
              <Row key={citation.url} citation={citation} index={index} isSelected={citation.url === selectedUrl} />
            ))}
          </ol>
        </div>
      </div>
    </section>
  )
}

function Row({ citation, index, isSelected }) {
  const className = ['citations__row', isSelected && 'citations__row--selected'].filter(Boolean).join(' ')

  return (
    <li className={className} style={{ '--citation-index': index }} aria-current={isSelected || undefined}>
      <a className="citations__link" href={citation.url} target="_blank" rel="noopener noreferrer">
        <span className="citations__icon">
          {citation.source ? <IntegrationIcon id={citation.source} size={ICON_SIZE} /> : <GlobeIcon />}
        </span>
        <span className="citations__label">{citation.title}</span>
        <span className="citations__host">{citation.host}</span>
        <span className="citations__index">{index + 1}</span>
      </a>
    </li>
  )
}

function LinkIcon() {
  return (
    <svg
      className="citations__header-icon"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  )
}

function ChevronIcon() {
  return (
    <svg
      className="citations__chevron"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}

function GlobeIcon() {
  return (
    <svg
      width={ICON_SIZE}
      height={ICON_SIZE}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      data-icon="globe"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a14 14 0 0 1 3.6 9 14 14 0 0 1-3.6 9 14 14 0 0 1-3.6-9A14 14 0 0 1 12 3z" />
    </svg>
  )
}
