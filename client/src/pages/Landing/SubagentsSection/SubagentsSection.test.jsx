import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import SubagentsSection from './SubagentsSection.jsx'

describe('SubagentsSection', () => {
  it('leads with one assistant out front and specialists behind it', () => {
    render(<SubagentsSection />)

    expect(screen.getByText(/One assistant out front/)).toBeInTheDocument()
    expect(screen.getByText(/never crowds the conversation you are having/)).toBeInTheDocument()
  })

  it('says a specialist is defined in the admin panel', () => {
    render(<SubagentsSection />)

    expect(screen.getByText('/admin')).toBeInTheDocument()
  })

  it('lists what a subagent buys you', () => {
    const { container } = render(<SubagentsSection />)

    expect(container.querySelectorAll('.lp-points li')).toHaveLength(4)
    expect(screen.getByText(/delegation is the only path to them/)).toBeInTheDocument()
    expect(screen.getByText(/its own provider and model/)).toBeInTheDocument()
  })

  it('draws the division of labour as a graph with a model per specialist', () => {
    const { container } = render(<SubagentsSection />)

    expect(container.querySelectorAll('.lp-subagents__children .lp-subagents__node')).toHaveLength(2)
    expect(container.querySelectorAll('.lp-subagents__edges path')).toHaveLength(2)
    expect(screen.getByText('code_investigator')).toBeInTheDocument()
    expect(screen.getByText('context_gatherer')).toBeInTheDocument()
    expect(screen.getByText('12 tools (13 delegated)')).toBeInTheDocument()
  })

  it('marks each node with the logos of the integrations it owns', () => {
    const { container } = render(<SubagentsSection />)
    const [parent] = container.querySelectorAll('.lp-subagents__node--parent')
    const [specialist] = container.querySelectorAll('.lp-subagents__children .lp-subagents__node')

    expect(parent.querySelector('[data-icon="shopify"]')).toBeInTheDocument()
    expect(specialist.querySelector('[data-icon="github"]')).toBeInTheDocument()
    expect(specialist.querySelector('[data-icon="sentry"]')).toBeInTheDocument()
  })

  it('shows the provider mark next to each specialist model', () => {
    const { container } = render(<SubagentsSection />)

    expect(container.querySelector('[data-icon="anthropic"]')).toBeInTheDocument()
    expect(container.querySelector('[data-icon="openai"]')).toBeInTheDocument()
  })

  it('is anchored so the nav can link to it', () => {
    const { container } = render(<SubagentsSection />)

    expect(container.querySelector('#subagents')).toBeInTheDocument()
  })
})
