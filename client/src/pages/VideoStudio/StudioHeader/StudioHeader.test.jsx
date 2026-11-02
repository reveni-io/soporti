import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import StudioHeader from './StudioHeader.jsx'
import { storyboardVideoFixture } from '../__fixtures__/video.js'

describe('StudioHeader', () => {
  it('links back to the videos and shows the title with the format and duration', () => {
    render(
      <MemoryRouter>
        <StudioHeader video={storyboardVideoFixture} busy={false} onDelete={vi.fn()} />
      </MemoryRouter>
    )

    expect(screen.getByRole('link', { name: /videos/i })).toHaveAttribute('href', '/videos')
    expect(screen.getByRole('heading', { name: 'Liquid email templates' })).toBeInTheDocument()
    expect(screen.getByText('16:9 · ~30s')).toBeInTheDocument()
  })

  it('deletes only after the confirmation', async () => {
    const onDelete = vi.fn()
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <StudioHeader video={storyboardVideoFixture} busy={false} onDelete={onDelete} />
      </MemoryRouter>
    )

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    expect(onDelete).not.toHaveBeenCalled()
    expect(screen.getByText('Delete this video?')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Yes, delete' }))

    expect(onDelete).toHaveBeenCalledTimes(1)
  })

  it('cancels the confirmation', async () => {
    const onDelete = vi.fn()
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <StudioHeader video={storyboardVideoFixture} busy={false} onDelete={onDelete} />
      </MemoryRouter>
    )

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
    expect(onDelete).not.toHaveBeenCalled()
  })
})
