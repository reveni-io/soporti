import IntegrationIcon from '../../../common/IntegrationIcon/IntegrationIcon.jsx'
import './SubagentsTile.css'

const MAIN = { name: 'Soporti', integrations: ['postgres', 'shopify', 'betterstack'] }

const SPECIALISTS = [
  { name: 'code_investigator', provider: 'anthropic', model: 'claude-sonnet', integrations: ['github', 'sentry'] },
  { name: 'context_gatherer', provider: 'openai', model: 'gpt-5.2', integrations: ['notion', 'shortcut'] },
]

const LOGO_SIZE = 14
const EDGES = ['M100 0 C100 34, 48 26, 48 64', 'M100 0 C100 34, 152 26, 152 64']

export default function SubagentsTile() {
  return (
    <div className="lp-subagents-tile" aria-hidden="true">
      <div className="lp-subagents-tile__node lp-subagents-tile__node--main">
        <span className="lp-subagents-tile__name">{MAIN.name}</span>
        <Logos ids={MAIN.integrations} />
      </div>

      <svg className="lp-subagents-tile__edges" viewBox="0 0 200 64" preserveAspectRatio="none">
        {EDGES.map(path => (
          <g key={path}>
            <path className="lp-subagents-tile__edge" d={path} />
            <path className="lp-subagents-tile__flow" d={path} />
          </g>
        ))}
      </svg>

      <div className="lp-subagents-tile__children">
        {SPECIALISTS.map(specialist => (
          <div className="lp-subagents-tile__node" key={specialist.name}>
            <span className="lp-subagents-tile__name lp-subagents-tile__name--mono">{specialist.name}</span>
            <span className="lp-subagents-tile__model">
              <IntegrationIcon id={specialist.provider} size={LOGO_SIZE} />
              {specialist.model}
            </span>
            <Logos ids={specialist.integrations} />
          </div>
        ))}
      </div>
    </div>
  )
}

function Logos({ ids }) {
  return (
    <span className="lp-subagents-tile__logos">
      {ids.map(id => (
        <IntegrationIcon key={id} id={id} size={LOGO_SIZE} />
      ))}
    </span>
  )
}
