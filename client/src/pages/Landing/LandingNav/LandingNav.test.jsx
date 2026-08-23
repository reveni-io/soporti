import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import LandingNav from './LandingNav.jsx'

const CTA = { href: '/chat', label: 'Open Soporti' }

describe('LandingNav', () => {
  it('links to every section of the page', () => {
    render(<LandingNav cta={CTA} />)

    expect(screen.getByRole('link', { name: 'Ask' })).toHaveAttribute('href', '#ask')
    expect(screen.getByRole('link', { name: 'Answers' })).toHaveAttribute('href', '#renders')
    expect(screen.getByRole('link', { name: 'Artifacts' })).toHaveAttribute('href', '#artifacts')
    expect(screen.getByRole('link', { name: 'Integrations' })).toHaveAttribute('href', '#integrations')
    expect(screen.getByRole('link', { name: 'Models' })).toHaveAttribute('href', '#providers')
    expect(screen.getByRole('link', { name: 'Skills' })).toHaveAttribute('href', '#skills')
    expect(screen.getByRole('link', { name: 'Automations' })).toHaveAttribute('href', '#automations')
  })

  it('always links to the public repository in a new tab', () => {
    render(<LandingNav cta={null} />)

    const link = screen.getByLabelText('Soporti on GitHub')
    expect(link).toHaveAttribute('href', 'https://github.com/reveni-io/soporti')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noreferrer')
  })

  it('renders the call to action it is given', () => {
    render(<LandingNav cta={CTA} />)

    expect(screen.getByRole('link', { name: /open soporti/i })).toHaveAttribute('href', '/chat')
  })

  it('renders no call to action when there is none', () => {
    render(<LandingNav cta={null} />)

    expect(screen.queryByRole('link', { name: /open soporti/i })).not.toBeInTheDocument()
  })
})
