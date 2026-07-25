import FeatureCard from '../FeatureCard/FeatureCard.jsx'
import Section from '../Section/Section.jsx'

const AUTOMATIONS = [
  {
    icon: '💬',
    title: 'Slack teammate',
    description: 'Mention Soporti in Slack and it answers in the thread — same tools, same read-only safety.',
    bullets: [
      'Auto-diagnoses new support tickets on its own',
      'Reads screenshots attached to a ticket (vision)',
      'Writes its findings back onto the ticket',
    ],
  },
  {
    icon: '🔍',
    title: 'Automated PR reviews',
    description:
      'Request a review (or add a label) and Soporti reviews the code with your changes actually applied, on three axes.',
    bullets: [
      'Correctness, standards (cites your CLAUDE.md & ADRs) and spec vs. the linked Shortcut story',
      'Posts inline comments; can approve trivial PRs, never blocks',
      'Replies to @-mentions right in the PR thread',
    ],
  },
  {
    icon: '🌱',
    title: 'Learns from feedback',
    description: 'A 👍 on a good answer saves it as a solved case, and future questions reuse it automatically.',
    bullets: [
      'Answers get grounded in past resolutions',
      'Semantic search over the knowledge base',
      'Gets more accurate the more the team uses it',
    ],
  },
]

export default function AutomationsSection() {
  return (
    <Section id="automations" className="lp-section--warm">
      <div className="lp-section__head">
        <span className="lp-eyebrow">Beyond the chat</span>
        <h2 className="lp-h2">Soporti shows up where the work happens.</h2>
        <p className="lp-lead">The same brain that answers in chat also works autonomously across Slack and GitHub.</p>
      </div>
      <div className="lp-feat__grid">
        {AUTOMATIONS.map(automation => (
          <FeatureCard
            key={automation.title}
            icon={automation.icon}
            title={automation.title}
            description={automation.description}
            bullets={automation.bullets}
            light
          />
        ))}
      </div>
    </Section>
  )
}
