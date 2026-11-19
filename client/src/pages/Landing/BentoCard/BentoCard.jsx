import Icon from '../../../common/Icon/Icon.jsx'
import { staggerStyle } from '../stagger.js'
import './BentoCard.css'

const KICKER_ICON_SIZE = 14

export default function BentoCard({ icon, kicker, title, description, isWide = false, index = 0, children }) {
  return (
    <article
      className={`lp-bento-card lp-rise${isWide ? ' lp-bento-card--wide' : ''}`}
      style={staggerStyle(index)}
      data-spotlight=""
    >
      <div className="lp-bento-card__visual">{children}</div>
      <div className="lp-bento-card__copy">
        <span className="lp-bento-card__kicker">
          <Icon name={icon} size={KICKER_ICON_SIZE} />
          {kicker}
        </span>
        <h3 className="lp-bento-card__title">{title}</h3>
        <p className="lp-bento-card__text">{description}</p>
      </div>
    </article>
  )
}
