import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import StoryboardPanel from './StoryboardPanel.jsx'
import { storyboardFixture } from '../__fixtures__/video.js'

describe('StoryboardPanel', () => {
  it('shows every scene with its number, time range, title, visual, on-screen text and sound', () => {
    render(<StoryboardPanel storyboard={storyboardFixture} canGenerate={true} onGenerate={vi.fn()} />)

    const scenes = screen.getAllByRole('listitem')
    expect(scenes).toHaveLength(2)
    expect(within(scenes[0]).getByText('1')).toBeInTheDocument()
    expect(within(scenes[0]).getByText('0:00–0:06')).toBeInTheDocument()
    expect(within(scenes[0]).getByRole('heading', { name: 'Hook' })).toBeInTheDocument()
    expect(within(scenes[0]).getByText('The template editor opens')).toBeInTheDocument()
    expect(within(scenes[0]).getByText('Emails that sound like you')).toBeInTheDocument()
    expect(within(scenes[0]).getByText('Soft whoosh')).toBeInTheDocument()
    expect(within(scenes[1]).getByText('0:06–0:30')).toBeInTheDocument()
  })

  it('shows the title, the summary, the music line and the total duration', () => {
    render(<StoryboardPanel storyboard={storyboardFixture} canGenerate={true} onGenerate={vi.fn()} />)

    expect(screen.getByRole('heading', { name: 'Liquid email templates' })).toBeInTheDocument()
    expect(screen.getByText('A merchant writes a template and sends the first email.')).toBeInTheDocument()
    expect(screen.getByText('Lo-fi house · 112 bpm · Warm')).toBeInTheDocument()
    expect(screen.getByText('0:30')).toBeInTheDocument()
  })

  it('generates the video', async () => {
    const onGenerate = vi.fn()
    const user = userEvent.setup()
    render(<StoryboardPanel storyboard={storyboardFixture} canGenerate={true} onGenerate={onGenerate} />)

    await user.click(screen.getByRole('button', { name: 'Generate video' }))

    expect(onGenerate).toHaveBeenCalledTimes(1)
  })

  it('disables Generate when it is not allowed', () => {
    render(<StoryboardPanel storyboard={storyboardFixture} canGenerate={false} onGenerate={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Generate video' })).toBeDisabled()
  })
})
