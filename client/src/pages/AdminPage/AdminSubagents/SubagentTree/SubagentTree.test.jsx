import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import SubagentTree from './SubagentTree.jsx'

const TOOL_GROUPS = [
  { id: 'repo', label: 'Repositories', configured: true, tools: ['search_code', 'get_file_contents'] },
  { id: 'sentry', label: 'Sentry', configured: true, tools: ['get_sentry_issue', 'search_sentry_issues'] },
]

function subagent(overrides = {}) {
  return {
    id: 1,
    name: 'code_investigator',
    description: 'Owns the codebase.',
    provider: 'anthropic',
    model: 'claude-sonnet-5',
    tools: ['search_code'],
    exclusive: true,
    enabled: true,
    ...overrides,
  }
}

describe('SubagentTree', () => {
  it('shows what the main agent has left and how much was delegated', () => {
    render(
      <SubagentTree subagents={[subagent()]} toolGroups={TOOL_GROUPS} globalProvider="openai" globalModel="gpt-5.2" />
    )

    expect(screen.getByText('Soporti (main agent)')).toBeInTheDocument()
    expect(screen.getByText(/3 tools \(1 delegated\)/)).toBeInTheDocument()
    expect(screen.getByText(/openai \/ gpt-5\.2/)).toBeInTheDocument()
  })

  it('counts the whole catalog for the main agent when nothing was taken away', () => {
    render(
      <SubagentTree
        subagents={[subagent({ exclusive: false })]}
        toolGroups={TOOL_GROUPS}
        globalProvider="openai"
        globalModel="gpt-5.2"
      />
    )

    expect(screen.getByText(/^4 tools/)).toBeInTheDocument()
    expect(screen.queryByText(/delegated/)).not.toBeInTheDocument()
  })

  it('names each subagent by the tool that reaches it, with its provider and model', () => {
    render(
      <SubagentTree subagents={[subagent()]} toolGroups={TOOL_GROUPS} globalProvider="openai" globalModel="gpt-5.2" />
    )

    expect(screen.getByText('ask_code_investigator')).toBeInTheDocument()
    expect(screen.getByText('anthropic / claude-sonnet-5')).toBeInTheDocument()
  })

  it('resolves what an inheriting subagent actually runs on', () => {
    render(
      <SubagentTree
        subagents={[subagent({ provider: null, model: null })]}
        toolGroups={TOOL_GROUPS}
        globalProvider="openai"
        globalModel="gpt-5.2"
      />
    )

    expect(screen.getByText('follows global (openai / gpt-5.2)')).toBeInTheDocument()
  })

  it('lists the tools of a subagent by the same labels the chat steps use', () => {
    render(
      <SubagentTree
        subagents={[subagent({ tools: ['search_code', 'get_sentry_issue'] })]}
        toolGroups={TOOL_GROUPS}
        globalProvider="openai"
        globalModel="gpt-5.2"
      />
    )

    expect(screen.getByText('2 tools: Searching code, Reading Sentry issue')).toBeInTheDocument()
  })

  it('reports a prompt-only subagent as holding no tools', () => {
    render(
      <SubagentTree
        subagents={[subagent({ tools: [] })]}
        toolGroups={TOOL_GROUPS}
        globalProvider="openai"
        globalModel="gpt-5.2"
      />
    )

    expect(screen.getByText('0 tools')).toBeInTheDocument()
  })

  it('marks a disabled subagent and leaves its tools with the main agent', () => {
    render(
      <SubagentTree
        subagents={[subagent({ enabled: false })]}
        toolGroups={TOOL_GROUPS}
        globalProvider="openai"
        globalModel="gpt-5.2"
      />
    )

    expect(screen.getByText('Disabled')).toBeInTheDocument()
    expect(screen.getByText(/^4 tools/)).toBeInTheDocument()
  })

  it('renders only the main agent when no subagent is defined', () => {
    const { container } = render(
      <SubagentTree subagents={[]} toolGroups={TOOL_GROUPS} globalProvider="openai" globalModel="gpt-5.2" />
    )

    expect(container.querySelectorAll('.subagent-tree__children > li')).toHaveLength(0)
    expect(screen.getByText(/^4 tools/)).toBeInTheDocument()
  })
})
