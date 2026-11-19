import IntegrationIcon from '../../../common/IntegrationIcon/IntegrationIcon.jsx'
import ReveniLogo from '../ReveniLogo/ReveniLogo.jsx'
import { GITHUB_URL } from '../constants.js'
import './LandingFooter.css'

const GITHUB_ICON_SIZE = 16

const LINKS = [
  { href: `${GITHUB_URL}#readme`, label: 'Documentation' },
  { href: `${GITHUB_URL}/blob/main/docs/deployment.md`, label: 'Deployment guide' },
  { href: `${GITHUB_URL}/blob/main/LICENSE`, label: 'License' },
]

export default function LandingFooter() {
  return (
    <footer className="lp-footer">
      <div className="lp__inner lp-footer__inner">
        <div className="lp-footer__brand">
          <span className="lp-footer__logo">
            <ReveniLogo className="lp-footer__mark" />
            Soporti
          </span>
          <span className="lp-footer__small">An open-source tool by Reveni · Runs on your own infrastructure</span>
        </div>
        <nav className="lp-footer__links" aria-label="Footer">
          {LINKS.map(link => (
            <a
              key={link.label}
              className="lp-footer__link lp-focusable"
              href={link.href}
              target="_blank"
              rel="noreferrer"
            >
              {link.label}
            </a>
          ))}
          <a className="lp-footer__link lp-focusable" href={GITHUB_URL} target="_blank" rel="noreferrer">
            <IntegrationIcon id="github" size={GITHUB_ICON_SIZE} />
            View on GitHub
          </a>
        </nav>
      </div>
      <div className="lp-footer__wordmark" aria-hidden="true">
        Soporti
      </div>
    </footer>
  )
}
