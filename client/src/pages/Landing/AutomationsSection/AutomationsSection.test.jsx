import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import AutomationsSection from './AutomationsSection.jsx'

describe('AutomationsSection', () => {
  it('renders a light card per automation, each with its bullets', () => {
    const { container } = render(<AutomationsSection />)

    expect(container.querySelectorAll('.lp-feat--light')).toHaveLength(3)
    expect(container.querySelectorAll('.lp-feat__list')).toHaveLength(3)
    expect(screen.getByText('Slack teammate')).toBeInTheDocument()
    expect(screen.getByText('Automated PR reviews')).toBeInTheDocument()
    expect(screen.getByText('Learns from feedback')).toBeInTheDocument()
    expect(screen.getByText(/never blocks/i)).toBeInTheDocument()
  })
})
