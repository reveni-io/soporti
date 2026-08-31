import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SubagentNode from './SubagentNode.jsx'

const SUBAGENT = {
  id: 4,
  name: 'code_reviewer',
  description: 'Owns the codebase and Sentry.',
  instructions: 'Review.',
  provider: 'anthropic',
  model: 'claude-sonnet-5',
  tools: ['search_code', 'search_notion_pages'],
  exclusive: true,
  enabled: true,
}

const GROUPS = [{ group: { id: 'repo', label: 'Repositories' }, tools: ['search_code'] }]

function noop() {}

describe('SubagentNode', () => {
  it('shows the tool name, the description and what it owns', () => {
    render(
      <SubagentNode
        subagent={SUBAGENT}
        groups={GROUPS}
        globalProvider="openai"
        globalModel="gpt-5"
        pendingDelete={false}
        onEdit={noop}
        onToggleEnabled={noop}
        onRequestDelete={noop}
        onCancelDelete={noop}
        onDelete={noop}
      />
    )

    expect(screen.getByText('ask_code_reviewer')).toBeInTheDocument()
    expect(screen.getByText('Owns the codebase and Sentry.')).toBeInTheDocument()
    expect(screen.getByText('1 tools · exclusive · 1 unavailable')).toBeInTheDocument()
  })

  it('edits and toggles the subagent it was given', async () => {
    const onEdit = vi.fn()
    const onToggleEnabled = vi.fn()
    render(
      <SubagentNode
        subagent={SUBAGENT}
        groups={GROUPS}
        globalProvider="openai"
        globalModel="gpt-5"
        pendingDelete={false}
        onEdit={onEdit}
        onToggleEnabled={onToggleEnabled}
        onRequestDelete={noop}
        onCancelDelete={noop}
        onDelete={noop}
      />
    )

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }))
    await userEvent.click(screen.getByRole('button', { name: 'Disable' }))

    expect(onEdit).toHaveBeenCalledWith(SUBAGENT)
    expect(onToggleEnabled).toHaveBeenCalledWith(SUBAGENT)
  })

  it('asks for the delete before running it', async () => {
    const onRequestDelete = vi.fn()
    render(
      <SubagentNode
        subagent={SUBAGENT}
        groups={GROUPS}
        globalProvider="openai"
        globalModel="gpt-5"
        pendingDelete={false}
        onEdit={noop}
        onToggleEnabled={noop}
        onRequestDelete={onRequestDelete}
        onCancelDelete={noop}
        onDelete={noop}
      />
    )

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))

    expect(onRequestDelete).toHaveBeenCalledWith(4)
    expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument()
  })

  it('confirms the delete once it is pending', async () => {
    const onDelete = vi.fn()
    render(
      <SubagentNode
        subagent={SUBAGENT}
        groups={GROUPS}
        globalProvider="openai"
        globalModel="gpt-5"
        pendingDelete
        onEdit={noop}
        onToggleEnabled={noop}
        onRequestDelete={noop}
        onCancelDelete={noop}
        onDelete={onDelete}
      />
    )

    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    expect(onDelete).toHaveBeenCalledWith(4)
  })

  it('offers to enable a disabled subagent and marks it', () => {
    render(
      <SubagentNode
        subagent={{ ...SUBAGENT, enabled: false }}
        groups={GROUPS}
        globalProvider="openai"
        globalModel="gpt-5"
        pendingDelete={false}
        onEdit={noop}
        onToggleEnabled={noop}
        onRequestDelete={noop}
        onCancelDelete={noop}
        onDelete={noop}
      />
    )

    expect(screen.getByRole('button', { name: 'Enable' })).toBeInTheDocument()
    expect(screen.getByText('Disabled')).toBeInTheDocument()
  })
})
