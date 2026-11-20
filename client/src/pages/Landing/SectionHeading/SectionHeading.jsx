import { staggerStyle } from '../stagger.js'
import './SectionHeading.css'

export default function SectionHeading({ eyebrow, title, lead, isCentered = false }) {
  return (
    <div className={`lp-heading${isCentered ? ' lp-heading--center' : ''}`}>
      <span className="lp-eyebrow lp-rise">{eyebrow}</span>
      <h2 className="lp-h2 lp-rise" style={staggerStyle(1)}>
        {title}
      </h2>
      {lead && (
        <p className="lp-lead lp-rise" style={staggerStyle(2)}>
          {lead}
        </p>
      )}
    </div>
  )
}
