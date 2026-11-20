import Icon from '../../../common/Icon/Icon.jsx'

const ARROW_STROKE = 2.2

export default function CtaButton({ cta }) {
  return (
    <a
      className="lp-btn lp-btn--primary"
      href={cta.href}
      target={cta.isExternal ? '_blank' : undefined}
      rel={cta.isExternal ? 'noreferrer' : undefined}
    >
      {cta.label}
      <Icon name="arrow-right" className="lp-btn__arrow" strokeWidth={ARROW_STROKE} />
    </a>
  )
}
