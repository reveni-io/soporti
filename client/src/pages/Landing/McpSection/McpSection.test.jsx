import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import McpSection from './McpSection.jsx'
import { MCP_COMMAND } from '../constants.js'

describe('McpSection', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('explains that other agents can ask Soporti over MCP', () => {
    const { container } = render(<McpSection />)

    expect(container.querySelector('section')).toHaveAttribute('id', 'mcp')
    expect(
      screen.getByRole('heading', { level: 2, name: 'Your other agents can ask Soporti too.' })
    ).toBeInTheDocument()
    expect(screen.getByText('Five tools, one endpoint')).toBeInTheDocument()
    expect(screen.getByText('Built for long questions')).toBeInTheDocument()
    expect(screen.getByText('Sign in, or bring a key')).toBeInTheDocument()
    expect(screen.getByText(/hands back a run id/i)).toBeInTheDocument()
  })

  it('shows the keyless install command next to the terminal that runs it', () => {
    const { container } = render(<McpSection />)

    expect(container.querySelector('.lp-mcp__command')).toHaveTextContent(MCP_COMMAND)
    expect(container.querySelector('.lp-terminal')).toBeInTheDocument()
  })

  it('copies the install command', async () => {
    const writeText = vi.fn().mockResolvedValue()
    const user = userEvent.setup()
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(<McpSection />)

    await user.click(screen.getByRole('button', { name: 'Copy the install command' }))

    expect(writeText).toHaveBeenCalledTimes(1)
    expect(writeText).toHaveBeenCalledWith(MCP_COMMAND)
  })
})
