export default function FeatureCard({ icon, title, description, bullets, light = false }) {
  return (
    <div className={`lp-feat ${light ? 'lp-feat--light' : ''}`}>
      <div className="lp-feat__icon" aria-hidden="true">
        {icon}
      </div>
      <div className="lp-feat__title">{title}</div>
      <div className="lp-feat__desc">{description}</div>
      {bullets && (
        <ul className="lp-feat__list">
          {bullets.map(bullet => (
            <li key={bullet}>{bullet}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
