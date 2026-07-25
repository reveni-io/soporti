import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SidebarFooter from './SidebarFooter.jsx'

describe('SidebarFooter', () => {
  it('opens the settings', async () => {
    const onOpenSettings = vi.fn()
    const user = userEvent.setup()
    render(<SidebarFooter onOpenSettings={onOpenSettings} onLogout={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: /settings/i }))

    expect(onOpenSettings).toHaveBeenCalledTimes(1)
  })

  it('logs out', async () => {
    const onLogout = vi.fn()
    const user = userEvent.setup()
    render(<SidebarFooter onOpenSettings={vi.fn()} onLogout={onLogout} />)

    await user.click(screen.getByRole('button', { name: /log out/i }))

    expect(onLogout).toHaveBeenCalledTimes(1)
  })
})
