import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import Section from './Section.jsx'

describe('Section', () => {
  it('renders its children inside the stage that reveals them on scroll', () => {
    const { container } = render(
      <Section>
        <p>Body</p>
      </Section>
    )

    expect(screen.getByText('Body')).toBeInTheDocument()
    expect(container.querySelector('.lp-stage')).toContainElement(screen.getByText('Body'))
  })

  it('applies the id and the extra class name it is given', () => {
    const { container } = render(
      <Section id="mcp" className="lp-section--mcp">
        <p>Body</p>
      </Section>
    )

    const section = container.querySelector('section')
    expect(section).toHaveAttribute('id', 'mcp')
    expect(section).toHaveClass('lp-section', 'lp-section--mcp')
  })
})
