import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import VideoComposer from './VideoComposer.jsx'

describe('VideoComposer', () => {
  it('sends the trimmed text and clears the draft once it is accepted', async () => {
    const onSend = vi.fn().mockResolvedValue(true)
    const user = userEvent.setup()
    render(<VideoComposer placeholder="Ask for changes" disabled={false} busy={false} onSend={onSend} />)

    await user.type(screen.getByRole('textbox', { name: 'Message' }), '  Shorter intro  ')
    await user.click(screen.getByRole('button', { name: 'Send' }))

    expect(onSend).toHaveBeenCalledTimes(1)
    expect(onSend).toHaveBeenCalledWith('Shorter intro')
    expect(screen.getByRole('textbox', { name: 'Message' })).toHaveValue('')
  })

  it('keeps the draft when sending fails', async () => {
    const onSend = vi.fn().mockResolvedValue(false)
    const user = userEvent.setup()
    render(<VideoComposer placeholder="Ask for changes" disabled={false} busy={false} onSend={onSend} />)

    await user.type(screen.getByRole('textbox', { name: 'Message' }), 'Shorter intro')
    await user.click(screen.getByRole('button', { name: 'Send' }))

    expect(screen.getByRole('textbox', { name: 'Message' })).toHaveValue('Shorter intro')
  })

  it('cannot send an empty message or while busy', async () => {
    const user = userEvent.setup()
    const { rerender } = render(
      <VideoComposer placeholder="Ask for changes" disabled={false} busy={false} onSend={vi.fn()} />
    )
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()

    await user.type(screen.getByRole('textbox', { name: 'Message' }), 'Hi')
    rerender(<VideoComposer placeholder="Ask for changes" disabled={false} busy={true} onSend={vi.fn()} />)

    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
  })
})
