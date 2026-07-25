import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import SafetySection from './SafetySection.jsx'

describe('SafetySection', () => {
  it('renders every guarantee behind a shield', () => {
    const { container } = render(<SafetySection />)

    expect(container.querySelectorAll('.lp-safe')).toHaveLength(4)
    expect(container.querySelectorAll('[data-icon="shield"]')).toHaveLength(4)
    expect(screen.getByText('Read-only everywhere')).toBeInTheDocument()
    expect(screen.getByText(/purged 14 days/i)).toBeInTheDocument()
  })
})
