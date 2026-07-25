import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import IntegrationsSection from './IntegrationsSection.jsx'
import { INTEGRATIONS } from './integrations.js'

describe('IntegrationsSection', () => {
  it('renders a card per integration with its description', () => {
    const { container } = render(<IntegrationsSection />)

    expect(container.querySelectorAll('.lp-int')).toHaveLength(INTEGRATIONS.length)
    expect(screen.getByText('GitHub')).toBeInTheDocument()
    expect(screen.getByText(/Browses directories, reads files/)).toBeInTheDocument()
  })

  it('uses the brand icon for integrations that have one', () => {
    const { container } = render(<IntegrationsSection />)

    expect(container.querySelector('[data-icon="github"]')).toHaveAttribute('fill', 'currentColor')
  })

  it('uses a stroke icon for the help center, which has no brand mark', () => {
    const { container } = render(<IntegrationsSection />)

    expect(screen.getByText('Help Center')).toBeInTheDocument()
    expect(container.querySelector('[data-icon="help-center"]')).toHaveAttribute('stroke', 'currentColor')
  })
})
