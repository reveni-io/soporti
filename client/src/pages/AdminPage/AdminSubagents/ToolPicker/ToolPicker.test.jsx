import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ToolPicker from './ToolPicker.jsx'

const GROUPS = [
  { id: 'repo', label: 'Repositories', configured: true, tools: ['search_code', 'get_file_contents'] },
  { id: 'notion', label: 'Notion', configured: false, tools: ['search_notion_pages'] },
]

describe('ToolPicker', () => {
  it('labels each tool the way the chat steps do', () => {
    render(
      <ToolPicker
        groups={GROUPS}
        selected={[]}
        claimedBy={{}}
        disabled={false}
        onToggle={vi.fn()}
        onToggleGroup={vi.fn()}
      />
    )

    expect(screen.getByRole('checkbox', { name: 'Searching code' })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Reading file' })).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Searching Notion' })).toBeInTheDocument()
  })

  it('reports the tool that was toggled', async () => {
    const onToggle = vi.fn()
    render(
      <ToolPicker
        groups={GROUPS}
        selected={[]}
        claimedBy={{}}
        disabled={false}
        onToggle={onToggle}
        onToggleGroup={vi.fn()}
      />
    )

    await userEvent.click(screen.getByRole('checkbox', { name: 'Searching code' }))

    expect(onToggle).toHaveBeenCalledTimes(1)
    expect(onToggle).toHaveBeenCalledWith('search_code')
  })

  it('checks the tools it was given as selected', () => {
    render(
      <ToolPicker
        groups={GROUPS}
        selected={['search_code']}
        claimedBy={{}}
        disabled={false}
        onToggle={vi.fn()}
        onToggleGroup={vi.fn()}
      />
    )

    expect(screen.getByRole('checkbox', { name: 'Searching code' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Reading file' })).not.toBeChecked()
  })

  it('offers to select a whole group, and to clear it once it is complete', async () => {
    const onToggleGroup = vi.fn()
    const { rerender } = render(
      <ToolPicker
        groups={GROUPS}
        selected={[]}
        claimedBy={{}}
        disabled={false}
        onToggle={vi.fn()}
        onToggleGroup={onToggleGroup}
      />
    )

    const [selectAll] = screen.getAllByRole('button', { name: 'Select all' })
    await userEvent.click(selectAll)

    expect(onToggleGroup).toHaveBeenCalledWith(GROUPS[0])

    rerender(
      <ToolPicker
        groups={GROUPS}
        selected={['search_code', 'get_file_contents']}
        claimedBy={{}}
        disabled={false}
        onToggle={vi.fn()}
        onToggleGroup={onToggleGroup}
      />
    )

    expect(screen.getByRole('button', { name: 'Clear' })).toBeInTheDocument()
  })

  it('renders an unconfigured group with a note to configure it first', () => {
    render(
      <ToolPicker
        groups={GROUPS}
        selected={[]}
        claimedBy={{}}
        disabled={false}
        onToggle={vi.fn()}
        onToggleGroup={vi.fn()}
      />
    )

    expect(screen.getByText('Configure it first')).toBeInTheDocument()
  })

  it('shows a tool another subagent already owns as taken and refuses to check it', async () => {
    const onToggle = vi.fn()
    render(
      <ToolPicker
        groups={GROUPS}
        selected={[]}
        claimedBy={{ search_code: 'context_gatherer' }}
        disabled={false}
        onToggle={onToggle}
        onToggleGroup={vi.fn()}
      />
    )

    const taken = screen.getByRole('checkbox', { name: 'Searching code' })
    expect(taken).toBeDisabled()
    expect(screen.getByText('Taken by context_gatherer')).toBeInTheDocument()

    await userEvent.click(taken)
    expect(onToggle).not.toHaveBeenCalled()
  })

  it('disables every tool while a save is in flight', () => {
    render(
      <ToolPicker groups={GROUPS} selected={[]} claimedBy={{}} disabled onToggle={vi.fn()} onToggleGroup={vi.fn()} />
    )

    for (const checkbox of screen.getAllByRole('checkbox')) expect(checkbox).toBeDisabled()
  })
})
