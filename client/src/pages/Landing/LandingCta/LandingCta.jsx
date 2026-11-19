import CtaButton from '../CtaButton/CtaButton.jsx'
import IntegrationIcon from '../../../common/IntegrationIcon/IntegrationIcon.jsx'
import { GITHUB_CTA, GITHUB_URL } from '../constants.js'
import { useReveal } from '../hooks/useReveal/useReveal.js'
import { staggerStyle } from '../stagger.js'
import './LandingCta.css'

const GITHUB_ICON_SIZE = 16

export default function LandingCta({ cta }) {
  const ref = useReveal()

  return (
    <section className="lp-cta">
      <div className="lp-cta__glow" aria-hidden="true" />
      <div className="lp-cta__horizon" aria-hidden="true" />
      <div className="lp__inner lp-cta__inner" ref={ref}>
        <h2 className="lp-cta__title lp-rise">
          Stop guessing. <br />
          <em className="lp-gradient-text">Just ask Soporti.</em>
        </h2>
        <p className="lp-cta__sub lp-rise" style={staggerStyle(1)}>
          Your AI teammate for code, data and docs, one question away.
        </p>
        <div className="lp-cta__actions lp-rise" style={staggerStyle(2)}>
          <CtaButton cta={cta ?? GITHUB_CTA} />
          {cta && (
            <a className="lp-btn lp-btn--ghost" href={GITHUB_URL} target="_blank" rel="noreferrer">
              <IntegrationIcon id="github" size={GITHUB_ICON_SIZE} />
              Star on GitHub
            </a>
          )}
        </div>
      </div>
    </section>
  )
}
