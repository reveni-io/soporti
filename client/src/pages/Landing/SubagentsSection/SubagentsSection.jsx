import Section from '../Section/Section.jsx'
import './SubagentsSection.css'

const POINTS = [
  'Hand a specialist its tools and take them off the main assistant, so delegation is the only path to them — or leave them shared and let its description decide when to hand off',
  'Each one runs on its own provider and model: a cheap one for log triage, your best one for code',
  'The tree in /admin shows exactly who owns what, and what the main assistant has left',
  'A delegation appears in the chat as an ordinary step, so you can watch it happen',
]

const SPECIALISTS = [
  { name: 'code_investigator', model: 'claude-sonnet-5', tools: '9 tools' },
  { name: 'context_gatherer', model: 'gpt-5.2', tools: '4 tools' },
]

export default function SubagentsSection() {
  return (
    <Section id="subagents" className="lp-section--cool">
      <div className="lp-section__head">
        <span className="lp-eyebrow">Subagents</span>
        <h2 className="lp-h2">
          One assistant out front, <em>specialists</em> behind it.
        </h2>
        <p className="lp-lead">
          Define a specialist in <strong>/admin</strong> and give it its own system prompt, its own model and its own
          tools. The assistant decides when a question belongs to one, asks it, and writes the answer from what comes
          back. Each specialist works in a context of its own, so a thirty-file investigation never crowds the
          conversation you are having.
        </p>
      </div>

      <ul className="lp-points">
        {POINTS.map(point => (
          <li key={point}>{point}</li>
        ))}
      </ul>

      <div className="lp-subagents__tree">
        <div className="lp-subagents__row">
          <span className="lp-subagents__name">Soporti</span>
          <span className="lp-subagents__meta">12 tools (13 delegated)</span>
        </div>
        {SPECIALISTS.map(specialist => (
          <div className="lp-subagents__row lp-subagents__row--child" key={specialist.name}>
            <span className="lp-subagents__name">{specialist.name}</span>
            <span className="chip">{specialist.model}</span>
            <span className="lp-subagents__meta">{specialist.tools}</span>
          </div>
        ))}
      </div>
    </Section>
  )
}
