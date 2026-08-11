import FeatureCard from '../FeatureCard/FeatureCard.jsx'
import Section from '../Section/Section.jsx'
import './McpSection.css'

const MCP_COMMAND =
  'claude mcp add --transport http soporti https://soporti.your.co/api/mcp \\\n  --header "Authorization: Bearer sop_..."'

const CAPABILITIES = [
  {
    icon: '🔌',
    title: 'One tool, one answer',
    description:
      'ask_soporti takes a question and returns the synthesis with every source it consulted — repos, integrations or all of them at once.',
    bullets: [
      'Pick sources, profile and skills per question',
      'Current-revision and legacy MCP clients share the endpoint',
      'Answers cite the sources they came from',
    ],
  },
  {
    icon: '⏳',
    title: 'Built for long questions',
    description: 'Investigations that take minutes stream progress the whole way, so nothing times out mid-answer.',
    bullets: [
      'A progress notification for every tool it runs',
      'Heartbeats keep proxies from killing the stream',
      'A cut stream cancels the run — retrying is always safe',
    ],
  },
  {
    icon: '🔐',
    title: 'Same keys, same guardrails',
    description: 'Agents authenticate with your sop_ API key, and a scoped key only reaches the sources it was given.',
    bullets: [
      'Origin validation and a dedicated rate limit',
      'Read-only tools, like everywhere else in Soporti',
      'Every run lands in your /admin stats',
    ],
  },
]

export default function McpSection() {
  return (
    <Section id="mcp" className="lp-section--warm">
      <div className="lp-section__head">
        <span className="lp-eyebrow">MCP server</span>
        <h2 className="lp-h2">Your other agents can ask Soporti too.</h2>
        <p className="lp-lead">
          Soporti is an MCP server: point Claude Code — or any MCP client — at one endpoint and it gets a tool that
          investigates across your stack and answers with citations.
        </p>
      </div>
      <div className="lp-feat__grid">
        {CAPABILITIES.map(capability => (
          <FeatureCard
            key={capability.title}
            icon={capability.icon}
            title={capability.title}
            description={capability.description}
            bullets={capability.bullets}
            light
          />
        ))}
      </div>
      <pre className="lp-mcp__command">
        <code>{MCP_COMMAND}</code>
      </pre>
    </Section>
  )
}
