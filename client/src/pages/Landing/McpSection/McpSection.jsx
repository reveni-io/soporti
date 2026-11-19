import CopyButton from '../../../common/CopyButton/CopyButton.jsx'
import Icon from '../../../common/Icon/Icon.jsx'
import McpTerminal from '../McpTerminal/McpTerminal.jsx'
import Section from '../Section/Section.jsx'
import SectionHeading from '../SectionHeading/SectionHeading.jsx'
import { MCP_COMMAND, SECTION_IDS } from '../constants.js'
import { staggerStyle } from '../stagger.js'
import './McpSection.css'

const ICON_SIZE = 18
const FIRST_POINT_INDEX = 3

const POINTS = [
  {
    icon: 'zap',
    title: 'Five tools, one endpoint',
    text: 'ask_soporti answers with every source it consulted; follow_up, get_answer, list_sources and list_skills let an agent aim the next question.',
  },
  {
    icon: 'clock',
    title: 'Built for long questions',
    text: 'A long investigation hands back a run id and keeps going on the server, so no client timeout cuts it short.',
  },
  {
    icon: 'shield',
    title: 'Sign in, or bring a key',
    text: 'OAuth 2.1 in the browser, or a scoped sop_ key for headless agents. Either way it runs as you and reaches nothing you cannot.',
  },
]

export default function McpSection() {
  return (
    <Section id={SECTION_IDS.MCP}>
      <div className="lp-mcp">
        <div className="lp-mcp__copy">
          <SectionHeading
            eyebrow="MCP server"
            title={
              <>
                Your other agents can <em>ask Soporti</em> too.
              </>
            }
            lead="Point Claude Code, or any MCP client, at one endpoint and it gets a teammate that investigates across your stack and answers with its sources."
          />
          <ul className="lp-mcp__points">
            {POINTS.map((point, index) => (
              <li key={point.title} className="lp-mcp__point lp-rise" style={staggerStyle(FIRST_POINT_INDEX + index)}>
                <span className="lp-icon-tile">
                  <Icon name={point.icon} size={ICON_SIZE} />
                </span>
                <span>
                  <strong>{point.title}</strong>
                  {point.text}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="lp-mcp__visual lp-rise" style={staggerStyle(2)}>
          <McpTerminal />
          <div className="lp-mcp__install">
            <code className="lp-mcp__command">{MCP_COMMAND}</code>
            <CopyButton text={MCP_COMMAND} ariaLabel="Copy the install command" variant="inverse" />
          </div>
        </div>
      </div>
    </Section>
  )
}
