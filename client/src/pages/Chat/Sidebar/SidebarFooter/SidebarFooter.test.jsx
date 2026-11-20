import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SidebarFooter from './SidebarFooter.jsx'

const USER = { name: 'Ada Lovelace', email: 'ada@example.com' }

describe('SidebarFooter', () => {
  afterEach(() => {
    document.documentElement.removeAttribute('data-theme')
    localStorage.clear()
  })

  it('shows who is signed in with their initial', () => {
    render(<SidebarFooter user={USER} onOpenSettings={vi.fn()} onLogout={vi.fn()} />)

    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument()
    expect(screen.getByText('ada@example.com')).toBeInTheDocument()
    expect(screen.getByText('A')).toBeInTheDocument()
  })

  it('falls back to the email when the user has no name', () => {
    render(<SidebarFooter user={{ email: 'grace@example.com' }} onOpenSettings={vi.fn()} onLogout={vi.fn()} />)

    expect(screen.getByText('grace@example.com')).toBeInTheDocument()
    expect(screen.getByText('G')).toBeInTheDocument()
  })

  it('keeps the actions when nobody is known to be signed in', () => {
    render(<SidebarFooter user={null} onOpenSettings={vi.fn()} onLogout={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Log out' })).toBeInTheDocument()
  })

  it('opens the settings', async () => {
    const onOpenSettings = vi.fn()
    const onLogout = vi.fn()
    const user = userEvent.setup()
    render(<SidebarFooter user={USER} onOpenSettings={onOpenSettings} onLogout={onLogout} />)

    await user.click(screen.getByRole('button', { name: 'Settings' }))

    expect(onOpenSettings).toHaveBeenCalledTimes(1)
    expect(onLogout).not.toHaveBeenCalled()
  })

  it('logs out', async () => {
    const onOpenSettings = vi.fn()
    const onLogout = vi.fn()
    const user = userEvent.setup()
    render(<SidebarFooter user={USER} onOpenSettings={onOpenSettings} onLogout={onLogout} />)

    await user.click(screen.getByRole('button', { name: 'Log out' }))

    expect(onLogout).toHaveBeenCalledTimes(1)
    expect(onOpenSettings).not.toHaveBeenCalled()
  })

  it('switches the app to the dark theme', async () => {
    const onOpenSettings = vi.fn()
    const onLogout = vi.fn()
    const user = userEvent.setup()
    render(<SidebarFooter user={USER} onOpenSettings={onOpenSettings} onLogout={onLogout} />)

    await user.click(screen.getByRole('button', { name: 'Switch to dark theme' }))

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(await screen.findByRole('button', { name: 'Switch to light theme' })).toBeInTheDocument()
    expect(onOpenSettings).not.toHaveBeenCalled()
    expect(onLogout).not.toHaveBeenCalled()
  })
})
