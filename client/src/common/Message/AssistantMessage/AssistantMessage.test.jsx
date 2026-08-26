import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import AssistantMessage from './AssistantMessage.jsx'

const REAL_CLIPBOARD = navigator.clipboard

function useClipboard(clipboard) {
  Object.defineProperty(navigator, 'clipboard', { value: clipboard, configurable: true })
}

afterEach(() => {
  useClipboard(REAL_CLIPBOARD)
})

vi.mock('../../FeedbackButtons/FeedbackButtons.jsx', () => ({
  default: ({ feedbackId }) => <div data-testid="feedback">{feedbackId}</div>,
}))

describe('AssistantMessage', () => {
  it('shows a typing indicator while there is nothing to render yet', () => {
    const { container } = render(<AssistantMessage message={{ parts: [] }} isStreaming />)

    expect(container.querySelector('.message__typing')).toBeInTheDocument()
  })

  it('renders text parts as markdown', () => {
    render(<AssistantMessage message={{ parts: [{ type: 'text', content: '**bold**' }] }} isStreaming={false} />)

    expect(screen.getByText('bold')).toBeInTheDocument()
  })

  it('groups tool calls into a single steps block', () => {
    render(
      <AssistantMessage
        message={{
          parts: [
            { type: 'tool_call', tool: 'search_code', input: { query: 'refund' }, done: true, durationMs: 120 },
            { type: 'tool_call', tool: 'get_file_contents', input: { repo: 'org/app', path: 'a.js' }, done: false },
          ],
        }}
        isStreaming
      />
    )

    expect(screen.getAllByRole('list')).toHaveLength(1)
    expect(screen.getByText('1/2 steps')).toBeInTheDocument()
    expect(screen.getByText('Searching code')).toBeInTheDocument()
    expect(screen.getByText('"refund"')).toBeInTheDocument()
    expect(screen.getByText('120ms')).toBeInTheDocument()
    expect(screen.getByText('org/app/a.js')).toBeInTheDocument()
  })

  it('collapses a finished step block once the answer follows it', () => {
    render(
      <AssistantMessage
        message={{
          parts: [
            { type: 'tool_call', tool: 'search_code', input: {}, done: true, durationMs: 120 },
            { type: 'text', content: 'Here is the answer.' },
          ],
        }}
        isStreaming
      />
    )

    expect(screen.getByRole('button', { name: /done/i })).toHaveAttribute('aria-expanded', 'false')
  })

  it('renders error parts', () => {
    const { container } = render(
      <AssistantMessage message={{ parts: [{ type: 'error', content: 'Something broke.' }] }} isStreaming={false} />
    )

    expect(container.querySelector('.message__error').textContent).toBe('Something broke.')
  })

  it('ignores an unknown part type', () => {
    const { container } = render(
      <AssistantMessage message={{ parts: [{ type: 'future_thing', content: 'x' }] }} isStreaming={false} />
    )

    expect(container.querySelector('.message__bubble').textContent).toBe('')
  })

  it('offers feedback only once the answer is complete', () => {
    const message = { parts: [{ type: 'text', content: 'done' }], feedbackId: 'fb-1' }
    const { rerender } = render(<AssistantMessage message={message} isStreaming token="tok" />)
    expect(screen.queryByTestId('feedback')).not.toBeInTheDocument()

    rerender(<AssistantMessage message={message} isStreaming={false} token="tok" />)

    expect(screen.getByTestId('feedback').textContent).toBe('fb-1')
  })

  it('offers no feedback without a feedback id', () => {
    render(<AssistantMessage message={{ parts: [{ type: 'text', content: 'done' }] }} isStreaming={false} />)

    expect(screen.queryByTestId('feedback')).not.toBeInTheDocument()
  })

  it('copies every text part of the answer, in order, as markdown', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    useClipboard({ writeText })
    const message = {
      parts: [
        { type: 'text', content: '## Diagnosis' },
        { type: 'text', content: '- first\n- second' },
      ],
    }
    render(<AssistantMessage message={message} isStreaming={false} />)

    await userEvent.click(screen.getByRole('button', { name: 'Copy answer' }))

    expect(writeText).toHaveBeenCalledTimes(1)
    expect(writeText).toHaveBeenCalledWith('## Diagnosis\n\n- first\n- second')
  })

  it('leaves tool calls and errors out of the copied answer', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    useClipboard({ writeText })
    const message = {
      parts: [
        { type: 'tool_call', tool: 'search_code', input: {}, done: true },
        { type: 'text', content: 'The answer.' },
        { type: 'error', content: 'Something broke.' },
      ],
    }
    render(<AssistantMessage message={message} isStreaming={false} />)

    await userEvent.click(screen.getByRole('button', { name: 'Copy answer' }))

    expect(writeText).toHaveBeenCalledTimes(1)
    expect(writeText).toHaveBeenCalledWith('The answer.')
  })

  it('offers the copy action only once the answer is complete', () => {
    const message = { parts: [{ type: 'text', content: 'done' }] }
    const { rerender } = render(<AssistantMessage message={message} isStreaming />)
    expect(screen.queryByRole('button', { name: 'Copy answer' })).not.toBeInTheDocument()

    rerender(<AssistantMessage message={message} isStreaming={false} />)

    expect(screen.getByRole('button', { name: 'Copy answer' })).toBeInTheDocument()
  })

  it('offers no copy action when the answer has no text', () => {
    const message = { parts: [{ type: 'error', content: 'Something broke.' }] }
    render(<AssistantMessage message={message} isStreaming={false} />)

    expect(screen.queryByRole('button', { name: 'Copy answer' })).not.toBeInTheDocument()
  })
})
