import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import Section from './Section.jsx'

describe('Section', () => {
  it('renders its children inside a revealable inner wrapper', () => {
    const { container } = render(
      <Section>
        <p>Body</p>
      </Section>
    )

    expect(screen.getByText('Body')).toBeInTheDocument()
    expect(container.querySelector('.lp-reveal')).toBeInTheDocument()
  })

  it('applies the id and the extra class name it is given', () => {
    const { container } = render(
      <Section id="ask" className="lp-section--white">
        <p>Body</p>
      </Section>
    )

    const section = container.querySelector('section')
    expect(section).toHaveAttribute('id', 'ask')
    expect(section).toHaveClass('lp-section', 'lp-section--white')
  })
})
