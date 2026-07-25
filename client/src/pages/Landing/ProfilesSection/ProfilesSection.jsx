import FeatureCard from '../FeatureCard/FeatureCard.jsx'
import Section from '../Section/Section.jsx'

const FEATURES = [
  {
    icon: '🤝',
    title: 'Support profile',
    description:
      'Simplified, behaviour-focused answers for support and ops — what the product does and why, without the code.',
  },
  {
    icon: '🛠️',
    title: 'Tech profile',
    description: 'Code-level detail for engineers — file paths, architecture and the exact logic behind a behaviour.',
  },
  {
    icon: '🎯',
    title: 'Pick your sources',
    description:
      'Enforced at the tool layer, not just the prompt. Scope a chat to specific repos and integrations, or let YOLO auto-select.',
  },
  {
    icon: '💬',
    title: 'Chat that remembers',
    description:
      'Conversations are saved and searchable, share a thread with a teammate, set custom instructions, and watch every answer stream in real time — tool calls and all.',
  },
]

export default function ProfilesSection() {
  return (
    <Section className="lp-section--dark">
      <div className="lp-section__head">
        <span className="lp-eyebrow">Made for the whole team</span>
        <h2 className="lp-h2">One assistant, tuned to how you work.</h2>
      </div>
      <div className="lp-feat__grid lp-feat__grid--2col">
        {FEATURES.map(feature => (
          <FeatureCard
            key={feature.title}
            icon={feature.icon}
            title={feature.title}
            description={feature.description}
          />
        ))}
      </div>
    </Section>
  )
}
