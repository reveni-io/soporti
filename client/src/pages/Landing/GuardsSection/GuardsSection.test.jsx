import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import GuardsSection from './GuardsSection.jsx'

describe('GuardsSection', () => {
  it('puts Soporti first, with guards answered by Jev', () => {
    const { container } = render(<GuardsSection />)

    expect(container.querySelector('section')).toHaveAttribute('id', 'guards')
    expect(
      screen.getByRole('heading', { level: 2, name: 'Soporti makes better decisions with guards.' })
    ).toBeInTheDocument()
    expect(screen.getByText(/Jev, TypeSafe’s question-answering model/)).toBeInTheDocument()
    expect(screen.getByText('One guard for each job')).toBeInTheDocument()
    expect(screen.getByText('Not sure means careful')).toBeInTheDocument()
    expect(screen.getByText('Wherever you ask')).toBeInTheDocument()
    expect(container.textContent).not.toMatch(/\/admin/)
  })

  it('shows an answer below the minimum confidence raising a warning before anything is sent', () => {
    const { container } = render(<GuardsSection />)

    expect(container.querySelectorAll('.lp-guards__answer')).toHaveLength(3)
    expect(container.querySelector('.lp-guards__answer--unsure')).toHaveTextContent('Not sure')
    expect(screen.getByText(/the case shows a warning before anyone sends the reply/)).toBeInTheDocument()
  })
})
