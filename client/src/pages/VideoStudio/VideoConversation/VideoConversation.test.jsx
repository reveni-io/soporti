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
})
