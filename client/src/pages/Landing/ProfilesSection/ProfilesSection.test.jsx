import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import ProfilesSection from './ProfilesSection.jsx'

describe('ProfilesSection', () => {
  it('renders a card per way of working', () => {
    const { container } = render(<ProfilesSection />)

    expect(container.querySelectorAll('.lp-feat')).toHaveLength(4)
    expect(screen.getByText('Support profile')).toBeInTheDocument()
    expect(screen.getByText('Tech profile')).toBeInTheDocument()
    expect(screen.getByText('Pick your sources')).toBeInTheDocument()
    expect(screen.getByText('Chat that remembers')).toBeInTheDocument()
  })

  it('renders the profile cards without bullet lists', () => {
    render(<ProfilesSection />)

    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })
})
