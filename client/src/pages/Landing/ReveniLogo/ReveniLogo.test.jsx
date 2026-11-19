import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import ReveniLogo from './ReveniLogo.jsx'

describe('ReveniLogo', () => {
  it('keeps the proportions of the Reveni mark at the height it is given', () => {
    const { container } = render(<ReveniLogo height={54} />)

    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('height', '54')
    expect(svg).toHaveAttribute('width', '38')
    expect(svg).toHaveAttribute('viewBox', '0 0 19 27')
    expect(svg).toHaveAttribute('aria-hidden', 'true')
  })

  it('draws the filled mark plus one stroke per contour so it can trace itself', () => {
    const { container } = render(<ReveniLogo className="lp-nav__logo-mark" />)

    expect(container.querySelector('svg')).toHaveClass('lp-logo', 'lp-nav__logo-mark')
    expect(container.querySelector('.lp-logo__fill')).toHaveAttribute('fill-rule', 'evenodd')
    const strokes = container.querySelectorAll('.lp-logo__stroke')
    expect(strokes).toHaveLength(2)
    strokes.forEach(stroke => expect(stroke).toHaveAttribute('pathLength', '1'))
  })
})
