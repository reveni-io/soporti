import { useLayoutEffect, useRef, useState } from 'react'
import ReveniLogo from '../ReveniLogo/ReveniLogo.jsx'
import { staggerStyle } from '../stagger.js'
import './LandingIntro.css'

const WORDMARK = 'Soporti'

function flightTo(from, to) {
  const dx = to.left + to.width / 2 - (from.left + from.width / 2)
  const dy = to.top + to.height / 2 - (from.top + from.height / 2)
  const scale = to.height / from.height

  return `translate(${dx}px, ${dy}px) scale(${scale})`
}

export default function LandingIntro({ isLeaving, targetRef, onSkip }) {
  const brandRef = useRef(null)
  const [flight, setFlight] = useState(null)

  useLayoutEffect(() => {
    if (!isLeaving) return

    const from = brandRef.current?.getBoundingClientRect()
    const to = targetRef.current?.getBoundingClientRect()
    if (!from?.height || !to?.height) return

    setFlight(flightTo(from, to))
  }, [isLeaving, targetRef])

  return (
    <div className={`lp-intro${isLeaving ? ' lp-intro--leaving' : ''}`} onClick={onSkip} aria-hidden="true">
      <div className="lp-intro__backdrop" />
      <div className="lp-intro__stage">
        <div
          className={`lp-intro__brand${flight ? ' lp-intro__brand--flying' : ''}`}
          ref={brandRef}
          style={flight ? { transform: flight } : undefined}
        >
          <ReveniLogo className="lp-intro__logo" />
          <span className="lp-intro__word">
            {WORDMARK.split('').map((letter, index) => (
              <span key={index} className="lp-intro__letter" style={staggerStyle(index)}>
                {letter}
              </span>
            ))}
          </span>
        </div>
        <div className="lp-intro__footer">
          <span className="lp-intro__by">by Reveni</span>
          <span className="lp-intro__progress" />
        </div>
      </div>
    </div>
  )
}
