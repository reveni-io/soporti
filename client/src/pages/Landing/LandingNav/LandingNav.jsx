import Icon from '../../../common/Icon/Icon.jsx'
import IntegrationIcon from '../../../common/IntegrationIcon/IntegrationIcon.jsx'
import { ROUTES } from '../../../router/constants.js'
import ReveniLogo from '../ReveniLogo/ReveniLogo.jsx'
import { GITHUB_URL, SECTION_IDS } from '../constants.js'
import { useScrolled } from '../hooks/useScrolled/useScrolled.js'
import './LandingNav.css'

const LINKS = [
  { id: SECTION_IDS.ANSWERS, label: 'Product' },
  { id: SECTION_IDS.INTEGRATIONS, label: 'Integrations' },
  { id: SECTION_IDS.AUTOMATIONS, label: 'Automations' },
  { id: SECTION_IDS.MCP, label: 'MCP' },
  { id: SECTION_IDS.SECURITY, label: 'Security' },
]

const SCROLL_OFFSET = 24
const GITHUB_ICON_SIZE = 18
const ARROW_STROKE = 2.2

export default function LandingNav({ cta, brandRef }) {
  const isScrolled = useScrolled(SCROLL_OFFSET)

  return (
    <nav className={`lp-nav${isScrolled ? ' lp-nav--scrolled' : ''}`} aria-label="Main">
      <div className="lp-nav__bar">
        <a className="lp-nav__brand lp-focusable" href={ROUTES.LANDING} ref={brandRef}>
          <ReveniLogo className="lp-nav__mark" />
          <span className="lp-nav__logo">Soporti</span>
        </a>

        <div className="lp-nav__links">
          {LINKS.map(link => (
            <a key={link.id} className="lp-nav__link lp-focusable" href={`#${link.id}`}>
              {link.label}
            </a>
          ))}
        </div>

        <div className="lp-nav__actions">
          <a
            className="lp-nav__link lp-nav__link--icon lp-focusable"
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            aria-label="Soporti on GitHub"
          >
            <IntegrationIcon id="github" size={GITHUB_ICON_SIZE} />
            <span className="lp-nav__github-label">GitHub</span>
          </a>
          {cta && (
            <a className="lp-btn lp-btn--primary lp-btn--sm" href={cta.href}>
              {cta.label}
              <Icon name="arrow-right" className="lp-btn__arrow" strokeWidth={ARROW_STROKE} />
            </a>
          )}
        </div>
      </div>
    </nav>
  )
}
