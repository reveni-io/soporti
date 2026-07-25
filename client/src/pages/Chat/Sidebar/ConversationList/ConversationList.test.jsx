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
})
