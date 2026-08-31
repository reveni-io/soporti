import { useId, useState } from 'react'
import './AgentSteps.css'

export default function AgentSteps({ steps, active }) {
  const [openOverride, setOpenOverride] = useState(null)
  const panelId = useId()

  const completed = steps.filter(step => step.done).length
  const isRunning = Boolean(active) || completed < steps.length
  const isOpen = openOverride ?? isRunning

  function handleToggle() {
    setOpenOverride(!isOpen)
  }

  const className = ['agent-steps', isRunning && 'agent-steps--running', isOpen && 'agent-steps--open']
    .filter(Boolean)
    .join(' ')

  return (
    <section className={className}>
      <button
        type="button"
        className="agent-steps__header"
        onClick={handleToggle}
        aria-expanded={isOpen}
        aria-controls={panelId}
      >
        <HeaderIcon />
        <span className="agent-steps__title">{isRunning ? 'Working' : 'Done'}</span>
        <span className="agent-steps__count">
          {completed}/{steps.length} steps
        </span>
        <ChevronIcon />
      </button>

      <div className="agent-steps__panel" id={panelId} inert={!isOpen}>
        <div className="agent-steps__panel-inner">
          <ol className="agent-steps__list" aria-live="polite">
            {steps.map((step, index) => (
              <Step key={index} step={step} />
            ))}
          </ol>
        </div>
      </div>
    </section>
  )
}

function Step({ step }) {
  const className = [
    'agent-steps__step',
    step.done ? 'agent-steps__step--done' : 'agent-steps__step--running',
    step.nested && 'agent-steps__step--nested',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <li className={className}>
      <StatusIcon done={step.done} />
      <span className="agent-steps__label">{step.label}</span>
      {step.detail && <span className="agent-steps__detail">{step.detail}</span>}
      {step.duration && <span className="agent-steps__duration">{step.duration}</span>}
    </li>
  )
}

function HeaderIcon() {
  return (
    <svg
      className="agent-steps__icon"
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <g className="agent-steps__icon-list">
        <line x1="9" y1="6" x2="20" y2="6" />
        <line x1="9" y1="12" x2="20" y2="12" />
        <line x1="9" y1="18" x2="20" y2="18" />
        <circle cx="4.5" cy="6" r="1.4" />
        <circle cx="4.5" cy="12" r="1.4" />
        <circle cx="4.5" cy="18" r="1.4" />
      </g>
      <polyline className="agent-steps__icon-check" points="20 6 9 17 4 12" />
    </svg>
  )
}

function ChevronIcon() {
  return (
    <svg
      className="agent-steps__chevron"
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

function StatusIcon({ done }) {
  return (
    <svg
      className="agent-steps__status"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      role="img"
      aria-label={done ? 'Completed' : 'In progress'}
    >
      <circle className="agent-steps__status-track" cx="12" cy="12" r="9" />
      {done ? (
        <polyline className="agent-steps__status-check" points="16.5 9.5 10.5 15.5 7.5 12.5" />
      ) : (
        <circle className="agent-steps__status-arc" cx="12" cy="12" r="9" />
      )}
    </svg>
  )
}
