import { useState } from 'react'
import Icon from '../../../common/Icon/Icon.jsx'
import IntegrationIcon from '../../../common/IntegrationIcon/IntegrationIcon.jsx'
import { useCountUp } from '../hooks/useCountUp/useCountUp.js'
import { INTEGRATIONS } from '../IntegrationsSection/integrations.js'
import './IntegrationsOrbit.css'

const RINGS = ['inner', 'outer']
const LOGO_SIZE = 20
const CORE_LOGO_SIZE = 30
const FULL_TURN_DEG = 360
const COUNT_UP_MS = 1400
const DEFAULT_CAPTION = 'Hover a logo to see what Soporti does with it.'

export default function IntegrationsOrbit() {
  const [activeId, setActiveId] = useState(null)
  const active = INTEGRATIONS.find(integration => integration.id === activeId)

  return (
    <div className="lp-orbit">
      <div className="lp-orbit__stage" onMouseLeave={() => setActiveId(null)}>
        {RINGS.map(ring => (
          <OrbitRing
            key={ring}
            ring={ring}
            integrations={INTEGRATIONS.filter(integration => integration.ring === ring)}
            activeId={activeId}
            onActivate={setActiveId}
          />
        ))}
        <div className="lp-orbit__core">{active ? <ActiveCore integration={active} /> : <CountCore />}</div>
      </div>
      <p className="lp-orbit__caption" aria-live="polite">
        {active ? (
          <>
            <strong>{active.name}</strong> {active.desc}
          </>
        ) : (
          DEFAULT_CAPTION
        )}
      </p>
    </div>
  )
}

function OrbitRing({ ring, integrations, activeId, onActivate }) {
  const step = FULL_TURN_DEG / integrations.length

  return (
    <ul className={`lp-orbit__ring lp-orbit__ring--${ring}`}>
      {integrations.map((integration, index) => (
        <li key={integration.id} className="lp-orbit__slot" style={{ '--angle': `${step * index}deg` }}>
          <button
            type="button"
            className={`lp-orbit__logo lp-focusable${integration.id === activeId ? ' lp-orbit__logo--active' : ''}`}
            aria-label={integration.name}
            onMouseEnter={() => onActivate(integration.id)}
            onFocus={() => onActivate(integration.id)}
            onBlur={() => onActivate(null)}
          >
            <IntegrationLogo integration={integration} size={LOGO_SIZE} />
          </button>
        </li>
      ))}
    </ul>
  )
}

function IntegrationLogo({ integration, size }) {
  if (integration.icon) return <Icon name={integration.icon} size={size} />

  return <IntegrationIcon id={integration.id} size={size} />
}

function CountCore() {
  const { ref, value } = useCountUp({ target: INTEGRATIONS.length, durationMs: COUNT_UP_MS })

  return (
    <span className="lp-orbit__count" ref={ref}>
      <span className="lp-orbit__number">{value}</span>
      <span className="lp-orbit__unit">integrations</span>
    </span>
  )
}

function ActiveCore({ integration }) {
  return (
    <span key={integration.id} className="lp-orbit__active">
      <IntegrationLogo integration={integration} size={CORE_LOGO_SIZE} />
      <span className="lp-orbit__name">{integration.name}</span>
    </span>
  )
}
