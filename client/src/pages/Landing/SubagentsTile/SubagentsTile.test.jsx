import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import SubagentsTile from './SubagentsTile.jsx'

describe('SubagentsTile', () => {
  it('draws the assistant above its specialists, each with its own model and tools', () => {
    const { container } = render(<SubagentsTile />)

    expect(screen.getByText('Soporti')).toBeInTheDocument()
    expect(screen.getByText('code_investigator')).toBeInTheDocument()
    expect(screen.getByText('context_gatherer')).toBeInTheDocument()
    expect(screen.getByText('claude-sonnet')).toBeInTheDocument()
    expect(screen.getByText('gpt-5.2')).toBeInTheDocument()
    expect(container.querySelector('[data-icon="anthropic"]')).toBeInTheDocument()
    expect(container.querySelector('[data-icon="openai"]')).toBeInTheDocument()
    expect(container.querySelector('[data-icon="sentry"]')).toBeInTheDocument()
    expect(container.querySelectorAll('.lp-subagents-tile__edge')).toHaveLength(2)
  })
})
