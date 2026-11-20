import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import SecuritySection from './SecuritySection.jsx'

describe('SecuritySection', () => {
  it('promises powerful access with zero blast radius', () => {
    const { container } = render(<SecuritySection />)

    expect(container.querySelector('section')).toHaveAttribute('id', 'security')
    expect(screen.getByRole('heading', { level: 2, name: 'Powerful access, zero blast radius.' })).toBeInTheDocument()
  })

  it('lists the guarantees next to the guardrails that enforce them', () => {
    const { container } = render(<SecuritySection />)

    expect(container.querySelectorAll('.lp-security__card')).toHaveLength(6)
    expect(screen.getByText('Read-only by default')).toBeInTheDocument()
    expect(screen.getByText(/google sign-in only lets your company’s domains in/i)).toBeInTheDocument()
    expect(screen.getByText(/deleted 14 days after their last use/i)).toBeInTheDocument()
    expect(screen.getByText('Open source')).toBeInTheDocument()
    expect(container.querySelector('[data-icon="lock"]')).toBeInTheDocument()
    expect(screen.getByText('guardrails')).toBeInTheDocument()
  })
})
