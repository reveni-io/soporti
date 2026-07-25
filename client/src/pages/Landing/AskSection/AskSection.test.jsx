import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import AskSection from './AskSection.jsx'
import { QUESTIONS } from './questions.js'

describe('AskSection', () => {
  it('renders a card per example question with its source tag', () => {
    const { container } = render(<AskSection />)

    expect(container.querySelectorAll('.lp-qcard')).toHaveLength(QUESTIONS.length)
    expect(screen.getByText(/sign up with an email that already exists/i)).toBeInTheDocument()
    expect(screen.getByText('Product')).toBeInTheDocument()
    expect(container.querySelector('[data-icon="github"]')).toBeInTheDocument()
  })
})
