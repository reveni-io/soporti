import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import IntegrationIcon from './IntegrationIcon.jsx'

describe('IntegrationIcon', () => {
  it.each(['github', 'notion', 'postgres', 'shopify', 'google-drive', 'shortcut', 'sentry'])(
    'renders the %s brand mark',
    id => {
      const { container } = render(<IntegrationIcon id={id} />)
      const svg = container.querySelector(`svg[data-icon="${id}"]`)
      expect(svg).toBeTruthy()
      expect(svg.querySelector('path')).toBeTruthy()
    }
  )

  it('renders a fallback glyph for unknown ids', () => {
    const { container } = render(<IntegrationIcon id="helpjuice" />)
    expect(container.querySelector('svg[data-icon="fallback"]')).toBeTruthy()
  })
})
