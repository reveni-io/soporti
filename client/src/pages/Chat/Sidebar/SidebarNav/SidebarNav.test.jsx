import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import SidebarNav from './SidebarNav.jsx'

describe('SidebarNav', () => {
  it('opens the artifacts', async () => {
    const onOpenArtifacts = vi.fn()
    const onOpenSchedules = vi.fn()
    const user = userEvent.setup()
    render(
      <SidebarNav isVideoGenerating={false} onOpenArtifacts={onOpenArtifacts} onOpenSchedules={onOpenSchedules} />,
      { wrapper: MemoryRouter }
    )

    await user.click(screen.getByRole('button', { name: /^artifacts$/i }))

    expect(onOpenArtifacts).toHaveBeenCalledTimes(1)
    expect(onOpenSchedules).not.toHaveBeenCalled()
  })

  it('opens the scheduled queries', async () => {
    const onOpenArtifacts = vi.fn()
    const onOpenSchedules = vi.fn()
    const user = userEvent.setup()
    render(
      <SidebarNav isVideoGenerating={false} onOpenArtifacts={onOpenArtifacts} onOpenSchedules={onOpenSchedules} />,
      { wrapper: MemoryRouter }
    )

    await user.click(screen.getByRole('button', { name: /scheduled queries/i }))

    expect(onOpenSchedules).toHaveBeenCalledTimes(1)
    expect(onOpenArtifacts).not.toHaveBeenCalled()
  })

  it('links to the analytics dashboard', () => {
    render(<SidebarNav isVideoGenerating={false} onOpenArtifacts={vi.fn()} onOpenSchedules={vi.fn()} />, {
      wrapper: MemoryRouter,
    })

    expect(screen.getByRole('link', { name: 'Analytics' })).toHaveAttribute('href', '/analytics')
  })

  it('links to the videos without a mark when nothing is being generated', () => {
    render(<SidebarNav isVideoGenerating={false} onOpenArtifacts={vi.fn()} onOpenSchedules={vi.fn()} />, {
      wrapper: MemoryRouter,
    })

    expect(screen.getByRole('link', { name: 'Videos' })).toHaveAttribute('href', '/videos')
    expect(screen.queryByRole('img', { name: 'A video is being generated' })).toBeNull()
  })

  it('marks the videos link while a video is being generated', () => {
    render(<SidebarNav isVideoGenerating onOpenArtifacts={vi.fn()} onOpenSchedules={vi.fn()} />, {
      wrapper: MemoryRouter,
    })

    expect(screen.getByRole('img', { name: 'A video is being generated' })).toBeInTheDocument()
  })
})
