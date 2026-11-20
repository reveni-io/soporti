import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import LandingFooter from './LandingFooter.jsx'

const REPO = 'https://github.com/reveni-io/soporti'

describe('LandingFooter', () => {
  it('signs the page with the Reveni mark', () => {
    const { container } = render(<LandingFooter />)

    expect(container.querySelector('.lp-footer__brand [data-logo="reveni"]')).toBeInTheDocument()
    expect(screen.getByText(/an open-source tool by reveni/i)).toBeInTheDocument()
  })

  it('links to the docs, the deployment guide, the license and the repository in new tabs', () => {
    render(<LandingFooter />)

    const nav = screen.getByRole('navigation', { name: 'Footer' })
    expect(within(nav).getByRole('link', { name: 'Documentation' })).toHaveAttribute('href', `${REPO}#readme`)
    expect(within(nav).getByRole('link', { name: 'Deployment guide' })).toHaveAttribute(
      'href',
      `${REPO}/blob/main/docs/deployment.md`
    )
    expect(within(nav).getByRole('link', { name: 'License' })).toHaveAttribute('href', `${REPO}/blob/main/LICENSE`)
    expect(within(nav).getByRole('link', { name: /view on github/i })).toHaveAttribute('href', REPO)
    within(nav)
      .getAllByRole('link')
      .forEach(link => expect(link).toHaveAttribute('target', '_blank'))
  })
})
