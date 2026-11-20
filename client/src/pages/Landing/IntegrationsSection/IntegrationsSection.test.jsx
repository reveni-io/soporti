import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import IntegrationsSection from './IntegrationsSection.jsx'
import { INTEGRATIONS } from './integrations.js'

describe('IntegrationsSection', () => {
  it('explains that every integration is optional and scoped per conversation', () => {
    const { container } = render(<IntegrationsSection />)

    expect(container.querySelector('section')).toHaveAttribute('id', 'integrations')
    expect(
      screen.getByRole('heading', { level: 2, name: /plugged into the tools your team already uses/i })
    ).toBeInTheDocument()
    expect(screen.getByText(/every integration is optional/i)).toBeInTheDocument()
    expect(screen.getByText(/enforced when the tools are built/i)).toBeInTheDocument()
  })

  it('states the guarantees about writes, personal accounts and credentials', () => {
    render(<IntegrationsSection />)

    expect(screen.getByText(/read-only by default/i)).toBeInTheDocument()
    expect(screen.getByText(/gmail, calendar, granola and zendesk connect per person/i)).toBeInTheDocument()
    expect(screen.getByText(/credentials live in your own database/i)).toBeInTheDocument()
  })

  it('puts every integration in the orbit', () => {
    render(<IntegrationsSection />)

    expect(screen.getAllByRole('button')).toHaveLength(INTEGRATIONS.length)
    expect(screen.getByRole('button', { name: 'Sendcloud' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'HubSpot' })).toBeInTheDocument()
  })
})
