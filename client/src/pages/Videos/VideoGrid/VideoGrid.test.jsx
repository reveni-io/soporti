import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import VideoGrid from './VideoGrid.jsx'

describe('VideoGrid', () => {
  it('shows the loading state', () => {
    render(<VideoGrid videos={[]} loading={true} error={null} />)

    expect(screen.getByText('Loading your videos…')).toBeInTheDocument()
  })

  it('shows the error', () => {
    render(<VideoGrid videos={[]} loading={false} error="Failed to load your videos" />)

    expect(screen.getByText('Failed to load your videos')).toBeInTheDocument()
  })

  it('shows the empty state', () => {
    render(<VideoGrid videos={[]} loading={false} error={null} />)

    expect(screen.getByText(/no videos yet/i)).toBeInTheDocument()
  })

  it('renders one card per video', () => {
    const videos = [
      { id: 'a', title: 'First', status: 'ready', format: '16:9', durationSeconds: 20, updatedAt: '2026-10-01' },
      { id: 'b', title: 'Second', status: 'failed', format: '1:1', durationSeconds: 60, updatedAt: '2026-10-02' },
    ]

    render(
      <MemoryRouter>
        <VideoGrid videos={videos} loading={false} error={null} />
      </MemoryRouter>
    )

    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.getByRole('heading', { name: 'First' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Second' })).toBeInTheDocument()
  })
})
