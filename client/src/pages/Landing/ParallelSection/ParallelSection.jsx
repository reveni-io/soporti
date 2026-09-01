import Section from '../Section/Section.jsx'
import './ParallelSection.css'

const ANSWERING_LABEL = 'Answering'

const CONVERSATIONS = [
  { title: 'Why did the payout of order 8412 fail?', isAnswering: true, isSelected: false },
  { title: 'Write the incident report for the webhook outage', isAnswering: true, isSelected: true },
  { title: 'How does the refund window work?', isAnswering: false, isSelected: false },
]

const POINTS = [
  'Start a new chat, or reopen an old one, while an answer is still being written',
  'Leaving a conversation stops watching it, it does not stop it — come back and the answer is there, finished or still arriving',
  'The sidebar marks every conversation being answered and highlights the one you are reading, so you never lose track of what is still running',
  'Stop only affects the conversation you are looking at',
]

export default function ParallelSection() {
  return (
    <Section id="parallel" className="lp-section--white">
      <div className="lp-section__head">
        <span className="lp-eyebrow">Several at once</span>
        <h2 className="lp-h2">
          Ask the next question <em>before</em> the last answer lands.
        </h2>
        <p className="lp-lead">
          A deep investigation can take minutes: thirty files read, logs aggregated, a database queried. You no longer
          have to sit and watch it. Send the question, open a new chat and ask something else — each conversation keeps
          its own answer coming, and none of them is interrupted by what you do next.
        </p>
        <ul className="lp-points">
          {POINTS.map(point => (
            <li key={point}>{point}</li>
          ))}
        </ul>
      </div>

      <div className="lp-parallel__list">
        <span className="lp-parallel__label">Conversations</span>
        <ul className="lp-parallel__items">
          {CONVERSATIONS.map(conversation => (
            <li
              className={`lp-parallel__item${conversation.isSelected ? ' lp-parallel__item--selected' : ''}`}
              key={conversation.title}
            >
              <span className="lp-parallel__title">{conversation.title}</span>
              {conversation.isAnswering && (
                <span className="lp-parallel__typing" role="img" aria-label={ANSWERING_LABEL}>
                  <span />
                  <span />
                  <span />
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </Section>
  )
}
