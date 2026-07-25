import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import AdminSection from './AdminSection.jsx'

describe('AdminSection', () => {
  it('renders the title as a heading with its children inside a card', () => {
    const { container } = render(
      <AdminSection title="Sentry integration">
        <p>Body copy.</p>
      </AdminSection>
    )

    expect(screen.getByRole('heading', { name: 'Sentry integration' })).toBeInTheDocument()
    expect(screen.getByText('Body copy.')).toBeInTheDocument()
    expect(container.querySelector('section')).toHaveClass('admin__section', 'card')
  })
})
