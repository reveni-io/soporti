import { describe, it, expect, afterEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import LandingNav from './LandingNav.jsx'

const CTA = { href: '/chat', label: 'Open Soporti' }

function scrollTo(y) {
  act(() => {
    window.scrollY = y
    window.dispatchEvent(new Event('scroll'))
  })
}

describe('LandingNav', () => {
  afterEach(() => {
    window.scrollY = 0
  })

  it('links to every section of the page', () => {
    render(<LandingNav cta={CTA} />)

    expect(screen.getByRole('link', { name: 'Product' })).toHaveAttribute('href', '#answers')
    expect(screen.getByRole('link', { name: 'Integrations' })).toHaveAttribute('href', '#integrations')
    expect(screen.getByRole('link', { name: 'Automations' })).toHaveAttribute('href', '#automations')
    expect(screen.getByRole('link', { name: 'MCP' })).toHaveAttribute('href', '#mcp')
    expect(screen.getByRole('link', { name: 'Security' })).toHaveAttribute('href', '#security')
  })

  it('links the brand back to the top of the landing', () => {
    render(<LandingNav cta={null} />)

    expect(screen.getByRole('link', { name: 'Soporti' })).toHaveAttribute('href', '/')
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

  it('turns solid once the page scrolls and clear again back at the top', () => {
    render(<LandingNav cta={null} />)
    const nav = screen.getByRole('navigation', { name: 'Main' })

    expect(nav).not.toHaveClass('lp-nav--scrolled')

    scrollTo(200)
    expect(nav).toHaveClass('lp-nav--scrolled')

    scrollTo(0)
    expect(nav).not.toHaveClass('lp-nav--scrolled')
  })
})
