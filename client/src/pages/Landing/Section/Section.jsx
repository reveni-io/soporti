import { useReveal } from '../hooks/useReveal/useReveal.js'

export default function Section({ className = '', children, id }) {
  const ref = useReveal()

  return (
    <section id={id} className={`lp-section ${className}`.trim()}>
      <div className="lp__inner lp-stage" ref={ref}>
        {children}
      </div>
    </section>
  )
}
