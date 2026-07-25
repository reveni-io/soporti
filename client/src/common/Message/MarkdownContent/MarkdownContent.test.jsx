import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import MarkdownContent from './MarkdownContent.jsx'

describe('MarkdownContent', () => {
  it('renders markdown as html', () => {
    render(<MarkdownContent content={'# Title\n\nSome **bold** text.'} isStreaming={false} />)

    expect(screen.getByRole('heading', { name: 'Title' })).toBeInTheDocument()
    expect(screen.getByText('bold')).toBeInTheDocument()
  })

  it('renders github-flavoured tables', () => {
    render(<MarkdownContent content={'| a | b |\n| - | - |\n| 1 | 2 |'} isStreaming={false} />)

    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'a' })).toBeInTheDocument()
  })

  it('opens links in a new tab safely', () => {
    render(<MarkdownContent content="[docs](https://example.com)" isStreaming={false} />)

    const link = screen.getByRole('link', { name: 'docs' })
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('routes fenced code through the code block', () => {
    render(<MarkdownContent content={'```sql\nSELECT 1\n```'} isStreaming={false} />)

    expect(screen.getByText('sql')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy code' })).toBeInTheDocument()
  })

  it('fences a bare mermaid diagram before rendering it', () => {
    const { container } = render(<MarkdownContent content={'flowchart TD\n  A --> B'} isStreaming token="tok" />)

    expect(container.querySelector('.mermaid-skeleton')).toBeInTheDocument()
  })
})
