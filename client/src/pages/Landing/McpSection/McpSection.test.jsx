import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import McpSection from './McpSection.jsx'

describe('McpSection', () => {
  it('renders a light card per capability, each with its bullets', () => {
    const { container } = render(<McpSection />)

    expect(container.querySelectorAll('.lp-feat--light')).toHaveLength(3)
    expect(container.querySelectorAll('.lp-feat__list')).toHaveLength(3)
    expect(screen.getByText('Five tools, one endpoint')).toBeInTheDocument()
    expect(screen.getByText('Built for long questions')).toBeInTheDocument()
    expect(screen.getByText('Sign in, or bring a key')).toBeInTheDocument()
    expect(screen.getByText(/follow_up: keep the thread/i)).toBeInTheDocument()
    expect(screen.getByText(/get_answer collects it/i)).toBeInTheDocument()
    expect(screen.getByText(/refresh tokens rotate/i)).toBeInTheDocument()
  })

  it('offers the keyless OAuth command as the first install route', () => {
    render(<McpSection />)

    expect(screen.getByText('Connect with no key at all')).toBeInTheDocument()
    expect(
      screen.getByText('claude mcp add --transport http soporti https://soporti.your.co/api/mcp')
    ).toBeInTheDocument()
  })

  it('still shows the command that registers soporti with an api key', () => {
    render(<McpSection />)

    expect(screen.getByText(/Bearer sop_/)).toBeInTheDocument()
  })

  it('offers the two install routes and no longer advertises a plugin marketplace', () => {
    const { container } = render(<McpSection />)

    expect(container.querySelectorAll('.lp-mcp__route')).toHaveLength(2)
    expect(screen.queryByText(/\/plugin marketplace add/)).not.toBeInTheDocument()
    expect(screen.queryByText(/\/soporti:setup/)).not.toBeInTheDocument()
  })
})
