import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SidebarHeader from './SidebarHeader.jsx'

describe('SidebarHeader', () => {
  it('renders the product name and tagline', () => {
    render(<SidebarHeader onClose={vi.fn()} onCollapse={vi.fn()} />)

    expect(screen.getByRole('heading', { name: 'Soporti' })).toBeInTheDocument()
    expect(screen.getByText('Your AI teammate for code, data & docs')).toBeInTheDocument()
  })

  it('closes the sidebar', async () => {
    const onClose = vi.fn()
    const onCollapse = vi.fn()
    const user = userEvent.setup()
    render(<SidebarHeader onClose={onClose} onCollapse={onCollapse} />)

    await user.click(screen.getByRole('button', { name: 'Close sidebar' }))

    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onCollapse).not.toHaveBeenCalled()
  })

  it('collapses the sidebar', async () => {
    const onClose = vi.fn()
    const onCollapse = vi.fn()
    const user = userEvent.setup()
    render(<SidebarHeader onClose={onClose} onCollapse={onCollapse} />)

    await user.click(screen.getByRole('button', { name: 'Collapse sidebar' }))

    expect(onCollapse).toHaveBeenCalledTimes(1)
    expect(onClose).not.toHaveBeenCalled()
  })
})
