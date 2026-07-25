import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ChatEmptyState from './ChatEmptyState.jsx'

const INTEGRATIONS = [
  { id: 'github', name: 'GitHub', description: 'Explore repositories' },
  { id: 'postgres', name: 'PostgreSQL', description: 'Query data' },
]

describe('ChatEmptyState', () => {
  it('asks for a source when none is selected', () => {
    const { container } = render(
      <ChatEmptyState hasSourcesSelected={false} integrations={INTEGRATIONS} stats={null} onTryExample={vi.fn()} />
    )

    expect(screen.getByText('Select a source to get started')).toBeInTheDocument()
    expect(container.querySelector('.chat__capabilities')).toBeNull()
    expect(container.querySelector('.chat__examples')).toBeNull()
  })

  it('shows a chip per integration with its description as the title', () => {
    render(<ChatEmptyState hasSourcesSelected integrations={INTEGRATIONS} stats={null} onTryExample={vi.fn()} />)

    expect(screen.getByText('Ask Soporti anything')).toBeInTheDocument()
    expect(screen.getByText('GitHub').closest('.chat__capability')).toHaveAttribute('title', 'Explore repositories')
    expect(screen.getByText('PostgreSQL')).toBeInTheDocument()
  })

  it('offers example questions and reports the one that was clicked', async () => {
    const onTryExample = vi.fn()
    const user = userEvent.setup()
    const { container } = render(
      <ChatEmptyState hasSourcesSelected integrations={INTEGRATIONS} stats={null} onTryExample={onTryExample} />
    )

    const examples = [...container.querySelectorAll('.chat__examples button')]
    expect(examples.length).toBeGreaterThan(0)

    await user.click(examples[0])

    expect(onTryExample).toHaveBeenCalledWith(examples[0].textContent)
  })

  it('keeps the same example questions across re-renders', () => {
    const { container, rerender } = render(
      <ChatEmptyState hasSourcesSelected integrations={INTEGRATIONS} stats={null} onTryExample={vi.fn()} />
    )
    const before = [...container.querySelectorAll('.chat__examples button')].map(node => node.textContent)

    rerender(<ChatEmptyState hasSourcesSelected integrations={INTEGRATIONS} stats={{}} onTryExample={vi.fn()} />)

    const after = [...container.querySelectorAll('.chat__examples button')].map(node => node.textContent)
    expect(after).toEqual(before)
  })

  it('renders only the stats that have a value, compactly formatted', () => {
    render(
      <ChatEmptyState
        hasSourcesSelected
        integrations={INTEGRATIONS}
        stats={{ conversations: 1200, activeUsers: 0, solvedCases: 8 }}
        onTryExample={vi.fn()}
      />
    )

    expect(screen.getByText('1.2K')).toBeInTheDocument()
    expect(screen.getByText('Conversations this week')).toBeInTheDocument()
    expect(screen.getByText('8')).toBeInTheDocument()
    expect(screen.queryByText('Teammates this week')).not.toBeInTheDocument()
  })

  it('renders no stats block without stats', () => {
    const { container } = render(
      <ChatEmptyState hasSourcesSelected integrations={INTEGRATIONS} stats={null} onTryExample={vi.fn()} />
    )

    expect(container.querySelector('.chat__stats')).toBeNull()
  })
})
