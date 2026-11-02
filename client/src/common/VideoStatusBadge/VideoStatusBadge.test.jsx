import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import VideoStatusBadge from './VideoStatusBadge.jsx'

describe('VideoStatusBadge', () => {
  it('shows the status alone when there is no phase or progress', () => {
    render(<VideoStatusBadge status="drafting" phase={null} progress={null} />)

    expect(screen.getByText('Drafting')).toBeInTheDocument()
  })

  it('adds the phase and the progress when present', () => {
    render(<VideoStatusBadge status="running" phase="rendering" progress={42} />)

    expect(screen.getByText('Generating · Rendering · 42%')).toBeInTheDocument()
  })

  it('shows a zero progress', () => {
    render(<VideoStatusBadge status="running" phase="preparing" progress={0} />)

    expect(screen.getByText('Generating · Preparing · 0%')).toBeInTheDocument()
  })

  it('marks a ready video as a success', () => {
    render(<VideoStatusBadge status="ready" />)

    expect(screen.getByText('Ready')).toHaveClass('badge--success')
  })

  it('marks a failed video', () => {
    render(<VideoStatusBadge status="failed" />)

    expect(screen.getByText('Failed')).toHaveClass('video-status-badge--failed')
  })

  it('falls back to the raw status when it is unknown', () => {
    render(<VideoStatusBadge status="paused" />)

    expect(screen.getByText('paused')).toBeInTheDocument()
  })
})
