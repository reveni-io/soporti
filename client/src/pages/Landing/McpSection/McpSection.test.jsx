import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import McpSection from './McpSection.jsx'

describe('McpSection', () => {
  it('renders a light card per capability, each with its bullets', () => {
    const { container } = render(<McpSection />)

    expect(container.querySelectorAll('.lp-feat--light')).toHaveLength(3)
    expect(container.querySelectorAll('.lp-feat__list')).toHaveLength(3)
    expect(screen.getByText('One tool, one answer')).toBeInTheDocument()
    expect(screen.getByText('Built for long questions')).toBeInTheDocument()
    expect(screen.getByText('Same keys, same guardrails')).toBeInTheDocument()
    expect(screen.getByText(/answers cite the sources/i)).toBeInTheDocument()
    expect(screen.getByText(/heartbeats keep proxies/i)).toBeInTheDocument()
  })

  it('shows the command that registers soporti as an mcp server', () => {
    render(<McpSection />)

    expect(screen.getByText(/claude mcp add --transport http soporti/)).toBeInTheDocument()
    expect(screen.getByText(/Bearer sop_/)).toBeInTheDocument()
  })
})
