import Icon from '../../../common/Icon/Icon.jsx'
import IntegrationIcon from '../../../common/IntegrationIcon/IntegrationIcon.jsx'
import { GITHUB_URL } from '../constants.js'

const LINKS = [
  { href: '#ask', label: 'Ask' },
  { href: '#renders', label: 'Answers' },
  { href: '#integrations', label: 'Integrations' },
  { href: '#providers', label: 'Models' },
  { href: '#skills', label: 'Skills' },
  { href: '#automations', label: 'Automations' },
]

const GITHUB_ICON_SIZE = 18
const ARROW_STROKE = 2.2

export default function LandingNav({ cta }) {
  return (
    <nav className="lp-nav">
      <div className="lp__inner lp-nav__inner">
        <div className="lp-nav__brand">
          <span className="lp-nav__logo">Soporti</span>
          <span className="lp-nav__by">by Reveni</span>
        </div>
        <div className="lp-nav__links">
          {LINKS.map(link => (
            <a key={link.href} className="lp-nav__link" href={link.href}>
              {link.label}
            </a>
          ))}
          <a className="lp-nav__gh" href={GITHUB_URL} target="_blank" rel="noreferrer" aria-label="Soporti on GitHub">
            <IntegrationIcon id="github" size={GITHUB_ICON_SIZE} />
            <span className="lp-nav__gh-label">GitHub</span>
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
