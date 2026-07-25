import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import AdminSectionStatus from './AdminSectionStatus.jsx'

describe('AdminSectionStatus', () => {
  it('shows a loading message under the section title when there is no error', () => {
    render(<AdminSectionStatus title="Notion" error={null} />)

    expect(screen.getByRole('heading', { name: 'Notion' })).toBeInTheDocument()
    expect(screen.getByText('Loading...')).toBeInTheDocument()
  })

  it('shows the error instead of the loading message', () => {
    render(<AdminSectionStatus title="Notion" error="Failed to load the Notion settings" />)

    expect(screen.getByText('Failed to load the Notion settings')).toBeInTheDocument()
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument()
  })
})
