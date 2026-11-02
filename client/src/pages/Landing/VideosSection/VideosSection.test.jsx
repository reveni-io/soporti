import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import VideosSection from './VideosSection.jsx'

describe('VideosSection', () => {
  it('explains how a brief becomes a product video', () => {
    render(<VideosSection />)

    expect(screen.getByRole('heading', { name: /from a brief to a product video/i })).toBeInTheDocument()
    expect(screen.getByText(/proposes a storyboard/i)).toBeInTheDocument()
  })

  it('lists the brief, the storyboard, the synthesized music, versions, sharing and variants', () => {
    const { container } = render(<VideosSection />)

    expect(container.querySelectorAll('.lp-points li')).toHaveLength(6)
    expect(screen.getByText(/from a 10-second clip to 90 seconds/i)).toBeInTheDocument()
    expect(screen.getByText(/synthesized from code/i)).toBeInTheDocument()
    expect(screen.getByText(/share a link or ask for a change as a new version/i)).toBeInTheDocument()
    expect(screen.getByText(/create a variant/i)).toBeInTheDocument()
    expect(screen.getByText(/get a slack message when it is ready/i)).toBeInTheDocument()
  })

  it('shows the studio following a render', () => {
    render(<VideosSection />)

    const steps = screen.getByRole('list', { name: 'Generation steps' })
    expect(steps).toHaveTextContent('PreparingComposingMusicRenderingReady')
    expect(screen.getByText('Rendering the MP4 · 64% · About 2 min left')).toBeInTheDocument()
  })
})
