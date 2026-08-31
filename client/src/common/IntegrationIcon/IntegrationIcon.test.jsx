import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import IntegrationIcon from './IntegrationIcon.jsx'

describe('IntegrationIcon', () => {
  it.each([
    'github',
    'notion',
    'postgres',
    'shopify',
    'google-drive',
    'shortcut',
    'sentry',
    'betterstack',
    'openai',
    'anthropic',
  ])('renders the %s brand mark', id => {
    const { container } = render(<IntegrationIcon id={id} />)
    const svg = container.querySelector(`svg[data-icon="${id}"]`)
    expect(svg).toBeTruthy()
    expect(svg.querySelector('path')).toBeTruthy()
  })

  it('uses the mark own viewBox when it is not drawn on a 24 grid', () => {
    const { container } = render(<IntegrationIcon id="anthropic" />)

    expect(container.querySelector('svg[data-icon="anthropic"]')).toHaveAttribute('viewBox', '0 0 248 248')
  })

  it('keeps the 24 grid for a mark that has no viewBox of its own', () => {
    const { container } = render(<IntegrationIcon id="openai" />)

    expect(container.querySelector('svg[data-icon="openai"]')).toHaveAttribute('viewBox', '0 0 24 24')
  })

  it('renders a fallback glyph for unknown ids', () => {
    const { container } = render(<IntegrationIcon id="helpjuice" />)
    expect(container.querySelector('svg[data-icon="fallback"]')).toBeTruthy()
  })
})
