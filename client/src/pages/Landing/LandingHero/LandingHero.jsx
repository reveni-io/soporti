import GridPattern from '../../../common/GridPattern/GridPattern.jsx'
import Icon from '../../../common/Icon/Icon.jsx'
import HeroChat from '../HeroChat/HeroChat.jsx'

const ARROW_STROKE = 2.2

export default function LandingHero({ cta }) {
  return (
    <header className="lp-hero">
      <div className="lp-hero__grid">
        <GridPattern variant="dark" />
      </div>
      <div className="lp__inner lp-hero__inner">
        <div className="lp-hero__text">
          <span className="lp-hero__badge">
            <span className="lp-hero__badge-dot" />
            Internal AI teammate · Read-only &amp; safe
          </span>
          <h1 className="lp-hero__title">
            Ask anything about <em>how your product works</em>.
          </h1>
          <p className="lp-hero__subtitle">
            Soporti reads your code, queries production data, and searches docs, tickets and errors — then explains what
            it finds in plain language. No spelunking required.
          </p>
          <div className="lp-hero__cta">
            {cta && (
              <a className="lp-btn lp-btn--primary" href={cta.href}>
                {cta.label}
                <Icon name="arrow-right" className="lp-btn__arrow" strokeWidth={ARROW_STROKE} />
              </a>
            )}
            <a className="lp-btn lp-btn--ghost" href="#renders">
              See what it can do
            </a>
          </div>
          <p className="lp-hero__note">Company sign-in only · nothing is ever modified</p>
        </div>
        <div className="lp-hero__visual">
          <HeroChat />
        </div>
      </div>
    </header>
  )
}
