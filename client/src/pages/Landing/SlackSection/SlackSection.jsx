import Section from '../Section/Section.jsx'
import './SlackSection.css'

const STEPS = [
  { title: 'Searching Notion', details: 'refund policy', status: 'done' },
  { title: 'Reading file', details: 'src/refunds/service.js', status: 'done' },
  { title: 'Searching logs', details: 'refund failed', status: 'running' },
]

export default function SlackSection() {
  return (
    <Section id="slack">
      <div className="lp-section__head">
        <span className="lp-eyebrow">Ask from Slack</span>
        <h2 className="lp-h2">Watch it work, right in the thread.</h2>
        <p className="lp-lead">
          Mention Soporti in any channel or DM and the reply is a live card. Every source it opens shows up as a step
          the moment it happens, and the answer streams in underneath — no more waiting on a silent “Thinking…” while
          you wonder whether it is stuck.
        </p>
        <ul className="lp-points">
          <li>Each step names what it looked at, so you can judge the answer by where it came from</li>
          <li>Steps are collapsed by default — the thread stays readable, the detail is one click away</li>
          <li>The answer writes itself into the same message instead of landing all at once at the end</li>
        </ul>
      </div>
      <ul className="lp-steps">
        {STEPS.map(step => (
          <li key={step.title} className={`lp-steps__item lp-steps__item--${step.status}`}>
            <span className="lp-steps__title">{step.title}</span>
            <span className="lp-steps__details">{step.details}</span>
          </li>
        ))}
      </ul>
    </Section>
  )
}
