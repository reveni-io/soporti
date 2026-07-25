import Icon from '../../../common/Icon/Icon.jsx'
import Section from '../Section/Section.jsx'

const SHIELD_SIZE = 20
const SHIELD_STROKE = 1.8

const GUARANTEES = [
  {
    title: 'Read-only everywhere',
    description: 'No tool can change code, data or settings. You can’t break anything by asking.',
  },
  {
    title: 'Company sign-in only',
    description: 'Google SSO restricted to your company’s domains, with stateless session tokens.',
  },
  {
    title: 'Secrets stay secret',
    description: 'A credential guard redacts anything secret-shaped before it’s ever posted or shown.',
  },
  {
    title: 'Your data, briefly',
    description: 'Conversations are purged 14 days after their last use. Webhooks are HMAC-verified.',
  },
]

export default function SafetySection() {
  return (
    <Section className="lp-section--white">
      <div className="lp-section__head">
        <span className="lp-eyebrow">Safe by design</span>
        <h2 className="lp-h2">Powerful access, zero blast radius.</h2>
      </div>
      <div className="lp-safe__grid">
        {GUARANTEES.map(guarantee => (
          <div className="lp-safe" key={guarantee.title}>
            <div className="lp-safe__icon">
              <Icon name="shield" size={SHIELD_SIZE} strokeWidth={SHIELD_STROKE} />
            </div>
            <div className="lp-safe__title">{guarantee.title}</div>
            <div className="lp-safe__desc">{guarantee.description}</div>
          </div>
        ))}
      </div>
    </Section>
  )
}
