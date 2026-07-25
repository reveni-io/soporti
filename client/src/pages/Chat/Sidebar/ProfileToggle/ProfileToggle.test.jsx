import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ProfileToggle from './ProfileToggle.jsx'

describe('ProfileToggle', () => {
  it('marks the selected profile and shows its hint', () => {
    render(<ProfileToggle selectedProfile="tech" onSelectProfile={vi.fn()} />)

    expect(screen.getByRole('button', { name: /^tech$/i }).className).toContain('sidebar__profile-btn--active')
    expect(screen.getByRole('button', { name: /^support$/i }).className).not.toContain('sidebar__profile-btn--active')
    expect(screen.getByText('Detailed code, architecture, and file paths')).toBeInTheDocument()
  })

  it('shows the support hint for the support profile', () => {
    render(<ProfileToggle selectedProfile="support" onSelectProfile={vi.fn()} />)

    expect(screen.getByText('Simplified explanations focused on behavior')).toBeInTheDocument()
  })

  it('reports the profile that was picked', async () => {
    const onSelectProfile = vi.fn()
    const user = userEvent.setup()
    render(<ProfileToggle selectedProfile="support" onSelectProfile={onSelectProfile} />)

    await user.click(screen.getByRole('button', { name: /^tech$/i }))

    expect(onSelectProfile).toHaveBeenCalledWith('tech')
  })

  it('falls back to the first profile when the selection is unknown', () => {
    render(<ProfileToggle selectedProfile="nonsense" onSelectProfile={vi.fn()} />)

    expect(screen.getByText('Simplified explanations focused on behavior')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^support$/i }).className).toContain('sidebar__profile-btn--active')
  })
})
