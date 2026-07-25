import IntegrationIcon from '../../../common/IntegrationIcon/IntegrationIcon.jsx'
import { GITHUB_URL } from '../constants.js'

const GITHUB_ICON_SIZE = 16

export default function LandingFooter() {
  return (
    <footer className="lp-footer">
      <div className="lp__inner lp-footer__inner">
        <span className="lp-footer__logo">Soporti</span>
        <span className="lp-footer__small">An open-source tool by Reveni · Read-only by design</span>
        <a className="lp-footer__gh" href={GITHUB_URL} target="_blank" rel="noreferrer">
          <IntegrationIcon id="github" size={GITHUB_ICON_SIZE} />
          View on GitHub
        </a>
      </div>
    </footer>
  )
}
