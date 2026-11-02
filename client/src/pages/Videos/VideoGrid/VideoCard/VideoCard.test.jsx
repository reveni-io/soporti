import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import VideoCard from './VideoCard.jsx'

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
          <VideoCard video={video} />
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
  })
})
