import Icon from '../../../common/Icon/Icon.jsx'
import { ROUTES } from '../../../router/constants.js'
import Section from '../Section/Section.jsx'

const ARROW_STROKE = 2.2

export default function LmstfySection() {
  return (
    <Section id="lmstfy" className="lp-section--cool">
      <div className="lp-section__head">
        <span className="lp-eyebrow">Let Me Soporti That For You</span>
        <h2 className="lp-h2">Answer the same question once, then send a link.</h2>
        <p className="lp-lead">
          Someone asks you something Soporti already knows? Type the question at <strong>/lmstfy</strong> and share the
          link it gives you. Whoever opens it watches the question being typed into Soporti and sent, then lands on the
          chat with it already written — so the next time, they ask it themselves.
        </p>
        <ul className="lp-points">
          <li>Public page, no account needed to watch the question being asked</li>
          <li>The answer still happens behind your login, so nothing is exposed to the internet</li>
          <li>Nothing to set up and nothing stored — the question travels in the link itself</li>
        </ul>
      </div>
      <a className="lp-btn lp-btn--ink" href={ROUTES.LMSTFY}>
        Make a link
        <Icon name="arrow-right" className="lp-btn__arrow" strokeWidth={ARROW_STROKE} />
      </a>
    </Section>
  )
}
