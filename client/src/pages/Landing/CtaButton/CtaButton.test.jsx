import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import CtaButton from './CtaButton.jsx'

describe('CtaButton', () => {
  it('links to an in-app destination in the same tab', () => {
    render(<CtaButton cta={{ href: '/chat', label: 'Open Soporti' }} />)

    const link = screen.getByRole('link', { name: 'Open Soporti' })
    expect(link).toHaveAttribute('href', '/chat')
    expect(link).not.toHaveAttribute('target')
    expect(link).not.toHaveAttribute('rel')
  })

  it('opens an external destination in a new tab without leaking the opener', () => {
    render(<CtaButton cta={{ href: 'https://github.com/reveni-io/soporti', label: 'Get it', isExternal: true }} />)

    const link = screen.getByRole('link', { name: 'Get it' })
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noreferrer')
  })
})
