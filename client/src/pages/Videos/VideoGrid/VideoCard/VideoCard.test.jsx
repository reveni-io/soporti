import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import VideoCard from './VideoCard.jsx'

const VIDEO_ID = '3f2a1b4c-5d6e-4f70-8a91-b2c3d4e5f601'

beforeEach(() => {
  vi.restoreAllMocks()
  global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200, blob: async () => new Blob(['jpeg']) })
  URL.createObjectURL = vi.fn(() => 'blob:thumbnail')
  URL.revokeObjectURL = vi.fn()
})

describe('VideoCard', () => {
  it('links to the studio and shows the title, format, status and updated date', () => {
    const video = {
      id: '3f2a1b4c-5d6e-4f70-8a91-b2c3d4e5f601',
      title: 'Launch video',
      status: 'storyboard',
      phase: null,
      progress: null,
      format: '1:1',
      durationSeconds: 60,
      updatedAt: '2026-10-30T10:00:00.000Z',
    }

    render(
      <MemoryRouter>
        <ul>
          <VideoCard video={video} token="tok" onLogout={vi.fn()} />
        </ul>
      </MemoryRouter>
    )

    expect(screen.getByRole('link')).toHaveAttribute('href', '/videos/3f2a1b4c-5d6e-4f70-8a91-b2c3d4e5f601')
    expect(screen.getByRole('heading', { name: 'Launch video' })).toBeInTheDocument()
    expect(screen.getByText('1:1 · ~60s')).toBeInTheDocument()
    expect(screen.getByText('Storyboard')).toBeInTheDocument()
    expect(screen.getByText(new Date(video.updatedAt).toLocaleDateString([], { dateStyle: 'medium' }))).toHaveAttribute(
      'datetime',
      video.updatedAt
    )
    expect(global.fetch).not.toHaveBeenCalled()
    expect(screen.queryByRole('progressbar')).toBeNull()
  })

  it('shows the thumbnail of the newest version that has one', async () => {
    const video = {
      id: VIDEO_ID,
      title: 'Launch video',
      status: 'ready',
      phase: null,
      progress: null,
      format: '16:9',
      durationSeconds: 30,
      thumbnailVersion: 2,
      updatedAt: '2026-10-30T10:00:00.000Z',
    }

    const { container } = render(
      <MemoryRouter>
        <ul>
          <VideoCard video={video} token="tok" onLogout={vi.fn()} />
        </ul>
      </MemoryRouter>
    )

    await vi.waitFor(() =>
      expect(container.querySelector('.video-card__image')).toHaveAttribute('src', 'blob:thumbnail')
    )
    expect(global.fetch).toHaveBeenCalledTimes(1)
    expect(global.fetch.mock.calls[0][0]).toBe(`/api/videos/${VIDEO_ID}/versions/2/thumbnail`)
    expect(global.fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer tok')
  })

  it('shows the live phase and progress while the video is generated', () => {
    const video = {
      id: VIDEO_ID,
      title: 'Launch video',
      status: 'running',
      phase: 'rendering',
      progress: 40,
      format: '9:16',
      durationSeconds: 20,
      thumbnailVersion: null,
      updatedAt: '2026-10-30T10:00:00.000Z',
    }

    render(
      <MemoryRouter>
        <ul>
          <VideoCard video={video} token="tok" onLogout={vi.fn()} />
        </ul>
      </MemoryRouter>
    )

    expect(screen.getByText('Generating · Rendering · 40%')).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Progress of Launch video' })).toHaveAttribute('aria-valuenow', '40')
  })
})
