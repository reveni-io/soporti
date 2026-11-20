import Icon from '../../../common/Icon/Icon.jsx'
import QueryGuard from '../QueryGuard/QueryGuard.jsx'
import Section from '../Section/Section.jsx'
import SectionHeading from '../SectionHeading/SectionHeading.jsx'
import { SECTION_IDS } from '../constants.js'
import { staggerStyle } from '../stagger.js'
import './SecuritySection.css'

const ICON_SIZE = 18
const FIRST_CARD_INDEX = 4

const GUARANTEES = [
  {
    icon: 'shield',
    title: 'Read-only by default',
    text: 'Code, data and settings are never changed. The few write actions stay off until an admin switches them on.',
  },
  {
    icon: 'users',
    title: 'No self sign-up',
    text: 'Admins create the accounts, and Google sign-in only lets your company’s domains in.',
  },
  {
    icon: 'lock',
    title: 'Secrets stay secret',
    text: 'Anything secret-shaped is redacted before it is posted, and a stored key is never sent back.',
  },
  {
    icon: 'trash',
    title: 'Your data, briefly',
    text: 'Conversations are deleted 14 days after their last use. Webhooks are HMAC-verified.',
  },
  {
    icon: 'code',
    title: 'Open source',
    text: 'Apache-2.0. Read every line and run it on your own infrastructure, with your own database.',
  },
  {
    icon: 'chart-line',
    title: 'See what it did',
    text: 'Every step shows in the chat as it runs, and each run can be traced in your own Langfuse.',
  },
]

export default function SecuritySection() {
  return (
    <Section id={SECTION_IDS.SECURITY}>
      <SectionHeading
        eyebrow="Safe by design"
        title={
          <>
            Powerful access, <em>zero blast radius</em>.
          </>
        }
        lead="Soporti reads everything it needs to answer and changes nothing you did not switch on."
        isCentered
      />

      <div className="lp-security">
        <div className="lp-security__visual lp-rise" style={staggerStyle(3)}>
          <QueryGuard />
        </div>
        <ul className="lp-security__grid">
          {GUARANTEES.map((guarantee, index) => (
            <li
              key={guarantee.title}
              className="lp-security__card lp-rise"
              style={staggerStyle(FIRST_CARD_INDEX + index)}
            >
              <span className="lp-icon-tile lp-security__icon">
                <Icon name={guarantee.icon} size={ICON_SIZE} />
              </span>
              <span className="lp-security__title">{guarantee.title}</span>
              <span className="lp-security__text">{guarantee.text}</span>
            </li>
          ))}
        </ul>
      </div>
    </Section>
  )
}
