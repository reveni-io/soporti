import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import ToolCall from './ToolCall.jsx'

describe('ToolCall', () => {
  it('renders known tool with label', () => {
    render(<ToolCall tool="search_code" input={{ repo: 'org/app', query: 'auth' }} done={false} />)
    expect(screen.getByText('Searching code')).toBeInTheDocument()
  })

  it('renders unknown tool with tool name', () => {
    render(<ToolCall tool="custom_tool" input={{}} done={false} />)
    expect(screen.getByText('custom_tool')).toBeInTheDocument()
  })

  it('shows checkmark when done', () => {
    render(<ToolCall tool="list_repos" input={{}} done={true} />)
    expect(screen.getByText('✓')).toBeInTheDocument()
  })

  it('formats get_directory_contents input', () => {
    render(<ToolCall tool="get_directory_contents" input={{ repo: 'org/app', path: 'src' }} done={false} />)
    expect(screen.getByText('org/app/src')).toBeInTheDocument()
  })

  it('formats get_file_contents input', () => {
    render(<ToolCall tool="get_file_contents" input={{ repo: 'org/app', path: 'src/index.js' }} done={false} />)
    expect(screen.getByText('org/app/src/index.js')).toBeInTheDocument()
  })

  it('formats search_code input', () => {
    render(<ToolCall tool="search_code" input={{ repo: 'org/app', query: 'authenticate' }} done={false} />)
    expect(screen.getByText('"authenticate" in org/app')).toBeInTheDocument()
  })

  it('applies done CSS class', () => {
    const { container } = render(<ToolCall tool="list_repos" input={{}} done={true} />)
    expect(container.querySelector('.tool-call--done')).toBeTruthy()
  })

  it('applies running CSS class', () => {
    const { container } = render(<ToolCall tool="list_repos" input={{}} done={false} />)
    expect(container.querySelector('.tool-call--running')).toBeTruthy()
  })

  it('handles null input gracefully', () => {
    render(<ToolCall tool="list_repos" input={null} done={false} />)
    expect(screen.getByText('Listing repositories')).toBeInTheDocument()
  })
})
