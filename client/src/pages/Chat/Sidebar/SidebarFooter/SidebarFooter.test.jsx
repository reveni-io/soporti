import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import SidebarFooter from './SidebarFooter.jsx'

describe('SidebarFooter', () => {
  it('opens the scheduled queries', async () => {
    const onOpenSchedules = vi.fn()
    const user = userEvent.setup()
    render(
      <SidebarFooter
        isVideoGenerating={false}
        onOpenSchedules={onOpenSchedules}
        onOpenArtifacts={vi.fn()}
        onOpenSettings={vi.fn()}
        onLogout={vi.fn()}
      />,
      { wrapper: MemoryRouter }
    )

    await user.click(screen.getByRole('button', { name: /scheduled queries/i }))

    expect(onOpenSchedules).toHaveBeenCalledTimes(1)
  })

  it('opens the artifacts', async () => {
    const onOpenArtifacts = vi.fn()
    const user = userEvent.setup()
    render(
      <SidebarFooter
        isVideoGenerating={false}
        onOpenSchedules={vi.fn()}
        onOpenArtifacts={onOpenArtifacts}
        onOpenSettings={vi.fn()}
        onLogout={vi.fn()}
      />,
      { wrapper: MemoryRouter }
    )

    await user.click(screen.getByRole('button', { name: /^artifacts$/i }))

    expect(onOpenArtifacts).toHaveBeenCalledTimes(1)
  })

  it('opens the settings', async () => {
    const onOpenSettings = vi.fn()
    const user = userEvent.setup()
    render(
      <SidebarFooter
        isVideoGenerating={false}
        onOpenSchedules={vi.fn()}
        onOpenArtifacts={vi.fn()}
        onOpenSettings={onOpenSettings}
        onLogout={vi.fn()}
      />,
      { wrapper: MemoryRouter }
    )

    await user.click(screen.getByRole('button', { name: /settings/i }))

    expect(onOpenSettings).toHaveBeenCalledTimes(1)
  })

  it('logs out', async () => {
    const onLogout = vi.fn()
    const user = userEvent.setup()
    render(
      <SidebarFooter
        isVideoGenerating={false}
        onOpenSchedules={vi.fn()}
        onOpenArtifacts={vi.fn()}
        onOpenSettings={vi.fn()}
        onLogout={onLogout}
      />,
      { wrapper: MemoryRouter }
    )

    await user.click(screen.getByRole('button', { name: /log out/i }))

    expect(onLogout).toHaveBeenCalledTimes(1)
  })

  it('links to the videos without a mark when nothing is being generated', () => {
    render(
      <SidebarFooter
        isVideoGenerating={false}
        onOpenSchedules={vi.fn()}
        onOpenArtifacts={vi.fn()}
        onOpenSettings={vi.fn()}
        onLogout={vi.fn()}
      />,
      { wrapper: MemoryRouter }
    )

    expect(screen.getByRole('link', { name: 'Videos' })).toHaveAttribute('href', '/videos')
    expect(screen.queryByRole('img', { name: 'A video is being generated' })).toBeNull()
  })

  it('marks the videos link while a video is being generated', () => {
    render(
      <SidebarFooter
        isVideoGenerating={true}
        onOpenSchedules={vi.fn()}
        onOpenArtifacts={vi.fn()}
        onOpenSettings={vi.fn()}
        onLogout={vi.fn()}
      />,
      { wrapper: MemoryRouter }
    )

    expect(screen.getByRole('img', { name: 'A video is being generated' })).toBeInTheDocument()
  })
})
