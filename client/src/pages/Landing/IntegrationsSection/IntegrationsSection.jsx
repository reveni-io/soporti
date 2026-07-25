import Icon from '../../../common/Icon/Icon.jsx'
import IntegrationIcon from '../../../common/IntegrationIcon/IntegrationIcon.jsx'
import Section from '../Section/Section.jsx'
import { INTEGRATIONS } from './integrations.js'

const ICON_SIZE = 22

export default function IntegrationsSection() {
  return (
    <Section id="integrations" className="lp-section--white">
      <div className="lp-section__head">
        <span className="lp-eyebrow">Connected everywhere</span>
        <h2 className="lp-h2">Plugged into the tools your team already uses.</h2>
        <p className="lp-lead">
          Every integration is optional and read-only. Leave <strong>YOLO (auto)</strong> on and Soporti picks the right
          tools for each question, or focus it on specific repos and sources.
        </p>
      </div>
      <div className="lp-int__grid">
        {INTEGRATIONS.map(integration => (
          <div className="lp-int" key={integration.id}>
            <div className="lp-int__icon">
              {integration.icon ? (
                <Icon name={integration.icon} size={ICON_SIZE} strokeWidth={1.7} />
              ) : (
                <IntegrationIcon id={integration.id} size={ICON_SIZE} />
              )}
            </div>
            <div>
              <div className="lp-int__name">{integration.name}</div>
              <div className="lp-int__desc">{integration.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </Section>
  )
}
