import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import Icon from './Icon.jsx'

describe('Icon', () => {
  it('renders the requested icon with the default size and view box', () => {
    const { container } = render(<Icon name="shield" />)

    const svg = container.querySelector('[data-icon="shield"]')
    expect(svg).toBeInTheDocument()
    expect(svg).toHaveAttribute('width', '16')
    expect(svg).toHaveAttribute('height', '16')
    expect(svg).toHaveAttribute('viewBox', '0 0 24 24')
    expect(svg).toHaveAttribute('stroke-width', '2')
  })

  it('applies the size, stroke width and class name it is given', () => {
    const { container } = render(<Icon name="arrow-right" size={22} strokeWidth={1.7} className="lp-btn__arrow" />)

    const svg = container.querySelector('[data-icon="arrow-right"]')
    expect(svg).toHaveAttribute('width', '22')
    expect(svg).toHaveAttribute('height', '22')
    expect(svg).toHaveAttribute('stroke-width', '1.7')
    expect(svg).toHaveClass('lp-btn__arrow')
  })

  it('uses the icon-specific view box when one is registered', () => {
    const { container } = render(<Icon name="share" />)

    expect(container.querySelector('[data-icon="share"]')).toHaveAttribute('viewBox', '0 0 16 16')
  })

  it('renders nothing for an unknown icon name', () => {
    const { container } = render(<Icon name="not-an-icon" />)

    expect(container).toBeEmptyDOMElement()
  })
})
