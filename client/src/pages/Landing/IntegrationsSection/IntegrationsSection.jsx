import Icon from '../../../common/Icon/Icon.jsx'
import IntegrationsOrbit from '../IntegrationsOrbit/IntegrationsOrbit.jsx'
import Section from '../Section/Section.jsx'
import SectionHeading from '../SectionHeading/SectionHeading.jsx'
import { SECTION_IDS } from '../constants.js'
import { staggerStyle } from '../stagger.js'
import './IntegrationsSection.css'

const CHECK_SIZE = 14
const CHECK_STROKE = 2.4
const FIRST_POINT_INDEX = 3

const POINTS = [
  'Read-only by default: the few write actions stay off until an admin switches them on',
  'Gmail, Calendar, Granola and Zendesk connect per person, so nobody reads anyone else’s',
  'Credentials live in your own database, set from /admin and rotated without a redeploy',
]

export default function IntegrationsSection() {
  return (
    <Section id={SECTION_IDS.INTEGRATIONS}>
      <div className="lp-integrations">
        <div className="lp-integrations__copy">
          <SectionHeading
            eyebrow="Connected everywhere"
            title={
              <>
                Plugged into the tools your team <em>already uses</em>.
              </>
            }
            lead="Every integration is optional. Leave YOLO on and Soporti picks the right tools for each question, or scope a chat to specific repos and sources. The choice is enforced when the tools are built, not just asked for in the prompt."
          />
          <ul className="lp-integrations__points">
            {POINTS.map((point, index) => (
              <li key={point} className="lp-rise" style={staggerStyle(FIRST_POINT_INDEX + index)}>
                <Icon name="check" size={CHECK_SIZE} strokeWidth={CHECK_STROKE} />
                {point}
              </li>
            ))}
          </ul>
        </div>
        <div className="lp-integrations__visual lp-rise" style={staggerStyle(2)}>
          <IntegrationsOrbit />
        </div>
      </div>
    </Section>
  )
}
