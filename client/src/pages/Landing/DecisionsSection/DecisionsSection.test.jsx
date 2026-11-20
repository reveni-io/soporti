import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import DecisionsSection from './DecisionsSection.jsx'

describe('DecisionsSection', () => {
  it('puts Soporti first and names Jev as the tool behind its decisions', () => {
    const { container } = render(<DecisionsSection />)

    expect(container.querySelector('section')).toHaveAttribute('id', 'decisions')
    expect(
      screen.getByRole('heading', { level: 2, name: 'Soporti makes better decisions with Jev.' })
    ).toBeInTheDocument()
    expect(screen.getByText('Not sure means no')).toBeInTheDocument()
    expect(screen.getByText('One switch for every call')).toBeInTheDocument()
    expect(container.textContent).not.toMatch(/\/admin/)
  })

  it('shows an answer below the minimum confidence holding the approval back', () => {
    const { container } = render(<DecisionsSection />)

    expect(container.querySelectorAll('.lp-decisions__answer')).toHaveLength(3)
    expect(container.querySelector('.lp-decisions__answer--unsure')).toHaveTextContent('Not sure')
    expect(screen.getByText(/so Soporti holds the approval and a person reviews it/)).toBeInTheDocument()
  })
})
