import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import LandingCta from './LandingCta.jsx'

describe('LandingCta', () => {
  it('closes with the pitch', () => {
    render(<LandingCta cta={null} />)

    expect(screen.getByRole('heading', { level: 2, name: 'Stop guessing. Just ask Soporti.' })).toBeInTheDocument()
    expect(screen.getByText(/one question away/i)).toBeInTheDocument()
  })

  it('leads to the app and offers the repository next to it', () => {
    render(<LandingCta cta={{ href: '/chat', label: 'Open Soporti' }} />)

    expect(screen.getByRole('link', { name: /open soporti/i })).toHaveAttribute('href', '/chat')
    const star = screen.getByRole('link', { name: /star on github/i })
    expect(star).toHaveAttribute('href', 'https://github.com/reveni-io/soporti')
    expect(star).toHaveAttribute('target', '_blank')
  })

  it('leads to the repository when there is no call to action', () => {
    render(<LandingCta cta={null} />)

    expect(screen.getByRole('link', { name: /get it on github/i })).toHaveAttribute(
      'href',
      'https://github.com/reveni-io/soporti'
    )
    expect(screen.queryByRole('link', { name: /star on github/i })).not.toBeInTheDocument()
  })
})
