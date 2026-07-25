import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import LandingFooter from './LandingFooter.jsx'

describe('LandingFooter', () => {
  it('credits the project and links to the repository in a new tab', () => {
    render(<LandingFooter />)

    expect(screen.getByText('An open-source tool by Reveni · Read-only by design')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: /view on github/i })
    expect(link).toHaveAttribute('href', 'https://github.com/reveni-io/soporti')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noreferrer')
  })
})
