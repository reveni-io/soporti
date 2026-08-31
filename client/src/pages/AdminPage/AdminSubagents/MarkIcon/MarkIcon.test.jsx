import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import MarkIcon from './MarkIcon.jsx'

describe('MarkIcon', () => {
  it('renders the integration logo when one exists', () => {
    const { container } = render(<MarkIcon id="sentry" label="Sentry" />)

    expect(container.querySelector('[data-icon="sentry"]')).toBeInTheDocument()
    expect(container.querySelector('.mark-icon')).not.toBeInTheDocument()
  })

  it('falls back to the label initial when the integration has no logo', () => {
    render(<MarkIcon id="helpjuice" label="Helpjuice" />)

    expect(screen.getByText('H')).toBeInTheDocument()
  })

  it('falls back to the id initial when no label is given', () => {
    render(<MarkIcon id="granola" />)

    expect(screen.getByText('G')).toBeInTheDocument()
  })

  it('applies the requested size to the fallback', () => {
    const { container } = render(<MarkIcon id="granola" label="Granola" size={24} />)

    expect(container.querySelector('.mark-icon')).toHaveStyle({ width: '24px', height: '24px' })
  })
})
