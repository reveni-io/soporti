import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ConversationList from './ConversationList.jsx'

describe('ConversationList', () => {
  it('renders nothing when there are no conversations', () => {
    const { container } = render(<ConversationList conversations={[]} onSelect={vi.fn()} onDelete={vi.fn()} />)

    expect(container).toBeEmptyDOMElement()
  })

  it('lists the titles and falls back for an untitled conversation', () => {
    render(
      <ConversationList
        conversations={[
          { id: 'c1', title: 'Auth question' },
          { id: 'c2', title: null },
        ]}
        onSelect={vi.fn()}
        onDelete={vi.fn()}
      />
    )

    expect(screen.getByText('Auth question')).toBeInTheDocument()
    expect(screen.getByText('Untitled conversation')).toBeInTheDocument()
  })

  it('marks the conversations produced by a schedule', () => {
    render(
      <ConversationList
        conversations={[
          { id: 'c1', title: 'Failed payments', scheduleId: 3 },
          { id: 'c2', title: 'Auth question', scheduleId: null },
        ]}
        onSelect={vi.fn()}
        onDelete={vi.fn()}
      />
    )

    expect(screen.getAllByLabelText('Scheduled run')).toHaveLength(1)
  })

  it('marks the conversation being read', () => {
    const { container } = render(
      <ConversationList
        conversations={[
          { id: 'c1', title: 'Auth question' },
          { id: 'c2', title: 'Payout failure' },
        ]}
        selectedId="c2"
        onSelect={vi.fn()}
        onDelete={vi.fn()}
      />
    )

    const current = container.querySelectorAll('[aria-current="true"]')
    expect(current).toHaveLength(1)
    expect(current[0]).toHaveTextContent('Payout failure')
  })

  it('marks none while a brand-new chat is open', () => {
    const { container } = render(
      <ConversationList
        conversations={[{ id: 'c1', title: 'Auth question' }]}
        selectedId={null}
        onSelect={vi.fn()}
        onDelete={vi.fn()}
      />
    )

    expect(container.querySelector('[aria-current="true"]')).toBeNull()
  })

  it('marks a conversation that is both being read and still answering', () => {
    const { container } = render(
      <ConversationList
        conversations={[{ id: 'c1', title: 'Payout failure', isStreaming: true }]}
        selectedId="c1"
        onSelect={vi.fn()}
        onDelete={vi.fn()}
      />
    )

    expect(container.querySelector('[aria-current="true"]')).toBeInTheDocument()
    expect(screen.getByLabelText('Answering')).toBeInTheDocument()
  })

  it('selects a conversation by id', async () => {
    const onSelect = vi.fn()
    const user = userEvent.setup()
    render(<ConversationList conversations={[{ id: 'c1', title: 'Auth' }]} onSelect={onSelect} onDelete={vi.fn()} />)

    await user.click(screen.getByText('Auth'))

    expect(onSelect).toHaveBeenCalledWith('c1')
  })

  it('deletes without selecting the conversation', async () => {
    const onSelect = vi.fn()
    const onDelete = vi.fn()
    const user = userEvent.setup()
    render(<ConversationList conversations={[{ id: 'c1', title: 'Auth' }]} onSelect={onSelect} onDelete={onDelete} />)

    await user.click(screen.getByLabelText('Delete conversation'))

    expect(onDelete).toHaveBeenCalledWith('c1')
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('survives a missing select handler', async () => {
    const user = userEvent.setup()
    render(<ConversationList conversations={[{ id: 'c1', title: 'Auth' }]} onDelete={vi.fn()} />)

    await user.click(screen.getByText('Auth'))

    expect(screen.getByText('Auth')).toBeInTheDocument()
  })
  it('marks the conversation that is being answered', () => {
    render(
      <ConversationList
        conversations={[
          { id: 'c1', title: 'Payout failure', isStreaming: true },
          { id: 'c2', title: 'Auth question' },
        ]}
        onSelect={vi.fn()}
        onDelete={vi.fn()}
      />
    )

    expect(screen.getAllByLabelText('Answering')).toHaveLength(1)
  })

  it('hides the delete button while the conversation is being answered', () => {
    render(
      <ConversationList
        conversations={[{ id: 'c1', title: 'Payout failure', isStreaming: true }]}
        onSelect={vi.fn()}
        onDelete={vi.fn()}
      />
    )

    expect(screen.queryByLabelText('Delete conversation')).not.toBeInTheDocument()
  })

  it('still opens the conversation that is being answered', async () => {
    const onSelect = vi.fn()
    const user = userEvent.setup()
    render(
      <ConversationList
        conversations={[{ id: 'c1', title: 'Payout failure', isStreaming: true }]}
        onSelect={onSelect}
        onDelete={vi.fn()}
      />
    )

    await user.click(screen.getByText('Payout failure'))

    expect(onSelect).toHaveBeenCalledWith('c1')
  })
})
