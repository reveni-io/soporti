import GridPattern from '../../../common/GridPattern/GridPattern.jsx'
import Icon from '../../../common/Icon/Icon.jsx'

const ARROW_STROKE = 2.2

export default function LandingCta({ cta }) {
  return (
    <section className="lp-section lp-section--dark lp-cta">
      <div className="lp-cta__grid">
        <GridPattern variant="dark" />
      </div>
      <div className="lp__inner lp-cta__inner">
        <h2 className="lp-cta__title">Stop guessing. Just ask Soporti.</h2>
        <p className="lp-cta__sub">Your AI teammate for code, data &amp; docs — one question away.</p>
        {cta && (
          <div className="lp-cta__actions">
            <a className="lp-btn lp-btn--primary" href={cta.href}>
              {cta.label}
              <Icon name="arrow-right" className="lp-btn__arrow" strokeWidth={ARROW_STROKE} />
            </a>
          </div>
        )}
      </div>
    </section>
  )
}
