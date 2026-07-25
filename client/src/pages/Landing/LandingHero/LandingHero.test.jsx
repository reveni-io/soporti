import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import LandingHero from './LandingHero.jsx'

describe('LandingHero', () => {
  it('renders the headline and the always-visible secondary link', () => {
    render(<LandingHero cta={null} />)

    expect(screen.getByText('how your product works')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /see what it can do/i })).toHaveAttribute('href', '#renders')
  })

  it('renders the call to action it is given', () => {
    render(<LandingHero cta={{ href: '/login', label: 'Log in' }} />)

    expect(screen.getByRole('link', { name: /log in/i })).toHaveAttribute('href', '/login')
  })

  it('renders no call to action when there is none', () => {
    render(<LandingHero cta={null} />)

    expect(screen.queryByRole('link', { name: /log in/i })).not.toBeInTheDocument()
  })
})
