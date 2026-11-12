import './CardSkeleton.css'

const DEFAULT_STEP = 'Thinking'
const BARS = ['first', 'second', 'third', 'fourth', 'fifth']

export default function CardSkeleton({ step, prompt }) {
  return (
    <div className="card-skeleton">
      <div className="card-skeleton__bars" aria-hidden="true">
        {BARS.map(bar => (
          <span key={bar} className={`card-skeleton__bar card-skeleton__bar--${bar}`} />
        ))}
      </div>

      <p className="card-skeleton__step" role="status">
        <span className="card-skeleton__dot" aria-hidden="true" />
        {step ?? DEFAULT_STEP}…
      </p>
      {prompt && <p className="card-skeleton__prompt">{prompt}</p>}
    </div>
  )
}
