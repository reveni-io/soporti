import { useEffect, useMemo, useState } from 'react'
import IntegrationIcon from './IntegrationIcon.jsx'
import { questionsForCategories } from './example-questions.js'
import './TourModal.css'

// Screenshots are optional: they live in client/public/tour/ and the step image
// is hidden automatically when the file is missing.
const GENERAL_STEPS = [
  {
    id: 'intro',
    title: 'Meet Soporti',
    description:
      'Soporti is your AI teammate. It can read our code, query data, and search docs, tickets and errors — ' +
      'then explain what it finds in plain language. Everything is read-only: it cannot change code, data or ' +
      'settings, so you cannot break anything by asking.',
  },
  {
    id: 'sources',
    title: 'Choose where it looks',
    description:
      'Every chat uses the sources selected in the sidebar. Leave YOLO (auto) on and Soporti picks the right ' +
      'tools for each question, or select specific repos and integrations to focus its search.',
    image: '/tour/sources.png',
  },
  {
    id: 'profiles',
    title: 'Answers that match your role',
    description:
      'The profile toggle changes how Soporti answers. Support gives simplified, behavior-focused explanations. ' +
      'Tech goes into code-level detail, with file paths and architecture.',
    image: '/tour/profiles.png',
  },
]

// Example questions come from the shared pool in example-questions.js, picked
// by category so the tour and the chat empty state stay in sync.
const CAPABILITY_STEPS = [
  {
    id: 'code',
    integrationIds: ['github'],
    title: 'Ask how the product works',
    description:
      'Soporti reads the source code on GitHub, so you can ask how features behave, what the business rules ' +
      'are, or why something works the way it does — without reading code yourself.',
    categories: ['product'],
  },
  {
    id: 'data',
    integrationIds: ['postgres', 'shopify'],
    title: 'Look up live data',
    description:
      'Ask about production data in plain language. Soporti writes the queries for you and can turn the ' +
      'results into tables and charts.',
    image: '/tour/data-answer.png',
    categories: ['data', 'orders'],
  },
  {
    id: 'docs',
    integrationIds: ['notion', 'helpjuice', 'google-drive'],
    title: 'Search the company docs',
    description:
      'Soporti can read internal documentation and help center articles to answer questions about processes ' +
      'and policies.',
    categories: ['docs'],
  },
  {
    id: 'tracking',
    integrationIds: ['shortcut', 'sentry'],
    title: 'Check tickets and errors',
    description:
      'Ask about the status of ongoing work, or paste a Sentry link or alert and ask what caused the error — ' +
      'all without leaving the chat.',
    categories: ['tickets', 'errors'],
  },
]

const TIPS_STEP = {
  id: 'tips',
  title: 'A few tips before you start',
  bullets: [
    'Conversations are saved in the sidebar, so you can pick up where you left off.',
    'Use the share button at the top to send a conversation to a teammate.',
    'Set custom instructions in the sidebar so answers fit how you work.',
    'If an answer looks off, just ask a follow-up — Soporti keeps the context of the chat.',
  ],
}

function buildSteps(integrations) {
  const steps = [...GENERAL_STEPS]

  for (const step of CAPABILITY_STEPS) {
    const matching = integrations.filter(i => step.integrationIds.includes(i.id))
    if (matching.length === 0) continue
    const examples = questionsForCategories(step.categories, integrations)
    steps.push({ ...step, integrations: matching, examples })
  }

  steps.push(TIPS_STEP)
  return steps
}

export default function TourModal({ integrations = [], onClose, onTryExample }) {
  const [stepIndex, setStepIndex] = useState(0)
  const [brokenImages, setBrokenImages] = useState(() => new Set())

  const steps = useMemo(() => buildSteps(integrations), [integrations])
  const step = steps[stepIndex]
  const isLastStep = stepIndex === steps.length - 1

  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  function handleImageError(src) {
    setBrokenImages(prev => new Set(prev).add(src))
  }

  return (
    <div className="tour-modal__overlay modal-overlay" onClick={onClose}>
      <div
        className="modal tour-modal"
        role="dialog"
        aria-modal="true"
        aria-label="What can Soporti do?"
        onClick={e => e.stopPropagation()}
      >
        <button className="modal__close tour-modal__close" onClick={onClose} aria-label="Close tour">
          &times;
        </button>

        <div className="tour-modal__body">
          <h3 className="modal__title tour-modal__title">{step.title}</h3>
          {step.description && <p className="tour-modal__description">{step.description}</p>}

          {step.integrations && (
            <div className="tour-modal__chips">
              {step.integrations.map(integration => (
                <span key={integration.id} className="chip chip--pill" title={integration.description}>
                  <IntegrationIcon id={integration.id} />
                  {integration.name}
                </span>
              ))}
            </div>
          )}

          {step.bullets && (
            <ul className="tour-modal__bullets">
              {step.bullets.map(bullet => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>
          )}

          {step.examples && step.examples.length > 0 && (
            <div className="tour-modal__examples">
              <span className="tour-modal__examples-hint">Click an example to try it:</span>
              {step.examples.map(example => (
                <button key={example.text} className="tour-modal__example" onClick={() => onTryExample(example.text)}>
                  {example.text}
                </button>
              ))}
            </div>
          )}

          {step.image && !brokenImages.has(step.image) && (
            <img className="tour-modal__image" src={step.image} alt="" onError={() => handleImageError(step.image)} />
          )}
        </div>

        <div className="tour-modal__footer">
          <div className="tour-modal__dots">
            {steps.map((s, i) => (
              <button
                key={s.id}
                className={`tour-modal__dot ${i === stepIndex ? 'tour-modal__dot--active' : ''}`}
                onClick={() => setStepIndex(i)}
                aria-label={`Go to step ${i + 1}`}
              />
            ))}
          </div>
          <div className="tour-modal__nav">
            {stepIndex > 0 && (
              <button className="btn btn--secondary" onClick={() => setStepIndex(stepIndex - 1)}>
                Back
              </button>
            )}
            {isLastStep ? (
              <button className="btn btn--primary" onClick={onClose}>
                Start asking
              </button>
            ) : (
              <button className="btn btn--primary" onClick={() => setStepIndex(stepIndex + 1)}>
                Next
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
