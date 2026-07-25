import Section from '../Section/Section.jsx'

const STATS = [
  { value: '7+', label: 'Connected sources: code, data, docs, tickets & errors' },
  { value: '2', label: 'Answer styles — Support and Tech' },
  { value: '3', label: 'Surfaces: web chat, Slack and GitHub PR reviews' },
  { value: '0', label: 'Write access — every tool is strictly read-only' },
]

export default function StatsSection() {
  return (
    <Section className="lp-section--warm">
      <div className="lp-stats">
        {STATS.map(stat => (
          <div className="lp-stat" key={stat.label}>
            <div className="lp-stat__num">{stat.value}</div>
            <div className="lp-stat__label">{stat.label}</div>
          </div>
        ))}
      </div>
    </Section>
  )
}
