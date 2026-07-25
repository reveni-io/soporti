import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import AdminNavIcon from './AdminNavIcon.jsx'

describe('AdminNavIcon', () => {
  it('renders the brand icon for an integration id', () => {
    const { container } = render(<AdminNavIcon id="github" />)

    const svg = container.querySelector('[data-icon="github"]')
    expect(svg).toBeInTheDocument()
    expect(svg).toHaveAttribute('fill', 'currentColor')
  })

  it('renders a stroke icon for a non-integration id', () => {
    const { container } = render(<AdminNavIcon id="database" />)

    const svg = container.querySelector('[data-icon="database"]')
    expect(svg).toBeInTheDocument()
    expect(svg).toHaveAttribute('stroke', 'currentColor')
  })
})
