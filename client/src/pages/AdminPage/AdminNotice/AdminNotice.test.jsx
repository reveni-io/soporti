import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import AdminNotice from './AdminNotice.jsx'

describe('AdminNotice', () => {
  it('renders the title and children in a centered card', () => {
    const { container } = render(
      <AdminNotice title="Admin">
        <p className="alert alert--error">Something went wrong.</p>
      </AdminNotice>
    )

    expect(screen.getByRole('heading', { name: 'Admin' })).toBeInTheDocument()
    expect(screen.getByText('Something went wrong.')).toBeInTheDocument()
    expect(container.querySelector('.admin')).toHaveClass('admin--centered')
  })
})
