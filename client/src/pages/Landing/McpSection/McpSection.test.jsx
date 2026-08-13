import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import McpSection from './McpSection.jsx'

describe('McpSection', () => {
  it('renders a light card per capability, each with its bullets', () => {
    const { container } = render(<McpSection />)

    expect(container.querySelectorAll('.lp-feat--light')).toHaveLength(3)
    expect(container.querySelectorAll('.lp-feat__list')).toHaveLength(3)
    expect(screen.getByText('Four tools, one endpoint')).toBeInTheDocument()
    expect(screen.getByText('Built for long questions')).toBeInTheDocument()
    expect(screen.getByText('Same keys, same guardrails')).toBeInTheDocument()
    expect(screen.getByText(/follow_up: keep the thread/i)).toBeInTheDocument()
    expect(screen.getByText(/heartbeats keep proxies/i)).toBeInTheDocument()
  })

  it('shows the command that registers soporti as an mcp server', () => {
    render(<McpSection />)

    expect(screen.getByText(/claude mcp add --transport http soporti/)).toBeInTheDocument()
    expect(screen.getByText(/Bearer sop_/)).toBeInTheDocument()
  })

  it('shows the plugin marketplace as an install route, with its setup command', () => {
    const { container } = render(<McpSection />)

    expect(container.querySelectorAll('.lp-mcp__route')).toHaveLength(2)
    expect(screen.getByText(/\/plugin marketplace add reveni-io\/soporti/)).toBeInTheDocument()
    expect(screen.getByText(/\/soporti:setup/)).toBeInTheDocument()
    expect(screen.getByText('Install the Claude plugin')).toBeInTheDocument()
  })
})
