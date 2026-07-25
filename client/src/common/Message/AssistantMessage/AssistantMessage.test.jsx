import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import AssistantMessage from './AssistantMessage.jsx'

vi.mock('../../ToolCall/ToolCall.jsx', () => ({
  default: ({ tool, done }) => (
    <div data-testid="tool-call" data-done={done}>
      {tool}
    </div>
  ),
}))

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

  it('renders tool calls', () => {
    render(
      <AssistantMessage
        message={{ parts: [{ type: 'tool_call', tool: 'search_code', input: {}, done: true, durationMs: 120 }] }}
        isStreaming={false}
      />
    )

    expect(screen.getByTestId('tool-call').textContent).toBe('search_code')
    expect(screen.getByTestId('tool-call')).toHaveAttribute('data-done', 'true')
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
})
