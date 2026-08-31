import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SubagentFlow from './SubagentFlow.jsx'

vi.mock('@xyflow/react', async () => {
  const { useState } = await import('react')

  return {
    ReactFlow: ({ nodes, nodeTypes, edges }) => (
      <div data-testid="flow" data-edges={(edges ?? []).map(edge => `${edge.target}:${edge.animated}`).join(',')}>
        {nodes.map(node => {
          const NodeComponent = nodeTypes[node.type]

          return <NodeComponent data={node.data} key={node.id} />
        })}
      </div>
    ),
    ReactFlowProvider: ({ children }) => children,
    Background: () => null,
    Controls: () => null,
    Handle: () => null,
    Position: { Top: 'top', Bottom: 'bottom' },
    MarkerType: { ArrowClosed: 'arrowclosed' },
    useNodesState: initial => {
      const [nodes, setNodes] = useState(initial)

      return [nodes, setNodes, vi.fn()]
    },
    useNodesInitialized: () => true,
    useReactFlow: () => ({ fitView: vi.fn() }),
  }
})

const TOOL_GROUPS = [
  { id: 'repo', label: 'Repositories', configured: true, tools: ['search_code', 'get_file_contents'] },
  { id: 'sentry', label: 'Sentry', configured: true, tools: ['get_sentry_issue'] },
  { id: 'notion', label: 'Notion', configured: false, tools: ['search_notion_pages'] },
]

const ACTIONS = {
  onEdit: () => {},
  onToggleEnabled: () => {},
  onRequestDelete: () => {},
  onCancelDelete: () => {},
  onDelete: () => {},
}

function subagent(overrides) {
  return {
    id: 1,
    name: 'code_investigator',
    description: 'Owns the codebase.',
    instructions: 'Investigate.',
    provider: 'anthropic',
    model: 'claude-sonnet-5',
    tools: ['search_code'],
    exclusive: true,
    enabled: true,
    ...overrides,
  }
}

