import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import RendersSection from './RendersSection.jsx'

describe('RendersSection', () => {
  it('renders one demo per output format', () => {
    const { container } = render(<RendersSection />)

    expect(container.querySelectorAll('.lp-demo')).toHaveLength(4)
    expect(screen.getByText('Charts')).toBeInTheDocument()
    expect(screen.getByText('Tables')).toBeInTheDocument()
    expect(screen.getByText('Diagrams')).toBeInTheDocument()
    expect(screen.getByText('Code & queries')).toBeInTheDocument()
  })

  it('renders the live table and diagram demos', () => {
    const { container } = render(<RendersSection />)

    expect(screen.getByText('Acme Apparel')).toBeInTheDocument()
    expect(container.querySelector('.mermaid-diagram')).toBeInTheDocument()
  })
})
