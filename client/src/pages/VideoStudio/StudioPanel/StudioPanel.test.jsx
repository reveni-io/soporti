import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import StudioPanel from './StudioPanel.jsx'
import { storyboardVideoFixture } from '../__fixtures__/video.js'

describe('StudioPanel', () => {
  it('shows a skeleton while the first storyboard is drafted', () => {
    const video = { ...storyboardVideoFixture, status: 'drafting', stage: 'drafting', storyboard: null }

    render(<StudioPanel video={video} busy={false} onGenerate={vi.fn()} />)

    expect(screen.getByRole('status')).toHaveTextContent('Reading the repos and drafting scenes…')
  })

  it('shows the storyboard ready to generate', () => {
    render(<StudioPanel video={storyboardVideoFixture} busy={false} onGenerate={vi.fn()} />)

    expect(screen.getByRole('heading', { name: 'Liquid email templates' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Generate video' })).toBeEnabled()
  })

  it('keeps the previous storyboard visible but locked while it is revised', () => {
    const video = { ...storyboardVideoFixture, status: 'drafting', stage: 'drafting' }

    render(<StudioPanel video={video} busy={false} onGenerate={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Generate video' })).toBeDisabled()
  })

  it('locks Generate while another action runs', () => {
    render(<StudioPanel video={storyboardVideoFixture} busy={true} onGenerate={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Generate video' })).toBeDisabled()
  })

  it('explains what to do when drafting failed before any storyboard', () => {
    const video = { ...storyboardVideoFixture, storyboard: null, storyboardError: 'The agent failed.' }

    render(<StudioPanel video={video} busy={false} onGenerate={vi.fn()} />)

    expect(screen.getByText(/no storyboard yet/i)).toBeInTheDocument()
  })

  it('shows the latest version in production', () => {
    const video = {
      ...storyboardVideoFixture,
      status: 'running',
      stage: 'production',
      versions: [{ version: 1, status: 'running', phase: 'composing', progress: 10 }],
    }

    render(<StudioPanel video={video} busy={false} onGenerate={vi.fn()} />)

    expect(screen.getByText('Generating · Composing · 10%')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Generate video' })).toBeNull()
  })
})
