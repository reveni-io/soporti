import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import StatsSection from './StatsSection.jsx'

describe('StatsSection', () => {
  it('renders the four headline numbers', () => {
    const { container } = render(<StatsSection />)

    expect(container.querySelectorAll('.lp-stat')).toHaveLength(4)
    expect(screen.getByText('7+')).toBeInTheDocument()
    expect(screen.getByText('0')).toBeInTheDocument()
    expect(screen.getByText(/every tool is strictly read-only/i)).toBeInTheDocument()
  })
})
