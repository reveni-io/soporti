import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import LandingCta from './LandingCta.jsx'

describe('LandingCta', () => {
  it('renders the closing pitch', () => {
    render(<LandingCta cta={null} />)

    expect(screen.getByRole('heading', { name: 'Stop guessing. Just ask Soporti.' })).toBeInTheDocument()
  })

  it('renders the call to action it is given', () => {
    render(<LandingCta cta={{ href: '/chat', label: 'Open Soporti' }} />)

    expect(screen.getByRole('link', { name: /open soporti/i })).toHaveAttribute('href', '/chat')
  })

  it('renders no call to action when there is none', () => {
    const { container } = render(<LandingCta cta={null} />)

    expect(container.querySelector('.lp-cta__actions')).toBeNull()
  })
})
