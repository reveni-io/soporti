import Section from '../Section/Section.jsx'
import IntegrationIcon from '../../../common/IntegrationIcon/IntegrationIcon.jsx'
import './SubagentsSection.css'

const POINTS = [
  'Hand a specialist its tools and take them off the main assistant, so delegation is the only path to them — or leave them shared and let its description decide when to hand off',
  'Each one runs on its own provider and model: a cheap one for log triage, your best one for code',
  'A graph in /admin shows who owns what — one logo per integration, hover it for the tools — and you pick the main assistant own tools there too',
  'A delegation appears in the chat as an ordinary step, so you can watch it happen',
]

const PARENT_INTEGRATIONS = ['postgres', 'shopify', 'google-drive', 'betterstack']

const SPECIALISTS = [
  {
    name: 'code_investigator',
    provider: 'anthropic',
    model: 'claude-sonnet-5',
    integrations: ['github', 'sentry'],
    tools: '9 tools',
  },
  {
    name: 'context_gatherer',
    provider: 'openai',
    model: 'gpt-5.2',
    integrations: ['shortcut', 'notion'],
    tools: '4 tools',
  },
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

      <div className="lp-subagents__graph">
        <div className="lp-subagents__node lp-subagents__node--parent">
          <span className="lp-subagents__name">Soporti</span>
          <Logos ids={PARENT_INTEGRATIONS} />
          <span className="lp-subagents__meta">12 tools (13 delegated)</span>
        </div>

        <svg className="lp-subagents__edges" viewBox="0 0 400 48" preserveAspectRatio="none" aria-hidden="true">
          <path d="M200 0 C200 28, 100 20, 100 48" />
          <path d="M200 0 C200 28, 300 20, 300 48" />
        </svg>

        <div className="lp-subagents__children">
          {SPECIALISTS.map(specialist => (
            <div className="lp-subagents__node" key={specialist.name}>
              <span className="lp-subagents__name">{specialist.name}</span>
              <span className="lp-subagents__provider">
                <IntegrationIcon id={specialist.provider} size={14} />
                <span className="chip">{specialist.model}</span>
              </span>
              <Logos ids={specialist.integrations} />
              <span className="lp-subagents__meta">{specialist.tools}</span>
            </div>
          ))}
        </div>
      </div>
    </Section>
  )
}

function Logos({ ids }) {
  return (
    <span className="lp-subagents__logos">
      {ids.map(id => (
        <IntegrationIcon id={id} size={18} key={id} />
      ))}
    </span>
  )
}
