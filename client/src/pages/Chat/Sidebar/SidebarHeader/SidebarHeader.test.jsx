import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SidebarHeader from './SidebarHeader.jsx'

describe('SidebarHeader', () => {
  it('renders the product name and tagline', () => {
    render(<SidebarHeader onClose={vi.fn()} />)

    expect(screen.getByRole('heading', { name: 'Soporti' })).toBeInTheDocument()
    expect(screen.getByText('Your AI teammate for code, data & docs')).toBeInTheDocument()
  })

  it('closes the sidebar', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    render(<SidebarHeader onClose={onClose} />)

    await user.click(screen.getByLabelText('Close sidebar'))

    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
