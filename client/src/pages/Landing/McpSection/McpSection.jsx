import FeatureCard from '../FeatureCard/FeatureCard.jsx'
import Section from '../Section/Section.jsx'
import './McpSection.css'

const INSTALL_ROUTES = [
  {
    label: 'Connect with no key at all',
    description: 'Add the endpoint and sign in: the browser opens, you approve the connection once and that is it.',
    command: 'claude mcp add --transport http soporti https://soporti.your.co/api/mcp',
  },
  {
    label: 'Or bring your own key',
    description: 'Headless agents that never see a browser keep authenticating with a sop_ key.',
    command:
      'claude mcp add --transport http soporti https://soporti.your.co/api/mcp \\\n  --header "Authorization: Bearer sop_..."',
  },
]

const CAPABILITIES = [
  {
    icon: '🔌',
    title: 'Five tools, one endpoint',
    description:
      'ask_soporti returns the synthesis with every source it consulted, and list_sources, list_skills, follow_up and get_answer let an agent aim the next question.',
    bullets: [
      'list_sources: only the repos and the tracker for release notes',
      'follow_up: keep the thread instead of asking from scratch',
      'Current-revision and legacy MCP clients share the endpoint',
    ],
  },
  {
    icon: '⏳',
    title: 'Built for long questions',
    description:
      'An investigation that runs long hands back a runId and keeps going on the server, so no client timeout can cut it short.',
    bullets: [
      'get_answer collects it — in Claude Code, the app and the web alike',
      'A progress notification for every tool it runs',
      'A cut stream loses nothing: the thread keeps the answer',
    ],
  },
  {
    icon: '🔐',
    title: 'Sign in, or bring a key',
    description:
      'OAuth 2.1 with your usual login, or a scoped sop_ key. Either way the agent runs as you and reaches nothing you cannot.',
    bullets: [
      'Mandatory PKCE, and tokens bound to this endpoint alone',
      'Refresh tokens rotate, so a replayed one kills the grant',
      'Read-only tools, and every run lands in your /admin stats',
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
      <div className="lp-mcp__routes">
        {INSTALL_ROUTES.map(route => (
          <div key={route.label} className="lp-mcp__route">
            <p className="lp-mcp__route-label">{route.label}</p>
            <p className="lp-mcp__route-description">{route.description}</p>
            <pre className="lp-mcp__command">
              <code>{route.command}</code>
            </pre>
          </div>
        ))}
      </div>
    </Section>
  )
}