describe('SubagentFlow', () => {
  it('renders the main agent with everything it holds when there are no subagents', () => {
    render(
      <SubagentFlow
        subagents={[]}
        toolGroups={TOOL_GROUPS}
        globalProvider="openai"
        globalModel="gpt-5"
        pendingDeleteId={null}
        actions={ACTIONS}
      />
    )

    expect(screen.getByText('Soporti')).toBeInTheDocument()
    expect(screen.getByText('3 tools')).toBeInTheDocument()
    expect(screen.getByTestId('flow')).toHaveAttribute('data-edges', '')
  })

  it('subtracts an exclusive subagent tools from the main agent', () => {
    render(
      <SubagentFlow
        subagents={[subagent({})]}
        toolGroups={TOOL_GROUPS}
        globalProvider="openai"
        globalModel="gpt-5"
        pendingDeleteId={null}
        actions={ACTIONS}
      />
    )

    expect(screen.getByText('2 tools (1 delegated)')).toBeInTheDocument()
    expect(screen.getByText('ask_code_investigator')).toBeInTheDocument()
  })

  it('animates the edge of a shared subagent and leaves an exclusive one static', () => {
    render(
      <SubagentFlow
        subagents={[subagent({}), subagent({ id: 2, name: 'context_gatherer', exclusive: false })]}
        toolGroups={TOOL_GROUPS}
        globalProvider="openai"
        globalModel="gpt-5"
        pendingDeleteId={null}
        actions={ACTIONS}
      />
    )

    expect(screen.getByTestId('flow')).toHaveAttribute('data-edges', '1:false,2:true')
  })

  it('leaves an unconfigured integration out of the canvas', () => {
    const { container } = render(
      <SubagentFlow
        subagents={[]}
        toolGroups={TOOL_GROUPS}
        globalProvider="openai"
        globalModel="gpt-5"
        pendingDeleteId={null}
        actions={ACTIONS}
      />
    )

    expect(container.querySelector('[data-icon="notion"]')).not.toBeInTheDocument()
    expect(container.querySelector('[data-icon="github"]')).toBeInTheDocument()
  })

  it('runs the actions from the node it was given', async () => {
    const onEdit = vi.fn()
    render(
      <SubagentFlow
        subagents={[subagent({})]}
        toolGroups={TOOL_GROUPS}
        globalProvider="openai"
        globalModel="gpt-5"
        pendingDeleteId={null}
        actions={{ ...ACTIONS, onEdit }}
      />
    )

    await userEvent.click(screen.getByRole('button', { name: 'Edit' }))

    expect(onEdit).toHaveBeenCalledWith(subagent({}))
  })

  it('shows the delete confirmation on the pending subagent only', () => {
    render(
      <SubagentFlow
        subagents={[subagent({}), subagent({ id: 2, name: 'context_gatherer' })]}
        toolGroups={TOOL_GROUPS}
        globalProvider="openai"
        globalModel="gpt-5"
        pendingDeleteId={2}
        actions={ACTIONS}
      />
    )

    expect(screen.getAllByRole('button', { name: 'Confirm' })).toHaveLength(1)
  })

  it('shows the confirmation once the pending delete arrives as a prop', () => {
    const { rerender } = render(
      <SubagentFlow
        subagents={[subagent({})]}
        toolGroups={TOOL_GROUPS}
        globalProvider="openai"
        globalModel="gpt-5"
        pendingDeleteId={null}
        actions={ACTIONS}
      />
    )

    expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument()

    rerender(
      <SubagentFlow
        subagents={[subagent({})]}
        toolGroups={TOOL_GROUPS}
        globalProvider="openai"
        globalModel="gpt-5"
        pendingDeleteId={1}
        actions={ACTIONS}
      />
    )

    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument()
  })

  it('updates the node when the subagent is disabled', () => {
    const { rerender } = render(
      <SubagentFlow
        subagents={[subagent({})]}
        toolGroups={TOOL_GROUPS}
        globalProvider="openai"
        globalModel="gpt-5"
        pendingDeleteId={null}
        actions={ACTIONS}
      />
    )

    expect(screen.getByRole('button', { name: 'Disable' })).toBeInTheDocument()

    rerender(
      <SubagentFlow
        subagents={[subagent({ enabled: false })]}
        toolGroups={TOOL_GROUPS}
        globalProvider="openai"
        globalModel="gpt-5"
        pendingDeleteId={null}
        actions={ACTIONS}
      />
    )

    expect(screen.getByRole('button', { name: 'Enable' })).toBeInTheDocument()
    expect(screen.getByText('Disabled')).toBeInTheDocument()
  })

  it('gives the main agent back the tools of a subagent that gets disabled', () => {
    const { rerender } = render(
      <SubagentFlow
        subagents={[subagent({})]}
        toolGroups={TOOL_GROUPS}
        globalProvider="openai"
        globalModel="gpt-5"
        pendingDeleteId={null}
        actions={ACTIONS}
      />
    )

    expect(screen.getByText('2 tools (1 delegated)')).toBeInTheDocument()

    rerender(
      <SubagentFlow
        subagents={[subagent({ enabled: false })]}
        toolGroups={TOOL_GROUPS}
        globalProvider="openai"
        globalModel="gpt-5"
        pendingDeleteId={null}
        actions={ACTIONS}
      />
    )

    expect(screen.getByText('3 tools')).toBeInTheDocument()
  })

  it('paints only the tools the main agent allowlist leaves it', () => {
    const { container } = render(
      <SubagentFlow
        subagents={[]}
        toolGroups={TOOL_GROUPS}
        mainAgentTools={['search_code']}
        globalProvider="openai"
        globalModel="gpt-5"
        pendingDeleteId={null}
        actions={ACTIONS}
      />
    )

    expect(screen.getByText('1 tools')).toBeInTheDocument()
    expect(container.querySelector('[data-icon="github"]')).toBeInTheDocument()
    expect(container.querySelector('[data-icon="sentry"]')).not.toBeInTheDocument()
  })
})
