import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SidebarToggles from './SidebarToggles.jsx'

describe('SidebarToggles', () => {
  it('opens the sidebar', async () => {
    const onOpenSidebar = vi.fn()
    const user = userEvent.setup()
    render(<SidebarToggles isSidebarCollapsed={false} onOpenSidebar={onOpenSidebar} onExpandSidebar={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Open sidebar' }))

    expect(onOpenSidebar).toHaveBeenCalledTimes(1)
  })

  it('expands the collapsed sidebar', async () => {
    const onExpandSidebar = vi.fn()
    const user = userEvent.setup()
    render(<SidebarToggles isSidebarCollapsed onOpenSidebar={vi.fn()} onExpandSidebar={onExpandSidebar} />)

    await user.click(screen.getByRole('button', { name: 'Expand sidebar' }))

    expect(onExpandSidebar).toHaveBeenCalledTimes(1)
  })

  it('offers no expand button while the sidebar is expanded', () => {
    render(<SidebarToggles isSidebarCollapsed={false} onOpenSidebar={vi.fn()} onExpandSidebar={vi.fn()} />)

    expect(screen.queryByRole('button', { name: 'Expand sidebar' })).not.toBeInTheDocument()
  })
})
