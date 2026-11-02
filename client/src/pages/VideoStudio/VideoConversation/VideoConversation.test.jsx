import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import VideoConversation from './VideoConversation.jsx'
import { storyboardVideoFixture } from '../__fixtures__/video.js'

describe('VideoConversation', () => {
  it('renders the user messages as plain text and Soporti messages as markdown', () => {
    render(
      <VideoConversation video={storyboardVideoFixture} token="tok" busy={false} onSend={vi.fn()} onRetry={vi.fn()} />
    )

    expect(screen.getByText('Explain Liquid templates').closest('.message')).toHaveClass('message--user')
    expect(screen.getByText('storyboard').tagName).toBe('STRONG')
    expect(screen.getByText('storyboard').closest('.message')).toHaveClass('message--assistant')
  })

  it('locks the composer while the storyboard is drafted', () => {
    const video = { ...storyboardVideoFixture, status: 'drafting', stage: 'drafting' }

    render(<VideoConversation video={video} token="tok" busy={false} onSend={vi.fn()} onRetry={vi.fn()} />)

    expect(screen.getByRole('textbox', { name: 'Message' })).toBeDisabled()
    expect(screen.getByPlaceholderText('Soporti is drafting the storyboard…')).toBeInTheDocument()
  })

  it('offers to try again when the storyboard failed', async () => {
    const onRetry = vi.fn()
    const user = userEvent.setup()
    const video = { ...storyboardVideoFixture, storyboardError: 'The storyboard agent timed out.' }
    render(<VideoConversation video={video} token="tok" busy={false} onSend={vi.fn()} onRetry={onRetry} />)

    expect(screen.getByText('The storyboard agent timed out.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Try again' }))

    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('hides the failure while a new draft is running', () => {
    const video = {
      ...storyboardVideoFixture,
      status: 'drafting',
      stage: 'drafting',
      storyboardError: 'The storyboard agent timed out.',
    }

    render(<VideoConversation video={video} token="tok" busy={false} onSend={vi.fn()} onRetry={vi.fn()} />)

    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
  })

  it.each([
    ['queued', null],
    ['running', 'preparing'],
    ['running', 'composing'],
  ])('locks change requests while the latest version is %s %s', (status, phase) => {
    const video = {
      ...storyboardVideoFixture,
      status,
      stage: 'production',
      versions: [{ version: 2, status, phase, previewReady: false }],
    }

    render(<VideoConversation video={video} token="tok" busy={false} onSend={vi.fn()} onRetry={vi.fn()} />)

    expect(screen.getByRole('textbox', { name: 'Message' })).toBeDisabled()
    expect(screen.getByPlaceholderText('Request a change…')).toBeInTheDocument()
    expect(screen.getByText('You can request a change once Soporti has composed this version.')).toBeInTheDocument()
  })

  it('warns that a change request stops the current render', async () => {
    const user = userEvent.setup()
    const onSend = vi.fn().mockResolvedValue(true)
    const video = {
      ...storyboardVideoFixture,
      status: 'running',
      stage: 'production',
      versions: [{ version: 1, status: 'running', phase: 'rendering', previewReady: true }],
    }
    render(<VideoConversation video={video} token="tok" busy={false} onSend={onSend} onRetry={vi.fn()} />)

    expect(screen.getByText('Sending a change stops the current render and starts a new version.')).toBeInTheDocument()
    await user.type(screen.getByRole('textbox', { name: 'Message' }), 'Slower outro')
    await user.click(screen.getByRole('button', { name: 'Send' }))

    expect(onSend).toHaveBeenCalledTimes(1)
    expect(onSend).toHaveBeenCalledWith('Slower outro')
  })

  it('takes a change request as soon as the preview is ready, even before the phase moves on', () => {
    const video = {
      ...storyboardVideoFixture,
      status: 'running',
      stage: 'production',
      versions: [{ version: 1, status: 'running', phase: 'composing', previewReady: true }],
    }

    render(<VideoConversation video={video} token="tok" busy={false} onSend={vi.fn()} onRetry={vi.fn()} />)

    expect(screen.getByRole('textbox', { name: 'Message' })).toBeEnabled()
    expect(screen.getByText('Sending a change stops the current render and starts a new version.')).toBeInTheDocument()
  })

  it('takes change requests without a hint once the version is ready', () => {
    const video = {
      ...storyboardVideoFixture,
      status: 'ready',
      stage: 'production',
      versions: [{ version: 1, status: 'ready', phase: null }],
    }

    render(<VideoConversation video={video} token="tok" busy={false} onSend={vi.fn()} onRetry={vi.fn()} />)

    expect(screen.getByRole('textbox', { name: 'Message' })).toBeEnabled()
    expect(screen.queryByText(/stops the current render/)).toBeNull()
    expect(screen.queryByText(/once Soporti has composed/)).toBeNull()
  })
})
