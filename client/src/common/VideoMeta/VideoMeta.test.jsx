import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import VideoMeta from './VideoMeta.jsx'

describe('VideoMeta', () => {
  it('shows the format and the approximate duration', () => {
    render(<VideoMeta format="9:16" durationSeconds={30} />)

    expect(screen.getByText('9:16 · ~30s')).toBeInTheDocument()
  })
})
